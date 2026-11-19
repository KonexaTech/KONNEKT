-- Staging-only non-enforcing phase 1: oiwtfkgrnpzirghbsvim.
-- Creates empty, private beta coordination tables. DOES NOT change existing
-- RLS, public RPCs, Auth config, Storage buckets or service roles.
-- Never run against production itkoagpigiifodfhoujt.
begin;
do $preflight$
begin
 if current_database() is null then raise exception 'Invalid database'; end if;
 if to_regnamespace('konnekt_beta') is not null then
   raise exception 'Beta schema already exists; inspect instead of rerunning bootstrap';
 end if;
end $preflight$;
create schema konnekt_beta;
revoke all on schema konnekt_beta from public, anon, authenticated;
create table konnekt_beta.control (
 singleton boolean primary key default true check(singleton),
 enabled boolean not null default false,
 started_at timestamptz,
 ends_at timestamptz,
 constraint beta_fourteen_days check(
   (started_at is null and ends_at is null) or
   (started_at is not null and ends_at = started_at + interval '14 days')
 )
);
insert into konnekt_beta.control(singleton,enabled) values(true,false);
create table konnekt_beta.testers (
 user_id uuid primary key references auth.users(id) on delete cascade,
 enrolled_at timestamptz not null default now()
);
create table konnekt_beta.owner_access (
 singleton boolean primary key default true check(singleton),
 user_id uuid not null unique references auth.users(id) on delete cascade,
 enrolled_at timestamptz not null default now()
);
alter table konnekt_beta.control enable row level security;
alter table konnekt_beta.testers enable row level security;
alter table konnekt_beta.owner_access enable row level security;
revoke all on all tables in schema konnekt_beta from public, anon, authenticated;
commit;
-- PHASE 1 ONLY: no beta authorization function, no global restrictive policies,
-- no privileged-session helper changes, no activation, and no tester invitations.
