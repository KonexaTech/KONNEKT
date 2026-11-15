# KONNEKT system audit and repair report — 15 November 2026

Repository: `siboniisozulu-alt/KONNEKT` · inspected base: `8159a31` · repair branch: `repair/system-audit-2026-11-15`.

## Decision

**Not ready for public release.** Source repairs are prepared for review. Production `main`, the live Pages deployment and the live Supabase database were not modified by this audit. Two SQL migrations are proposals requiring explicit approval. Critical production defects remain until reviewed database repairs are applied and live tests pass.

Readiness estimate: **40%**, a planning assessment rather than a measured completion percentage: source/build 18/20, functional evidence 10/30, security 6/25, device/end-to-end testing 4/15, operations/legal 2/10. Mocked browser and isolated SQL successes do not establish live multi-user reliability.

## Publication status

The repair branch is published to GitHub after a successful permission retry. The initial Git push and connector branch-creation attempts returned HTTP 403; the retry succeeded. Changes remain on the separate repair branch for draft review. Production and the live database remain unchanged.

## A. Audit results

**41 grouped findings: 2 critical, 16 high, 18 medium, 5 low.** Statuses: 18 repaired in source, 11 covered by unapplied SQL proposals, 12 open. These counts describe the review branch; none imply the production deployment is repaired. Individual advisor warnings are grouped, not added repeatedly to the issue count.

Inspected the inventory of 384 tracked repository files, entry points, canonical JSX screen/import graph, shared services, duplicate source artifacts, SQL, seven Edge Function artifacts, PWA files, Capacitor configuration, dependencies, documentation and three active workflows. Build/lint cover the active application; legacy duplicate `.js` screens are not loaded by the app registry and are excluded from lint. Source review does not certify every placeholder as functional.

Live backend confirmed: project `itkoagpigiifodfhoujt` (`konnekt`), PostgreSQL 17.11.0.018. Inspected public columns/defaults, keys/constraints, functions/ACLs, triggers, RLS policies, storage policies/buckets, realtime publication, advisors and aggregate logs. All 30 public tables have RLS enabled. The project has **zero deployed Edge Functions and no recorded CLI migration history**. Historical schema changes appear to have been applied outside CLI migration history; do not reset or replay the old root SQL files.

Email provider is enabled and email confirmation is required; phone provider is disabled in public Auth settings. SMTP delivery, redirect allowlist, CAPTCHA/rate limits, backup restore and secret configuration were not verified. Anonymous REST probes returned no visible profile/message/membership/report rows (count 0) and denied key-backup table access. Phone privacy finding is authenticated access confirmed through catalog privileges/policy review; no personal phone values were retrieved. Live Pages returned HTTP 200.

Health advisor returned no findings. Security advisor warnings include callable definer functions: they were reviewed as endpoints, not all treated as vulnerabilities, since checked RPCs and trigger functions have different behavior. Performance advisories remain. Aggregate logs were read for the default preceding 24 hours; a zero count for a particular `level` attribute is not proof of no service errors.

