# Release candidate evidence — 16 November 2026

**Decision: HOLD. Mandatory live/device/operational gates remain blocked. This is not release authorization.**

Merging the repair does not authorize publication. The Pages workflow continues to validate/build main pushes, but its deploy job requires a manual dispatch with `publish=true` (default false). Keep that action on hold until release acceptance and owner go/no-go approval.

Started from the latest observed `origin/main`, `7102642`, on `repair/release-gates-20261115`. Carried forward the tested staging work from PR #14 without merging it to main. Production database/data and hosted frontend were not changed. No paid service, new hosted project or infrastructure upgrade was introduced.

## Verified repairs

- Staging profile phone reads are denied to anonymous and authenticated API roles; public fields remain readable to signed-in callers. Compatible explicit-column profile queries retain profile editing and refresh. Stored phone values were not deleted or changed.
- Removed anonymous EXECUTE from eight inspected RPCs/RLS helpers while retaining authenticated access. Local database tests exercise actual direct/group creation, membership, message writes, moderator/reel helpers and repeat application. Final staging catalogs confirm the grants, and the anonymous-function advisor warnings cleared. Authenticated definer warnings remain for intentional, reviewed app entry points/helpers; they were not blindly revoked.
- Staging legacy restricted live rooms/comments are owner-only. New room creation offers public audiences only; private/follower choices cannot falsely claim enforcement. Public-room access continues in local role tests. The two restrictive staging policies were inspected after application.
- Voice recording is reachable from the existing chat composer. Browser tests verify encrypted sends, track cleanup and late permission cleanup. Failed voice-note writes and other chat attachments retain the previously merged cleanup/ID protections.
- Fixed growing multi-Reel layout, selected-Reel navigation from Discover, active Status expiry/media shutdown, and unused Reel/Status upload cleanup/retry. Cleanup first checks for a referenced row, preserving media when a write result is ambiguous. Real WebM bytes are decoded/played in browser fixtures.
- Disabled unenforced privacy controls without changing main navigation or the existing visual direction. Replaced the invented blocked-account count with actual account data. Public Status media links are explicitly distinguished from list expiry.
- Client MFA challenge/retry/sign-out and enrollment recovery/QR/removal now work in fixtures. Current-password checks use an isolated session so the active AAL2 session is retained. Sensitive screen/subscription/key initialization waits for the security check.
- Route-based screen loading reduces the measured main JavaScript asset from about 971 kB to about 505 kB (minified); the remaining >500 kB warning is nonblocking technical debt, not proof of phone performance. A failed screen download offers reload and tests preserve the registered encryption identity.
- Inherited Android repairs isolate `com.konnekt.staging`, fix duplicate launcher colors and declare optional camera/microphone permissions. Staging builds reject production backend configuration.

## Staging deployment scope

Applied only to `konnekt-staging` (`oiwtfkgrnpzirghbsvim`), after inspecting its current schema:

| Change | Evidence |
| --- | --- |
| `release_profile_phone_and_function_grants` | `phone` SELECT false for anonymous/authenticated; public fields true; profile RLS remains enabled; all eight anonymous EXECUTE grants false and authenticated grants true |
| `release_live_room_audience_privacy` | Two restrictive policies recorded; local owner/nonowner/public-room/comment tests passed |
| `release_opt_in_mfa_enforcement` | **APPLIED after explicit owner approval**, version `20261116040341`. Catalogs confirm 31 restrictive MFA policies, eight guarded public functions, and denied client execution for all three internal conversation implementations. Private schema excluded from the Data API (HTTP 406 / `PGRST106`) |

The reviewed source SQL is under this directory. CLI migration generation was unavailable in this environment, so staging-only proposals/deployment scripts are deliberately kept outside automatically applied production migrations.

MFA enforcement is now installed in staging after owner approval, current-schema inspection, a private schema-only snapshot and a successful local restoration rehearsal. Local AAL1/AAL2 RLS/storage/RPC tests passed again, and live read-only simulated-role probes checked missing-identity denial and no-factor/nonmember behavior. Real enrolled-account AAL1/AAL2 acceptance remains blocked on staging account/authenticator access; see [MFA_STAGING_REVIEW.md](MFA_STAGING_REVIEW.md). No real factors, account passwords or user encryption keys were reset.

## Automated validation

Local clean install, lint, all **18 unit/database/service-worker tests**, all **31 browser tests**, production web build, mobile build and production dependency audit passed. The production audit reported **zero vulnerabilities**. An initial browser test assumed synchronous screen loading; it was corrected to wait for the loaded settings screen and count response, then the full 31-test run passed.

