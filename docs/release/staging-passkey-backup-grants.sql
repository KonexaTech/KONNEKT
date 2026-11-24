-- PROPOSED: konnekt-staging oiwtfkgrnpzirghbsvim ONLY, after owner review.
-- Separate from the passkey session policy. Catalog inspected 2026-11-23:
-- authenticated has TRUNCATE/TRIGGER/REFERENCES on this encrypted-backup table.
-- Actual browser callers only SELECT and INSERT/UPSERT; no app caller creates
-- triggers, foreign keys, or truncates tables. TRUNCATE bypasses row policies.
-- Keep ordinary CRUD grants, original policies, postgres and service_role ACLs.
BEGIN;
REVOKE TRUNCATE, TRIGGER, REFERENCES
  ON public.user_key_passkey_backups FROM authenticated;
COMMIT;
