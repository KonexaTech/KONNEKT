-- STAGING ONLY: oiwtfkgrnpzirghbsvim. Manual review/deployment; NEVER production.
-- Inactive by default. Applying this migration would intentionally deny staging app
-- access until exactly 20 approved staging accounts are enrolled and activated.
-- Prior to deployment verify service-role/Edge/Realtime/public URL bypass controls.
begin;
-- Fail closed before installing policies: a public Supabase Storage bucket can
-- serve already-known file URLs without consulting storage.objects RLS.
-- Private buckets still require separate tests of issued signed URLs.
do $public_media_preflight$
begin
 if exists(select 1 from storage.buckets where public) then
   raise exception using errcode='42501',
     message='Beta activation blocked: a public Storage bucket bypasses session expiry and shutdown. Review and migrate public media URLs before deployment.';
 end if;
end $public_media_preflight$;
create schema if not exists konnekt_beta;
revoke all on schema konnekt_beta from public, anon, authenticated;
create table if not exists konnekt_beta.control (
 singleton boolean primary key default true check (singleton),
 enabled boolean not null default false,
 started_at timestamptz,
 ends_at timestamptz,
 constraint beta_fourteen_days check (
   (started_at is null and ends_at is null)
   or (started_at is not null and ends_at = started_at + interval '14 days')
 )
);
insert into konnekt_beta.control(singleton,enabled) values(true,false) on conflict do nothing;
create table if not exists konnekt_beta.testers (
 user_id uuid primary key references auth.users(id) on delete cascade,
 enrolled_at timestamptz not null default now()
);
alter table konnekt_beta.control enable row level security;
alter table konnekt_beta.testers enable row level security;
revoke all on all tables in schema konnekt_beta from public, anon, authenticated;
create or replace function konnekt_beta.allowed()
returns boolean language sql stable security definer set search_path=''
as $fn$
 select auth.uid() is not null
   and exists (
     select 1 from konnekt_beta.control c
     where c.singleton and c.enabled and c.started_at <= now()
       and now() < c.ends_at
   )
   and (select count(*) from konnekt_beta.testers)=20
   and exists (select 1 from konnekt_beta.testers t where t.user_id=auth.uid());
$fn$;
revoke all on function konnekt_beta.allowed() from public, anon, authenticated;
grant usage on schema konnekt_beta to authenticated;
grant execute on function konnekt_beta.allowed() to authenticated;
-- Protect privileged RPCs that delegate to the existing session_allowed() helper.
-- This body is based on the inspected staging definition (19 November 2026).
-- Do not deploy if staging helper's definition has since changed.
create or replace function konnekt_private.session_allowed()
returns boolean language sql stable security definer set search_path=''
as $fn$
 select exists(select 1 from auth.users where id=auth.uid())
 and not exists(select 1 from public.account_deletion_requests
   where user_id=auth.uid() and status in ('processing','completed'))
 and (coalesce(auth.jwt()->>'aal','aal1')='aal2'
      or not exists(select 1 from auth.mfa_factors
           where user_id=auth.uid() and status='verified'))
 and (select konnekt_beta.allowed());
$fn$;
-- Deny table reads/writes including previously authenticated sessions.
-- Existing permissive ownership/membership policies still apply in addition.
do $block$
declare r record;
begin
 for r in
   select n.nspname,c.relname,c.relrowsecurity
   from pg_class c join pg_namespace n on n.oid=c.relnamespace
   where c.relkind in ('r','p')
     and (n.nspname='public' or (n.nspname='storage' and c.relname='objects'))
 loop
   if not r.relrowsecurity then
     raise exception 'Beta security requires RLS on %.%',r.nspname,r.relname;
   end if;
   if not exists(select 1 from pg_policies p where p.schemaname=r.nspname
     and p.tablename=r.relname and p.policyname='beta_14_day_gate') then
     execute format('create policy beta_14_day_gate on %I.%I as restrictive for all to public using ((select konnekt_beta.allowed())) with check ((select konnekt_beta.allowed()))',r.nspname,r.relname);
   end if;
 end loop;
end $block$;
commit;
-- Deliberately NO activation here. Never enable without live negative tests.
-- Operator shutdown after activation:
-- update konnekt_beta.control set enabled=false where singleton;
