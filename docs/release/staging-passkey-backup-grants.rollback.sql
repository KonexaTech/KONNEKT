-- STAGING ONLY: oiwtfkgrnpzirghbsvim, after owner review.
-- Restores exactly the three inspected previous authenticated grants.
-- This reopens unnecessary table-administration privileges; it is not a fix.
BEGIN;
GRANT TRUNCATE, TRIGGER, REFERENCES
  ON public.user_key_passkey_backups TO authenticated;
COMMIT;
