-- STAGING ONLY: reviewed against oiwtfkgrnpzirghbsvim on 2026-11-22.
-- Replaces one broad SELECT policy. Does not change files, rows or bucket flags.
-- Requires existing public content RLS and konnekt_is_blocked_pair(uuid).
CREATE OR REPLACE FUNCTION konnekt_private.can_read_social_object(object_path text)
RETURNS boolean LANGUAGE sql STABLE SECURITY INVOKER SET search_path = '' AS $$
  SELECT (SELECT auth.uid()) IS NOT NULL AND (
    EXISTS (
      SELECT 1 FROM public.reels r
      WHERE pg_catalog.split_part(object_path, '/', 1) = 'reels'
        AND pg_catalog.split_part(object_path, '/', 2) = r.user_id::text
        AND r.media_path = object_path
        AND r.deleted_at IS NULL AND r.published_at IS NOT NULL
        AND NOT public.konnekt_is_blocked_pair(r.user_id)
    ) OR EXISTS (
      SELECT 1 FROM public.statuses s
      WHERE pg_catalog.split_part(object_path, '/', 1) = 'statuses'
        AND pg_catalog.split_part(object_path, '/', 2) = s.user_id::text
        AND (s.media_url = object_path OR s.media_url = 'https://oiwtfkgrnpzirghbsvim.supabase.co/storage/v1/object/public/konnekt-public-media/' || object_path)
        AND s.expires_at > pg_catalog.now()
        AND NOT public.konnekt_is_blocked_pair(s.user_id)
    ) OR EXISTS (
      SELECT 1 FROM public.posts p
      WHERE pg_catalog.split_part(object_path, '/', 1) = 'posts'
        AND pg_catalog.split_part(object_path, '/', 2) = p.user_id::text
        AND (p.media_url = object_path OR p.media_url = 'https://oiwtfkgrnpzirghbsvim.supabase.co/storage/v1/object/public/konnekt-public-media/' || object_path)
        AND NOT public.konnekt_is_blocked_pair(p.user_id)
    )
  );
$$;
REVOKE ALL ON FUNCTION konnekt_private.can_read_social_object(text) FROM PUBLIC, anon;
GRANT USAGE ON SCHEMA konnekt_private TO authenticated;
GRANT EXECUTE ON FUNCTION konnekt_private.can_read_social_object(text) TO authenticated;
DROP POLICY IF EXISTS "public media readable by signed in users" ON storage.objects;
DROP POLICY IF EXISTS "social objects require visible content" ON storage.objects;
CREATE POLICY "social objects require visible content" ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'konnekt-public-media' AND konnekt_private.can_read_social_object(name));
