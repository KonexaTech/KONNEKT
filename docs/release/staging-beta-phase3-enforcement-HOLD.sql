-- STAGING ONLY: oiwtfkgrnpzirghbsvim. Phase 3 is NOT SAFE TO RUN
-- until all 20 verified tester UUIDs and the separate owner UUID are enrolled,
-- private-media sign/download and service-role/Edge/Realtime/push bypasses audited,
-- and a rollback/negative-test window is explicitly scheduled.
-- Production project must never receive these beta policies.
begin;
do $preflight$
begin
 if (select count(*) from konnekt_beta.testers)<>20
   or (select count(*) from konnekt_beta.owner_access)<>1
 then raise exception 'Refusing enforcement: 20 testers plus 1 owner not enrolled'; end if;
 if exists(select 1 from konnekt_beta.control where enabled or started_at is not null)
 then raise exception 'Refusing enforcement on activated beta'; end if;
 if to_regprocedure('konnekt_beta.allowed()') is null
 then raise exception 'Private beta controls (phase 2) missing'; end if;
 if exists(select 1 from storage.buckets where public)
 then raise exception 'Public Storage bucket prevents reliable beta shutdown'; end if;
 if exists(
   select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace
   where c.relkind in ('r','p') and not c.relrowsecurity
   and (n.nspname='public' or (n.nspname='storage' and c.relname='objects'))
 ) then raise exception 'An exposed table lacks row-level security'; end if;
 -- These exact session helper checks have been inspected on staging;
 -- do not silently overwrite a future change to MFA/deletion handling.
 if not (pg_get_functiondef('konnekt_private.session_allowed()'::regprocedure)
     ilike '%account_deletion_requests%'
   and pg_get_functiondef('konnekt_private.session_allowed()'::regprocedure)
     ilike '%auth.mfa_factors%'
   and pg_get_functiondef('konnekt_private.session_allowed()'::regprocedure)
     not ilike '%konnekt_beta.allowed%')
 then raise exception 'Session helper changed: inspect before deploying phase 3'; end if;
end $preflight$;

-- Private phase 2 already contains the roster cap, owner distinction,
-- immutable activation timestamp and one-way shutdown.
grant usage on schema konnekt_beta to authenticated;
grant execute on function konnekt_beta.allowed() to authenticated;

create or replace function konnekt_private.session_allowed()
returns boolean language sql stable security definer set search_path=''
as $function$
 select exists(select 1 from auth.users where id=auth.uid())
 and not exists(select 1 from public.account_deletion_requests
   where user_id=auth.uid() and status in ('processing','completed'))
 and (coalesce(auth.jwt()->>'aal','aal1')='aal2'
   or not exists(select 1 from auth.mfa_factors
     where user_id=auth.uid() and status='verified'))
 and (select konnekt_beta.allowed());
$function$;

do $policies$
declare row_ record;
begin
 for row_ in
   select n.nspname schema_name,c.relname table_name
   from pg_class c join pg_namespace n on n.oid=c.relnamespace
   where c.relkind in ('r','p')
    and (n.nspname='public' or (n.nspname='storage' and c.relname='objects'))
 loop
   if exists(select 1 from pg_policies p where
       p.schemaname=row_.schema_name and p.tablename=row_.table_name
       and p.policyname='beta_14_day_gate')
   then raise exception 'Beta policy already present for %.%',row_.schema_name,row_.table_name;
   end if;
   execute format(
    'create policy beta_14_day_gate on %I.%I as restrictive for all to public using ((select konnekt_beta.allowed())) with check ((select konnekt_beta.allowed()))',
    row_.schema_name,row_.table_name
   );
 end loop;
end $policies$;
commit;
-- INTENTIONALLY NO ENABLE/START COMMAND. Phase 3 will deny app access
-- until the operator performs negative/positive tests and explicitly activates
-- the one-time fourteen-day control window.
