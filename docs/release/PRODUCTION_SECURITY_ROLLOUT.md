# Production security promotion — review package, not deployment approval

Public release stays **HOLD**. The owner previously limited database writes to staging. This package does not authorize a production mutation or website publication.

Read-only production catalog inspection on 16 November 2026 found:

- All 30 public tables have RLS enabled.
- The `phone` column still grants SELECT to authenticated and anonymous roles. Column privilege alone does not prove anonymous row visibility; profile ownership/privacy policies must also be checked. The staging phone grant repair has not been promoted.
- Two conversation membership/creator helpers retain anonymous EXECUTE; the other six reviewed functions already deny it.
- No `release_opt_in_mfa` policies or `konnekt_private` schema are installed.
- Conversation creator and group-envelope sender foreign keys still cascade on Auth deletion. Do not run account deletion against production before repairing and verifying those relationships.

No production rows, values or secrets were read by this inspection; no production schema/data changed.

## Prerequisites and order

1. Complete three-account staging encryption/Realtime/file tests, enrolled MFA/recovery, deletion of a disposable account and the owner-agreed full backup/restore drill. Install stable signing and complete physical call/push/installation acceptance.
2. Capture a supported encrypted production backup and private schema/ACL snapshot. Reinspect production catalog drift and function bodies immediately before promotion. Keep the restore operator and rollback window available.
3. Confirm the currently deployed web and Android clients use explicit public-profile field selections and handle MFA challenges. Older wildcard profile reads fail after column privileges tighten. Merging source alone does not prove that the hosted website has the compatible build; Pages is intentionally manual while release is on hold.
4. Review and separately approve the exact production DDL, after adapting the staging-only guards to the inspected production schema. Source sequence: `staging-profile-and-function-grants.sql`, `staging-live-room-audience.sql`, `staging-opt-in-mfa.sql`, then `staging-account-deletion.sql`, followed by the separately reviewed unused legacy RPC revocation in `staging-unused-direct-rpc.sql`. These files are deliberately outside automatically applied production migrations. Do not run all files blindly or reset any factors/passwords/encryption identities.
5. In the agreed window, publish only the approved compatible client and apply the approved production migration sequence. Preserve existing member/owner/block policies, authenticated callers and retained group cryptographic metadata. Record migration versions and post-change grants/constraints, without private values.
6. Repeat access tests with dedicated production acceptance accounts, including a real verified factor at AAL1/AAL2, before authorizing general public rollout. Monitor authentication/RLS failures and follow the captured data-preserving rollback plan if legitimate access regresses.

The phone/RPC staging changes revoke unnecessary grants rather than rewriting private values. MFA policies protect only enrolled accounts and require actual live signed-token evidence. Auth deletion processing must stay server-only. External push erasure and any live provider configuration need independent verification; no secret belongs in a browser bundle.

Remaining security advisories need documented review: authenticated definer helpers/entry points are intentional where member/owner/MFA checks and ACLs are verified. [Review the advisor guidance](https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable). [Leaked-password protection](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection) remains disabled in staging; confirm an R0-compatible owner decision without enabling a paid upgrade.

## Additional push/TURN prerequisites

The later staging-only files `staging-push-delivery.sql`, `staging-push-outbox.sql` and `staging-turn-authorization.sql` are review sources, not automatic production migrations. Native push uses new own-session registration RPCs; leave production integration flags disabled until compatible client/backend/provider configuration is verified. The deployed Edge handlers deliberately refuse production URLs. Adapt and separately approve their project/origin guards only after staging delivery, stable signing/device tests and provider-enabled deletion/backup acceptance. Never promote staging aliases, device capabilities, provider keys or webhook/Vault tokens. The retry schedule is an opt-in infrastructure operation requiring quota and queued-header access review.
