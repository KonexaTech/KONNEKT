# KONNEKT public-release acceptance gates

This branch is not authorization to launch. Keep production Supabase unchanged until staging tests and approval.

## Staging isolation (required)
- Create a **separate** Supabase staging project, with a different project URL, publishable key, database, auth users, storage buckets, and secrets. Never reuse production service-role keys.
- Configure a staging deployment on a distinct hostname and use staging-only environment variables. Keep production GitHub Pages deployment bound to main.
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

## Calling and live-room gate (must pass)
- Voice and video: caller/callee, ringing, answer, decline, hangup, reconnect, permissions denied, mute, camera toggle, background/resume.
- Test different networks, including cellular-to-Wi-Fi and symmetric NAT with TURN relay credentials; verify TURN secrets are not embedded in the client.
- Group calls: 2–4 devices, join/leave/rejoin and network failures. Four-person peer-to-peer beta is not an SFU-based scalable live room.
- Live rooms require an approved SFU/provider, moderator controls, capacity and abuse testing before release.

## Push and payments gate (must pass)
- Configure push provider, Android credentials and device token registration in staging. Test foreground/background/terminated delivery, permission denial, token rotation, logout and notification privacy.
- Creator monetization requires a real payment provider, webhook signature verification, idempotency, ledger, refund/dispute flow, fraud prevention, payout identity checks and reconciliation. Do not accept live payments until compliance and financial tests pass.
- Run provider sandbox payment cases: success, decline, duplicate webhook, refund, cancellation and partial failure. Never store card data in KONNEKT.

## Real-world acceptance (must pass)
- Signed Android 8.0+ APK/AAB installs on representative physical devices; test registration, messaging, attachments, calls, reels, status, moderation and recovery.
- Test weak/offline network, battery/memory use, accessibility, slow devices and production-like concurrent traffic.
- Document observed results and failures, remediate and rerun targeted regressions. Obtain explicit go/no-go sign-off.

**Current decision: NO-GO until all gates are evidenced.**
