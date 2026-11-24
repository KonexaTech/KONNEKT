# Staging security observations — 22 November 2026

Scope: read-only catalog inspection of existing `konnekt-staging` (`oiwtfkgrnpzirghbsvim`). Production was not queried or modified for this increment. No database migration, enrollment, account deletion or provider activation was performed.

## Observed state

- All 31 public tables have RLS enabled, including `user_key_backups` and `user_key_passkey_backups`. RLS flags alone are not proof of correct authorization.
- Both `konnekt-chat-media` and `konnekt-public-media` are **private**; each has a 50 MiB server limit. Older reports describing a public social bucket are superseded by this observation.
- Nine Auth accounts remain. No disposable-account deletion scope has been approved in this increment; preserve all accounts.
- Realtime publication includes messages, receipts, conversation membership, direct/group call tables, notifications and statuses. Publication membership does not prove subscriber isolation.
- Beta control exists, with `enabled=false`, no start/end timestamps and zero enrolled testers. `admission_open()` permits access before a start timestamp exists. This is an inactive gate, not an active supervised 20-person beta. Repository documents saying no beta SQL is installed are stale relative to this catalog; reconcile drift before any activation.

## Confirmed media integration defect and repair

Main used `getPublicUrl` for Reel object paths and loaded persisted public Status URLs directly. Those URLs cannot read a private bucket. The repair resolves existing same-project paths/legacy URLs through authenticated `createSignedUrl`, without rewriting records, changing bucket settings or persisting bearer URLs. Tokens last at most 300 seconds; Status requests are additionally bounded by their remaining lifetime. Signing errors remain errors, with no public fallback. Existing external media links retain their existing behavior.

Local behavioral tests cover path normalization, cross-bucket/traversal rejection, expiry, denied signing and private-bucket Reel playback. They do not establish live authorization or Android acceptance. Feed URLs renew while active; the Status viewer removes expired media. Signed URLs are bearer capabilities until they expire.

## Remaining high-severity social-file authorization finding — FAIL

The installed Storage SELECT policy named `public media readable by signed in users` permits any authenticated user to read any object in `konnekt-public-media` (subject to the global MFA/beta gates). It does not join the associated Reel/Status/Post. Conversely, Reel table RLS distinguishes public/follower visibility and excludes unpublished/deleted rows for other users; Status table reads check expiry.

Therefore making the bucket private and fixing client URLs does **not** prove follower-only, deleted or expired media confidentiality. A permitted authenticated account knowing a path can request it independently of the content row. Client token lifetime is not a server-enforced maximum on a hostile caller's signing request. This remains a release blocker; do not claim Status expiry or restricted Reel file authorization passes.

Next reviewed security change must bind Storage reads to the relevant visible content row, handle existing URL/path formats, preserve uploader cleanup and test non-member, unfollowed, blocked and expired access using independently authenticated sessions. Inspect all current policies and existing files first. Do not simply make a production bucket private or delete media. Rollback must restore the exact captured policy definitions, not broadly grant reads. Existing bearer URLs/cache behavior and token expiry need explicit acceptance. No policy change is proposed as applied here.

## Advisories observed

Eight INFO findings concern RLS-enabled tables without client policies in the private/beta schemas; default deny can be intentional. Eleven WARN findings concern authenticated-callable SECURITY DEFINER helpers/RPCs. Their legitimate callers and transitive checks must be reviewed before revoking grants. Leaked-password protection is disabled (WARN). Do not purchase an upgrade to clear an advisory under the R0 budget.

- [RLS with no policy](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy)
- [Authenticated SECURITY DEFINER functions](https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable)
- [Password protection](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection)

## Acceptance still required

Final-source live A/B encrypted direct/group voice/document exchange, C row/Realtime/file denial, recovery and retry cleanup remain unverified for this candidate. Prior scoped live results must not be re-labelled as final-commit evidence. The earlier extended live rerun did not execute because automatic approval review hit a usage limit; it was not a security rejection and was not bypassed.

Stable signing, same-key Android upgrade, two physical phones on Wi-Fi/mobile data, actual closed-app push, owner inbox recovery, backup/restore, deletion fulfillment and approved production security rollout remain separate gates. OneSignal Android delivery requires FCM credentials; no Firebase dependency or provider has been introduced in this increment. Human device tests cannot be replaced by synthetic browser audio or fixture APIs.

**Public release: HOLD.**

## Follow-up evidence and proposed repair

The scoped live messaging/Realtime/recovery checks above now have passing evidence in LIVE_ACCEPTANCE.json, replacing their earlier unverified status for the tested paths. The critical social-file finding remains installed and unresolved remotely. A minimal invoker-only row-authorized policy replacement and exact prior-policy rollback were locally verified against PostgreSQL RLS. Current catalogs/policies and aggregate data counts were captured before requesting staging application. The Supabase connector confirmation expired; read-back showed no helper, no migration record and the old policy unchanged. Do not report deployment of the proposal. Staging and production data were not deleted or reset.

Before an owner confirms the staging migration: inspect the two SQL files and three regression cases; target only oiwtfkgrnpzirghbsvim, retain current bucket flags, preserve current global MFA/beta and chat policies. Then verify with real positive social-media reads plus follower/blocked/expired/orphan negative downloads and signing; verify private messaging remains functional. Existing signed bearer URLs may remain usable until expiry and previously downloaded content cannot be revoked. Production rollout needs separate review and authorization.
