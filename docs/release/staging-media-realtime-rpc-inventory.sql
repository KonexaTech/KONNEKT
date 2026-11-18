-- STAGING ONLY (oiwtfkgrnpzirghbsvim). Read-only authorization inventory.
-- Review before applying the proposed 20-person beta gate.
-- This inventory is NOT an authenticated end-to-end privacy test.
BEGIN READ ONLY;
-- Storage object RLS and policies (signed URLs require separate expiry/revocation tests).
SELECT 'storage_rls' AS surface, n.nspname AS schema_name, c.relname AS object_name,
       c.relrowsecurity AS rls_enabled, c.relforcerowsecurity AS force_rls
FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
WHERE n.nspname='storage' AND c.relname='objects' AND c.relkind='r';
SELECT 'storage_policy' AS surface, schemaname, tablename, policyname,
       permissive, roles, cmd, qual, with_check
FROM pg_policies WHERE schemaname='storage' AND tablename='objects'
ORDER BY policyname;
-- Realtime publication membership; RLS on published tables is not sufficient
-- evidence that existing subscriptions terminate at beta expiry.
SELECT 'realtime_publication' AS surface, pubname, schemaname, tablename
FROM pg_publication_tables WHERE pubname LIKE '%realtime%'
ORDER BY pubname, schemaname, tablename;
-- Exposed callable privileged functions: investigate ALL results, not only
-- the five previously inventoried RPC names.
SELECT 'privileged_rpc' AS surface, n.nspname AS schema_name,
       p.proname AS function_name,
       pg_get_function_identity_arguments(p.oid) AS signature,
       p.prosecdef AS security_definer
FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
WHERE n.nspname IN ('public','konnekt_private')
  AND p.prosecdef AND has_function_privilege('authenticated',p.oid,'EXECUTE')
ORDER BY n.nspname,p.proname,signature;
ROLLBACK;
