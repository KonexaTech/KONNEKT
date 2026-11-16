# R0 backup, restore and deletion acceptance plan

Status: **BLOCKED — owner agreement/access is required.** A local schema regression is not a backup/restore drill. No new paid service or infrastructure is authorized.

Implementation update: the owner selected removal of the deleting account's sent messages and attachments. A staging-only operator worker, deletion-safe schema, encrypted export packaging and restore verification are now implemented; see [RELEASE_OPERATIONS.md](RELEASE_OPERATIONS.md). Local tests are not fulfillment of a real deletion request or a complete provider restore drill.

Before public release, the owner must agree to recovery-point/recovery-time objectives, retention, encrypted backup storage, the recovery operator and a disposable restore target. Do not assume the free hosting plan supplies restorable backups. Do not overwrite the existing staging project or production to test restoration.

An accepted backup must cover:

- Compatible public schema, migrations, policies, ACLs and function definitions.
- App data with stable user/conversation IDs and their relationships.
- Storage object metadata AND actual media bytes, including encrypted chat media.
- Auth identities/configuration through a provider-supported backup process. Auth/MFA secrets, signing material and refresh tokens must stay in owner-controlled encrypted storage, not Git, client configuration or public Actions artifacts.
- Server-side provider configuration/secrets through the owner's secret-management process.
- User encryption recovery: an administrator's database backup cannot recreate a lost client private key or an unknown recovery passphrase. Test encrypted-key backup/recovery separately with disposable accounts.

Use supported CLI/dashboard export procedures, checking the installed CLI help rather than guessing commands. The current execution environment could not launch the pinned Supabase CLI, and no database dump credentials or approved encrypted backup destination were provided.

The drill must restore to the agreed disposable local/free target, verify account IDs/RLS/grants, log in as ordinary members and an outsider, decrypt messages with the correct recovered key, play restored attachments, and prove wrong-passphrase and unauthorized access fail. Record object counts/hashes and the measured recovery times. Retain no personal data in the published report.

The app submits a request; the new trusted operator worker can perform Storage/Auth deletion after explicit execution and backup confirmations. Shared-history behavior now follows the owner's choice: remove the deleting user's content, preserve others' content and the public key metadata needed to read it. Staff/audit cases and external push erasure still need separate handling. Verify only with an explicitly disposable staging account after a recoverable snapshot. Never test by deleting an existing owner/production account.

The remaining inputs are owner access for supported exports/restore, an encrypted destination, the agreed recovery objectives/retention, a disposable restore target, and a deletion/retention decision. These operational gates remain BLOCKED until observed end-to-end results exist.
