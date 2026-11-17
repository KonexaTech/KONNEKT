-- STAGING ONLY after catalog inspection. Keep member SELECT and own participant
-- updates; only the creator may change the shared session, including ending it.
BEGIN;
DROP POLICY IF EXISTS release_group_call_owner_update ON public.group_call_sessions;
CREATE POLICY release_group_call_owner_update ON public.group_call_sessions
AS RESTRICTIVE FOR UPDATE TO authenticated
USING (created_by=(SELECT auth.uid()))
WITH CHECK (created_by=(SELECT auth.uid()));
COMMIT;