The final proposed commit must also pass the repository CI and a fresh staging APK workflow. The repair PR contains the exact final commit, CI run and APK artifact links. Prior passing APK evidence is linked from [STAGING_ANDROID_ACCEPTANCE.md](STAGING_ANDROID_ACCEPTANCE.md); it does not substitute for a new build of changed application code.

## Gate matrix

A local fixture pass is not a live staging or device pass.

| Gate | Status | Observable evidence / exact remaining input |
| --- | --- | --- |
| Local install, lint, database/service-worker tests, browser regressions, web/mobile builds and production audit | PASS | Results above; final-commit CI linked in repair PR |
| Phone privacy and unnecessary anonymous grants in staging | PASS | Post-change catalogs/advisor results plus role tests; no private values were read |
| Restricted live-room metadata/comment privacy in staging | PASS | Applied restrictive policies and owner/nonowner local tests |
| MFA client/enrollment behavior | PASS | Browser fixtures: wrong/correct OTP, refresh, retry, QR, pending setup, fresh-code removal and AAL2 password confirmation |
| Staging MFA migration deployment and schema restoration rehearsal | PASS | Owner-approved migration applied; 31 restrictive policies, eight guarded public functions, internal RPC grants denied, private schema not exposed; captured definitions/grants/policies restored in a local rehearsal |
| MFA enforcement for actual enrolled accounts | BLOCKED | Dedicated staging account/authenticator access needed to prove real AAL1 API denial, AAL2 access and factor-removal behavior; local tests and simulated role probes do not substitute |
| Three-account in-app direct/group text, voice and attachment exchange; C denied history, events and file downloads; blocking/retry/cleanup/key recovery | BLOCKED | Usable dedicated staging sessions and original keys/backups are still unavailable. The owner deferred account access. Local encryption/cleanup/backup tests pass, but the live runner has not run. Supply private ignored test configuration; do not send passwords in PR/chat |
| Live Reels/Status/Discover acceptance | BLOCKED | Browser playback/search/like/comment/status tests pass; repeat with real staging accounts/permissions and actual uploads after access is supplied |
| Staging APK compilation/signature/API 26 setup | PASS | Application commit `6672194`: workflow `43798610402` and artifact `14195466629` linked in PR. Subsequent MFA evidence edits are documentation only. Debug signing and minSdk configuration do not prove physical Android 8.0 compatibility |
| Signed installation and two-way voice/video, Wi-Fi↔cellular, reconnect, ringing, hang-up | BLOCKED | Two physical Android devices, test networks/SIM data, staging account access and a configured short-lived TURN endpoint/relay. No paid relay was provisioned |
| Live-room media and moderator controls | BLOCKED | No real broadcast/SFU/moderation provider integration is configured. Need an owner-selected R0-compatible provider, its credentials/integration and multiple devices; SQL room/chat records or local camera preview are not broadcast evidence |
| Push foreground/background/closed-app and old-account isolation | BLOCKED | Matching staging OneSignal app ID, Android FCM/server credentials and sender integration, plus physical devices. Credentials must remain server-side; SDK registration logic is not delivery evidence |
| Real authentication/email recovery and key recovery | BLOCKED | Verified staging accounts/inbox access, original recoverable test keys and an authenticator for real MFA tests. Fixture login/recovery tests pass; actual email round trip remains unverified |
| Account-deletion fulfillment | BLOCKED | Current app submits a request only. Owner retention/shared-history/session-revocation decisions, privileged processing implementation/access and a disposable staging account are required before testing actual deletion |
| Agreed backup/restore procedure and drill | BLOCKED | Owner recovery objectives/retention, supported export/restore access, encrypted backup destination and approved disposable target. See [R0_BACKUP_RESTORE_ACCEPTANCE.md](R0_BACKUP_RESTORE_ACCEPTANCE.md) |
| Creator payment sandbox: failures, duplicate events, refunds | BLOCKED | No payment backend/provider is configured. Need an owner-selected provider, sandbox account/keys, server webhook/ledger/refund integration and agreed financial rules; no charges or paid services were introduced |
| Breached-password protection, independent security/operations/legal acceptance | BLOCKED | Staging advisory still reports leaked-password protection disabled. Owner must confirm an R0-compatible configuration, approve final policies/moderation/support/retention and complete independent review/operations tests; no paid upgrade assumed |
| Public rollout | BLOCKED / HOLD | No merge, production migration or public launch until mandatory gates have evidence and explicit go/no-go approval |
