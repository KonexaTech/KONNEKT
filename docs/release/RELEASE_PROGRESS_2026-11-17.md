# Release progress — 17 November 2026

Public release remains **HOLD**. This record supersedes the pending completion-guard status in the 16 November report. Production data, configuration and publication are unchanged; no paid service was added.

## Staging correction applied

Migration `20261117035233_release_staging_erasure_completion_restore_guard` moves the Auth/Storage absence check before the completion function's idempotent return. Read-back confirms that order and preserves service-only EXECUTE (anonymous/authenticated denied). Counts remain 7 Auth accounts and 30 files, with zero processing deletions. No account or file was deleted. The full deletion/restore/provider workflow still needs operational acceptance; deploying the guard does not pass it.

## Notification repairs

- Native click handling accepts only the generic Notifications destination. It does not use provider-supplied recipients, URLs or conversation IDs as navigation parameters. Cold-start intents wait for session/security readiness, expire after one minute and are discarded on logout/account switch. MFA and password recovery remain in control of protected screens.
- Notifications has an accessible Back button; repeated taps do not stack duplicate inbox screens. Existing main tabs and design remain intact.
- Browser alerts use generic text, honor current-account/type preferences, reject another recipient and stop after screen cleanup. In-app authorized activity remains visible. The browser permission message accurately describes alerts while the Notifications screen is open; it does not promise browser background push.
- CI exposed a first-render settings race after refresh: a saved opt-out briefly appeared enabled before an effect loaded it. The controls now initialize synchronously from the current account's saved preferences, with the existing refresh/account-isolation case verifying the repair.

The new unit/browser cases are fixture evidence for routing and alert privacy. They do not establish native SDK delivery or behavior on a physical device. Final-commit CI and APK evidence are recorded in PR #19.

Actual in-app acceptance subsequently passed four scoped checks using the three existing approved staging accounts: each opened its own inbox despite forged provider parameters, every response/query remained recipient-scoped, arbitrary privileged routes were rejected, Back returned to the existing tabs and no unexpected network origin was contacted. The runner sends no notification or message and creates no account. Sanitized proof: [NOTIFICATION_ACCEPTANCE_2026-11-17.json](NOTIFICATION_ACCEPTANCE_2026-11-17.json). It injects the app intent directly; actual OneSignal/FCM transport and phone behavior remain BLOCKED.

The initial notification pass completed clean install/lint, 61 automated checks, 45 browser cases, both builds, three compiled smoke checks per build and a clean production dependency audit. After the call repairs, clean install and lint passed again with 63 unit/database tests, 58 browser cases, both production builds, six compiled smoke checks and zero production dependency vulnerabilities. Final-commit CI and Android artifact links belong in PR #19. No test keys, tokens, account passwords or provider credentials are committed.

## Call lifecycle and schema repairs

Controlled browser regressions reproduced stale ringing after reopening, delayed private group invitations after sign-out, cameras surviving a late switch/permission grant, unavailable cancellation during consent and notifications interfering with a call. Repairs keep hang-up/leave available, stop local capture before network cleanup, discard cancelled setup and release unused tracks. Camera-off state survives an asynchronous switch. Active calls keep their screen when a generic notification is tapped.

Incoming dialogs and unanswered outgoing calls use the existing server push ring window of 45 seconds. Matching Realtime terminal updates dismiss only their own invitation. Caller timeout stops capture and records a missed call; failed hang-up signalling still attempts the session update. Group hosts are not prompted to join their own invitation. Leaving before joining or during consent works, late group media is stopped, and departed peers are removed.

The live decline run found an actual schema mismatch: staging accepts direct-call `rejected`, while the UI sent `declined` (PostgREST HTTP 400 / SQLSTATE 23514). Read-only inspection confirms production also accepts `rejected`. The client now writes that supported value, handles both canonical and legacy terminal values, and labels history correctly. The browser API fixture enforces the inspected staging CHECK so it cannot mask this mismatch again. Group participant `declined` remains valid and unchanged. No status constraint or production data was modified.

The policy review also found a permissive group-member session UPDATE although the UI reserves ending the shared call for its host. `staging-group-call-ownership.sql` adds a restrictive creator-only session update policy; member SELECT and own participant updates remain in place. Its database test reproduces the old permission, proves a non-host cannot end/take over the session, confirms host completion/member decline, and preserves operator access. Staging migration `20261117054101_release_staging_group_call_owner_update` was applied and read back with unchanged 7 users, 58 messages, 30 files and zero group calls at deployment. Production remains untouched. Advisor counts remain eleven reviewed authenticated definer warnings, five intentional private default-deny INFO findings and disabled leaked-password protection.

All eight final live invitation checks passed using the existing three staging accounts: recipient Realtime positive control, direct decline, caller hang-up, timed expiry, group host leave, outsider read denial, non-host end denial and member decline. Cleanup completed. The group flow also exposed enabled call buttons before conversation metadata was ready; both buttons now wait for the loaded conversation, verified by a controlled regression and the actual staging flow. Sanitized evidence: [CALL_LIFECYCLE_ACCEPTANCE_2026-11-17.json](CALL_LIFECYCLE_ACCEPTANCE_2026-11-17.json). Read-back confirms 7 users, 58 messages, 30 files, 12 terminal direct calls and 2 ended group calls, with no active calls. The runner requests no microphone/camera and does not establish physical Android media or push delivery.

## Remaining mandatory gates

| Gate | Status | Exact missing evidence/input |
| --- | --- | --- |
| Stable Android installation/update | BLOCKED | Four owner-held Actions signing secrets; two same-key builds installed/updated on phones without clearing keys/data |
| Native notification delivery/isolation | BLOCKED | Staging OneSignal/FCM credentials, matching server/APK public App ID, private sender/webhook configuration; foreground/background/swipe-closed, permission, account-switch and revoke tests |
| Calls across networks | BLOCKED | Two Android phones, Wi-Fi/mobile data and working R0 TURN relay credentials; observed ringing, media, controls, reconnect and hang-up |
| Live deletion fulfillment | BLOCKED | Disposable account, actual provider access, supported recoverable backup and observed file/provider/Auth removal with other participants' history preserved |
| Full-service backup/restore | BLOCKED | Agreed recovery objectives, private export access/destination/operator and approved disposable restore target; hosted Auth/Storage/login/encryption/media evidence |
| Email/password recovery | BLOCKED | Approved staging inbox/SMTP access and actual link/new-password acceptance; fixture Auth and encryption-recovery results do not prove email delivery |
| Production security/operations | BLOCKED | Supported backup, exact reviewed DDL/client rollout approval, post-rollout signed-account tests, monitoring/security/legal review and owner go/no-go |

Previously recorded scoped staging messaging, Realtime outsider isolation, encrypted-key recovery, media/retry, social activity and push-registration checks retain their stated limits. See [LIVE_ACCEPTANCE_2026-11-16.json](LIVE_ACCEPTANCE_2026-11-16.json) and [ANDROID_PROVIDER_ACCEPTANCE_2026-11-16.json](ANDROID_PROVIDER_ACCEPTANCE_2026-11-16.json). Live rooms and payments remain deferred as agreed in the initial release scope.
