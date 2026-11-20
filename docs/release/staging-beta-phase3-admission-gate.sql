-- STAGING ONLY: oiwtfkgrnpzirghbsvim. Do NOT execute on production.
-- Non-disruptive pre-activation policy: before started_at, leave existing
-- staging permissions unchanged. After first activation, require the exact
-- 20-testers + 1-owner allowlist via konnekt_beta.allowed(), including shutdown.
-- Phase 2 roster and control triggers must already be installed.
-- This replaces the earlier HOLD proposal, which denied all pre-activation use.
begin;
do $preflight$
begin
 if (select count(*) from konnekt_beta.control) <> 1
   or not exists (select 1 from konnekt_beta.control where singleton and started_at is null and not enabled)
 then raise exception 'Refusing gate install: staging beta already started or control missing'; end if;
 if (select count(*) from pg_policies where policyname='beta_14_day_gate') <> 0
 then raise exception 'Refusing gate install: beta policy already exists'; end if;
 if exists (select 1 from storage.buckets where public)
 then raise exception 'Refusing gate install: public media bucket bypass'; end if;
 if exists (
   select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace
   where c.relkind in ('r','p') and not c.relrowsecurity
   and (n.nspname='public' or (n.nspname='storage' and c.relname='objects'))
 ) then raise exception 'Refusing gate install: exposed table without RLS'; end if;
 if to_regprocedure('konnekt_beta.allowed()') is null
 then raise exception 'Refusing gate install: roster admission helper missing'; end if;
 if not (pg_get_functiondef('konnekt_private.session_allowed()'::regprocedure)
   ilike '%account_deletion_requests%'
   and pg_get_functiondef('konnekt_private.session_allowed()'::regprocedure)
   ilike '%auth.mfa_factors%'
   and pg_get_functiondef('konnekt_private.session_allowed()'::regprocedure)
   not ilike '%konnekt_beta.%')
 then raise exception 'Session helper changed; review before replacing'; end if;
end;
$preflight$;

create or replace function konnekt_beta.admission_open()
returns boolean language sql stable security definer set search_path=''
as $gate$
 select not exists (
    select 1 from konnekt_beta.control c
    where c.singleton and c.started_at is not null
  ) or (select konnekt_beta.allowed());
$gate$;
revoke all on function konnekt_beta.admission_open() from public, anon, authenticated;
grant usage on schema konnekt_beta to anon, authenticated;
grant execute on function konnekt_beta.admission_open() to anon, authenticated;

create or replace function konnekt_private.session_allowed()
returns boolean language sql stable security definer set search_path=''
as $session$
 select exists(select 1 from auth.users where id=auth.uid())
 and not exists(select 1 from public.account_deletion_requests
    where user_id=auth.uid() and status in ('processing','completed'))
 and (coalesce(auth.jwt()->>'aal','aal1')='aal2'
      or not exists(select 1 from auth.mfa_factors
        where user_id=auth.uid() and status='verified'))
 and (select konnekt_beta.admission_open());
$session$;

do $policies$
declare r record;
begin
 for r in select n.nspname as schema_name,c.relname as table_name
   from pg_class c join pg_namespace n on n.oid=c.relnamespace
   where c.relkind in ('r','p')
   and (n.nspname='public' or (n.nspname='storage' and c.relname='objects'))
 loop
  execute format(
    'create policy beta_14_day_gate on %I.%I as restrictive for all to public using ((select konnekt_beta.admission_open())) with check ((select konnekt_beta.admission_open()))',
    r.schema_name,r.table_name
  );
 end loop;
end;
$policies$;
commit;
-- NO activation and NO identity enrollment in this migration.
-- Protected access only becomes beta-restricted after the one-way activation.
-- Audit service-role/Edge Functions, SECURITY DEFINER RPCs, signed media
-- and Realtime channels before treating this as complete beta isolation.
