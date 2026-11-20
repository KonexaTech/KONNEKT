-- STAGING ONLY — non-enforcing phase 2. Depends on the phase-1 beta tables.
-- Prepare exact 20 tester + one owner approval, immutable 14-day window.
-- No public RLS updates, no app login restrictions, no activation.
begin;
do $preflight$
begin
 if to_regclass('konnekt_beta.control') is null
    or to_regclass('konnekt_beta.testers') is null
    or to_regclass('konnekt_beta.owner_access') is null
 then raise exception 'Missing non-enforcing beta roster preparation';
 end if;
 if exists(select 1 from konnekt_beta.control where enabled or started_at is not null)
    or exists(select 1 from konnekt_beta.testers)
    or exists(select 1 from konnekt_beta.owner_access)
 then raise exception 'Cannot install phase 2 over an enrolled or active beta';
 end if;
 if to_regprocedure('konnekt_beta.allowed()') is not null
 then raise exception 'Phase 2 already installed; inspect rather than reinstall';
 end if;
end $preflight$;

create function konnekt_beta.enforce_roster_limit()
returns trigger language plpgsql security definer set search_path=''
as $body$
begin
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('konnekt-beta-21-person-roster',0));
 if exists(select 1 from konnekt_beta.control where started_at is not null)
 then raise exception 'Beta roster cannot be modified after activation' using errcode='42501';
 end if;
 if TG_TABLE_NAME='testers' then
   if exists(select 1 from konnekt_beta.owner_access where user_id=NEW.user_id)
   then raise exception 'Owner cannot occupy tester slot' using errcode='23514'; end if;
   if TG_OP='INSERT' and (select count(*) from konnekt_beta.testers)>=20
   then raise exception 'Only 20 testers may be enrolled' using errcode='23514'; end if;
 else
   if exists(select 1 from konnekt_beta.testers where user_id=NEW.user_id)
   then raise exception 'Owner must be distinct from testers' using errcode='23514'; end if;
 end if;
 return NEW;
end;
$body$;
revoke all on function konnekt_beta.enforce_roster_limit() from public,anon,authenticated;
create trigger beta_roster_limit_testers
before insert or update of user_id on konnekt_beta.testers
for each row execute function konnekt_beta.enforce_roster_limit();
create trigger beta_roster_limit_owner
before insert or update of user_id on konnekt_beta.owner_access
for each row execute function konnekt_beta.enforce_roster_limit();

create function konnekt_beta.enforce_control_window()
returns trigger language plpgsql security definer set search_path=''
as $body$
begin
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('konnekt-beta-21-person-roster',0));
 if OLD.started_at is not null then
   if NEW.started_at is distinct from OLD.started_at or NEW.ends_at is distinct from OLD.ends_at
   then raise exception 'The beta start and end times are immutable' using errcode='42501'; end if;
   if NOT OLD.enabled and NEW.enabled
   then raise exception 'Stopped beta cannot be restarted' using errcode='42501'; end if;
 elsif NEW.enabled or NEW.started_at is not null then
   if NEW.enabled is not true or NEW.started_at is null
      or NEW.started_at > now() or NEW.started_at < now()-interval '5 minutes'
      or NEW.ends_at is distinct from NEW.started_at+interval '14 days'
   then raise exception 'Activation must start a fixed 14-day window now' using errcode='23514'; end if;
   if (select count(*) from konnekt_beta.testers)<>20
      or (select count(*) from konnekt_beta.owner_access)<>1
      or exists(select 1 from konnekt_beta.testers t join konnekt_beta.owner_access o on o.user_id=t.user_id)
   then raise exception 'Activation needs exactly 20 distinct testers and one owner' using errcode='23514'; end if;
 end if;
 return NEW;
end;
$body$;
revoke all on function konnekt_beta.enforce_control_window() from public,anon,authenticated;
create trigger beta_fixed_control_window
before update on konnekt_beta.control
for each row execute function konnekt_beta.enforce_control_window();

create function konnekt_beta.allowed()
returns boolean language sql stable security definer set search_path=''
as $body$
 select auth.uid() is not null
   and exists(select 1 from konnekt_beta.control c
      where c.enabled and c.started_at<=now() and now()<c.ends_at)
   and (select count(*) from konnekt_beta.testers)=20
   and (select count(*) from konnekt_beta.owner_access)=1
   and not exists(select 1 from konnekt_beta.testers t
      join konnekt_beta.owner_access o on t.user_id=o.user_id)
   and (exists(select 1 from konnekt_beta.testers where user_id=auth.uid())
     or exists(select 1 from konnekt_beta.owner_access where user_id=auth.uid()));
$body$;
revoke all on function konnekt_beta.allowed() from public,anon,authenticated;
commit;
-- Still NOT enforcing access to public app tables, RPCs, Realtime, media or push.
-- The beta remains OFF. Final rollout only after approved 21 UUIDs and negative tests.
