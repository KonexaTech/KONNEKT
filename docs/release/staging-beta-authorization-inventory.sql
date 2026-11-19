-- Read-only staging inventory for KONNEKT 20-person beta authorization review.
-- Run against staging only. No schema, grants, policies or user data are changed.
-- A row is a REVIEW TARGET, not proof of an exploitable bypass.
-- SECURITY DEFINER functions can execute with owner privileges, so RLS alone
-- must not be assumed to enforce the beta gate for every RPC.
select n.nspname as schema_name,
       p.proname as function_name,
       pg_get_function_identity_arguments(p.oid) as argument_types,
       p.prosecdef as security_definer,
       p.proconfig as execution_settings,
       has_function_privilege('anon', p.oid, 'EXECUTE') as anon_can_execute,
       has_function_privilege('authenticated', p.oid, 'EXECUTE') as authenticated_can_execute,
       pg_get_functiondef(p.oid) as definition_for_manual_review
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and (has_function_privilege('anon', p.oid, 'EXECUTE')
    or has_function_privilege('authenticated', p.oid, 'EXECUTE'))
order by p.prosecdef desc, n.nspname, p.proname, argument_types;

-- Enumerate all exposed table/view RLS settings and current policies.
select n.nspname as schema_name, c.relname as relation_name,
       c.relkind, c.relrowsecurity as rls_enabled,
       c.relforcerowsecurity as rls_forced,
       pol.polname as policy_name, pol.polpermissive as permissive,
       pg_get_expr(pol.polqual, pol.polrelid) as using_expression,
       pg_get_expr(pol.polwithcheck, pol.polrelid) as check_expression
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
left join pg_policy pol on pol.polrelid = c.oid
where n.nspname in ('public','storage')
  and c.relkind in ('r','p','v','m')
order by n.nspname, c.relname, pol.polname;

-- Realtime publication membership; separately audit channel authorization
-- and subscriptions with authenticated, expired and excluded tester sessions.
-- pg_publication_tables expands FOR ALL TABLES and FOR TABLES IN SCHEMA
-- publications; pg_publication_rel alone misses those memberships.
select pubname, schemaname as schema_name, tablename as relation_name
from pg_publication_tables
order by pubname, schemaname, tablename;

-- Storage bucket exposure. Never print object contents or signed URLs.
select id, name, public, file_size_limit, allowed_mime_types
from storage.buckets
order by id;
