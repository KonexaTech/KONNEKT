-- STAGING ONLY: oiwtfkgrnpzirghbsvim. Manual review/deployment; NEVER production.
-- Inactive by default. Applying this migration would intentionally deny staging app
-- access until exactly 20 approved tester accounts and one distinct owner account are enrolled and activated.
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
-- This singleton reserves exactly one separately verified founder/owner UUID.
-- It does not authorize anyone merely by knowing the owner's email or tester code.
create table if not exists konnekt_beta.owner_access (
 singleton boolean primary key default true check (singleton),
 user_id uuid not null unique references auth.users(id) on delete restrict,
 enrolled_at timestamptz not null default now()
);
-- Serialize privileged enrollment operations, including concurrent inserts, and
-- hard-cap testers at 20 while prohibiting the owner's UUID in tester slots.
create or replace function konnekt_beta.enforce_roster_limit()
returns trigger language plpgsql security definer set search_path=''
as $limit$
begin
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('konnekt-beta-21-person-roster',0));
 if TG_TABLE_NAME = 'testers' then
   if exists(select 1 from konnekt_beta.owner_access o where o.user_id=NEW.user_id) then
     raise exception using errcode='23514',message='The owner account cannot use a tester slot.';
   end if;
   if TG_OP = 'INSERT' and (select count(*) from konnekt_beta.testers) >= 20 then
     raise exception using errcode='23514',message='Only 20 tester accounts may be enrolled.';
   end if;
 else
   if exists(select 1 from konnekt_beta.testers t where t.user_id=NEW.user_id) then
     raise exception using errcode='23514',message='The owner account must be separate from all testers.';
   end if;
 end if;
 return NEW;
end;
$limit$;
create trigger beta_tester_roster_limit
before insert or update of user_id on konnekt_beta.testers
for each row execute function konnekt_beta.enforce_roster_limit();
create trigger beta_owner_roster_limit
before insert or update of user_id on konnekt_beta.owner_access
for each row execute function konnekt_beta.enforce_roster_limit();
alter table konnekt_beta.control enable row level security;
alter table konnekt_beta.testers enable row level security;
alter table konnekt_beta.owner_access enable row level security;
revoke all on all tables in schema konnekt_beta from public, anon, authenticated;
revoke all on function konnekt_beta.enforce_roster_limit() from public, anon, authenticated;
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
   and (select count(*) from konnekt_beta.owner_access)=1
   and not exists (
     select 1 from konnekt_beta.testers t
     join konnekt_beta.owner_access o on t.user_id=o.user_id
   )
   and (
     exists (select 1 from konnekt_beta.testers t where t.user_id=auth.uid())
     or exists (select 1 from konnekt_beta.owner_access o where o.user_id=auth.uid())
   );
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
-- Deliberately NO activation here. Provision exactly 20 distinct tester UUIDs\n-- and 1 separately verified owner UUID privately with a privileged connection.\n-- Operator MUST bind owner_access.user_id to the owner's real staging Auth UUID.\n-- The 14-day clock starts on explicit activation, not APK build or first login.\n-- This is an APP ADMISSION gate, not a pre-signup Auth hook: unapproved\n-- people might create Auth identities but cannot access protected app data.\n-- To prevent extra Auth signups themselves, separately configure/review an\n-- invite-only Supabase Auth admission mechanism before distribution.\n-- Never enable without live negative tests.
-- Operator shutdown after activation:
-- update konnekt_beta.control set enabled=false where singleton;
