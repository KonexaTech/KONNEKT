-- STAGING ONLY: oiwtfkgrnpzirghbsvim, after owner review.
-- Exact rollback of the one-policy proposal. Leaves original owner policies,
-- rows, helper definitions and grants unchanged. Reopens the known absence of
-- session/MFA/deletion/beta authorization on this encrypted-backup table.
BEGIN;
DROP POLICY "passkey backups require authorized session"
  ON public.user_key_passkey_backups;
COMMIT;
