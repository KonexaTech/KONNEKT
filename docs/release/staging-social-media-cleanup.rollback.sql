-- STAGING ONLY: oiwtfkgrnpzirghbsvim, after owner review.
-- Disable cleanup-social-media and drain all in-flight invocations FIRST.
-- Removes entrypoints and reference triggers; keeps permanent retirement records
-- for recovery review. Does not restore removed objects or delete Storage rows.
BEGIN;
DROP FUNCTION public.konnekt_claim_social_cleanup(uuid,uuid,text);
DROP FUNCTION public.konnekt_social_cleanup_absent(uuid,text);
DROP TRIGGER guard_social_cleanup_reference ON public.reels;
DROP TRIGGER guard_social_cleanup_reference ON public.statuses;
DROP TRIGGER guard_social_cleanup_reference ON public.posts;
DROP FUNCTION konnekt_private.guard_social_cleanup_reference();
DROP FUNCTION konnekt_private.canonical_social_reference(text);
COMMIT;
