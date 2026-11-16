# Staging MFA migration: approval review

**Approved by the owner and applied to staging on 16 November 2026. Public release remains on HOLD.**

The client challenge/enrollment changes and local database tests are on the repair branch. The exact `staging-opt-in-mfa.sql` was applied only to `konnekt-staging` (`oiwtfkgrnpzirghbsvim`) as migration `20261116040341_release_opt_in_mfa_enforcement`. It is not a production migration. Live authenticated-account acceptance remains incomplete.

Automatic approval review initially rejected staging application because the proposal moves/replaces database functions and adds restrictive policies across public tables and storage objects. The reviewer identified service-disruption and rollback risk beyond a narrow guard. The owner subsequently explicitly approved this exact migration and restoration plan. After reinspection and a successful local restoration rehearsal, the migration was applied through the normal migration tool; no alternative tool was used to bypass the rejection.

## Deployment evidence

- Immediately before application: all 31 affected tables had RLS enabled; no existing MFA guard/schema; zero verified factors. All eight original function definitions, ACLs and current policies were captured privately outside Git. No account records, Auth secrets or encryption keys were exported.
- Local MFA database regression passed again. A separate local rehearsal used the captured live definitions/grants, applied the proposed migration, then executed the restoration script. Original definitions, anonymous/authenticated/service-role access and existing policies matched the pre-change state, and the private schema was removed. This was a schema restoration rehearsal, not a full backup/restore drill.
- Application succeeded. Post-change catalogs confirm 31 restrictive authenticated-role policies (30 public tables plus `storage.objects`), eight guarded public functions, and no anonymous execution of those public functions. Authenticated access to the public entry points remains granted.
- The three internal conversation implementations deny EXECUTE to anonymous and authenticated roles. A real staging Data API request with `Accept-Profile: konnekt_private` returned HTTP 406 / `PGRST106`, listing only `public` and `graphql_public` as exposed schemas.
- Transaction-scoped read-only SQL role probes reject a missing identity, allow the MFA guard for a synthetic no-factor AAL1 identity, and return false for nonmember/nonowner/nonmoderator helper checks. These simulated claims are not real login, signed-token or enrolled-factor evidence.
- Phone SELECT remains denied and both earlier restrictive live-room policies remain present. Advisors still report the eight reviewed authenticated definer endpoints/helpers and disabled leaked-password protection; no claim is made that all advisories are cleared.
- No production changes, real factor enrollment/removal, passwords, messages or encryption keys were modified. Dedicated staging accounts and an authenticator are still required for actual enrolled AAL1 rejection, AAL2 access, direct/group RPCs, attachments, receipts, recovery and sign-out acceptance.

## Exact proposal

- Add a private, self-scoped helper using the authenticated user ID, signed JWT assurance level and verified Auth factors. User-editable metadata is not an authorization source.
- Accounts without a verified factor retain AAL1 access; accounts with a verified factor require AAL2.
- Supplement every existing public-table policy and the storage-object policies with a restrictive MFA guard, retaining the existing ownership/member/block predicates.
- Guard five existing boolean policy/RPC helpers without changing their signatures.
- Move the existing implementations of the three direct/group conversation RPCs into an internal schema, revoke client execution on those internal functions, and preserve the public signatures through checked wrappers. Definer RPCs otherwise bypass row policies.
- No stored account, message, file or encryption key data is rewritten or deleted.

Local tests cover repeated application, normal users, unverified factors, verified AAL1 denial, AAL2 message/storage/group access, helper calls, denial of internal RPC execution, and restored AAL1 access after factor removal. Browser fixtures cover sign-in challenge/retry/sign-out, invalid/correct codes, QR decoding, pending-factor recovery, fresh-code removal and preserving AAL2 during password confirmation. These are not live-account MFA acceptance results.

## Preconditions and rollback review

1. Review the exact SQL and current staging definitions/grants. The last schema inspection found all public tables and storage objects protected by RLS and zero verified factors. Reinspect immediately before any later application.
2. Record an owner-controlled schema-only snapshot of affected function definitions, ACLs and policies before changes; verify it is usable for restoration. Keep Auth secrets and backups out of Git/CI artifacts. The internal schema must not be exposed through the Data API.
3. Use a staging maintenance window, dedicated test accounts and the matching client challenge build. Do not link or apply this file to production.
4. The transaction rolls back automatically on execution error. For an unexpected behavioral regression after a successful commit, restore the captured original function definitions/ACLs and RPC locations/signatures, and remove only the `release_opt_in_mfa` policies. Preserve the separately applied phone and live-room privacy guards. Do not drop the internal helper until dependent policies/functions have been removed or restored; never use broad CASCADE or a database reset.
5. Exercise AAL1/AAL2, normal users, all direct/group RPCs, attachments, backups, receipts and sign-out. Capture evidence before permitting further acceptance.

Owner approval for this staging application has been received and fulfilled. A complete owner-agreed backup/restore drill and live MFA acceptance remain separate blocked release gates. Nothing in this document authorizes a production deployment.
