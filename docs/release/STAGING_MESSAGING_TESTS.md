# Three-account staging messaging acceptance

Status: **live scoped text/image, Realtime, key-recovery and MFA acceptance passed on 16 November 2026** using three explicitly approved dedicated staging fixtures. Public release remains HOLD; physical Android and operational gates are separate.

The runner uses the existing `konnekt-staging` project only. Production URLs, unknown projects and secret/service-role keys are rejected before a browser or server starts. It does not migrate schemas, reset passwords or replace existing encryption identities.

## Private setup

Create an ignored configuration file ending in `.local`, outside shared/public storage. Example structure (replace values privately):

```json
{
  "projectUrl": "https://oiwtfkgrnpzirghbsvim.supabase.co",
  "publishableKey": "STAGING_PUBLISHABLE_KEY",
  "confirmStagingWrites": true,
  "accounts": [
    { "email": "a@example.invalid", "password": "", "username": "staging_a" },
    { "email": "b@example.invalid", "password": "", "username": "staging_b" },
    { "email": "c@example.invalid", "password": "", "username": "staging_c" }
  ]
}
```

Use three dedicated, verified staging accounts with distinct existing usernames. Do not use real user accounts or production passwords. The runner needs no service-role credential. Restrict the file to its owner:

```sh
chmod 600 /private/path/konnekt-acceptance.local
KONNEKT_ACCEPTANCE_CONFIG=/private/path/konnekt-acceptance.local node scripts/acceptance/staging-messaging.mjs --check-config
```

`--check-config` makes no network requests, opens no browsers and creates no test records. The browser runner requires Chromium installed for Playwright or an existing browser specified by `CHROMIUM_PATH`.

## Execution

```sh
KONNEKT_ACCEPTANCE_CONFIG=/private/path/konnekt-acceptance.local CHROMIUM_PATH=/usr/bin/chromium node scripts/acceptance/staging-messaging.mjs
```

Run from a private workstation/workspace. Local port **5280** must be free. The runner starts Vite in staging mode on that fixed loopback origin so IndexedDB encryption keys remain available across repeated runs. HTTP and WebSocket connections are restricted to that local app and the existing staging project.

If browser egress needs a proxy, the runner accepts `KONNEKT_ACCEPTANCE_PROXY` or the standard HTTPS proxy environment setting. Localhost bypasses it. In proxy mode, HTTP and WebSocket traffic uses verified Node TLS with the environment's existing CA trust; actual staging responses/frames are forwarded unchanged. No shared trust-store changes or certificate-verification bypass is required. Proxy credentials are not logged. The same fixed-origin allowlist and Realtime positive controls still apply.

Read-only connectivity check (no account credentials, browser profiles or database writes):

```sh
KONNEKT_STAGING_PUBLISHABLE_KEY=STAGING_PUBLISHABLE_KEY CHROMIUM_PATH=/usr/bin/chromium node scripts/acceptance/staging-transport.mjs
```

`PASS_TRANSPORT_ONLY` requires a real Auth health response and a real Realtime heartbeat reply with TLS verification enabled. It is not encryption, PostgreSQL-change delivery or outsider-isolation acceptance.

The runner preserves three separate Chromium profiles beside the configuration, in `<configuration>.artifacts.local/profiles/`. These profiles contain sessions and private encryption keys: keep the parent directory private and never commit, upload or share it. Each account is checked against the configured username and persisted session before use. If an existing account's original private key is unavailable, the run stops; credentials alone cannot restore its encrypted history. Recover the original key through the app's encrypted-backup flow rather than replacing it. A pass is only meaningful with recoverable test keys.

## Checks performed by the live runner

