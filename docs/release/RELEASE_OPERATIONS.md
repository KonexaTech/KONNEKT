# Staging release operations and owner setup

Public release is **HOLD**. All commands here are for the existing `konnekt-staging` project. No production account, data or signing key may be used for tests. Server operations are outside the client source/bundles.

## Stable Android signing

The APK workflow now defaults staging builds to stable signing. It requires these repository Actions secrets:

- `KONNEKT_STAGING_KEYSTORE_BASE64`
- `KONNEKT_STAGING_KEYSTORE_PASSWORD`
- `KONNEKT_STAGING_KEY_ALIAS`
- `KONNEKT_STAGING_KEY_PASSWORD`

The connected GitHub integration cannot administer these secrets (HTTP 403). An owner must install them at [Actions secrets](https://github.com/siboniisozulu-alt/KONNEKT/settings/secrets/actions). Reuse an existing staging keystore if one exists; do not replace a signing identity just to make a build pass. If no stable staging key has ever existed, generate one privately with `keytool -genkeypair` on the owner's machine, retain an encrypted offline copy and keep passwords separately. Never paste the keystore or passwords into chat, Git or an Actions artifact. Production uses separate `ANDROID_*` secrets in the release workflow.

`scripts/android-staging-signing.mjs` validates the keystore/alias using environment-based passwords, limits decoded files to private runner storage, writes no password into Gradle, and fingerprints the certificate. APK verification compares the actual signer to that fingerprint. The key is removed after the job. Local tests generate a disposable fixture keystore and check repeatable fingerprints, idempotent Gradle configuration, private permissions and rejection of absent/malformed secrets.

The explicit `ephemeral_staging_signing=true` dispatch escape hatch produces a separately labelled **Fresh-Install-Only** test artifact. It is not signing-continuity evidence. Earlier debug builds may have different signing certificates: if Android rejects an upgrade, preserve the installed app and its private encryption key. Do not uninstall or clear app data to bypass the error. Prove encrypted-key recovery before moving a test account to a new installation. Production signing also requires owner keys, native build verification and a physical installation test.

## Account deletion

Owner decision: **remove the account's sent messages and attachments**, while preserving other participants' messages. The app continues to submit a deletion request. A trusted operator fulfills it with `scripts/ops/delete-account.mjs`; no browser receives a service credential or authority to choose another account.

The staging schema repairs conversation creator and group-key sender cascades. Surviving groups transfer ownership to a remaining member. Remaining direct-chat messages retain only the deleted peer UUID/public key required to decrypt the surviving author's own history; personal profile data is removed. Direct history is read-only, with sending, attachments, recording and calls disabled. Public-key envelopes for surviving group members remain readable. These public cryptographic metadata are not private keys.

The guarded processing state prevents new app data access while removal is underway. The common RLS/RPC helper checks that the Auth user still exists, so old JWTs cannot regain access after Auth deletion just because their AAL is `aal2`. Normal users cannot submit a request already marked processing/completed. Four operator RPCs are executable only by `service_role`. Staff/audit accounts are refused and need a separate reviewed procedure.

Create a private ignored `operations.local`, mode 600, outside shared/public storage:

```json
{
  "projectUrl": "https://oiwtfkgrnpzirghbsvim.supabase.co",
  "serviceKey": "SERVER_ONLY_STAGING_SECRET",
  "deletionUserId": "DISPOSABLE_STAGING_ACCOUNT_UUID",
  "allowStagingDeletion": false,
  "disposableStagingAccount": true,
  "backupVerified": false,
  "pushProvider": "none"
}
```

Read-only plan:

```sh
KONNEKT_OPERATIONS_CONFIG=/private/path/operations.local node scripts/ops/delete-account.mjs
```

After a real recoverable snapshot, an explicitly disposable account's request, operator review and physical/session test preparation, set the execution/backup confirmations privately and run:

```sh
KONNEKT_OPERATIONS_CONFIG=/private/path/operations.local node scripts/ops/delete-account.mjs --execute --confirm DISPOSABLE_STAGING_ACCOUNT_UUID
```

The worker locks the account, uses ownership-based server manifests to remove Storage objects through the Storage API, then deletes Auth (which cascades the sender's messages/profile/keys/memberships), and marks the request complete with the private reason cleared. It never deletes Storage metadata directly through SQL. Storage failure leaves the account locked for retry and never reports completion. A dry run does not lock or delete anything. A completed request can be retried without deleting again. `backupVerified` is an operator attestation, not a substitute for an observed restore drill.

No real account has been deleted by this repair. End-to-end acceptance still requires a dedicated disposable staging account, server-only credential and backup evidence. Server erasure cannot recall files/messages already downloaded or independently copied by recipients.

### Provider-enabled erasure

The staging-only `staging-provider-erasure.sql` extends the worker with a private identity ledger and deletion manifest. The ledger retains provider aliases after logout; the manifest survives Auth removal for safe retry. Ordinary users cannot configure the provider, inspect these tables, prepare deletion or mark a target erased. Completed deletion tombstones deny accidentally restored identities; reconcile tombstones before exposing a restored database. The worker refuses to treat a restored Auth identity as an already-completed deletion.

Before native provider testing, an authorized operator must configure the **actual public staging App ID** with service-only `konnekt_configure_push_app(p_app_id)`. It must match the APK and Edge sender App ID. No App ID or dummy provider is installed by the migration. Provider application changes are refused while deletion is processing. Inventory any historical provider applications separately; the database cannot discover unrecorded external identities.

For OneSignal, use `"pushProvider":"onesignal"` and `"onesignalApps":[{"appId":"ACTUAL_STAGING_PUBLIC_APP_UUID","apiKey":"PRIVATE_STAGING_APP_API_KEY"}]` in the private operations file. Every server-recorded App ID needs its matching private key. `pushProvider:none` is refused when any provider app/target is recorded. A plan-only run never calls the provider or locks/deletes data.

Execution first verifies that the keys belong to the recorded applications, then locks deletion, snapshots aliases, revokes sessions and ends calls. It deletes each provider identity (including the legacy account UUID for known apps), polls until GET returns 404, records that proof and only then proceeds to Storage/Auth. A DELETE 202 means accepted, not erased. Provider errors or unverified absence stop processing without claiming completion; keep the account locked and retry. Raw provider responses, aliases and keys are never logged. Files still go through the Storage API, never direct metadata deletion. Full deletion acceptance remains **BLOCKED** until observed with a disposable account, recoverable backup, actual provider credentials and a physical device.

## Encrypted export packaging and restore

`scripts/ops/backup-bundle.mjs` uses GnuPG AES-256 to encrypt owner-supplied exports. It never connects to or modifies a database. Install GnuPG locally; no hosted or paid service is needed. Prepare provider-supported exports in a private folder:

- `schema.sql`, `data.sql`, `roles.sql`: compatible schema, app rows, roles/grants/functions/policies.
- `auth.sql`: supported Auth export including stable IDs. Preserve provider encryption/root-key requirements through the supported secret-management process; this tool does not manufacture a working Auth backup.
- `configuration.json`: owner-exported service configuration; includes `"projectRef":"oiwtfkgrnpzirghbsvim"`. Include necessary provider secrets only in this private encrypted export.
- `storage-manifest.json`: array of `{ "bucket": "...", "name": "original/object/path", "file": "storage/blob-file" }` entries, and each corresponding media byte file under `storage/`.

The manifest records every file's byte count and SHA-256; restore verifies all hashes and required components before writing a new private directory. Symlinks, duplicate/traversal paths, wrong project metadata and missing media are refused. Existing restore destinations are never overwritten. The initial staging tool is bounded to 256 MiB / 10,000 files; larger exports require a reviewed segmented strategy.

Keep a single-line passphrase of at least 20 characters in an owner-only regular file; keep this separate from the archive. Never commit the passphrase or export directory.

```sh
KONNEKT_BACKUP_PASSPHRASE_FILE=/private/path/passphrase.local node scripts/ops/backup-bundle.mjs seal /private/path/exports /private/path/staging-backup.gpg.local
KONNEKT_BACKUP_PASSPHRASE_FILE=/private/path/passphrase.local node scripts/ops/backup-bundle.mjs open /private/path/staging-backup.gpg.local /private/path/new-restore.local
```

An open result explicitly reports `databaseRestored:false`. The owner must restore those exports and media into an approved disposable local/free Supabase target, using [supported provider procedures](https://supabase.com/docs/guides/platform/migrating-within-supabase/backup-restore), and prove ordinary login, RLS, encryption recovery and media playback. This workspace has no supported export credential; its Docker socket is permission-denied. The fixture drill restored SQL into a new PGlite database and checked exact media bytes; it is not a hosted Auth/Storage/full-service restore.

Still needed: owner agreement on recovery time/point, retention/schedule, encrypted destination and operator, plus export access and a disposable restore target. Do not overwrite production or the existing staging project to test restoration. Admin backups cannot recreate a lost client encryption key or unknown recovery passphrase.
