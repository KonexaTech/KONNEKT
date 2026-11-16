# Staging MFA migration: approval review

**Not applied. Public release remains on HOLD.**

The client challenge/enrollment changes and local database tests are on the repair branch. `staging-opt-in-mfa.sql` is a proposal, not a production migration or a completed staging gate.

Automatic approval review rejected staging application because the proposal moves/replaces database functions and adds restrictive policies across public tables and storage objects. Although staging changes were authorized generally, the reviewer identified service-disruption and rollback risk beyond a narrow guard. The action was not retried through another tool.

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

Explicit approval of this proposal and its restoration plan is still required. A complete owner-agreed backup/restore drill is a separate blocked release gate. Nothing in this document authorizes a production deployment.
