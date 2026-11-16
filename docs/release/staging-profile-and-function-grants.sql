-- STAGING ONLY. Inspect catalogs and verify compatible explicit-column client
-- queries before applying. This changes privileges, never profile data.
BEGIN;

-- Table SELECT grants override column revocations: remove both grant paths.
REVOKE SELECT ON TABLE public.profiles FROM PUBLIC, anon, authenticated;
REVOKE SELECT (phone) ON TABLE public.profiles FROM PUBLIC, anon, authenticated;
GRANT SELECT (id, username, full_name, avatar_url, bio, created_at, updated_at, encryption_public_key)
  ON TABLE public.profiles TO authenticated;

-- App RPCs and RLS helpers are needed by authenticated callers. None requires
-- anonymous EXECUTE; retain authenticated access rather than disabling RLS.
REVOKE EXECUTE ON FUNCTION public.create_direct_conversation(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.is_konnekt_conversation_creator(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.is_konnekt_conversation_member(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.is_konnekt_moderator() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.konnekt_can_view_reel(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.konnekt_create_group_conversation(text,text,uuid[]) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.konnekt_is_blocked_pair(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.konnekt_start_direct_conversation(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_direct_conversation(uuid),
  public.is_konnekt_conversation_creator(uuid), public.is_konnekt_conversation_member(uuid),
  public.is_konnekt_moderator(), public.konnekt_can_view_reel(uuid),
  public.konnekt_create_group_conversation(text,text,uuid[]),
  public.konnekt_is_blocked_pair(uuid), public.konnekt_start_direct_conversation(text)
  TO authenticated;
COMMIT;
