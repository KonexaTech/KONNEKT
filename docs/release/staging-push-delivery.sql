-- STAGING ONLY. Requires inspected Auth sessions plus the existing MFA/deletion guard.
-- No production application, provider secret, webhook or network extension is enabled here.
BEGIN;
CREATE TABLE IF NOT EXISTS konnekt_private.push_sessions (
  session_id uuid PRIMARY KEY REFERENCES auth.sessions(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  device_key text NOT NULL UNIQUE CHECK (device_key ~ '^[a-f0-9]{64}$'),
  external_id text NOT NULL UNIQUE DEFAULT ('ks_' || replace(pg_catalog.gen_random_uuid()::text,'-','') || replace(pg_catalog.gen_random_uuid()::text,'-','')),
  messages boolean NOT NULL DEFAULT true,
  calls boolean NOT NULL DEFAULT true,
  social boolean NOT NULL DEFAULT true,
  security boolean NOT NULL DEFAULT true
);
ALTER TABLE konnekt_private.push_sessions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON konnekt_private.push_sessions FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION public.konnekt_register_push_session(
  p_device_key text,p_user_id uuid,p_messages boolean DEFAULT true,p_calls boolean DEFAULT true,
  p_social boolean DEFAULT true,p_security boolean DEFAULT true
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE actor uuid := auth.uid(); sid uuid; result jsonb;
BEGIN
  IF NOT konnekt_private.session_allowed() THEN
    RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Verify your sign-in before enabling notifications.';
  END IF;
  IF p_device_key IS NULL OR p_device_key !~ '^[a-f0-9]{64}$' THEN
    RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Invalid device registration.';
  END IF;
  IF actor IS DISTINCT FROM p_user_id THEN
    RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='The account changed before notification registration.';
  END IF;
  sid := nullif(auth.jwt()->>'session_id','')::uuid;
  IF NOT EXISTS (SELECT 1 FROM auth.sessions s JOIN auth.users u ON u.id=s.user_id
    WHERE s.id=sid AND s.user_id=actor AND (s.not_after IS NULL OR s.not_after>now())
      AND (u.banned_until IS NULL OR u.banned_until<=now())) THEN
    RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='This sign-in session is no longer active.';
  END IF;
  -- Serialize this private installation capability. An older Auth session may
  -- not overwrite a newer account switch after a delayed bridge/network reply.
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_device_key,0));
  IF EXISTS(SELECT 1 FROM konnekt_private.push_sessions p JOIN auth.sessions old_session ON old_session.id=p.session_id
    JOIN auth.sessions current_session ON current_session.id=sid
    WHERE p.device_key=p_device_key AND p.session_id<>sid AND old_session.created_at>=current_session.created_at) THEN
    RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='A newer sign-in already controls notifications on this device.';
  END IF;
  -- A new account on this installation retires the old target even if its
  -- Auth session remains alive or a delayed native bridge wins a race.
  DELETE FROM konnekt_private.push_sessions p WHERE p.device_key=p_device_key AND (p.session_id<>sid OR p.user_id<>actor);
  INSERT INTO konnekt_private.push_sessions(session_id,user_id,device_key,messages,calls,social,security)
    VALUES(sid,actor,p_device_key,coalesce(p_messages,true),coalesce(p_calls,true),coalesce(p_social,true),coalesce(p_security,true))
    ON CONFLICT(session_id) DO UPDATE SET device_key=excluded.device_key,messages=excluded.messages,calls=excluded.calls,
      social=excluded.social,security=excluded.security;
  SELECT jsonb_build_object('user_id',p.user_id,'external_id',p.external_id) INTO result
    FROM konnekt_private.push_sessions p WHERE p.session_id=sid AND p.user_id=actor;
  RETURN result;
END;
$$;
REVOKE ALL ON FUNCTION public.konnekt_register_push_session(text,uuid,boolean,boolean,boolean,boolean) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.konnekt_register_push_session(text,uuid,boolean,boolean,boolean,boolean) TO authenticated;

-- A stale logout cannot remove the new account's registration on the same device.
CREATE OR REPLACE FUNCTION public.konnekt_unregister_push_session(p_device_key text)
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path='' AS $$
  DELETE FROM konnekt_private.push_sessions p WHERE p.user_id=auth.uid()
    AND p.session_id=nullif(auth.jwt()->>'session_id','')::uuid AND p.device_key=p_device_key;
