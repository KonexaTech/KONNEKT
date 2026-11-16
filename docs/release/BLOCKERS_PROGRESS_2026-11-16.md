# Release blocker repair progress — 16 November 2026

Public release remains **HOLD**. This milestone extends the initial core-release PR; it does not merge, publish the website, change production data or enable paid infrastructure.

## Completed repairs

- Native push identity changes are serialized; stale SDK loading/login cannot win an account switch. An unresolved permission prompt cannot delay logout. The controller clears a cached native identity at startup and attempts cleanup after failures. Provider delivery, identity verification and physical closed-app behavior remain unproven.
- Stable staging signing now has an explicit default path using owner-held Actions secrets, private keystore files, environment-based passwords, repeatable certificate fingerprints and actual APK-signer matching. Missing secrets fail early. Explicit ephemeral builds are labelled fresh-install-only, not safe upgrades. Production signing secrets are no longer interpolated into shell source; the manual release workflow prepares/verifies an installable signed APK as well as an AAB and removes the runner keystore.
- Owner deletion policy was received: remove the deleting account's sent messages and attachments. The staging schema now preserves other participants' conversations and group key envelopes, transfers surviving group ownership, and retains the public cryptographic metadata needed to decrypt the remaining author's direct messages. Direct history for a deleted peer is read-only.
- A guarded staging-only operator worker defaults to a read-only plan. It requires an existing owner-submitted request, explicit target confirmation, disposable-account and backup attestations, and no configured external push provider. It removes owned files through Storage before Auth, stops on errors and supports resuming a locked request. Staff/audit accounts and push-enabled account erasure remain excluded pending their separate procedure/integration.
- The common staging RLS/RPC helper now denies processing and deleted Auth identities, including residual `aal2` tokens. End users cannot call the four operator functions or forge a processing request.
- Offline backup packaging uses GnuPG AES-256 plus per-file SHA-256/size manifests and storage-byte checks. Wrong passphrases, corrupt archives, missing media, symlinks and existing restore destinations fail safely. It does not connect to a database and reports `databaseRestored:false` when exports are recovered.
- Browser recovery now uses two genuinely isolated browser processes: wrong-passphrase failure leaves no key; the correct passphrase recovers the original identity and decrypts the original ciphertext. A separate browser case proves remaining direct messages decrypt after peer deletion while send/media/record/call controls are disabled. These are fixture tests, not live-account acceptance.

## Observed staging deployment

Migration `20261116115946_release_safe_account_deletion` succeeded on `konnekt-staging` after current-schema inspection, a private schema snapshot and a successful local schema-restoration rehearsal. Before/after counts remained **4 Auth users, 4 profiles, 1 message and 0 Storage objects**. No real accounts, messages or files were deleted.

Catalogs confirm both destructive cascades changed to `SET NULL`, 31 MFA policies remain installed, phone SELECT is still denied, the guarded peer-key lookup remains member-scoped, and all four operator functions deny anonymous/authenticated EXECUTE while allowing `service_role`. A live read-only simulated-role probe rejects an AAL2 identity that does not exist. Real signed-user deletion/recovery remains pending.

Advisors retain nine intentional authenticated definer helpers/entry points, including the new member-only lookup, and disabled leaked-password protection. [Definer advisor guidance](https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable) and [password protection guidance](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection) require owner review; no paid upgrade was enabled.

## Gate matrix

| Gate | Result | Evidence or remaining input |
| --- | --- | --- |
| Deletion schema protections and access grants | PASS | Staging migration/catalogs; data counts preserved; local deletion/RLS and schema-restoration tests |
| Push identity race regressions | PASS | SDK-load race, pending permission, delayed login and failed-login cleanup tests |
| Isolated encrypted-key recovery and deleted-peer readability | PASS (fixtures) | Two isolated browser processes; original ciphertext decryption; read-only controls |
| Encrypted export packaging/local fixture restore | PASS (limited) | GnuPG wrong/correct passphrase and corruption checks; byte-identical media; SQL restored to a new fixture PGlite database |
| Stable signing/native updates | BLOCKED | GitHub integration returns 403 for secret administration. Owner must supply the four staging signing secrets; native update installation must then be observed. No old test key was replaced |
| Live three-account encryption, Realtime, files and recovery | BLOCKED | Credentials/sessions/original recoverable keys not supplied. A proposed short-lived service-role fixture-bootstrap endpoint was rejected by automatic approval review; it was not deployed and no new accounts were created. Existing-account configuration remains an alternative |
| Calls and push on physical Android | BLOCKED | Two devices, Wi-Fi/cellular, TURN and OneSignal/FCM/server sender configuration plus actual delivery/identity-isolation evidence |
| Real deletion fulfillment | BLOCKED | Server-only staging credential, a disposable account's request and verified recoverable snapshot; configured external-provider erasure remains an implementation/test prerequisite |
| Full platform backup/restore | BLOCKED | Owner-approved RPO/RTO/retention/schedule/destination, supported export credential and disposable local/free target. Workspace Docker socket is permission-denied. Packaging exports is not a full Auth/Storage drill |
| Production security promotion | BLOCKED | Read-only preflight complete; production still has phone grants, two anonymous helper grants, no MFA guard and the old deletion cascades. Compatible deployed clients, backup/live acceptance and separate owner approval are required |
| Public launch | BLOCKED / HOLD | All mandatory live/device/operational gates must pass; live rooms/payments remain excluded |

Local final-tree validation passed: clean install, lint, **29 unit/database/service-worker tests**, **37 browser tests**, production website/mobile builds, **three compiled-bundle smoke cases per build**, and production dependency audit (**zero vulnerabilities**). The lazy-module outage test now catches timestamped Vite URLs and requires an actual blocked request, so it cannot silently miss the simulated failure. Exact final-commit CI and native workflow links belong in the repair PR. Build/test results must not be substituted for the blocked live gates above.

Owner setup and exact safe commands: [RELEASE_OPERATIONS.md](RELEASE_OPERATIONS.md). Production promotion review: [PRODUCTION_SECURITY_ROLLOUT.md](PRODUCTION_SECURITY_ROLLOUT.md). Live runner: [STAGING_MESSAGING_TESTS.md](STAGING_MESSAGING_TESTS.md).
