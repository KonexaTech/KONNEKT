# Staging social-media cleanup proposal

This implementation is local and has not been deployed or applied. Target only
`konnekt-staging` (`oiwtfkgrnpzirghbsvim`). It fixes the observed case where
Storage removal returns no error but removes no object after a Reel is
softdeleted or a Status expires. The exact latest fixture allowlist retained at
least two objects. An earlier run lost its original manifest; two is not a total
count of all historical test leftovers. Never infer a deletion list from names.

## Authorization and race safety

The Edge Function accepts one canonical `reels|statuses|posts/<caller UUID>/<file>`
path. It accepts no bucket, project, actor or credential from the body. It verifies
the caller's JWT through Auth, then calls the existing guarded
`konnekt_authorize_turn` RPC with that JWT. The existing RPC enforces canonical
session ownership/expiry, bans, enrolled MFA, deletion state and beta admission.
Service credentials stay in the server environment.

The proposed server-only claim RPC rechecks canonical Auth-session ownership,
expiry and bans, then evaluates the existing session authorization helper under
the session's server-recorded user/AAL. Its SECURITY DEFINER checks see all content
references, including references invisible to the requesting user through RLS.
Active Status, unpublished/nondeleted Reel, any post reference, foreign-owned
object/reference or uncertain noncanonical local reference retains the file.
Only orphan uploads, own expired Status media and own softdeleted Reel media may
be claimed.

A claim permanently retires its exact path. Claiming and INSERT/UPDATE publication
triggers share transaction advisory locks. Publication committed first prevents
cleanup; cleanup committed first prevents later publication or reactivation of
that retired path. Unknown/encoded local aliases cannot bypass retirement.
Uncertain API results retain the claim rather than allowing a later reference to
a potentially missing file. The user must upload a new unique path when retrying
publication. No rows in `storage.objects` are deleted through SQL.

The Edge calls the Storage API only after obtaining the versioned durable claim.
Afterward it independently checks exact-path absence through a server-only RPC.
Missing guards, silent no-op removal and uncertain responses return a truthful
failure. Success requires `{removed:true,path:<exact submitted path>}`. There is
no broad owner-read exception, and no private chat-media cleanup in this endpoint.

## Review and deployment order

1. Review exact catalog assumptions, SQL, Edge source and rollback with the owner.
   The cleanup SQL adds one private claims table, two private helper functions,
   two service-role-only RPCs and three reference triggers. It preserves existing
   content ownership/visibility policies and removes no existing files or rows.
2. Obtain staging-only approval for `staging-social-media-cleanup.sql`. Independent
   active-session and passkey-backup proposals require their own explicit scopes;
   this file does not apply those proposals or remove existing authorization gates.
3. Pass handler, embedded PostgreSQL and the real PostgreSQL two-connection race
   test. The real concurrency test requires a dedicated loopback database:
   `KONNEKT_CLEANUP_TEST_DATABASE_URL=postgresql://konnekt_test@127.0.0.1:5432/konnekt_cleanup_test node --test tests/cleanup-social-concurrency.test.mjs`.
   Without that environment it explicitly skips; skipped is not a concurrency pass.
4. Apply only the reviewed staging SQL, capture definitions/ACLs and run advisors.
   Then deploy only `cleanup-social-media` to staging, with platform JWT validation
   enabled and generated server-only Supabase environment variables. No provider
   credentials, client secret, production migration or public release is involved.
5. Test through the matching staging client using only newly created approved
   disposable fixture paths. Verify active references retain objects, eligible
   fixture removals are absent via exact-path server-side metadata checks, and
   unapproved paths/identities remain untouched. Do not automatically remove the
   earlier retained fixtures or guess their missing manifest.

## Rollback

Disable the cleanup endpoint/client invocation and drain in-flight invocations
before applying `staging-social-media-cleanup.rollback.sql`. Rollback removes the
server cleanup entrypoints and publication triggers but retains retirement
records for review. It does not restore files already removed by the Storage API,
change bucket publicity, modify original visibility policies or delete Auth data.
Restoring active references to removed objects requires an explicit recovery plan.

A successful local test is not staging application evidence or a public-release
signoff. Current migration/deployment state must be rechecked before any approval.
