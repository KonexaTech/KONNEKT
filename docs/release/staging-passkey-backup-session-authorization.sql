-- PROPOSED: konnekt-staging oiwtfkgrnpzirghbsvim ONLY, after owner review.
-- Catalog inspected 2026-11-23: RLS enabled; three permissive authenticated
-- owner SELECT/INSERT/UPDATE policies; no restrictive session/MFA/beta policy.
-- Requires the reviewed session_allowed() helper. Apply the active-session
-- helper proposal separately if canonical Auth-session revocation is required.
-- Adds one restrictive policy; preserves rows, existing owner policies and ACLs.
BEGIN;
CREATE POLICY "passkey backups require authorized session"
  ON public.user_key_passkey_backups AS RESTRICTIVE
  FOR ALL TO authenticated
  USING ((SELECT konnekt_private.session_allowed()))
  WITH CHECK ((SELECT konnekt_private.session_allowed()));
COMMIT;
