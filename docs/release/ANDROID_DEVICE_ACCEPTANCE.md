# Android installation, notification and security acceptance

Public release is **HOLD**. Run this on the existing staging project only. These are pending manual tests, not passed checks. Keep test accounts, device identifiers, tokens, notification aliases and recordings private.

## Required setup

The owner has elected to supply access later. Two physical Android phones (one Android 8/API 26 if available, one Android 13+), Wi-Fi and mobile data are required. Record model, OS, WebView version, battery restrictions and app notification permission. Use approved staging accounts A/B; C remains the privacy outsider.

Configure the four stable staging signing secrets described in [RELEASE_OPERATIONS.md](RELEASE_OPERATIONS.md). Retain an encrypted copy of that exact key. Configure a separate staging OneSignal Android application for `com.konnekt.staging`, its FCM credentials, private sender/webhook secrets and the public App ID. The server's configured App ID, sender and APK must agree; see [STAGING_PUSH_DELIVERY.md](STAGING_PUSH_DELIVERY.md). Configure the existing authenticated TURN endpoint and a working R0 relay; do not buy infrastructure automatically.

Dispatch **Build and Verify KONNEKT Android APK** on the exact proposed commit with `staging=true`, `ephemeral_staging_signing=false`. Supply only public staging settings in workflow inputs. Download the **Stable** artifact, preserving `app-debug.apk` and `apk-evidence.json`. A Fresh-Install-Only artifact cannot satisfy this gate. Record the run URL, source commit, APK SHA-256 and signing certificate from the evidence file.

The evidence script invokes the Android SDK's signature verifier for API 26, inspects the actual APK package/minimum SDK, and hashes its bytes. It leaves physical installation/update/push explicitly BLOCKED. The staging package is a debuggable test build, not a production distribution artifact.

## Installation and update

1. Verify the downloaded APK hash against `apk-evidence.json`; confirm `com.konnekt.staging`, minimum SDK 26 and the owner-retained certificate. Install on both phones. Confirm staging branding and that any production installation remains intact.
2. Sign in, send an encrypted message and attachment both ways, and create an encrypted recovery backup. Record only redacted outcomes. Confirm the wrong passphrase fails and the correct one restores the original history in an isolated installation/session.
3. Build a second candidate with the same stable key. Compare both evidence files (the script accepts the previous file as its final optional CLI argument). Android must accept an in-place update without uninstalling or clearing data. Confirm accounts, original encryption identity/history, media and notification permission still work. The comparison checks signer/package/nondecreasing version code; only the phone proves the update.
4. A signature mismatch is a FAIL. Preserve the installed app and its private keys; do not uninstall to make the result pass. Record and repair signing continuity before retrying. Repeat with the separately signed, non-debuggable production package before public launch.

## Notification matrix

For every row record UTC send/receive times, direction A→B and B→A, network, actual phone behavior and redacted provider message reference. A provider HTTP acceptance or unread database row alone cannot pass delivery. Confirm generic lock-screen content never reveals encrypted text or private identifiers.

| Case | Required observation | Result |
| --- | --- | --- |
| Foreground | New activity reaches the correct account; tap navigates safely; no unwanted duplicate | BLOCKED |
| Background/Home | Notification arrives while another app is open, on Wi-Fi then mobile data | BLOCKED |
| Swipe-closed | Remove from Recents without force-stopping; actual notification arrives and opens safely | BLOCKED |
| Locked screen/battery restrictions | Record observed delivery and OS restrictions; repeat after reconnect | BLOCKED |
| Permission denied/re-enabled | App remains usable; no false delivery claim; delivery works after explicit enable | BLOCKED |
| Preferences | Disable messages only: message alerts stop while allowed categories still work; choices survive refresh/update | BLOCKED |
| Logout | After confirmed logout, send NEW activity to old account: no delivery to that installation | BLOCKED |
| Switch A→B | Fresh A activity does not reach B's installation; fresh B activity does; late A cleanup cannot remove B | BLOCKED |
| Session revoke/token rotation | Revoked sign-in cannot re-register; renewed permitted subscription delivers only to current account | BLOCKED |
| Expired/ended calls and read events | Stale ringing/read activity does not produce a fresh misleading alert | BLOCKED |

Also test Android **Force stop** as a separate diagnostic. Android may suppress push until the app is opened again; do not describe force-stopped delivery as supported based on a swipe-closed result. Record reopening/re-registration behavior. Distinguish already accepted/in-flight notifications from NEW events created after logout acknowledgement; a stale notification exposing prior account activity is a privacy failure to investigate.

## Calls and production security

On both phones exercise voice/video both ways for Wi-Fi↔Wi-Fi, Wi-Fi↔mobile, mobile↔Wi-Fi and mobile↔mobile. Observe ringing, answer/decline, two-way sound/video, mute, camera toggle, reconnect after network changes, hang-up on both ends, denied permissions and blocked-user rejection. Confirm a relay candidate is actually selected in a TURN-required case; redact addresses and credentials. Synthetic browser media does not pass this gate.

Follow [PRODUCTION_SECURITY_ROLLOUT.md](PRODUCTION_SECURITY_ROLLOUT.md): recoverable backup first, inspect drift, approve exact DDL/client promotion, apply only during the approved window, then test dedicated production accounts. The 16 November read-only recheck still found phone-column grants and two anonymous definer helpers; production security acceptance has not passed. Deletion with provider erasure and a full-service restore drill also require separate observed acceptance.

Store an owner-private report with exact commit/APK/run identifiers, OS/network conditions, each case's PASS/FAIL/BLOCKED result, redacted evidence and retest reference. Publish only sanitized outcomes. Mark a case PASS only after observing the stated behavior. Keep public launch on HOLD until every mandatory included gate passes.
