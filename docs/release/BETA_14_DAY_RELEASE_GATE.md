# KONNEKT controlled Android beta — release gate (14 days / 20 users)

**Status: NOT APPROVED TO DISTRIBUTE.** This branch is staging-only; production Supabase must not change.

## Verified architecture
- Staging project: `oiwtfkgrnpzirghbsvim`; production: `itkoagpigiifodfhoujt`.
- Vite staging mode requires a separate Supabase URL and publishable key.
- Existing staging `release_opt_in_mfa` restrictive RLS policies are installed.
- Beta SQL is **not deployed**; it must be reviewed alongside existing MFA policies and privileged RPCs.

## Access policy
- Use exactly 20 individually approved staging Auth UUIDs; never auto-enroll arbitrary signups.
- Start the 14-day clock only at the approved beta activation, not at build time.
- A single staging-only control row supports emergency shutdown and exact expiration.
- Do not migrate staging accounts or data to production. At public launch, users register afresh.
- Client UI should display a beta-ended notice, but client-side checks alone are insufficient.

## Mandatory before running SQL or distributing APK
1. Review all `SECURITY DEFINER` functions, public RPCs, storage policies, signed URLs, Realtime subscriptions and any Edge Functions for bypass paths. The SQL gate alone does **not** secure those paths.
2. Validate beta-off, unenrolled, 21st-user, expiry and emergency-shutdown denial using authenticated existing sessions, not just new logins. Confirm reads, writes, media and notifications fail closed.
3. Verify owner-controlled signing certificate fingerprint, clean install and same-key update on Android 8+, then verify calls and closed-app push on physical devices.
4. Verify bug-reporting flow, account deletion/recovery, backup/restore and security acceptance.
5. Confirm rollback, production isolation, privacy notice, tester consent and incident contact.
6. Run clean lint, unit tests, browser tests, staging build and CI; retain results before merge.

## Operator commands (not yet executed)
- Enroll 20 staging UUIDs privately with a privileged connection after reviewing eligibility.
- Activate only after all gates pass, setting `started_at=now()` and `ends_at=now()+interval '14 days'` in one transaction.
- To shut down immediately, set `enabled=false` in staging `konnekt_beta.control`.
- Never copy staging keys, accounts or test messages into production.

## Known limitation
The proposed RLS policies guard table access but do not automatically cover privileged RPCs, Auth endpoints, cached data, already issued signed URLs, external media services or existing Realtime sessions. Treat full shutdown as **unverified** until those surfaces are covered and tested.

## Read-only staging privileged-RPC inventory (18 November 2026)
Staging catalog confirms authenticated EXECUTE on SECURITY DEFINER routines `konnekt_private.session_allowed`, `public.is_konnekt_conversation_creator`, `public.is_konnekt_conversation_member`, `public.is_konnekt_moderator`, `public.konnekt_authorize_turn`, `public.konnekt_can_view_reel`, `public.konnekt_create_group_conversation`, `public.konnekt_is_blocked_pair`, `public.konnekt_register_push_session`, `public.konnekt_retired_peer`, `public.konnekt_start_direct_conversation`, and `public.konnekt_unregister_push_session`. This inventory is not proof of a vulnerability, but the beta RLS gate alone cannot enforce enrollment or expiration on their side effects. Review and enforce beta authorization in every callable privileged operation before deploying this proposal. In particular, group/direct conversation creation, push registration and TURN authorization must reject unenrolled/expired sessions, and helper functions must not become data-exposure paths. No SQL was deployed during this inventory.

The proposed `allowed()` function now denies **all** access unless exactly 20 testers are enrolled. This is a fail-closed check, not a substitute for atomic enrollment controls or full service-level shutdown verification.

## Privileged RPC beta authorization check (18 November 2026)
Read-only staging catalog inspection confirmed five authenticated-callable SECURITY DEFINER entry points (`konnekt_authorize_turn`, `konnekt_create_group_conversation`, `konnekt_register_push_session`, `konnekt_start_direct_conversation`, `konnekt_unregister_push_session`) have **no direct** `konnekt_beta.allowed()` reference. Existing session/MFA checks are not equivalent to a 20-person enrollment and 14-day expiry gate. This is an enforcement gap in the **proposed** beta design, not evidence of current data leakage. The beta gate has not been deployed. Run `staging-privileged-rpc-beta-inventory.sql` to reproduce the inventory; inspect delegated helpers and test authenticated denial before approval. Do not deploy the beta SQL until these paths and Realtime/media paths are secured.
