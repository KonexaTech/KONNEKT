-- STAGING ONLY. No current application, policy or routine calls this legacy RPC.
-- Preserve its definition and service-role access; no data changes.
-- Apply only after confirming catalog callers and current client RPC usage.
BEGIN;
REVOKE EXECUTE ON FUNCTION public.create_direct_conversation(uuid) FROM PUBLIC, anon, authenticated;
COMMIT;
-- Rollback, only after reviewing the caller requirement:
-- GRANT EXECUTE ON FUNCTION public.create_direct_conversation(uuid) TO authenticated;
