# Staging background push — implementation and acceptance

Public release remains **HOLD**. Provider delivery and physical Android behavior are not accepted. Production data/configuration is unchanged.

## Implemented and verified scope

The earlier app had native registration but no trusted background sender. The new staging path uses private, unpredictable session identities rather than public account UUIDs. The current [OneSignal identity-verification documentation](https://documentation.onesignal.com/docs/en/identity-verification) explicitly says Cordova/Capacitor cannot send login JWTs; do not enable its verification toggle for this SDK. An opaque identity is a private bearer capability, not a claim of native SDK token verification.

`konnekt_register_push_session` checks the signed caller, expected account, actual Auth session, expiry, bans, MFA and deletion guard. A private installation capability retires a previous account's target on the same device. A transaction lock and server-issued Auth-session creation order stop delayed older registrations from reclaiming it. Unregister matches both caller/session and device, so late logout cannot remove a new account. Aliases and installation capabilities must never be logged, published or stored in public tables.

`konnekt_push_delivery` is service-only. It re-reads the notification and targets; it excludes read/old activity, blocked pairs, banned/deleting recipients, expired/revoked sessions, MFA sessions needing verification, and disabled notification types. Direct and group call activity is generic, invitation-scoped and expires within 45 seconds; ended/accepted calls are excluded. Generic push never includes private message text, account IDs or conversation IDs. A provider acceptance response is not phone-delivery evidence.

The app resolves its own identity through the guarded RPC and refreshes it on renewed sign-in. Notification choices are account-scoped and sync for configured native push. Sound/vibration remain Android controls; the previous nonfunctional plaintext-preview switch was removed. Web/in-app activity remains readable independently of push choices.

The shared Edge handler authenticates a separate webhook secret, limits body size, accepts only notification INSERT IDs, ignores supplied recipients/body, uses a fixed provider URL with no redirects and a bounded timeout, validates targets, and uses the notification UUID as the provider idempotency key. It never exposes the provider key or raw error response. The runtime pins supabase-js 2.119.0 and refuses production URLs.

Staging migration `20261116171920_release_staging_private_push_sessions` succeeded after schema inspection and idempotent local SQL tests. Counts immediately before/after remained 7 Auth users, 52 messages, 30 files and 56 notifications. New registration/call activity tests use dedicated approved fixtures only. `dispatch-push` was deployed to staging and returned the expected `503 {"status":"not_configured"}` because provider secrets are absent; no actual provider send was attempted.

Local database/handler/client tests and real three-account registration checks cover ownership, secret-target isolation, preferences, switches, stale requests and logout. A redacted operator probe found one eligible target for the enabled fixture, zero for the opted-out fixture, and zero Auth/registration rows for the two signed-out isolated sessions. Existing fixture sessions and encryption keys were preserved.

## Owner configuration and remaining evidence

Set staging Edge Function secrets privately: `KONNEKT_ONESIGNAL_APP_ID`, `KONNEKT_ONESIGNAL_API_KEY`, and a fresh random webhook token of at least 32 characters in `KONNEKT_PUSH_WEBHOOK_SECRET`. Keep these out of Vite variables, Git, chat and artifacts. Only the public App ID belongs in `KONNEKT_STAGING_ONESIGNAL_APP_ID` for the APK build. Use an Android/FCM-configured staging OneSignal application for `com.konnekt.staging`, separate from production.

Configure a staging database webhook for INSERT on `public.notifications` to `/functions/v1/dispatch-push`, with `Authorization: Bearer <private webhook token>` and JSON Content-Type. The function intentionally uses its own secret verification (`verify_jwt=false`); ordinary account JWTs are not sender credentials. Use supported secret storage and restrict access to queued request headers; never place a service-role key in client code or public SQL. Do not configure production hooks from this guide.

The current code is a staging-only deployment; a separately approved production adaptation must inspect schema/ACLs and remove the staging URL restriction only after acceptance. Two authenticated definer entry points are intentional and tested; the private RLS table intentionally grants no direct client access or policy. Its no-policy INFO is default-deny, not permission to add a public SELECT policy. Leaked-password protection and the pre-existing reviewed definer advisories remain documented separately.

Install a stable-signed APK on two phones and observe foreground/background/closed-app delivery, permission denial, native alias changes, logout/account-switch isolation, revoked sessions, unread/read behavior, type preferences, direct/group call expiry and media across Wi-Fi/cellular. Check actual native/provider identities without publishing their values. The SDK's asynchronous bridge, queued notifications already accepted before logout, Android battery restrictions and FCM behavior require physical evidence. Provider-enabled deletion/erasure remains a separate mandatory gate.
