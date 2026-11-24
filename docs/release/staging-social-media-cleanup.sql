-- PROPOSED STAGING ONLY: oiwtfkgrnpzirghbsvim, after owner review.
-- Required before deploying cleanup-social-media. No existing object is removed
-- or content row rewritten. Durable claims retire paths permanently, including
-- after failed/uncertain Storage API deletion; retry may delete only that path.
-- Claims and publication share transaction advisory locks, preventing a newly
-- referenced object being deleted after a stale precheck. Never SQL-delete blobs.
BEGIN;
CREATE TABLE konnekt_private.social_cleanup_claims (
  object_path text PRIMARY KEY,
  actor uuid NOT NULL,
  claimed_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE konnekt_private.social_cleanup_claims ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON konnekt_private.social_cleanup_claims FROM PUBLIC,anon,authenticated,service_role;
CREATE FUNCTION konnekt_private.canonical_social_reference(value text)
RETURNS text LANGUAGE sql IMMUTABLE SECURITY INVOKER SET search_path='' AS $$
 SELECT CASE
  WHEN value ~ '^(reels|statuses|posts)/[0-9a-f-]{36}/[A-Za-z0-9._-]+$' THEN value
  WHEN value LIKE 'https://oiwtfkgrnpzirghbsvim.supabase.co/storage/v1/object/public/konnekt-public-media/%'
   AND substring(value FROM length('https://oiwtfkgrnpzirghbsvim.supabase.co/storage/v1/object/public/konnekt-public-media/')+1) ~ '^(reels|statuses|posts)/[0-9a-f-]{36}/[A-Za-z0-9._-]+$'
   THEN substring(value FROM length('https://oiwtfkgrnpzirghbsvim.supabase.co/storage/v1/object/public/konnekt-public-media/')+1)
  ELSE NULL END;
$$;
REVOKE ALL ON FUNCTION konnekt_private.canonical_social_reference(text) FROM PUBLIC,anon,authenticated,service_role;
CREATE FUNCTION konnekt_private.guard_social_cleanup_reference()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' SET lock_timeout='5s' AS $$
DECLARE path text; value text;
BEGIN
 value:=CASE WHEN tg_table_name='reels' THEN to_jsonb(new)->>'media_path' ELSE to_jsonb(new)->>'media_url' END;
 path:=konnekt_private.canonical_social_reference(value);
 IF path IS NOT NULL THEN
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('konnekt-social-cleanup:'||path,0));
  IF EXISTS(SELECT 1 FROM konnekt_private.social_cleanup_claims c WHERE c.object_path=path) THEN
   RAISE EXCEPTION USING ERRCODE='23514',MESSAGE='This upload was retired. Upload a new file before publishing.';
  END IF;
 ELSIF value LIKE '%oiwtfkgrnpzirghbsvim.supabase.co/storage/%' OR value ~ '^(reels|statuses|posts)/' THEN
  -- Unknown/encoded aliases to this project's bucket cannot bypass tombstones.
  RAISE EXCEPTION USING ERRCODE='23514',MESSAGE='Use the canonical social media path for this upload.';
 END IF;
 RETURN new;
END;
$$;
REVOKE ALL ON FUNCTION konnekt_private.guard_social_cleanup_reference() FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER guard_social_cleanup_reference BEFORE INSERT OR UPDATE ON public.reels
 FOR EACH ROW EXECUTE FUNCTION konnekt_private.guard_social_cleanup_reference();
CREATE TRIGGER guard_social_cleanup_reference BEFORE INSERT OR UPDATE ON public.statuses
 FOR EACH ROW EXECUTE FUNCTION konnekt_private.guard_social_cleanup_reference();
CREATE TRIGGER guard_social_cleanup_reference BEFORE INSERT OR UPDATE ON public.posts
 FOR EACH ROW EXECUTE FUNCTION konnekt_private.guard_social_cleanup_reference();