1. Sign in through the actual app in three isolated browser profiles; verify the authenticated users are distinct and initialize/check the app's encryption identities.
2. A and B open the same direct conversation through discovery. C opens a separate legitimate conversation with A, never joins A/B's chat or group.
3. Establish real Realtime observer subscriptions for member B and outsider C. Require successful subscription, fail on disconnect/error, and require C to observe its own legitimate control messages before and after each protected exchange.
4. Send encrypted text and PNG attachments in both directions in A/B's direct chat. Verify ciphertext on the message write, exactly one inserted row, UI delivery without reload, and byte-identical decrypted PNG content in the recipient's specific message bubble.
5. Create an A/B group through the app UI. Verify actual membership, exchange encrypted text and PNG attachments both ways, and repeat the member/outsider Realtime checks.
6. Confirm C cannot read protected message history through the API. Require member B's observer to see every protected message and C's observer to see none during the measured window (five seconds after its final positive control).
7. Verify sent-to-read receipt transition when B opens the conversation, authenticated C download/signed-link denial for all direct/group PNGs, then refresh both member browsers and verify encrypted history remains readable.

The runner writes labelled **TEST ACCEPTANCE** records to staging. It leaves the group, conversations, encrypted attachments and messages as evidence; it does not delete unrelated data. The sanitized report records phase/results and evidence IDs, without account passwords, tokens, private keys, screenshots or browser traces. It is written with owner-only permissions beside the private configuration. A failed or blocked phase exits nonzero and cannot grant acceptance. Labels and reports do not include email addresses.

## Interpretation and limits

- `PASS_SCOPED_MESSAGING_ONLY` covers these exact direct/group text/image scenarios and the bounded Realtime observation; it does not claim all Realtime conditions or all attachment formats are proven.
- `FAIL_OR_BLOCKED` includes missing keys, login/MFA problems, unsupported environment, or real functional failures. The report identifies the phase. It deliberately avoids logging raw browser errors that can contain credentials.
- This runner does not exercise physical Android installation, voice/video across Wi-Fi/cellular, TURN relay behavior, closed-app push, audio/video attachments, group membership changes, or account recovery. Those remain separate acceptance gates.
- Live sanitized reports are stored privately alongside the configuration. Keep public release on hold until all mandatory gates pass.

## Extended recovery and media acceptance

`staging-security.mjs` reuses the original profiles and backs up their existing identity, checks outsider backup exclusion, enrolls a real test TOTP factor through the app, verifies AAL1 UI/API/RPC denial and wrong-code rejection, then restores legitimate access using a correct code. A fresh isolated browser must reject a wrong recovery passphrase without writing a key, restore the same fingerprint with the correct passphrase, and decrypt old live messages. The factor is removed using a fresh code; failure cleanup uses the test account's own normal Auth session. Recovery passphrases and TOTP material are stored owner-only beside the config, never in logs. Preserve these files if cleanup fails.

Extended runners require `allowExtendedAcceptance: true` and `fixtureRun` matching each account's server-side `app_metadata.konnekt_test_run`; they refuse ordinary accounts. Run them sequentially after the messaging runner, using the same `KONNEKT_ACCEPTANCE_CONFIG` and `CHROMIUM_PATH`. Port 5280 and the three persistent profiles cannot be shared by simultaneous runs.

`staging-media.mjs` records a synthetic browser audio stream through the real MediaRecorder UI, then encrypts/uploads/sends/decrypts and plays it remotely. It also tests the small VP8 video fixture, compares recipient bytes, denies C file access, verifies stopped recording tracks, and tests normal-service blocking plus UI unblock. Synthetic browser audio does not establish physical microphone, Android codec, two-phone call, or network acceptance. It leaves labelled staging evidence in place.

`staging-retry.mjs` tests one explicitly bounded failure: a message INSERT is rejected locally before it reaches the server, after a real encrypted upload. It requires real unused-file deletion, the preserved draft, and exactly one real recipient-delivered message on retry. It then forwards a real INSERT successfully but replaces its response with an injected error, requiring the committed row and its file to survive, no cleanup DELETE, and byte-identical recipient image decryption. Other ambiguous network and authorization changes remain separate cases.

`staging-social.mjs` verifies actual fixture profile persistence, Discover, public Reel upload/playback/like/comment, and text/image/video Status publication/viewing. It also confirms the legacy direct RPC is denied after staging grant repair while current direct/group UI callers work. These are dedicated staging fixtures; do not point these scripts at production.
