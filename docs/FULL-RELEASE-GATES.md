# KONNEKT full-feature release gates (working checklist)

Status: **NO-GO** until every mandatory gate has dated, reproducible evidence. This document is a plan, not a certification.

## Non-negotiable change controls
- Keep the existing Chats, Reels, Status, Discover, Profile navigation and approved appearance.
- Preserve user records, media, messages, and Supabase production data.
- All source fixes go through a repair branch and reviewed pull request; do not merge or deploy without explicit approval.
- Inspect actual Supabase schema before preparing additive migrations; validate migrations in isolated/staging environments before seeking production approval.
- No unapproved paid providers or secrets committed to Git.

## Phase A — Consolidate existing repairs
- [ ] Compare main against open PR #4 (conversation UUID, encrypted attachments, group key retries) and PR #6 (CI dependency audit); avoid duplicate/conflicting edits.
- [ ] Confirm which fixes from audit PR #3 and attachment PR #5 actually landed in main.
- [ ] Verify live Supabase state against the two previously approved audit migrations, without replaying old SQL.
- [ ] Run locked install, lint, unit/SQL tests, browser tests, production web/mobile builds, and dependency audit on the final proposed head commit.

## Phase B — Security blockers
- [ ] K03: move private phone values behind appropriate access controls; test anonymous, unrelated authenticated, and owner access.
- [ ] K17: enforce MFA challenge for enrolled users and verify recovery/authorization.
- [ ] K23: enforce account, status, and media privacy server-side; design media expiration and cleanup.
- [ ] K26: provide a tested, authorized account-deletion workflow, including media and legal retention handling.
- [ ] Accept live fixes for K01/K02/K04–K09/K18/K22/K24 with negative authorization tests.
- [ ] Independent review of encryption, storage policies, callable functions, secret handling, abuse prevention and logging.

## Phase C — Core and advanced features
- [ ] Two-account direct/group messages: membership, blocks, retries, ordering, attachments, voice notes, encryption and receipt updates.
- [ ] Reels/Status/Discover: creation, discovery, comments, likes, follows, reporting, privacy and expiration.
- [ ] Voice/video calls: permissions, signaling, reconnection, NAT/TURN, ringing, cancellation, and cross-device audio/video.
- [ ] Live rooms: real media publishing/subscribing, room roles, moderation, reconnect and capacity limits (K33).
- [ ] Push: provider credentials, opt-in, token rotation, background/terminated delivery, routing, logout cleanup and abuse controls (K36).
- [ ] Creator monetisation: approved business rules, eligibility, payment-provider contracts, real ledger, payout verification, refunds/chargebacks, fraud controls, reconciliation and tax/legal review (K34). A mock payment is not launch-ready.
- [ ] Edge Functions: source layout, imports, schema compatibility, authorization, deploy and monitoring (K25).

## Phase D — Platform and operations
- [ ] Android 8+ installation, signed APK/AAB, permissions, background behavior and device matrix.
- [ ] PWA install, offline/failure behavior, deep links and service-worker upgrade.
- [ ] SMTP, Auth redirects, rate limiting, CAPTCHA/abuse response, secret rotation and backup restore.
- [ ] Crash/error monitoring, alerts, incident response, capacity limits and rollback rehearsal.
- [ ] South African POPIA and international privacy/legal review, terms, community rules, child-safety and payment requirements.
- [ ] Fix or explicitly accept remaining performance and maintainability findings K35/K39/K40/K41.

## Final GO/NO-GO
- [ ] No unresolved critical/high security findings.
- [ ] All required automated checks pass on the release commit.
- [ ] Real two-account and real-device evidence covers every claimed public feature.
- [ ] Payments and live streaming are verified with approved providers and budget.
- [ ] Authorized release owner explicitly approves merge and deployment.

**Evidence rule:** Mark a box complete only with a dated test log, PR/commit, deployment record, or reviewed acceptance artifact. Do not infer release readiness from a passing Vite build alone.