$$;
REVOKE ALL ON FUNCTION public.konnekt_unregister_push_session(text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.konnekt_unregister_push_session(text) TO authenticated;

-- Aliases are bearer capabilities. Only the trusted sender may enumerate targets.
CREATE OR REPLACE FUNCTION public.konnekt_push_delivery(notification_id uuid)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
  WITH event AS (
    SELECT n.*,CASE WHEN n.type='message' THEN 'messages' WHEN n.type IN ('call','group_call') THEN 'calls'
      WHEN n.type IN ('follow','like','comment') THEN 'social' WHEN n.type='security' THEN 'security' END AS category
    FROM public.notifications n JOIN auth.users u ON u.id=n.recipient_id
    WHERE n.id=notification_id AND n.read_at IS NULL AND n.created_at>now()-interval '1 hour'
      AND (u.banned_until IS NULL OR u.banned_until<=now())
      AND NOT EXISTS(SELECT 1 FROM public.account_deletion_requests d WHERE d.user_id=n.recipient_id AND d.status='processing')
      AND NOT EXISTS(SELECT 1 FROM public.user_blocks b WHERE
        (b.blocker_id=n.recipient_id AND b.blocked_id=n.actor_id) OR (b.blocked_id=n.recipient_id AND b.blocker_id=n.actor_id))
      AND (n.type<>'group_call' OR EXISTS(SELECT 1 FROM public.group_call_sessions g
        JOIN public.group_call_participants p ON p.call_id=g.id AND p.user_id=n.recipient_id
        JOIN public.conversation_members m ON m.conversation_id=g.conversation_id AND m.user_id=p.user_id
        WHERE g.id=n.reference_id AND g.status IN ('ringing','active') AND p.status='invited' AND g.created_at>now()-interval '45 seconds'))
      AND (n.type<>'call' OR EXISTS(SELECT 1 FROM public.call_sessions c WHERE c.id=n.reference_id
        AND c.callee_id=n.recipient_id AND c.status='ringing' AND c.created_at>now()-interval '45 seconds'))
  ), targets AS (
    SELECT p.external_id FROM event n JOIN konnekt_private.push_sessions p ON p.user_id=n.recipient_id
      JOIN auth.sessions s ON s.id=p.session_id AND s.user_id=p.user_id
    WHERE n.category IS NOT NULL AND (s.not_after IS NULL OR s.not_after>now())
      AND (s.aal::text='aal2' OR NOT EXISTS(SELECT 1 FROM auth.mfa_factors f WHERE f.user_id=p.user_id AND f.status='verified'))
      AND CASE n.category WHEN 'messages' THEN p.messages WHEN 'calls' THEN p.calls WHEN 'social' THEN p.social WHEN 'security' THEN p.security ELSE false END
    ORDER BY p.external_id LIMIT 100
  ) SELECT jsonb_build_object('category',(SELECT category FROM event),
    'ttl',CASE WHEN (SELECT category FROM event)='calls' THEN greatest(1,least(45,extract(epoch FROM ((CASE WHEN (SELECT type FROM event)='call' THEN (SELECT c.created_at FROM public.call_sessions c JOIN event n ON c.id=n.reference_id) ELSE (SELECT g.created_at FROM public.group_call_sessions g JOIN event n ON g.id=n.reference_id) END)+interval '45 seconds'-now()))::int)) ELSE 3600 END,
    'aliases',coalesce((SELECT jsonb_agg(external_id) FROM targets),'[]'::jsonb));
$$;
REVOKE ALL ON FUNCTION public.konnekt_push_delivery(uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.konnekt_push_delivery(uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.konnekt_notify_incoming_call()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
  IF new.status='ringing' THEN
    PERFORM public.konnekt_create_notification(new.callee_id,new.caller_id,'call','Incoming KONNEKT call.',NULL,new.id);
  END IF;
  RETURN new;
END;
$$;
REVOKE ALL ON FUNCTION public.konnekt_notify_incoming_call() FROM PUBLIC,anon,authenticated;
DROP TRIGGER IF EXISTS konnekt_notify_incoming_call ON public.call_sessions;
CREATE TRIGGER konnekt_notify_incoming_call AFTER INSERT ON public.call_sessions
  FOR EACH ROW EXECUTE FUNCTION public.konnekt_notify_incoming_call();
CREATE OR REPLACE FUNCTION public.konnekt_notify_group_call_invite()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE creator uuid;
BEGIN
  SELECT g.created_by INTO creator FROM public.group_call_sessions g
    WHERE g.id=new.call_id AND g.status IN ('ringing','active');
  IF new.status='invited' AND creator IS NOT NULL AND creator<>new.user_id THEN
    PERFORM public.konnekt_create_notification(new.user_id,creator,'group_call','Incoming KONNEKT group call.',NULL,new.call_id);
  END IF;
  RETURN new;
END;
$$;
REVOKE ALL ON FUNCTION public.konnekt_notify_group_call_invite() FROM PUBLIC,anon,authenticated;
DROP TRIGGER IF EXISTS konnekt_notify_group_call_invite ON public.group_call_participants;
CREATE TRIGGER konnekt_notify_group_call_invite AFTER INSERT ON public.group_call_participants
  FOR EACH ROW EXECUTE FUNCTION public.konnekt_notify_group_call_invite();
COMMIT;
