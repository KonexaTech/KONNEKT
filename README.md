# KONNEKT

**KONNEKT — Connecting people everywhere.**

This repository is the existing React 18/Vite application with React Native Web screens, Supabase authentication/data/storage/realtime and Capacitor Android support. Upgrade work preserves the existing project and adds no database reset, account removal or service-role key.

## Audit and review branch

See [the 15 November 2026 audit](docs/audit-2026-11-15/REPORT.md) for verified defects, source repairs, test evidence and unapplied database proposals. The application is not ready for public release. Do not apply SQL or deploy the repair branch without review and approval.

## Current application capabilities

- Supabase email/password authentication and profile persistence.
- One-to-one conversations, group conversations and realtime message updates.
- Image, video and audio attachments in chats; voice note recording where browser support permits.
- One-to-one WebRTC voice/video call signalling and media transport; small peer-to-peer group calls have a four-person limit.
- Status updates with 24-hour expiry and photo/video upload paths.
- Supabase-backed posts/Reels, likes, comments, follows, user discovery and notifications.
- User blocking/reporting, moderation screens and local content/notification preferences.
- Six main navigation destinations in order: Reels, Chats, Status, Discover, Calls, Profile.

These features depend on correct Supabase schema, RLS, storage and deployment configuration. A screen or signalling record is not proof of a successful real-world call or push delivery.

## KONNEKT 2.0 brand and release updates

- Shared theme tokens now follow the requested Royal Purple `#6A0DAD`, Solar Gold `#FFC107`, Sunset Orange `#FF6B00`, Electric Indigo `#3A0CA3` and Neo Cyan `#00E6FF` palette.
- Updated browser theme metadata, PWA manifest theme colour/icon paths and Android launcher background colour without replacing existing app assets or Capacitor configuration.
- Added a controlled testing checklist at `docs/REAL-WORLD-TESTING-RELEASE.md`.
- The tab destinations already existed in the inspected app shell and were retained rather than rebuilding the app.

## External configuration and release limitations

- Review and apply only pending additive SQL migrations in order. Never reset the Supabase project or rerun the original schema as a production reset.
- Configure a secure TURN credential endpoint for reliable calls. Set `VITE_TURN_CREDENTIALS_URL` to an endpoint issuing short-lived credentials; never ship permanent TURN credentials in browser variables.
- Configure OneSignal/FCM for background push. In-app notifications and call prompts while the app is open are not background push.
- Live video broadcasting needs a streaming provider/SFU; a local camera preview is not a broadcast.
- The current client encrypts new chat text and media using Web Crypto; older plaintext records remain plaintext. Encrypted media needs the proposed compatibility migration. The implementation has not received an independent cryptographic review and does not implement a forward-secrecy ratchet.
- Creator verification, subscriptions, earnings, payouts and brand campaigns must not be presented as active unless their real backend workflows are configured.
- Legal terms and privacy materials remain drafts that require review before public launch.

## Build

1. Install dependencies with `npm ci` (or `npm install` if no lockfile is present).
2. Run `npm run lint`, `npm test` and `npm run test:browser` (install Chromium with `npx playwright install chromium`, or set `CHROMIUM_PATH` to an installed browser). Browser tests intercept Supabase traffic and SQL tests use an isolated in-memory database.
3. Run `npm run build` for web.
4. Run `npm run build:mobile`, then `npx cap sync android` for Android assets.
5. Build and verify on real target devices before controlled testing.

## Existing project protection

- Keep the existing Supabase project, accounts, records, integrations and Android configuration.
- Do not expose a Supabase `service_role` key in browser code.
- Do not commit `.env` files or TURN credentials.
- Review every migration and check which ones have already been applied before execution.

See `SUPABASE-SETUP.md`, `TURN-AND-PUSH-SETUP.md`, `TESTING-CHECKLIST.md` and `docs/REAL-WORLD-TESTING-RELEASE.md` for setup and verification guidance.