| ID | Severity | Verified finding | Status | Evidence / correction |
| --- | --- | --- | --- | --- |
| K01 | Critical | Notification helper references nonexistent entity_type/entity_id columns | Proposed SQL | Live notifications has reference_id. Isolated execution reproduced failed message/follow inserts through their triggers; compatibility SQL repairs the shared helper. |
| K02 | Critical | Direct-chat creator can insert a third member and expose the conversation | Proposed SQL | Live conversation_members INSERT policy checks creator only. Isolated baseline insertion succeeded. Proposed grants reserve conversation/member creation to atomic RPCs. |
| K03 | High | All authenticated accounts can read optional profile phone numbers | Open | profiles SELECT policy is true and authenticated has phone SELECT privilege, confirmed via catalogs. No private phone values were read. Requires a private-data model and compatible profile queries. |
| K04 | High | Legacy direct-conversation RPC bypasses blocking | Proposed SQL | Inspected create_direct_conversation(uuid) creates chats without block checks; anonymous execution is also granted, although its auth.uid guard prevents anonymous creation. Proposal delegates to the checked username RPC and revokes anonymous execution. |
| K05 | High | Blocking does not stop existing direct-message sends or calls | Proposed SQL | Live messages/call_sessions INSERT policies omit block-pair checks. Proposed restrictive guards were tested with synthetic blocked users. |
| K06 | High | Group key envelopes lack recipient membership and creator restrictions | Proposed SQL | Live INSERT repeats the sender membership check twice, without checking target user membership. Proposal restricts distribution to creator and real members; positive and negative isolated tests pass. |
| K07 | High | Call invitations and mutable participant identities lack sufficient restrictions | Proposed SQL | Group-call invites do not require target conversation membership; broad UPDATE permits call identity changes. Proposed membership checks and column UPDATE grants preserve lifecycle updates. |
| K08 | High | Encrypted attachment columns are missing in the live messages table | Proposed SQL | Client writes media_encrypted, media_encryption_iv and media_mime_type; live catalog has none. Proposal adds them without rewriting existing messages. |
| K09 | High | Atomic group creation references missing conversations.description | Proposed SQL | Live function definition and catalog mismatch. Isolated baseline RPC failed, then passed after additive column repair. |
| K10 | High | Chat list selects nonexistent messages.media_encrypted | Repaired on branch | src/services/social.js now selects only existing preview fields and preserves encrypted-message/attachment placeholders. |
| K11 | High | Recipient encryption identity is not prepared at sign-in | Repaired on branch | Only opening a chat prepared keys, preventing send-to-new-user flows. Auth lifecycle now prepares the identity outside the Supabase auth callback. |
| K12 | High | Concurrent identity setup or a mismatched local key can replace a registered identity | Repaired on branch | Identity initialization is serialized per user; conflicting registered/local identities fail closed. Browser tests confirm refusal to replace a key and backup recovery behavior. |
| K13 | High | Voice-note path sends unencrypted media and plaintext body | Repaired on branch | VoiceNoteScreen now uses existing ECDH/AES-GCM helpers for both body and media, with no plaintext fallback. Mocked browser integration verifies encrypted writes and missing-key rejection. |
| K14 | High | React Native Web Alert.alert is a no-op | Repaired on branch | Installed react-native-web implementation has an empty alert method. Shared accessible browser dialog now executes existing callbacks, including incoming-call decline and delete-request confirmation; cancel and confirm are browser-tested. |
| K15 | High | Session restoration and signout leave the wrong screen visible | Repaired on branch | App shell previously reset to Welcome without user identity dependency. It now routes by user/recovery state. Refresh and signout browser tests pass. |
| K16 | High | Pinned Vite version has reported security advisories | Repaired on branch | Baseline npm audit: one high Vite finding and one moderate esbuild finding. Compatible Vite 6.4.6 update, lockfile and Supabase version pin yield zero npm audit advisories. |
| K17 | High | Authenticator enrollment is not enforced during ordinary sign-in or by RLS | Open | MFA enrollment exists, but LoginScreen does not challenge enrolled factors and protected policies do not require aal2. Do not advertise enforced two-factor protection until challenge/recovery and policy changes are designed and tested. |
| K18 | High | Report submitter can forge moderation outcome fields on INSERT | Proposed SQL | Live INSERT checks reporter_id only. Isolated baseline accepted an actioned report with forged moderator_id. Proposed restrictive submission policy requires untouched moderation fields. |
| K19 | Medium | Change-password screen never calls the authentication backend | Repaired on branch | Existing form now validates, reauthenticates with the current password and calls updateUser; rejected and successful mocked flows are tested. |
| K20 | Medium | Followers/Following screens use empty local arrays | Repaired on branch | Existing layouts now load profiles through follows records, persist follow/unfollow, and open real profile routes. Follow-back is tested with mocked backend responses. |
| K21 | Medium | Conversations over 300 messages load the oldest window | Repaired on branch | Query now fetches latest 300 descending and reverses for display. Browser fixture with 305 messages verifies the retained window begins with message 6. |
| K22 | Medium | Reels uploads use a folder rejected by storage policy | Proposed SQL | Live public-media INSERT allows statuses/posts; WatchScreen uploads reels/user-id. Proposal adds the existing Reels folder to the owner-scoped policy, with isolated ownership tests. |
| K23 | Medium | Privacy switches do not enforce account/status/media privacy | Open | Account/Status privacy controls are local selections. Active statuses are readable by authenticated users; the media bucket is public and URLs survive row expiry. Requires product rules, private media authorization and cleanup design; changing bucket publicity alone would break current URLs. |
| K24 | Medium | Notification trigger copies private message bodies | Proposed SQL | Inspected konnekt_notify_message copies body into notification records. Proposal emits a generic message notification; isolated checks confirm no plaintext duplication. |
| K25 | Medium | Edge Function artifacts are not deployable or schema-compatible as laid out | Open | Seven index*.ts artifacts are at repository root, import missing ../_shared/cors.ts, and several reference absent reports/blocked_users/other staging tables. Live project lists zero Edge Functions. Syntax transpilation alone does not validate these imports or services. |
| K26 | Medium | Account deletion is a request-only workflow | Open | UI correctly states requests require administrator/backend completion. No trusted media erasure/session revocation/final-deletion workflow is deployed. Destructive deletion was not attempted. |
| K27 | Medium | Signed Android release workflow copies absent android-res files | Repaired on branch | Workflow now installs existing repository icon/splash assets using scripts/android-assets.mjs. Generation, asset installation and Capacitor sync were executed successfully; no signed package was built. |
| K28 | Medium | Dependency installs are not reproducible | Repaired on branch | Original repository has no lockfile and workflows use npm install. Committed lockfile, exact Supabase pin and npm ci make checked installations repeatable. |
| K29 | Medium | No executable lint/regression suite or pull-request CI | Repaired on branch | Added lint rules for runtime errors in canonical JSX/services, isolated PostgreSQL tests, service-worker tests and intercepted-browser tests. CI validates web/mobile builds and tests without deploying. |
| K30 | Medium | Narrow-screen Reels and Status headers overflow | Repaired on branch | Reels header wraps; Status text column shrinks. All six tabs pass horizontal-overflow checks at 320, 390 and 1280 pixels. |
| K31 | Medium | PWA manifest hardcodes GitHub Pages paths in mobile builds | Repaired on branch | Manifest id/scope/start_url/icons now resolve relative to its location, preserving /KONNEKT/ web hosting and relative Capacitor assets. |
| K32 | Medium | Push notification click can navigate outside application scope | Repaired on branch | Service worker now limits targets to the same origin and registration path. Tests reject external, javascript and sibling-app destinations. |
| K33 | Medium | Live room video is only a local camera preview | Open | Source explicitly states no broadcast transport is configured. Room chat is separate from streaming. Requires streaming/SFU provider and real host/viewer tests. |
| K34 | Medium | Creator monetisation has no transaction/payment backend | Open | Subscriptions, funded earnings, payouts, gifts and verification workflows remain partial or explicitly unavailable. No payment credentials or transactions were invented. |
| K35 | Medium | Reliable cross-network calling lacks supplied TURN configuration | Open | Default build uses STUN; no VITE_TURN_CREDENTIALS_URL is supplied by the deployment workflow. Requires short-lived credential service and real two-device/two-network verification. |
| K36 | Medium | Background push is not configured in the deployment | Open | No OneSignal app ID is supplied by the workflow; no push Edge Function is deployed. Browser alerts while open do not prove background push delivery. |
| K37 | Low | File picker cancellation can leave a pending promise | Repaired on branch | Media chooser now resolves null on the browser cancel event, while retaining change/error handling. |
| K38 | Low | Media helper permits 50 MB while promising a 45 MB video limit | Repaired on branch | Shared validation now enforces the existing 45 MB product limit consistently. |
| K39 | Low | Eager screen registry creates a large entry bundle | Open | Production build warns about an approximately 1 MB JavaScript entry chunk. Warning remains visible; no arbitrary threshold increase or broad architecture rewrite was made. |
| K40 | Low | Duplicate source trees and obsolete package notes obscure the canonical app | Open | Root screens and many src/screens/*.js duplicate the active JSX tree. Main entry uses App.jsx and src/screens/*.jsx. Duplicates were inventoried and retained to avoid deleting potentially needed artifacts. |
| K41 | Low | Database has redundant policies/indexes and optimization advisories | Open | Live advisors report duplicate indexes, multiple permissive policies, unindexed FKs and per-row auth calls. These are grouped as one performance finding; no speculative index deletion was performed. |

## B. Repairs and safety

The change preserves branding, navigation destinations and existing screen layouts. Most screen edits only replace the nonfunctional Alert import with a shared browser implementation; existing callback bodies remain intact. The dialog preserves explicit confirmation/cancel buttons and keyboard focus. Existing validation and RLS were not bypassed to make tests pass.

The client prepares encryption keys after sign-in, prevents conflicting identity replacement, encrypts voice notes using the existing crypto implementation, and keeps ciphertext out of chat previews. This is not a Signal-style ratchet: forward secrecy, membership key rotation, cross-tab initialization races, key-authenticity guarantees and an independent cryptographic review remain launch work. Historical plaintext messages are not retroactively encrypted. Older non-exportable keys cannot be recovered through the new backup flow.

### Unapplied database proposals

1. `supabase/migrations/20261115095238_audit_compatibility_repairs.sql`: adds group description and encrypted-media metadata columns; fixes notification helper to use `reference_id`; allows owner-scoped Reels uploads. Existing rows and RLS remain intact.
2. `supabase/migrations/20261115095256_audit_security_hardening.sql`: delegates legacy chat creation to the checked RPC; restricts direct conversation/member writes to RPCs; limits call/notification UPDATE columns; adds restrictive checks for blocks, receipts, group keys, group invites and report moderation fields; revokes unnecessary trigger-function execution; makes message notifications generic.

Both run inside transactions with a 5-second lock timeout and were applied twice in an isolated PostgreSQL reconstruction. **Neither was applied to the connected project.** Grant reductions can affect other clients or integrations that write these tables directly; review those consumers and take a backup before approval. The proposals do not fix phone privacy, public-media access, MFA enforcement, every possible group-signal lifecycle abuse, or all definer-function access. Do not treat them as a complete security certification.

`tests/fixtures/live-schema-2026-11-15.sql` reconstructs catalog-derived application tables/functions/policies with synthetic Auth/Storage helpers and test grants. It contains no user rows or credentials. It is only for the in-memory test engine and must never be applied to Supabase. Hosted Auth, JWT issuance, PostgREST behavior, actual Storage objects and realtime are not simulated by those SQL checks.

## C. Testing evidence

| Check | Result | Scope / limit |
| --- | --- | --- |
| Baseline dependency installation/build | Passed | Original source built with Vite 5.4.14; this did not prove runtime features worked. |
| Locked dependency installation | Passed | `npm ci --ignore-scripts`; lockfile matches package.json. |
| Dependency audit | Passed | `npm audit`: zero advisories after repair; baseline had high Vite/moderate esbuild advisories. |
| Lint | Passed | `npm run lint`; runtime-error rules on canonical source/services and service worker. |
| Unit/SQL suite | Passed | `npm test`: 6 runner tests, including the isolated SQL scenario and 5 service-worker tests. SQL scenario contains 28 named checks. |
| Browser regression suite | Passed | `npm run test:browser`: 16 tests in headless Chromium; Supabase HTTP/WebSocket traffic intercepted. No test credentials or writes to live backend. |
| Web production build | Passed | `npm run build`; retained large-chunk warning. |
| Mobile production build | Passed | `npm run build:mobile`; relative build and PWA assets emitted. |
| Android preparation | Passed | `npx cap add android`, asset installer, `npx cap sync android`; generated project is ignored, not committed. |
| Edge Function syntax | Passed | Seven root TypeScript artifacts transpiled without syntax errors; missing imports/schema mismatches and Deno runtime remain unresolved. |
| Live read-only backend probes | Passed within stated scope | Schema/policy/function inspection, Auth settings, advisors, aggregate logs and anonymous negative reads; not signed-in feature tests. |
| Configured typecheck/unit suite before repair | Absent | No original lint/test/typecheck scripts or project tsconfig. New checks added; no claim of full TypeScript type safety. |
| Existing GitHub Actions history | Inspected | Recent main Pages and debug-APK runs succeeded; the signed-release workflow was not validated by those debug runs. Repair-branch CI was triggered by the successful publication retry; local passing results are recorded below. Remote results should be checked on the draft PR. |
| Signed Android release / iOS / physical device | Not performed | No signing secrets, SDK/device validation or App Store/Play deployment. |
| Live two-account end-to-end | Not performed | No dedicated test accounts supplied during this run. No real email/SMS, message receipt, call transport, storage playback or background push delivery certified. |
| Payments and destructive erasure | Not performed | Provider/trusted backend absent; financial and destructive operations intentionally left unapplied. |

Browser cases cover missing/invalid form data, rejected/successful login, signup request/confirmation state, recovery request, refresh/signout, six destinations at 320/390/1280 pixels, deletion-request cancel/confirm, database-backed follower UI, notification rollback, encrypted text/attachment writes, correct/wrong key-recovery passphrases, identity conflict, encrypted voice-note writes and missing-peer-key rejection, Status validation/expiry, password reauthentication failures/success and a 305-message conversation, incoming group-call decline and dismissal of stale confirmations on signout.

Initial regressions exposed missing tab selection semantics, small-screen overflow, backend/source errors and incorrect fixture selectors; corrected and rerun. One overlapping local test-server run caused connection failures; the harness now allocates an isolated port. Final results above are from completed passing runs, without disabling failing tests. Video bytes in mocked upload tests are not evidence of actual hosted playback.

Isolated SQL tests reproduce the original missing-description/notification failures and membership/report-field vulnerabilities, apply each proposal twice, then check positive/negative message access, blocking, receipts, notifications, Reels owner paths, group keys/invites, call lifecycle and immutable participants. Live production mutations were not used to prove these fixes.

## D. Feature readiness

Status applies to the review branch, with live prerequisites shown explicitly. “Broken and repaired” means exercised in the stated isolated/mock scope, not deployed or verified with live accounts.

| Feature | Classification | Evidence / remaining work |
| --- | --- | --- |
| Registration and login | Implemented but needs testing | Mock positive/negative requests and UI pass; live confirmation email and account lifecycle untested. |
| Password recovery | Implemented but needs testing | Reset request and Pages redirect tested with intercepted Auth; real mailbox/link round-trip untested. |
| Change password | Broken and repaired | Existing form now reauthenticates and updates; mocked negative/positive tests pass. |
| Profiles | Implemented but needs testing | Existing read/save integration; phone privacy must be resolved before public release. |
| Following/unfollowing | Broken and repaired | Connection lists persist through service calls; live notifications require proposed trigger repair. |
| Private conversation creation | Implemented but needs testing | Checked username RPC exists; legacy/membership holes require unapplied security proposal and live concurrency tests. |
| Sending/receiving messages | Broken and repaired | Source and isolated trigger repairs tested; live trigger remains broken until approval; realtime receipt/delivery unverified. |
| Conversation history | Broken and repaired | Latest 300-message window tested; older-history pagination remains absent. |
| Reels uploads/playback | Partially implemented | Upload UI exists; live storage folder policy rejects uploads until SQL repair. Real codec/playback/device tests remain. |
| Reel likes/comments | Implemented but needs testing | Client and RLS present; notification-trigger repair and live interactions needed. |
| Status updates | Implemented but needs testing | Mock text publish/expiry and mobile layout pass; private audience controls/expired-object cleanup incomplete. |
| Discover | Implemented but needs testing | Data queries/navigation render at tested sizes; live search/follow/block behavior still needed. |
| Notifications | Broken and repaired | Mock read/rollback and isolated trigger checks pass; live trigger repair unapplied. |
| Voice/video calling | Blocked by external configuration | WebRTC signaling exists; reliable TURN service and real-device/network transport tests needed. |
| Group conversations | Broken and repaired | Missing description fixed in proposed SQL and isolated group RPC checks; live migration pending. |
| Group calls | Partially implemented | Four-person P2P implementation; invitation/lifecycle checks proposed, no real group media test. |
| Encryption/key recovery | Implemented but needs testing | AES-GCM/ECDH and passphrase backup exercised with mocked persistence; cryptographic/security review and real multi-device lifecycle remain. |
| Voice notes | Broken and repaired | Previously plaintext path now encrypts; microphone capture/device recording not certified. |
| Blocking/reporting | Broken and repaired | Client API paths exist; isolated access restrictions pass, but live policies still need approval. |
| Moderation | Partially implemented | Moderator screen and tables exist; report forgery guard proposed; no live moderator workflow test. |
| Account deletion | Partially implemented | Request submission tested; final erasure/media cleanup/session revocation not deployed. |
| Creator monetisation | Blocked by external configuration | Payment, subscription/ledger/payout and verification backend not active. |
| Live video streaming | Blocked by external configuration | Local preview and room chat exist; no broadcast transport. |
| Mobile navigation/responsiveness | Implemented and verified | Six primary tabs exercised in Chromium at three widths; physical Android/iOS behavior still untested. |
| MFA | Partially implemented | Enrollment exists; sign-in challenge and higher-assurance enforcement remain absent. |
| Background push | Blocked by external configuration | Native provider/build configuration and delivery testing needed. |
| Group management, archive/star/forward, Status reactions, creator support tools | Partially implemented | Numerous local/demo/placeholder handlers remain. Not marked functional simply because screens load. |

## E. Remaining launch requirements

1. Review this branch and the SQL proposals. Resolve phone privacy, real audience rules/public media, MFA challenge enforcement, key lifecycle and remaining authorization edges before inviting public users.
2. Approve/apply only reviewed migrations against the inspected project, with a backup and catalog preflight; do not run old reset/base SQL. Rerun live advisors and authenticated two-/three-account RLS/storage tests afterwards.
3. Supply dedicated test accounts through a secure sign-in flow. Verify registration, confirmation/recovery email, profiles, duplicate usernames, follows, direct/group chat concurrency, realtime, receipts, block/report behavior, moderator access and two-device key recovery.
4. Verify SMTP, Auth redirect allowlist, rate limits/CAPTCHA and optional SMS. Phone authentication is currently disabled. No delivery claims can be made from provider settings alone.
5. Configure short-lived TURN credentials and test audio/video/group media across separate networks, denied/revoked permissions and disconnect/reconnect cases. Streaming/SFU requires its own provider.
6. Configure background push and verify foreground/background/closed-app delivery, permissions and logout/account-switch behavior. Ordinary in-app notifications are not push proof.
7. Design/deploy schema-compatible trusted backend functions for account export/deletion, scheduled media cleanup and any required moderation operations. Review ownership transfer, retention, session revocation and partial-failure handling before destructive execution.
8. Configure compliant creator payments, transaction ledger, eligibility, identity checks and payout/reconciliation before enabling money-related controls.
9. Finish incomplete feature integrations and verify behavior, or explicitly scope the controlled beta with honest capability labels. A screen is not a completed feature.
10. Run real Android/iOS, signed-release, camera/microphone, playback, accessibility/keyboard/screen-reader, offline/update and long-session tests. Verify PWA updates and recovery-link behavior after deployment.
11. Complete legal/POPIA/privacy/terms and support-owner review; verify backups through an actual restore exercise, monitoring, incident response, retention and abuse processes.

## F. Review gates

**Approval required:** applying either migration, modifying live storage/public access, deploying provider credentials/functions, payment activation, destructive erasure, or production merge/deployment. The user brief (section 2 and final instruction) explicitly reserves these actions for approval. Source repairs and draft review do not grant production approval.

Supabase references reviewed: changelog index and current security/RLS documentation. Advisor remediation: [security-definer exposure](https://supabase.com/docs/guides/database/database-linter?lint=0028_anon_security_definer_function_executable), [RLS auth-call optimization](https://supabase.com/docs/guides/database/postgres/row-level-security#call-functions-with-select), [duplicate indexes](https://supabase.com/docs/guides/database/database-linter?lint=0009_duplicate_index).

## Changed-file appendix

Every changed/new file is listed below. For alert-only rows, the safety rationale is shared: route existing callbacks through the implemented browser dialog without altering feature logic. Other rows describe the minimal correction or its verification/supporting artifact.


| File | Correction / safety rationale |
| --- | --- |
| `.github/workflows/build-android-apk.yml` | Use npm ci, trigger on lockfile changes and install existing branded Android assets. |
| `.github/workflows/build-android-release.yml` | Replace absent android-res copy paths with the verified asset installer and use npm ci. |
| `.github/workflows/ci.yml` | Run lint, isolated tests, web/mobile builds and mocked-browser checks on repair pushes/PRs; no deployment. |
| `.github/workflows/deploy.yml` | Use npm ci and gate the existing main-only Pages build on lint/unit checks. |
| `.gitignore` | Keep dependencies, builds, local secrets, generated native projects and test artifacts out of commits. |
| `App.jsx` | Correct session/recovery navigation; await call-decline updates; use working alerts; dismiss stale prompts on account changes; expose selected tab semantics. |
| `README.md` | Link the current audit, correct tab order/encryption limitations and document reproducible checks. |
| `docs/audit-2026-11-15/REPORT.md` | Audit evidence, finding register, reproduction instructions or tracked-file inventory; contains no user records or secret credentials. |
| `docs/audit-2026-11-15/TEST-RESULTS.txt` | Audit evidence, finding register, reproduction instructions or tracked-file inventory; contains no user records or secret credentials. |
| `docs/audit-2026-11-15/TESTING.md` | Audit evidence, finding register, reproduction instructions or tracked-file inventory; contains no user records or secret credentials. |
| `docs/audit-2026-11-15/issues.json` | Audit evidence, finding register, reproduction instructions or tracked-file inventory; contains no user records or secret credentials. |
| `docs/audit-2026-11-15/repository-files.txt` | Audit evidence, finding register, reproduction instructions or tracked-file inventory; contains no user records or secret credentials. |
| `eslint.config.js` | Add focused runtime-error checks on the canonical app/services without rewriting legacy duplicates. |
| `main.jsx` | Mount the shared browser AlertHost once alongside the existing app. |
| `manifest.webmanifest` | Use relative scope/start/icon paths compatible with both Pages and mobile builds. |
| `package-lock.json` | Record exact dependency graph for npm ci and security review. |
| `package.json` | Patch vulnerable tooling, pin the installed Supabase client, and declare verification scripts/dev dependencies. |
| `scripts/android-assets.mjs` | Install existing checked-in branded assets into generated Capacitor resource directories; no redesign or new artwork. |
| `src/AuthContext.jsx` | Prepare encryption identity after session establishment and outside the auth callback. |
| `src/components/Alert.jsx` | Implement the existing callback API with a queued accessible browser dialog and explicit cancellation/focus behavior. |
| `src/konnektEncryption.js` | Serialize identity initialization per user and reject registered/local key conflicts. |
| `src/screens/AccountDeletionScreen.jsx` | Replace the no-op React Native Web Alert import with the shared browser implementation; preserve existing screen logic and layout. |
| `src/screens/AccountSettingsScreen.jsx` | Replace the no-op React Native Web Alert import with the shared browser implementation; preserve existing screen logic and layout. |
| `src/screens/ActiveSessionsScreen.jsx` | Replace the no-op React Native Web Alert import with the shared browser implementation; preserve existing screen logic and layout. |
| `src/screens/AdminModerationScreen.jsx` | Replace the no-op React Native Web Alert import with the shared browser implementation; preserve existing screen logic and layout. |
| `src/screens/ArchivedChatsScreen.jsx` | Replace the no-op React Native Web Alert import with the shared browser implementation; preserve existing screen logic and layout. |
| `src/screens/BlockedContactsScreen.jsx` | Replace the no-op React Native Web Alert import with the shared browser implementation; preserve existing screen logic and layout. |
| `src/screens/CameraScreen.jsx` | Replace the no-op React Native Web Alert import with the shared browser implementation; preserve existing screen logic and layout. |
| `src/screens/ChangePasswordScreen.jsx` | Connect existing form to current-password reauthentication/updateUser, with busy/error handling and working alerts. |
| `src/screens/ChatAttachmentsScreen.jsx` | Replace the no-op React Native Web Alert import with the shared browser implementation; preserve existing screen logic and layout. |
| `src/screens/ChatConversationScreen.jsx` | Fix latest-message window and send locking, remove unsupported encryption_version write, label composer controls and show unavailable-key placeholders. |
| `src/screens/ChatDetailsScreen.jsx` | Replace the no-op React Native Web Alert import with the shared browser implementation; preserve existing screen logic and layout. |
| `src/screens/ChatNotificationSettingsScreen.jsx` | Replace the no-op React Native Web Alert import with the shared browser implementation; preserve existing screen logic and layout. |
| `src/screens/CommentsScreen.jsx` | Replace the no-op React Native Web Alert import with the shared browser implementation; preserve existing screen logic and layout. |
| `src/screens/ContactProfileScreen.jsx` | Replace the no-op React Native Web Alert import with the shared browser implementation; preserve existing screen logic and layout. |
| `src/screens/ContactsScreen.jsx` | Replace the no-op React Native Web Alert import with the shared browser implementation; preserve existing screen logic and layout. |
| `src/screens/ContentPreferencesScreen.jsx` | Replace the no-op React Native Web Alert import with the shared browser implementation; preserve existing screen logic and layout. |
| `src/screens/CreateScreen.jsx` | Replace the no-op React Native Web Alert import with the shared browser implementation; preserve existing screen logic and layout. |
| `src/screens/CreatorContentManagementScreen.jsx` | Replace the no-op React Native Web Alert import with the shared browser implementation; preserve existing screen logic and layout. |
| `src/screens/CreatorSafetyScreen.jsx` | Replace the no-op React Native Web Alert import with the shared browser implementation; preserve existing screen logic and layout. |
| `src/screens/CreatorSettingsScreen.jsx` | Replace the no-op React Native Web Alert import with the shared browser implementation; preserve existing screen logic and layout. |
| `src/screens/DocumentPickerScreen.jsx` | Replace the no-op React Native Web Alert import with the shared browser implementation; preserve existing screen logic and layout. |
| `src/screens/FollowersScreen.jsx` | Load connections, persist follow-back/unfollow and navigate to the existing profile screen. |
| `src/screens/FollowingScreen.jsx` | Load connections, persist confirmed unfollow and navigate to the existing profile screen. |
| `src/screens/ForwardMessageScreen.jsx` | Replace the no-op React Native Web Alert import with the shared browser implementation; preserve existing screen logic and layout. |
| `src/screens/GroupInfoScreen.jsx` | Replace the no-op React Native Web Alert import with the shared browser implementation; preserve existing screen logic and layout. |
| `src/screens/GroupInviteScreen.jsx` | Replace the no-op React Native Web Alert import with the shared browser implementation; preserve existing screen logic and layout. |
| `src/screens/GroupMembersScreen.jsx` | Replace the no-op React Native Web Alert import with the shared browser implementation; preserve existing screen logic and layout. |
| `src/screens/GroupNotificationSettingsScreen.jsx` | Replace the no-op React Native Web Alert import with the shared browser implementation; preserve existing screen logic and layout. |
| `src/screens/GroupPermissionsScreen.jsx` | Replace the no-op React Native Web Alert import with the shared browser implementation; preserve existing screen logic and layout. |
| `src/screens/HashtagScreen.jsx` | Replace the no-op React Native Web Alert import with the shared browser implementation; preserve existing screen logic and layout. |
| `src/screens/HelpSupportScreen.jsx` | Replace the no-op React Native Web Alert import with the shared browser implementation; preserve existing screen logic and layout. |
| `src/screens/LiveStreamChatScreen.jsx` | Replace the no-op React Native Web Alert import with the shared browser implementation; preserve existing screen logic and layout. |
| `src/screens/LiveStreamGiftsScreen.jsx` | Remove undefined setBalance and false-success path; preserve truthful provider-unavailable behavior and existing UI. |
| `src/screens/LiveStreamModerationScreen.jsx` | Replace the no-op React Native Web Alert import with the shared browser implementation; preserve existing screen logic and layout. |
| `src/screens/MediaPickerScreen.jsx` | Replace the no-op React Native Web Alert import with the shared browser implementation; preserve existing screen logic and layout. |
| `src/screens/NotificationSettingsScreen.jsx` | Replace the no-op React Native Web Alert import with the shared browser implementation; preserve existing screen logic and layout. |
| `src/screens/PhoneVerificationScreen.jsx` | Replace the no-op React Native Web Alert import with the shared browser implementation; preserve existing screen logic and layout. |
| `src/screens/PrivacySettingsScreen.jsx` | Replace the no-op React Native Web Alert import with the shared browser implementation; preserve existing screen logic and layout. |
| `src/screens/ReportContentScreen.jsx` | Replace the no-op React Native Web Alert import with the shared browser implementation; preserve existing screen logic and layout. |
| `src/screens/ReportUserScreen.jsx` | Replace the no-op React Native Web Alert import with the shared browser implementation; preserve existing screen logic and layout. |
| `src/screens/SavedVideosScreen.jsx` | Replace the no-op React Native Web Alert import with the shared browser implementation; preserve existing screen logic and layout. |
| `src/screens/ShareContactScreen.jsx` | Replace the no-op React Native Web Alert import with the shared browser implementation; preserve existing screen logic and layout. |
| `src/screens/ShareLocationScreen.jsx` | Replace the no-op React Native Web Alert import with the shared browser implementation; preserve existing screen logic and layout. |
| `src/screens/StarredMessagesScreen.jsx` | Replace the no-op React Native Web Alert import with the shared browser implementation; preserve existing screen logic and layout. |
| `src/screens/StatusPrivacyScreen.jsx` | Replace the no-op React Native Web Alert import with the shared browser implementation; preserve existing screen logic and layout. |
| `src/screens/StatusReactionScreen.jsx` | Replace the no-op React Native Web Alert import with the shared browser implementation; preserve existing screen logic and layout. |
| `src/screens/StatusScreen.jsx` | Allow the existing header text column to shrink instead of overflowing. |
| `src/screens/TermsPrivacyScreen.jsx` | Replace the no-op React Native Web Alert import with the shared browser implementation; preserve existing screen logic and layout. |
| `src/screens/TwoStepVerificationScreen.jsx` | Replace the no-op React Native Web Alert import with the shared browser implementation; preserve existing screen logic and layout. |
| `src/screens/VoiceNoteScreen.jsx` | Use the encrypted voice-message helper and normalize recorded MIME parameters; preserve recording UI. |
| `src/screens/WatchScreen.jsx` | Wrap the existing Reels header at narrow widths. |
| `src/services/connections.js` | Share existing-profile/follows queries and owner-scoped follow/unfollow calls. |
| `src/services/media.js` | Resolve file-picker cancellation and enforce the documented 45 MB video limit. |
| `src/services/safety.js` | Make repeated blocking use ignoreDuplicates rather than an UPDATE path unsupported by current block policies. |
| `src/services/social.js` | Remove a chat-preview select of an absent column while preserving encrypted preview labeling. |
| `src/services/voiceMessages.js` | Encrypt voice body/media with existing direct/group crypto; refuse missing keys; retain private bucket ownership paths. |
| `supabase/migrations/20261115095238_audit_compatibility_repairs.sql` | Unapplied, transaction-scoped, rerunnable proposal for the inspected live schema; requires approval and is tested only in isolated PostgreSQL. |
| `supabase/migrations/20261115095256_audit_security_hardening.sql` | Unapplied, transaction-scoped, rerunnable proposal for the inspected live schema; requires approval and is tested only in isolated PostgreSQL. |
| `sw.js` | Restrict notification navigation to the app scope; bump the cache version. |
| `tests/browser/app.test.mjs` | Reproducible regression harness/fixture; uses synthetic sessions, intercepted HTTP or an isolated in-memory database, never live mutations. |
| `tests/browser/helpers.mjs` | Reproducible regression harness/fixture; uses synthetic sessions, intercepted HTTP or an isolated in-memory database, never live mutations. |
| `tests/database.test.mjs` | Reproducible regression harness/fixture; uses synthetic sessions, intercepted HTTP or an isolated in-memory database, never live mutations. |
| `tests/fixtures/live-schema-2026-11-15.sql` | Reproducible regression harness/fixture; uses synthetic sessions, intercepted HTTP or an isolated in-memory database, never live mutations. |
| `tests/service-worker.test.mjs` | Reproducible regression harness/fixture; uses synthetic sessions, intercepted HTTP or an isolated in-memory database, never live mutations. |

Total changed/new files in this review: **85**.
