# Competitive foundations development report — 17 November 2026

Baseline: main `e5c6a69`. Branch: `development/competitive-foundations-20261117`. The five-tab navigation candidate is isolated on `development/five-tab-review-20261117`. Neither candidate is authorized for automatic merge or production publication. Commit, PR, final CI and APK artifact links are recorded in each PR description to avoid claiming a future workflow has passed.

Public-release decision: **HOLD**. This is a verified incremental upgrade, not completion of the competitive feature target. The full classified inventory is [COMPETITIVE_INVENTORY_2026-11-17.md](COMPETITIVE_INVENTORY_2026-11-17.md).

## Feature comparison

| Feature | Before | After | Evidence / limit |
| --- | --- | --- | --- |
| Messaging | Encrypted direct/group messaging, receipts, attachments, retry and outsider isolation have scoped staging evidence | Unchanged | Existing live reports and regression suite; no durable offline outbox added |
| Voice/video calls | Invitation/rejection/timeout/hang-up repairs already merged | Unchanged | Existing call-lifecycle tests; physical media/network gate still blocked |
| Notifications | Session-bound registration and safe generic notification routing exist | Unchanged | Existing tests; actual native push still blocked |
| Reels | Active video autoplays, but leaving it active or hiding the page need not pause it | Explicit inactive/hidden/unmount pause, active playback and preserved manual pause on return | Both new browser regressions failed before repair and passed afterward; existing controls/styles/order/upload/engagement reused |
| Recommendations | Chronological query; no recommender | Tested explainable pure ranking foundation, not activated | Six tests: follows/interests/opt-out, exclusion, dedup, diversity/exposure, determinism and limits; no tracking or private-message inputs |
| Creator Studio/analytics | Hub and placeholder cards; content manager reads posts rather than Reels | Existing analytics cards load recorded own-period likes/comments/current follow counts; unknown metrics remain unavailable | Two unit cases and two browser cases; one actual staging account comparison observed before the bounded three-account run timed out |
| Monetisation | Disabled/deferred, no verified revenue | Still disabled; 60/40 ledger/provider/reconciliation and proposed R100 withdrawal design documented | Design review only; no ledger/provider/refund/payout tests claimed |
| Discover | People/videos/hashtags search and follows implemented | Unchanged | Existing social tests and historical live evidence; bounded client search/global trend limitations recorded |
| Status | Text/photo/video and row expiry; public file links and no restricted audiences | Unchanged; launch privacy blocker documented precisely | Public bucket/schema inspected read-only; no audience or media transition deployed |
| Security | Scoped staging encryption/RLS/Realtime/recovery evidence; production rollout pending | No grant or database mutation; ranking ignores message fields, analytics reads only authorized aggregates | Existing security regression suite plus ranking/aggregate tests; no independent cryptographic audit claimed |
| Android compatibility | Verified API26 staging APK, temporary signing only | Existing package IDs/minSDK/signing workflow retained | Web/mobile builds and candidate APK workflow evidence belong in PR; physical devices/stable updates unverified |
| Navigation | Main has six tabs | Upgrade branch unchanged; separate review candidate has Chats/Reels/Status/Discover/Profile and secondary Calls route | Separate PR tests retain call lifecycle assertions and verify Calls access/Back; not automatically merged |

## Engineering changes

Modified:

- `src/screens/WatchScreen.jsx`: replace only the video element with the lifecycle component, retaining props/styles/preload/controls.
- `src/screens/CreatorAnalyticsScreen.jsx`: replace placeholder available metrics with account/period-bound snapshots; retain layout and unknown-metric dashes.

New:

- `src/components/ReelPlayer.jsx`: explicit playback lifecycle and visibility cleanup, including denied autoplay handling.
- `src/services/creatorAnalytics.js`: three exact HEAD counts through existing RLS/FKs, period bounds, published-content filtering and partial-failure handling.
- `src/services/reelRanking.js`: dormant deterministic ranking, public/following eligibility, explicit exclusions, bounded inputs/output and exposure/diversity.
- `tests/browser/reel-playback.test.mjs`: active transition and hidden/foreground/manual-pause regressions.
- `tests/browser/creator-analytics.test.mjs`: exact own-account/window requests, partial errors, unsupported metrics and stale response handling.
- `tests/creator-analytics.test.mjs`: count semantics, limits, invalid input and unavailable-vs-zero behavior.
- `tests/reel-ranking.test.mjs`: six independent ranking policy cases.
- `scripts/acceptance/staging-creator-analytics.mjs`: existing isolated fixture sessions only; compares exact server counts to authorized fixture rows and UI, with private progress/interruption reports.
- This report, the inventory and `RECOMMENDATION_AND_REVENUE_REVIEW.md`.

The separate navigation branch modifies only App.jsx, CallsScreen.jsx, FeatureHubScreen.jsx and their navigation/call-lifecycle test entry/return expectations, adds a navigation test and its review document. No call assertion is removed to accommodate moving Calls out of the main tab bar.

No dependencies, package identities, signing configuration, financial routes or production deployment settings changed. No secrets, profile exports or private test reports are included in Git. No new service or billing requirement introduced.

## Database and security review

No migration applied to staging or production. Read-only inspection covered existing social columns, policies, buckets and indexes. Four additive analytics index proposals are documented with build-cost, EXPLAIN, compatibility and rollback prerequisites. They are not executable production migrations. A separate private-media/audience transition is required; flipping the shared public bucket would break current public content and is explicitly excluded.

Advisors remain eleven authenticated-definer warnings, five intentional private no-policy INFO findings and one disabled leaked-password warning. Existing reviewed security boundaries are unchanged; this upgrade does not resolve production promotion. See [Supabase public/private bucket behavior](https://supabase.com/docs/guides/storage/buckets/fundamentals) and [definer review guidance](https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable).

## Verification

Baseline clean install/lint, 63 unit/database tests and four existing social browser tests passed. Both added playback regressions failed on the baseline and passed with the repair. Focused analytics unit/browser and six ranking cases passed. Development StrictMode may issue a duplicate initial read; tests verify each query's scope rather than assuming a production-only request count.

Final local regression passed: clean npm ci, lint, 71 unit/database/service-worker tests, 62 browser tests, web/mobile production builds, six compiled smoke checks and zero production dependency vulnerabilities. Exact-commit CI and APK evidence are recorded separately in the PR description when observed. An existing >500 kB chunk advisory is not a mobile performance pass.

The actual analytics acceptance run was incomplete: one account's exact counts matched independently read authorized rows and its real screen, but the bounded three-account run exceeded its runtime while persistent browser sessions were slow. Do not classify the full live suite as passed. Test processes were stopped without clearing stored identities/profiles. The runner now persists progress and SIGTERM status for future bounded runs; repeat with `CHROMIUM_PATH` pointing to the installed Chromium and a private `KONNEKT_ACCEPTANCE_CONFIG`, sequentially without concurrent browser suites.

Physical-device performance, installation/update, cross-network media and native push remain BLOCKED. Automated tests do not establish production readiness.

## Remaining decisions and next milestone

1. Review the two unmerged PRs independently; approve five-tab behavior separately from the upgrade.
2. Prioritize the restricted Status/Reels file privacy transition: audience model, existing public-file treatment, isolated private storage, expiry-bounded signed URLs, staging backfill/rollback and three-account access acceptance. Preserve current public assets.
3. Complete missing bookmarks/sharing/connected per-account preference controls in an approved design increment; approve ranking activation before changing feed order. Add consented watch measurement only with rate limits/retention decisions.
4. Retain disabled financial/live scope until provider, eligibility, settlement/reconciliation, legal and sandbox acceptance exist. R100 is still a proposal.
5. Supply stable signing and provider credentials privately; execute two-phone calls/push/update tests, provider-enabled deletion, supported full-service backup/restore, real email recovery and separately approved production security/operations acceptance.

No readiness percentage is assigned. Features requiring new behavior, schema/storage migration, owner configuration or hardware remain explicitly incomplete.
