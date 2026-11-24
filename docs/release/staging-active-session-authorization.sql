-- PROPOSED: konnekt-staging oiwtfkgrnpzirghbsvim ONLY, after owner review.
-- Preserve the inspected Auth-user, deletion, MFA and beta admission checks.
-- Adds canonical session ownership/expiry validation; changes no Auth records.
CREATE OR REPLACE FUNCTION konnekt_private.session_allowed()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
 SELECT EXISTS(SELECT 1 FROM auth.users WHERE id=auth.uid())
 AND EXISTS(
   SELECT 1 FROM auth.sessions s
   WHERE s.user_id=auth.uid()
     AND s.id = CASE WHEN (auth.jwt()->>'session_id') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
       THEN (auth.jwt()->>'session_id')::uuid ELSE NULL END
     AND (s.not_after IS NULL OR s.not_after > now())
 )
 AND NOT EXISTS(SELECT 1 FROM public.account_deletion_requests
   WHERE user_id=auth.uid() AND status IN ('processing','completed'))
 AND (coalesce(auth.jwt()->>'aal','aal1')='aal2'
   OR NOT EXISTS(SELECT 1 FROM auth.mfa_factors WHERE user_id=auth.uid() AND status='verified'))
 AND (SELECT konnekt_beta.admission_open());
$$;
-- CREATE OR REPLACE retains current owner/ACL. Do not add grants or remove gates.
