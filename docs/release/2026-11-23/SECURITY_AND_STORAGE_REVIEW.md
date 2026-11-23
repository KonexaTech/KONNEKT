# Staging security and social-media cleanup — owner review

Controlled public beta and production release remain HOLD. No SQL in this review was applied remotely, no Edge function was deployed, and no original account or media was removed during this increment.

## Verified installed state

Read-only inspection of existing konnekt-staging (`oiwtfkgrnpzirghbsvim`) found social visibility migration `20261122173615`, name `konnekt_staging_social_object_visibility_20261122`, already installed. Its helper body exactly matches the reviewed source (SHA256 `48374ac5dba790b3e9a7d5a6f58bc9422da2fbba0dfffb62ada21a73d0fec3d6`). Both media buckets remain private and the broad authenticated SELECT policy is absent. The migration history has no applied-at column; the version is not an independently recorded application timestamp. This task did not apply that change. Do not reapply it or run its permissive rollback simply because an earlier checkpoint said confirmation had expired.

Nine real SDK checks with three approved isolated staging accounts passed: unreferenced, public, follower-only, anonymous/public URL, soft-deleted Reel, active Status and expired Status authorization, plus original bytes through the actual application media resolver. These are real staging API/media-service checks, not physical-device or complete user-interface acceptance. Already issued signed URLs remain bearer capabilities until their TTL; denial of a newly minted URL is not universal instant revocation.

## Confirmed remaining failures

- HIGH: the current session helper checks users/deletion/MFA/beta but not canonical active Auth sessions. The separately recorded fresh-session diagnostic retained private backup access using a revoked, still-unexpired JWT. The UI now explains token lifetime accurately; this does not fix the installed guard.
- HIGH: `user_key_passkey_backups` has owner policies but lacks the restrictive session/MFA/deletion/beta gate. Its authenticated TRUNCATE/TRIGGER/REFERENCES privileges are unnecessary for inspected SELECT/upsert callers and are proposed for separate revocation.
- Cleanup failure: live SDK removal returned no error but privileged exact-path inspection found both latest-run fixture blobs still retained (one Reel, one Status). Nine authorization checks therefore do not make the whole acceptance suite PASS. An earlier run may have additional retained test media; do not infer an approved deletion allowlist from filenames alone. New runs archive their own exact fixture IDs privately.

The media cleanup client now retains visible committed references and requests server-authorized cleanup with an exact-path acknowledgement. It no longer interprets an error-free Storage response as proof of deletion. Until the reviewed server guard and Edge function are installed, cleanup reports a clear failure and retains media. Private chat upload/cryptographic behavior is unchanged.

## Proposed staging-only sequence

1. Re-inspect schema, helper definitions/ACLs and backups for drift. Review `staging-active-session-authorization.sql` and exact `.rollback.sql` from the preceding session report. Approve separately before replacement; preserve Auth-user, MFA, deletion and beta checks.
2. Review `staging-passkey-backup-session-authorization.sql` and its rollback. It adds one restrictive policy without replacing owner policies or rewriting rows.
3. Review `staging-passkey-backup-grants.sql` and its rollback. It revokes only authenticated TRUNCATE/TRIGGER/REFERENCES and preserves ordinary CRUD plus service/postgres privileges.
4. Review `staging-social-media-cleanup.sql` and rollback. Durable path retirement and publication triggers share transaction locks. The server-owned claim checks canonical active session, actor ownership and all content references outside viewer RLS. Publication of a retired path is refused, including after uncertain deletion, so a lost response cannot cause a later committed post to lose its file. No direct SQL blob deletion is used.
5. After approved staging SQL, deploy only `cleanup-social-media` to the existing staging project. Its privileged credential stays in the Edge runtime. It accepts only the authenticated owner's canonical social path, performs Storage API deletion after a durable claim, and confirms exact-path absence before returning success. Missing guards fail closed. Do not deploy this staging-pinned function or SQL to production.
6. Run scoped positive/negative staging access and cleanup tests, preserve private per-run fixture manifests, verify affected legitimate callers and Realtime separately, and check revoked/expired sessions only within the approved fresh-session scope. Delete no unapproved accounts or unknown data.

Rollback must disable the Edge cleanup deployment first, review uncertain in-flight claims, then use the exact staged rollback. Reverting an authorization fix reopens its recorded weakness and never constitutes release acceptance. Existing data and keys must remain intact.

The proposed SQL/Edge changes require explicit review; no previous MFA or social-policy approval is treated as blanket approval. Other mandatory gates remain: deletion fulfillment, restore drill, real-device installation/upgrade, two-phone calls/push, operational/privacy review and candidate release approval. Test and build evidence belongs to its exact source commit or explicitly recorded unchanged source hash.

## Local verification before the cleanup proposal commit

117 unit/database/security assertions passed; one dedicated real-PostgreSQL concurrency case was explicitly skipped locally because no loopback PostgreSQL server is configured. Seven handler cases, five embedded PostgreSQL cases and three focused cleanup browser cases passed. The full unit result includes the handler/embedded cases; do not add those counts twice. Lint, web/mobile builds, three compiled web smoke cases, three compiled mobile smoke cases and Deno 2.5.6 type-checking of the new Edge adapter passed. Broader browser regression and exact proposed-commit CI are recorded separately in the shared release dashboard after completion. CI now checks the exact PR head and provisions a disposable PostgreSQL17 service for the independent two-connection cleanup/publication test. No local skip is described as a concurrency pass.
