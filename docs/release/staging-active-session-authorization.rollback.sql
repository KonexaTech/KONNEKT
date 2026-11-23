-- Captured current staging definition, 22 November 2026. No row changes.
-- Emergency rollback reopens the observed stale-access-token limitation.
CREATE OR REPLACE FUNCTION konnekt_private.session_allowed()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
 select exists(select 1 from auth.users where id=auth.uid())
 and not exists(select 1 from public.account_deletion_requests
    where user_id=auth.uid() and status in ('processing','completed'))
 and (coalesce(auth.jwt()->>'aal','aal1')='aal2'
      or not exists(select 1 from auth.mfa_factors
        where user_id=auth.uid() and status='verified'))
 and (select konnekt_beta.admission_open());
$$;
