# KONNEKT public-release acceptance gates

This branch is not authorization to launch. Keep production Supabase unchanged until staging tests and approval.

The agreed initial scope is [CORE_ANDROID_RELEASE.md](CORE_ANDROID_RELEASE.md). Live rooms and payments are deferred with guarded app routes; their future acceptance requirements below do not waive any included core gate. Current physical-device setup is [ANDROID_DEVICE_ACCEPTANCE.md](ANDROID_DEVICE_ACCEPTANCE.md), with latest repairs in [RELEASE_PROGRESS_2026-11-17.md](RELEASE_PROGRESS_2026-11-17.md).

## Staging isolation (required)
- For Android device acceptance, set the GitHub Actions repository variables `KONNEKT_STAGING_SUPABASE_URL` and `KONNEKT_STAGING_SUPABASE_PUBLISHABLE_KEY` to the separate project’s API URL and publishable key. Set `KONNEKT_STAGING_TURN_CREDENTIALS_URL` to the staging endpoint issuing short-lived relay credentials and `KONNEKT_STAGING_ONESIGNAL_APP_ID` to the staging OneSignal app ID. These values are embedded in the client bundle. Keep provider secrets and private keys on the server.
- Staging Android builds use `com.konnekt.staging` and the label **KONNEKT Staging**, so installation does not replace `com.konnekt.app` or its stored keys. Set `KONNEKT_BUILD_TARGET=staging` for local Capacitor add/sync commands after building staging web assets.
- If repository-variable administration is unavailable, dispatch accepts optional `staging_url` and `staging_publishable_key` inputs. These are public client settings; never supply a secret/service-role key. Repository variables take precedence. The workflow verifies that built JavaScript includes the staging URL and excludes the production project reference.
- Dispatch **Build and Verify KONNEKT Android APK** with `staging=true` and `ephemeral_staging_signing=false`. Install the **Staging-Stable** artifact and retain its `apk-evidence.json`. The **Fresh-Install-Only** artifact cannot prove stable updates. Missing or production Supabase settings cause the staging build to fail. TURN and OneSignal settings are required to exercise their respective acceptance cases.
- Reuse the existing `konnekt-staging` project (`oiwtfkgrnpzirghbsvim`), with its isolated Auth, Storage and credentials. Do not create another paid project or copy production data/keys.
- Use a distinct staging origin and staging-only client settings. Production GitHub Pages publication remains manual and on hold until acceptance and explicit go/no-go.
- Apply reviewed migrations to staging once, in migration order; verify RLS, policies, indexes, triggers and storage permissions before populating test accounts.
- Configure staging Auth redirect URLs, SMTP, email verification, MFA policy and password breach protection. Never copy real user data into staging.
- Deploy Edge Functions with staging secrets only. Check JWT authorization, CORS and request limits before exposing them.

## Security gate (must pass)
- Test anonymous, authenticated non-member, blocked-user, moderator and member access to every exposed RPC, RLS policy and private storage object. Confirm no cross-account reads or writes.
- Review all SECURITY DEFINER functions for explicit authorization, safe search_path and least-privilege EXECUTE. The two anonymous-executable conversation helper functions need reviewed remediation; do not revoke blindly before checking policy dependencies.
- Verify account deletion, export, privacy settings, session revocation, MFA and password recovery.
- Complete dependency audit, independent security review, rate limiting, monitoring, backup/restore drill and POPIA/legal review.

## Messaging gate (must pass)
- Two independent accounts and devices: create direct and group chats; exchange encrypted text and image/video/audio; confirm no duplicate sends, unauthorized access or orphan uploads.
- Verify group key creation race, key recovery on another device, blocked users and account switching.
- Confirm failed uploads clean up and no private chat media has a long-lived URL.

## Calling gate (must pass)
- Voice and video: caller/callee, ringing, answer, decline, hangup, reconnect, permissions denied, mute, camera toggle, background/resume.
- Test different networks, including cellular-to-Wi-Fi and symmetric NAT with TURN relay credentials; verify TURN secrets are not embedded in the client.
- Group calls: 2–4 devices, join/leave/rejoin and network failures. Four-person peer-to-peer beta is not an SFU-based scalable live room.
- Before re-enabling deferred live rooms, require an approved SFU/provider, moderator controls, capacity and abuse testing. They are excluded from the agreed initial scope.

## Push gate (must pass)
- Configure push provider, Android credentials and device token registration in staging. Test foreground/background/terminated delivery, permission denial, token rotation, logout and notification privacy.

## Deferred payments (before re-enabling)
- Creator monetization requires a real payment provider, webhook signature verification, idempotency, ledger, refund/dispute flow, fraud prevention, payout identity checks and reconciliation. Do not accept live payments until compliance and financial tests pass.
- Run provider sandbox payment cases: success, decline, duplicate webhook, refund, cancellation and partial failure. Never store card data in KONNEKT.

## Real-world acceptance (must pass)
- Signed Android 8.0+ APK/AAB installs on representative physical devices; test registration, messaging, attachments, calls, reels, status, moderation and recovery.
- Test weak/offline network, battery/memory use, accessibility, slow devices and production-like concurrent traffic.
- Document observed results and failures, remediate and rerun targeted regressions. Obtain explicit go/no-go sign-off.

**Current decision: NO-GO until all gates are evidenced.**
