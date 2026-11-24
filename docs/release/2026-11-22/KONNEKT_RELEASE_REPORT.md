# KONNEKT release candidate — 22 November 2026

**Decision: NOT READY for public release; HOLD.** This repair candidate improves existing implementation. It is not physical-device or live-backend acceptance.

Repository: `KonexaTech/KONNEKT`. Baseline main: `94de4b608857a35fe4b809129037b2770d42deef`. Candidate branch: `development/voice-media-release-20261122`. Existing staging beta PRs #27–#29 are separate and remain unmerged. No deployment or production database change was made by this increment. Latest deployed commit has not been verified against this candidate.

## Completed repairs

See [voice/media implementation](VOICE_MEDIA_REPAIR.md) and [current staging security observations](STAGING_SECURITY_OBSERVATIONS.md).

The patch repairs empty/failed/duplicate voice sends; recording cancellation, pause/resume and background cleanup; playback coordination/speed; encrypted voice metadata; private PDF/plain-text attachments; remaining Profile and Reels shortcut routes; and social-file reads after the existing social bucket became private. Existing encryption and passkey recovery are preserved. Current main's six navigation tabs and purple/gold styling are unchanged. No dependency or schema migration is added.

## Functional inventory

| Area | Observed implementation and evidence | Acceptance status |
| --- | --- | --- |
| Authentication/profile | Existing Auth forms, session/MFA gate, profile load/save and recovery request tested with isolated fixture APIs | Implemented; live inbox/device acceptance BLOCKED |
| Direct/group messaging | Existing conversation-ID validation, encryption, attachment bytes and retry checks exercised by browser regression | Implemented; final-source three-account Realtime isolation BLOCKED |
| Voice notes | Recorder state lifecycle, encrypted body/binary, stable retry IDs, failure cleanup, playback/seek/speed exercised locally | Local functional evidence; real Android recording/playback BLOCKED |
| Reels/Status | Private bucket signing, bounded expiry, denied access and actual fixture WebM playback tested; likes/comments/follows/status text exercised by existing fixtures | Client repair verified locally; live file authorization FAIL |
| Discover/social | Existing search/follow/report and menu routes exercised by regression fixtures | Implemented; complete live role/access acceptance BLOCKED |
| Calls/push | Existing bounded invitation/capture cleanup and server push handlers have automated tests | Two phones, TURN and foreground/background/closed delivery BLOCKED |
| Creator/payment/live rooms | Existing recorded creator analytics, safe deferred payment/live routes and disabled financial controls preserved | Actual revenue/provider/payment acceptance NOT TESTED; no payout enabled |
| Android/PWA | Separate staging identity, min SDK 26 and signing guard tested in source; both web bundles compile | Actual signed artifact and install/upgrade acceptance require separate evidence |
| Security/operations | Local SQL/RLS, MFA, deletion, backup archive and provider erasure tests pass | Hosted backup/restore, actual deletion fulfillment and production rollout BLOCKED |

## Local verification

- `npm ci` completed against the existing lockfile.
- `npm run lint` passed.
- `node --test --test-concurrency=1 --test-reporter=spec tests/*.test.mjs`: **94 passed, 0 failed**, including database/service-worker/security/voice/media/passkey tests.
- Production web and mobile web builds passed; existing approximately 518 kB entry chunk emits a size warning.
- `npm audit --omit=dev --audit-level=high`: **0 vulnerabilities**.
- Full browser run: 84/85 passed initially; the sole failure was a missing test-fixture readFile import. After restoring the import, all seven affected social/private-bucket/playback cases passed. All 85 cases have passing evidence across those runs; final full-suite CI must independently confirm the exact commit.
- Compiled production web smoke: 3/3 passed. Compiled mobile web smoke: 3/3 passed. These are Chromium fixtures, not physical Android tests.

Tests used permission-reviewed local subprocess execution. An initial restricted run failed helper-process tests; the reviewed rerun passed them. One initial route-census test used a fixed delay and inspected two lazily loaded screens too early. The test now waits for the real Back/tab control; their product controls were already present.

Static inventory tooling identifies **97 JSX files and 405 control definitions** on this candidate. This is not 405 independently verified features or runtime buttons. Dynamic rows and native media controls have additional runtime states. Source presence is never assigned PASS. The generated inventory is a local audit artifact; evidence of particular actions resides in named behavioral tests. No total functional-coverage or release-readiness percentage is inferred from this count.

## Mandatory unresolved gates

1. Replace broad authenticated social-file Storage reads with row-authorized policies after reviewing current schema, dependencies, rollback and existing files; verify unknown-path access, follower restrictions, blocking and expiry using independent sessions. Private bucket settings alone are insufficient.
2. Complete final-source A/B direct/group encrypted voice/document exchange, C read/download/signed-link/Realtime denial and positive controls, recovery and interrupted-send reconciliation. Prior live results do not pass this candidate.
3. Produce a stable signed staging APK with the owner-held key and pinned certificate. Verify fresh installation and same-key upgrade on Android 8.0+ without changing the existing package IDs.
4. On two physical Android phones test calls across Wi-Fi/mobile data, ringing/media/controls/reconnection/hangup and actual push foreground/background/closed, sign-out and account switching. OneSignal Android requires FCM credentials; no provider or Firebase dependency was added here.
5. Verify actual owner inbox recovery, hosted database/Auth/Storage backup and restore, account-deletion fulfillment and an approved production security rollout. Preserve all accounts until exact cleanup scope and recoverable backups are approved.
6. Complete operational monitoring, legal/privacy review, the supervised 20-person pilot and release sign-off. Existing beta metadata is inactive, not evidence that the pilot is enabled or safe.

