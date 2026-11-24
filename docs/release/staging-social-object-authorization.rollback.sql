-- STAGING ONLY emergency rollback to the exact inspected previous policy.
-- This reopens the known broad authenticated-read weakness. Obtain owner review
-- before using it; never apply either staging file to production.
BEGIN;
DROP POLICY IF EXISTS "social objects require visible content" ON storage.objects;
CREATE POLICY "public media readable by signed in users" ON storage.objects
  FOR SELECT TO authenticated USING (bucket_id = 'konnekt-public-media'::text);
DROP FUNCTION IF EXISTS konnekt_private.can_read_social_object(text);
COMMIT;