CREATE FUNCTION public.konnekt_claim_social_cleanup(p_actor uuid,p_session uuid,p_path text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' SET lock_timeout='5s' AS $$
DECLARE old_claims text:=current_setting('request.jwt.claims',true); old_sub text:=current_setting('request.jwt.claim.sub',true); level text; allowed boolean;
BEGIN
 IF p_actor IS NULL OR p_session IS NULL OR p_path IS NULL OR length(p_path)>1024
   OR p_path !~ ('^(reels|statuses|posts)/'||p_actor::text||'/[A-Za-z0-9._-]+$')
   OR split_part(p_path,'/',3) IN ('.','..') THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Invalid owned social path'; END IF;
 -- Even the trusted Edge cannot turn an inactive caller into a cleanup grant.
 SELECT s.aal::text INTO level FROM auth.sessions s JOIN auth.users u ON u.id=s.user_id
  WHERE s.id=p_session AND s.user_id=p_actor AND (s.not_after IS NULL OR s.not_after>now())
   AND (u.banned_until IS NULL OR u.banned_until<=now());
 IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Active sign-in required'; END IF;
 PERFORM set_config('request.jwt.claim.sub',p_actor::text,true);
 PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',p_actor,'role','authenticated','session_id',p_session,'aal',level)::text,true);
 allowed:=konnekt_private.session_allowed();
 PERFORM set_config('request.jwt.claims',coalesce(old_claims,''),true);
 PERFORM set_config('request.jwt.claim.sub',coalesce(old_sub,''),true);
 IF allowed IS DISTINCT FROM true THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Authorized sign-in required'; END IF;
 PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('konnekt-social-cleanup:'||p_path,0));
 IF EXISTS(SELECT 1 FROM storage.objects o WHERE o.bucket_id='konnekt-public-media' AND o.name=p_path
    AND coalesce(o.owner_id,o.owner::text,'')<>p_actor::text) THEN
  RETURN jsonb_build_object('guardVersion',1,'path',p_path,'claimed',false);
 END IF;
 -- All-reference checks run as postgres, never through viewer RLS. Draft Reel
 -- references are retained; only softdeleted own Reels and expired own statuses
 -- are eligible. Every post reference and every foreign-owned reference retains.
 IF EXISTS(SELECT 1 FROM public.reels r WHERE konnekt_private.canonical_social_reference(r.media_path)=p_path
      AND (r.user_id<>p_actor OR r.deleted_at IS NULL))
  OR EXISTS(SELECT 1 FROM public.statuses s WHERE konnekt_private.canonical_social_reference(s.media_url)=p_path
      AND (s.user_id<>p_actor OR s.expires_at IS NULL OR s.expires_at>now()))
  OR EXISTS(SELECT 1 FROM public.posts p WHERE konnekt_private.canonical_social_reference(p.media_url)=p_path)
  -- Existing noncanonical local URLs are uncertain references: retain until an
  -- operator reviews them. Future such references are refused by the triggers.
  OR EXISTS(SELECT 1 FROM public.statuses s WHERE s.user_id=p_actor AND s.media_url LIKE '%oiwtfkgrnpzirghbsvim.supabase.co/storage/%' AND konnekt_private.canonical_social_reference(s.media_url) IS NULL)
  OR EXISTS(SELECT 1 FROM public.posts p WHERE p.user_id=p_actor AND p.media_url LIKE '%oiwtfkgrnpzirghbsvim.supabase.co/storage/%' AND konnekt_private.canonical_social_reference(p.media_url) IS NULL)
 THEN RETURN jsonb_build_object('guardVersion',1,'path',p_path,'claimed',false); END IF;
 INSERT INTO konnekt_private.social_cleanup_claims(object_path,actor) VALUES(p_path,p_actor) ON CONFLICT(object_path) DO NOTHING;
 RETURN jsonb_build_object('guardVersion',1,'path',p_path,'claimed',true);
END;
$$;
REVOKE ALL ON FUNCTION public.konnekt_claim_social_cleanup(uuid,uuid,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.konnekt_claim_social_cleanup(uuid,uuid,text) TO service_role;
CREATE FUNCTION public.konnekt_social_cleanup_absent(p_actor uuid,p_path text)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT jsonb_build_object('guardVersion',1,'path',p_path,'absent',
   EXISTS(SELECT 1 FROM konnekt_private.social_cleanup_claims c WHERE c.object_path=p_path AND c.actor=p_actor)
   AND NOT EXISTS(SELECT 1 FROM storage.objects o WHERE o.bucket_id='konnekt-public-media' AND o.name=p_path));
$$;
REVOKE ALL ON FUNCTION public.konnekt_social_cleanup_absent(uuid,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.konnekt_social_cleanup_absent(uuid,text) TO service_role;
COMMIT;
