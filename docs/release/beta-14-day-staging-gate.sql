-- REVIEW ONLY. STAGING PROJECT oiwtfkgrnpzirghbsvim. Do not apply to production.
-- Install only after auditing SECURITY DEFINER RPCs, Realtime and storage.
begin;
create schema if not exists konnekt_beta;
revoke all on schema konnekt_beta from public, anon, authenticated;
create table if not exists konnekt_beta.control (
  singleton boolean primary key default true check (singleton),
  enabled boolean not null default false,
  started_at timestamptz,
  ends_at timestamptz,
  check (ends_at is null or (started_at is not null and ends_at = started_at + interval '14 days'))
);
insert into konnekt_beta.control(singleton) values(true) on conflict do nothing;
create table if not exists konnekt_beta.testers (
  user_id uuid primary key references auth.users(id) on delete cascade,
  enrolled_at timestamptz not null default now()
);
revoke all on all tables in schema konnekt_beta from public, anon, authenticated;
alter table konnekt_beta.control enable row level security;
alter table konnekt_beta.testers enable row level security;
create or replace function konnekt_beta.allowed()
returns boolean language sql stable security definer set search_path = ''
as $$
  select (select auth.uid()) is not null
    and exists (
      select 1 from konnekt_beta.control c
      where c.singleton and c.enabled
        and c.started_at <= now() and now() < c.ends_at
    )
    and exists (
      select 1 from konnekt_beta.testers t
      where t.user_id = (select auth.uid())
    );
$$;
revoke all on function konnekt_beta.allowed() from public, anon;
grant usage on schema konnekt_beta to authenticated;
grant execute on function konnekt_beta.allowed() to authenticated;
-- Restrictive policies combine with existing ownership and membership policies.
-- This deliberately does not modify public RPCs or Realtime authorization.
do $block$
declare r record;
begin
 for r in select n.nspname,c.relname,c.relrowsecurity
 from pg_class c join pg_namespace n on n.oid=c.relnamespace
 where c.relkind='r' and (n.nspname='public' or (n.nspname='storage' and c.relname='objects'))
 loop
   if not r.relrowsecurity then raise exception 'RLS missing on %.%',r.nspname,r.relname; end if;
   execute format('create policy beta_14_day_gate on %I.%I as restrictive for all to authenticated using ((select konnekt_beta.allowed())) with check ((select konnekt_beta.allowed()))',r.nspname,r.relname);
 end loop;
end $block$;
commit;
-- Operator activation (run privately with elevated staging credentials only):
-- BEGIN; LOCK TABLE konnekt_beta.control IN EXCLUSIVE MODE;
-- Confirm exactly 20 approved UUIDs in konnekt_beta.testers; then
-- UPDATE konnekt_beta.control SET started_at=now(),ends_at=now()+interval '14 days',enabled=true WHERE singleton;
-- COMMIT;
-- Emergency shutdown: UPDATE konnekt_beta.control SET enabled=false WHERE singleton;
-- Do not activate until RPCs, Realtime, storage, Auth and bypass tests are accepted.
