# Release progress — 17 November 2026

Public release remains **HOLD**. This record supersedes the pending completion-guard status in the 16 November report. Production data, configuration and publication are unchanged; no paid service was added.

## Staging correction applied

Migration `20261117035233_release_staging_erasure_completion_restore_guard` moves the Auth/Storage absence check before the completion function's idempotent return. Read-back confirms that order and preserves service-only EXECUTE (anonymous/authenticated denied). Counts remain 7 Auth accounts and 30 files, with zero processing deletions. No account or file was deleted. The full deletion/restore/provider workflow still needs operational acceptance; deploying the guard does not pass it.

## Notification repairs

- Native click handling accepts only the generic Notifications destination. It does not use provider-supplied recipients, URLs or conversation IDs as navigation parameters. Cold-start intents wait for session/security readiness, expire after one minute and are discarded on logout/account switch. MFA and password recovery remain in control of protected screens.
- Notifications has an accessible Back button; repeated taps do not stack duplicate inbox screens. Existing main tabs and design remain intact.
- Browser alerts use generic text, honor current-account/type preferences, reject another recipient and stop after screen cleanup. In-app authorized activity remains visible. The browser permission message accurately describes alerts while the Notifications screen is open; it does not promise browser background push.

The new unit/browser cases are fixture evidence for routing and alert privacy. They do not establish native SDK delivery or behavior on a physical device. Final-commit CI and APK evidence are recorded in PR #19.

Actual in-app acceptance subsequently passed four scoped checks using the three existing approved staging accounts: each opened its own inbox despite forged provider parameters, every response/query remained recipient-scoped, arbitrary privileged routes were rejected, Back returned to the existing tabs and no unexpected network origin was contacted. The runner sends no notification or message and creates no account. Sanitized proof: [NOTIFICATION_ACCEPTANCE_2026-11-17.json](NOTIFICATION_ACCEPTANCE_2026-11-17.json). It injects the app intent directly; actual OneSignal/FCM transport and phone behavior remain BLOCKED.

Local checks passed: clean `npm ci`, lint, 61 unit/database/service-worker checks, 45 browser cases, both web/mobile builds, three compiled smoke checks per build and production dependency audit (zero vulnerabilities). The final session-before-buffer-replay ordering and responsive notification navigation were checked again with the affected browser cases and rebuilt bundles. No test keys, tokens, account passwords or provider credentials were committed.

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