No test accounts were deleted, no payments activated, no paid services introduced and no migration applied. The earlier staging live rerun was rejected by automatic approval review because of a usage limit and was not bypassed. Unrelated local verification continued.

## Controlled-beta gates and checkpoint

| Gate | Result | Remaining evidence |
| --- | --- | --- |
| Actual essential journeys | BLOCKED | Final-candidate staging transactions, not fixture APIs |
| Authentication/authorization | BLOCKED | Final live three-account and device-session checks |
| Data isolation/integrity | BLOCKED | Live negative Realtime/file tests on final source |
| Critical/high defects resolved | FAIL | Broad social-file Storage read policy remains installed |
| Automated regression | PASS | 94 unit cases; 85 browser cases across full/affected runs; six compiled smoke cases; lint/builds/audit |
| Payments/notifications as scoped | BLOCKED | Financial features deferred; real device notification acceptance |
| Android/PWA target acceptance | BLOCKED | Stable signature, installation and same-key upgrade |
| Operations/recovery | BLOCKED | Hosted backup/restore and deletion fulfillment |
| Legal/privacy/deployment review | BLOCKED | Owner review and reviewed staging beta activation |
| Human device acceptance/sign-off | BLOCKED | Physical phones and supervised pilot |

One of ten mandatory gates has scoped passing evidence (10% gate coverage, not feature completion or readiness probability). Controlled beta: INCOMPLETE / HOLD. General public launch: HOLD.

Repair branch: `development/voice-media-release-20261122`, based on main `94de4b608857a35fe4b809129037b2770d42deef`. The older `/workspace/work/KONNEKT-acceptance` working tree remains untouched as a source/evidence checkpoint. `scripts/acceptance/staging-voice-field.mjs` is prepared but excluded from this verified application commit until its live execution is reviewed; it must never replace existing identities. Private configuration and preserved browser profiles remain outside Git.

## Stable APK preflight repair

The first exact-candidate stable workflow45034811606 stopped at its certificate-pin preflight. Logs showed all four signing inputs present and a public pinned fingerprint with a trailing CR/LF. The shell regex rejected that formatting before the existing certificate verifier could run. The preflight now removes CR/LF formatting only, retains strict full-fingerprint validation, and still requires the actual keystore certificate to match the pinned fingerprint. No signing key, alias, password, package ID or certificate variable was changed. Two focused signing tests and two APK-evidence tests passed, including pasted fingerprints, malformed-pin rejection and actual wrong-certificate rejection. A new stable workflow must provide artifact evidence; the failed run is not an APK acceptance pass.

## Subsequent observed acceptance — scoped results supersede earlier blocked entries

- Live three-account run: 12/12 scoped checks passed on application source0f09dbc. Both directions exercised real Supabase encrypted direct/group voice/documents, original-byte hash equality, browser audio playback/seek/speed, C row/file/signed-link denial, Realtime positive controls and isolation, plus TEST REPORT submission/moderation-record denial. Synthetic audio is not a physical microphone test. All recorded source hashes still match the candidate application files.
- Live recovery: 4/4 scoped checks passed on eaa1e93. Created a new encrypted backup only for approved fixtureB, whose backup was absent; preserved existingA backup and all original identities. Wrong passphrase in a new isolated session stored no key; correct passphrase restored the identical original key and decrypted authenticated existing direct/group voice metadata and files. C could not read the backup. The recovery secret is private, outside Git.
- Exact-source repair CI45035077738 passed on eaa1e93. Stable Android workflow45035074687 passed on eaa1e93 after the line-ending repair. Package com.konnekt.staging, minSDK26, owner-configured certificate, debuggable staging APK. Published archive SHA and contained APK SHA independently matched downloaded bytes; metadata in APK_EVIDENCE.json. APK/source links are in the consolidated dashboard. The build is not physical installation/update/push acceptance.
- Three real embedded-PostgreSQL policy regressions reproduce then repair follower-file exposure, expired/deleted/orphan/spoofed-owner access and blocking, while preserving chat policy behavior and exercising rollback without row deletion. The proposed staging migration and rollback are docs/release/staging-social-object-authorization*.sql. The connector confirmation expired; migration history and catalogs showed it was NOT applied. The broad social-file policy is therefore still a HIGH release blocker. No production migration was attempted.

LIVE_ACCEPTANCE.json contains sanitized, source-bound results; no account IDs, private object paths, passwords, private keys or recovery secrets. These scoped passes do not make the overall app beta-ready. Exact-final-head automated CI must confirm the added test/harness/report commit.
