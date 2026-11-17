-- STAGING ONLY after private push sessions, retries and safe account deletion.
-- No provider credentials, configuration rows or account deletions are created.
BEGIN;
DO $$BEGIN IF EXISTS(SELECT 1 FROM public.account_deletion_requests d JOIN auth.users u ON u.id=d.user_id WHERE d.status='completed') THEN RAISE EXCEPTION 'Review completed deletion requests with live Auth identities before applying'; END IF; END$$;
-- Completed tombstones also deny an accidentally restored Auth identity.
CREATE OR REPLACE FUNCTION konnekt_private.session_allowed()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT EXISTS(SELECT 1 FROM auth.users WHERE id=auth.uid())
 AND NOT EXISTS(SELECT 1 FROM public.account_deletion_requests WHERE user_id=auth.uid() AND status IN ('processing','completed'))
 AND (coalesce(auth.jwt()->>'aal','aal1')='aal2' OR NOT EXISTS(SELECT 1 FROM auth.mfa_factors WHERE user_id=auth.uid() AND status='verified'));
$$;
CREATE TABLE IF NOT EXISTS konnekt_private.push_app_settings(singleton boolean PRIMARY KEY DEFAULT true CHECK(singleton),app_id uuid NOT NULL);
CREATE TABLE IF NOT EXISTS konnekt_private.push_provider_identities(
 user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,app_id uuid NOT NULL,external_id text NOT NULL CHECK(external_id ~ '^ks_[a-f0-9]{64}$'),PRIMARY KEY(user_id,app_id,external_id)
);
CREATE TABLE IF NOT EXISTS konnekt_private.deletion_push_manifest(
 user_id uuid NOT NULL,app_id uuid NOT NULL,external_id text NOT NULL,erased boolean NOT NULL DEFAULT false,PRIMARY KEY(user_id,app_id,external_id)
);
ALTER TABLE konnekt_private.push_sessions ADD COLUMN IF NOT EXISTS app_id uuid;
ALTER TABLE konnekt_private.push_app_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE konnekt_private.push_provider_identities ENABLE ROW LEVEL SECURITY;
ALTER TABLE konnekt_private.deletion_push_manifest ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON konnekt_private.push_app_settings,konnekt_private.push_provider_identities,konnekt_private.deletion_push_manifest FROM PUBLIC,anon,authenticated;
CREATE OR REPLACE FUNCTION public.konnekt_configure_push_app(p_app_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF p_app_id IS NULL THEN RAISE EXCEPTION 'A verified staging provider App ID is required'; END IF;
 IF EXISTS(SELECT 1 FROM public.account_deletion_requests WHERE status='processing')
   AND p_app_id IS DISTINCT FROM (SELECT app_id FROM konnekt_private.push_app_settings WHERE singleton) THEN
   RAISE EXCEPTION 'Finish processing deletions before changing provider application';
 END IF;
 INSERT INTO konnekt_private.push_app_settings(singleton,app_id) VALUES(true,p_app_id) ON CONFLICT(singleton) DO UPDATE SET app_id=excluded.app_id;
END;
$$;
REVOKE ALL ON FUNCTION public.konnekt_configure_push_app(uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.konnekt_configure_push_app(uuid) TO service_role;
CREATE OR REPLACE FUNCTION public.konnekt_register_push_session(
  p_device_key text,p_user_id uuid,p_messages boolean DEFAULT true,p_calls boolean DEFAULT true,
  p_social boolean DEFAULT true,p_security boolean DEFAULT true
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE actor uuid := auth.uid(); sid uuid; configured_app uuid; result jsonb;
BEGIN
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('konnekt-delete:'||actor::text,0));
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
  SELECT app_id INTO configured_app FROM konnekt_private.push_app_settings WHERE singleton;
  -- A new account on this installation retires the old target even if its
  -- Auth session remains alive or a delayed native bridge wins a race.
  DELETE FROM konnekt_private.push_sessions p WHERE p.device_key=p_device_key AND (p.session_id<>sid OR p.user_id<>actor);
  INSERT INTO konnekt_private.push_sessions(session_id,user_id,device_key,app_id,messages,calls,social,security)
    VALUES(sid,actor,p_device_key,configured_app,coalesce(p_messages,true),coalesce(p_calls,true),coalesce(p_social,true),coalesce(p_security,true))
    ON CONFLICT(session_id) DO UPDATE SET external_id=CASE WHEN push_sessions.app_id IS DISTINCT FROM excluded.app_id THEN 'ks_' || replace(pg_catalog.gen_random_uuid()::text,'-','') || replace(pg_catalog.gen_random_uuid()::text,'-','') ELSE push_sessions.external_id END,app_id=excluded.app_id,device_key=excluded.device_key,messages=excluded.messages,calls=excluded.calls,
      social=excluded.social,security=excluded.security;
  INSERT INTO konnekt_private.push_provider_identities(user_id,app_id,external_id)
    SELECT p.user_id,p.app_id,p.external_id FROM konnekt_private.push_sessions p WHERE p.session_id=sid AND p.user_id=actor AND p.app_id IS NOT NULL ON CONFLICT DO NOTHING;
  SELECT jsonb_build_object('user_id',p.user_id,'external_id',p.external_id,'app_id',p.app_id) INTO result
    FROM konnekt_private.push_sessions p WHERE p.session_id=sid AND p.user_id=actor;
  RETURN result;
END;
$$;
REVOKE ALL ON FUNCTION public.konnekt_register_push_session(text,uuid,boolean,boolean,boolean,boolean) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.konnekt_register_push_session(text,uuid,boolean,boolean,boolean,boolean) TO authenticated;

CREATE OR REPLACE FUNCTION public.konnekt_push_delivery(notification_id uuid)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
  WITH event AS (
    SELECT n.*,CASE WHEN n.type='message' THEN 'messages' WHEN n.type IN ('call','group_call') THEN 'calls'
      WHEN n.type IN ('follow','like','comment') THEN 'social' WHEN n.type='security' THEN 'security' END AS category
    FROM public.notifications n JOIN auth.users u ON u.id=n.recipient_id
    WHERE n.id=notification_id AND n.read_at IS NULL AND n.created_at>now()-interval '1 hour'
      AND (u.banned_until IS NULL OR u.banned_until<=now())
      AND NOT EXISTS(SELECT 1 FROM public.account_deletion_requests d WHERE d.user_id=n.recipient_id AND d.status IN ('processing','completed'))
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
    WHERE p.app_id=(SELECT app_id FROM konnekt_private.push_app_settings WHERE singleton) AND n.category IS NOT NULL AND (s.not_after IS NULL OR s.not_after>now())
      AND (s.aal::text='aal2' OR NOT EXISTS(SELECT 1 FROM auth.mfa_factors f WHERE f.user_id=p.user_id AND f.status='verified'))
      AND CASE n.category WHEN 'messages' THEN p.messages WHEN 'calls' THEN p.calls WHEN 'social' THEN p.social WHEN 'security' THEN p.security ELSE false END
    ORDER BY p.external_id LIMIT 100
  ) SELECT jsonb_build_object('app_id',(SELECT app_id FROM konnekt_private.push_app_settings WHERE singleton),'category',(SELECT category FROM event),
    'ttl',CASE WHEN (SELECT category FROM event)='calls' THEN greatest(1,least(45,extract(epoch FROM ((CASE WHEN (SELECT type FROM event)='call' THEN (SELECT c.created_at FROM public.call_sessions c JOIN event n ON c.id=n.reference_id) ELSE (SELECT g.created_at FROM public.group_call_sessions g JOIN event n ON g.id=n.reference_id) END)+interval '45 seconds'-now()))::int)) ELSE 3600 END,
    'aliases',coalesce((SELECT jsonb_agg(external_id) FROM targets),'[]'::jsonb));
$$;
REVOKE ALL ON FUNCTION public.konnekt_push_delivery(uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.konnekt_push_delivery(uuid) TO service_role;

CREATE OR REPLACE FUNCTION konnekt_private.deletion_push_targets(target_user uuid)
RETURNS TABLE(app_id uuid,external_id text,erased boolean) LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 WITH apps AS (
  SELECT p.app_id FROM konnekt_private.push_provider_identities p WHERE p.user_id=target_user
  UNION SELECT s.app_id FROM konnekt_private.push_app_settings s WHERE s.singleton
  UNION SELECT m.app_id FROM konnekt_private.deletion_push_manifest m WHERE m.user_id=target_user
 ), targets AS (
  SELECT p.app_id,p.external_id FROM konnekt_private.push_provider_identities p WHERE p.user_id=target_user
  UNION SELECT a.app_id,target_user::text FROM apps a
  UNION SELECT m.app_id,m.external_id FROM konnekt_private.deletion_push_manifest m WHERE m.user_id=target_user
 ) SELECT t.app_id,t.external_id,coalesce(m.erased,false) FROM targets t
 LEFT JOIN konnekt_private.deletion_push_manifest m ON m.user_id=target_user AND m.app_id=t.app_id AND m.external_id=t.external_id;
$$;
REVOKE ALL ON FUNCTION konnekt_private.deletion_push_targets(uuid) FROM PUBLIC,anon,authenticated;
CREATE OR REPLACE FUNCTION public.konnekt_deletion_push_plan(target_user uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 PERFORM public.konnekt_deletion_plan(target_user);
 RETURN jsonb_build_object('app_ids',coalesce((SELECT jsonb_agg(DISTINCT t.app_id) FROM konnekt_private.deletion_push_targets(target_user) t),'[]'::jsonb),
  'pending_targets',(SELECT count(*) FROM konnekt_private.deletion_push_targets(target_user) t WHERE NOT t.erased),
  'targets',coalesce((SELECT jsonb_agg(x) FROM (SELECT t.app_id,t.external_id FROM konnekt_private.deletion_push_targets(target_user) t WHERE NOT t.erased ORDER BY t.app_id,t.external_id LIMIT 100) x),'[]'::jsonb));
END;
$$;
CREATE OR REPLACE FUNCTION public.konnekt_deletion_push_prepare(target_user uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 -- Same per-user transaction lock as registration: no identity can race the snapshot.
 PERFORM public.konnekt_deletion_prepare(target_user);
 INSERT INTO konnekt_private.deletion_push_manifest(user_id,app_id,external_id,erased)
  SELECT target_user,t.app_id,t.external_id,t.erased FROM konnekt_private.deletion_push_targets(target_user) t ON CONFLICT DO NOTHING;
 DELETE FROM auth.sessions WHERE user_id=target_user;
 UPDATE public.call_sessions SET status='ended',ended_at=now() WHERE (caller_id=target_user OR callee_id=target_user) AND status IN ('ringing','accepted');
 UPDATE public.group_call_sessions SET status='ended',ended_at=now() WHERE created_by=target_user AND status IN ('ringing','active');
 UPDATE public.group_call_participants SET status='left' WHERE user_id=target_user AND status IN ('invited','joined');
END;
$$;
CREATE OR REPLACE FUNCTION public.konnekt_deletion_push_mark_erased(target_user uuid,p_app_id uuid,p_external_id text)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF NOT EXISTS(SELECT 1 FROM public.account_deletion_requests WHERE user_id=target_user AND status='processing') THEN RAISE EXCEPTION 'Account is not locked for deletion'; END IF;
 UPDATE konnekt_private.deletion_push_manifest SET erased=true WHERE user_id=target_user AND app_id=p_app_id AND external_id=p_external_id;
 RETURN FOUND;
END;
$$;
CREATE OR REPLACE FUNCTION public.konnekt_deletion_complete(target_user uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF EXISTS(SELECT 1 FROM auth.users WHERE id=target_user) OR EXISTS(SELECT 1 FROM storage.objects WHERE owner=target_user OR owner_id=target_user::text) THEN RAISE EXCEPTION 'Auth account and owned files must be removed first'; END IF;
 IF EXISTS(SELECT 1 FROM public.account_deletion_requests WHERE user_id=target_user AND status='completed') AND NOT EXISTS(SELECT 1 FROM public.account_deletion_requests WHERE user_id=target_user AND status IN ('requested','processing')) THEN RETURN; END IF;
 IF EXISTS(SELECT 1 FROM konnekt_private.deletion_push_targets(target_user) t WHERE NOT t.erased) THEN RAISE EXCEPTION 'Provider erasure must be confirmed before completion'; END IF;
 UPDATE public.account_deletion_requests SET status='completed',reason='',processed_at=now() WHERE user_id=target_user AND status='processing';
 DELETE FROM konnekt_private.deletion_push_manifest WHERE user_id=target_user;
END;
$$;
REVOKE ALL ON FUNCTION public.konnekt_deletion_push_plan(uuid),public.konnekt_deletion_push_prepare(uuid),public.konnekt_deletion_push_mark_erased(uuid,uuid,text),public.konnekt_deletion_complete(uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.konnekt_deletion_push_plan(uuid),public.konnekt_deletion_push_prepare(uuid),public.konnekt_deletion_push_mark_erased(uuid,uuid,text),public.konnekt_deletion_complete(uuid) TO service_role;
NOTIFY pgrst, 'reload schema';
COMMIT;
