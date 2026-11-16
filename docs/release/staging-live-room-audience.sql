-- STAGING ONLY. Restricted live audiences are unavailable in the current app.
-- Public room behavior is retained; legacy restricted rooms become owner-only.
BEGIN;
DROP POLICY IF EXISTS release_live_audience_read ON public.live_streams;
CREATE POLICY release_live_audience_read ON public.live_streams
AS RESTRICTIVE FOR SELECT TO authenticated
USING (host_id = (SELECT auth.uid()) OR audience = 'Everyone');
DROP POLICY IF EXISTS release_live_audience_insert ON public.live_streams;
CREATE POLICY release_live_audience_insert ON public.live_streams
AS RESTRICTIVE FOR INSERT TO authenticated
WITH CHECK (audience = 'Everyone');
COMMIT;
