-- STAGING ONLY. Inspect schema first. Does not delete any accounts or media.
-- Owner policy: remove the deleting account's sent messages/files, preserve
-- other participants' messages and the public key metadata needed to read them.
BEGIN;
ALTER TABLE public.conversations ALTER COLUMN created_by DROP NOT NULL;
ALTER TABLE public.conversations DROP CONSTRAINT conversations_created_by_fkey;
ALTER TABLE public.conversations ADD CONSTRAINT conversations_created_by_fkey
  FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE public.conversations ADD COLUMN IF NOT EXISTS retired_peer_id uuid;
ALTER TABLE public.conversations ADD COLUMN IF NOT EXISTS retired_peer_public_key text;
ALTER TABLE public.group_key_envelopes ALTER COLUMN sender_id DROP NOT NULL;
ALTER TABLE public.group_key_envelopes DROP CONSTRAINT group_key_envelopes_sender_id_fkey;
ALTER TABLE public.group_key_envelopes ADD CONSTRAINT group_key_envelopes_sender_id_fkey
  FOREIGN KEY (sender_id) REFERENCES auth.users(id) ON DELETE SET NULL;

-- Expired/revoked Auth refresh sessions alone do not invalidate existing JWTs.
-- Every installed MFA RLS/RPC guard must also deny deleted/processing accounts.
CREATE OR REPLACE FUNCTION konnekt_private.session_allowed()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT EXISTS (SELECT 1 FROM auth.users WHERE id = (SELECT auth.uid()))
  AND NOT EXISTS (SELECT 1 FROM public.account_deletion_requests
    WHERE user_id = (SELECT auth.uid()) AND status = 'processing')
  AND (coalesce((SELECT auth.jwt())->>'aal', 'aal1') = 'aal2'
    OR NOT EXISTS (SELECT 1 FROM auth.mfa_factors
      WHERE user_id = (SELECT auth.uid()) AND status = 'verified'));
$$;
DROP POLICY IF EXISTS "users submit own deletion requests" ON public.account_deletion_requests;
CREATE POLICY "users submit own deletion requests" ON public.account_deletion_requests
FOR INSERT TO authenticated WITH CHECK (user_id = (SELECT auth.uid()) AND status = 'requested' AND processed_at IS NULL);

CREATE OR REPLACE FUNCTION public.konnekt_retired_peer(target_conversation uuid)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT jsonb_build_object('id',c.retired_peer_id,'encryption_public_key',c.retired_peer_public_key,'retired',true)
  FROM public.conversations c WHERE c.id=target_conversation AND NOT c.is_group
    AND c.retired_peer_id IS NOT NULL AND konnekt_private.session_allowed()
    AND public.is_konnekt_conversation_member(c.id);
$$;
REVOKE ALL ON FUNCTION public.konnekt_retired_peer(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.konnekt_retired_peer(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.konnekt_deletion_plan(target_user uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.moderation_admins WHERE user_id=target_user)
    OR EXISTS (SELECT 1 FROM public.moderation_actions WHERE moderator_id=target_user) THEN
    RAISE EXCEPTION 'Staff/audit accounts need a separate reviewed deletion procedure';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.account_deletion_requests WHERE user_id=target_user AND status IN ('requested','processing')) THEN
    RAISE EXCEPTION 'An open owner-submitted deletion request is required';
  END IF;
  IF EXISTS (SELECT 1 FROM public.conversations c JOIN public.conversation_members m ON m.conversation_id=c.id
      WHERE m.user_id=target_user AND NOT c.is_group
        AND EXISTS (SELECT 1 FROM public.messages WHERE conversation_id=c.id AND sender_id<>target_user AND is_encrypted)
        AND NOT EXISTS (SELECT 1 FROM public.profiles WHERE id=target_user AND encryption_public_key IS NOT NULL)) THEN
    RAISE EXCEPTION 'Missing peer public key: preserve other participants encryption before deleting';
  END IF;
  IF EXISTS (SELECT 1 FROM storage.objects WHERE (owner=target_user AND owner_id IS NOT NULL AND owner_id<>target_user::text)
    OR (owner_id=target_user::text AND owner IS NOT NULL AND owner<>target_user)) THEN
    RAISE EXCEPTION 'Conflicting file ownership requires operator review';
  END IF;
  RETURN jsonb_build_object('account_exists',EXISTS(SELECT 1 FROM auth.users WHERE id=target_user),
    'sent_messages',(SELECT count(*) FROM public.messages WHERE sender_id=target_user),
    'owned_files',(SELECT count(*) FROM storage.objects WHERE owner=target_user OR owner_id=target_user::text));
END;
$$;

CREATE OR REPLACE FUNCTION public.konnekt_deletion_prepare(target_user uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended('konnekt-delete:'||target_user::text,0));
  PERFORM public.konnekt_deletion_plan(target_user);
  UPDATE public.conversations c SET retired_peer_id=target_user,
    retired_peer_public_key=(SELECT encryption_public_key FROM public.profiles WHERE id=target_user)
  WHERE NOT c.is_group AND EXISTS (SELECT 1 FROM public.conversation_members WHERE conversation_id=c.id AND user_id=target_user)
    AND EXISTS (SELECT 1 FROM public.conversation_members WHERE conversation_id=c.id AND user_id<>target_user);
  UPDATE public.account_deletion_requests SET status='processing'
    WHERE user_id=target_user AND status IN ('requested','processing');
  -- Keep surviving groups manageable, not just readable.
  UPDATE public.conversations c SET created_by=(SELECT m.user_id FROM public.conversation_members m
    WHERE m.conversation_id=c.id AND m.user_id<>target_user ORDER BY m.joined_at,m.user_id LIMIT 1)
  WHERE c.is_group AND c.created_by=target_user;
END;
$$;

CREATE OR REPLACE FUNCTION public.konnekt_deletion_files(target_user uuid)
RETURNS TABLE(bucket_id text,name text) LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.account_deletion_requests WHERE user_id=target_user AND status='processing') THEN
    RAISE EXCEPTION 'Account is not locked for deletion';
  END IF;
  RETURN QUERY SELECT o.bucket_id,o.name FROM storage.objects o
    WHERE o.owner=target_user OR o.owner_id=target_user::text ORDER BY o.bucket_id,o.name LIMIT 100;
END;
$$;

CREATE OR REPLACE FUNCTION public.konnekt_deletion_complete(target_user uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM auth.users WHERE id=target_user)
    OR EXISTS (SELECT 1 FROM storage.objects WHERE owner=target_user OR owner_id=target_user::text) THEN
    RAISE EXCEPTION 'Auth account and owned files must be removed first';
  END IF;
  UPDATE public.account_deletion_requests SET status='completed',reason='',processed_at=now()
    WHERE user_id=target_user AND status='processing';
END;
$$;

REVOKE ALL ON FUNCTION public.konnekt_deletion_plan(uuid), public.konnekt_deletion_prepare(uuid), public.konnekt_deletion_files(uuid), public.konnekt_deletion_complete(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.konnekt_deletion_plan(uuid), public.konnekt_deletion_prepare(uuid), public.konnekt_deletion_files(uuid), public.konnekt_deletion_complete(uuid) TO service_role;
NOTIFY pgrst, 'reload schema';
COMMIT;
