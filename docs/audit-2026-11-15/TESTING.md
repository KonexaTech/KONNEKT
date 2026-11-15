# Reproducing the audit checks

Use Node 22.13+ (or a supported Node 24 release).

```sh
npm ci
npm run lint
npm test
npx playwright install chromium
npm run test:browser
npm run build
npm run build:mobile
```

`CHROMIUM_PATH=/usr/bin/chromium npm run test:browser` can use an existing Linux Chromium. Browser tests create isolated local Vite servers, synthetic sessions and intercepted Supabase responses. They block Supabase WebSockets and do not sign in to or mutate the connected project. They verify client behavior, not hosted backend correctness or delivery.

`npm test` creates an in-memory PGlite database and reconstructs the catalog-derived schema using `tests/fixtures/live-schema-2026-11-15.sql`. Auth/Storage helpers and grants are test scaffolding, not a replica of the hosted platform. It reproduces baseline defects, applies each proposed migration twice locally and checks permitted/forbidden operations with synthetic account IDs. The fixture contains no user rows or credentials. Never run it on Supabase.

The two files under `supabase/migrations/` remain **unapplied proposals**. These test commands do not run Supabase CLI migration, database push or deployment commands.

To prepare Android locally, run `npx cap add android`, `node scripts/android-assets.mjs`, then `npx cap sync android` after the mobile build. Signed packaging needs the required SDK/signing configuration; the audit only verified project generation/assets/sync.

Live acceptance still needs dedicated accounts, separate devices/networks, provider configuration and approval for any database deployment or destructive account-erasure tests. See REPORT.md for the feature matrix and launch requirements.
