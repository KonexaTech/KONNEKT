# Initial Android and web release scope

Public release remains **HOLD**. The owner agreed to defer live rooms and payments from the initial release. This reduces scope; it does not waive privacy, recovery, device or operational acceptance.

## Included

Existing navigation and core features: authentication, profiles/discovery/following, encrypted direct/group messaging, attachments and voice notes, Reels, Status, calls, notifications, blocking/reporting, account security and recovery. These are included in acceptance scope, not automatically declared ready.

## Deferred

Live-room creation, viewing/chat, broadcasting/moderation, gifts, creator earnings/payouts/monetisation, paid subscriptions and paid brand partnerships. Shared route guards substitute an unavailable screen before any of these implementations mounts. Feature and creator listings label them unavailable, the Create Live tile is disabled, and Welcome no longer advertises live streaming. No backend records or existing content are deleted.

Content management and analytics remain accessible. Calls remain in scope and still need real-device acceptance. The current public website is not updated by this repair: publication requires a separate manual approval/action.

## Verification

Local results: clean `npm ci` (temporary writable cache), lint, all 18 unit/database/service-worker tests, all 35 development-browser tests, web/mobile builds, three production-smoke cases per compiled bundle and the production dependency audit all passed. Audit: zero vulnerabilities. Existing >500 kB main-chunk warning remains; device performance is unverified. The repair PR records final-commit CI and fresh staging APK links.

- Baseline: latest `origin/main` at `b1d183a`, including the new Create group entry in Chats.
- New browser checks cover phone and desktop widths, unavailable routes from the feature hub and creator studio, back navigation, zero live/payment API calls, zero media requests and deferred implementations not loading.
- Production build smoke checks exercise the existing tab order, the Chats group-creation entry, the unavailable notice and the truthful Welcome/login flow. CI runs these against both the compiled website and mobile web bundle, separately from the development-server browser regressions.
- Public hosted website smoke checks are anonymous only: HTTP 200, welcome-to-login navigation, no uncaught JavaScript errors and no failed same-site assets at widths 390 and 1280. They do not test production credentials or change production records.
- A fresh isolated staging APK is required for the changed application code. Compilation/signature verification does not prove physical installation, media delivery or notification delivery.

## Remaining mandatory acceptance

| Gate | Status | Missing input or evidence |
| --- | --- | --- |
| Actual enrolled MFA, email/password and encrypted-key recovery | BLOCKED | Dedicated staging accounts, inbox and authenticator; original keys or recoverable backups for existing encrypted identities |
| Three-account direct/group encryption and outsider isolation | BLOCKED | Private staging account configuration and recoverable test keys; prove messages, Realtime events and file access, plus blocking/retries/voice and recovery |
| Live-account Reels, Status and Discover | BLOCKED | Staging accounts and actual upload/interaction acceptance |
| Physical Android installation and two-way calls | BLOCKED | Two devices, Wi-Fi/mobile data, configured TURN and real ringing/media/reconnect/hang-up evidence |
| Push delivery and old-account isolation | BLOCKED | Staging OneSignal/FCM/server sender configuration and physical foreground/background/closed-app tests |
| Account deletion fulfillment | BLOCKED | Retention/shared-history/session decisions, privileged processing implementation and disposable staging account |
| Backup/restore drill | BLOCKED | Agreed recovery objectives, encrypted destination, export access and disposable restore target |
| Production security promotion | BLOCKED | Privacy/MFA database changes were applied only to staging; inspect and plan their separately approved production rollout and restoration after live acceptance |
| Production signing and final security/operations acceptance | BLOCKED | Secure owner signing configuration, installation verification, remaining advisory review and owner go/no-go |

Live broadcast and payment-provider acceptance are deferred with their app routes, not falsely marked passed. Keep public publishing disabled while mandatory included gates remain blocked.
