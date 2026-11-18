-- STAGING ONLY: oiwtfkgrnpzirghbsvim. Read-only negative controls.
-- Does not substitute for real signed-in member/nonmember positive controls.
-- Run with a privileged SQL runner capable of SET LOCAL ROLE; never in production.
-- Any nonzero visible row count means investigate before beta approval.
BEGIN READ ONLY;
SET LOCAL ROLE authenticated;
-- No JWT: authenticated role without a user identity must see no protected rows.
SELECT 'no-jwt' AS scenario,
  (SELECT count(*) FROM public.messages) AS messages_visible,
  (SELECT count(*) FROM public.conversation_members) AS memberships_visible,
  (SELECT count(*) FROM public.user_reports) AS reports_visible;
-- Deliberately nonexistent test identity: never impersonate a real user.
SELECT set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000001', true);
SELECT 'unknown-identity' AS scenario,
  (SELECT count(*) FROM public.messages) AS messages_visible,
  (SELECT count(*) FROM public.conversation_members) AS memberships_visible,
  (SELECT count(*) FROM public.user_reports) AS reports_visible;
ROLLBACK;
