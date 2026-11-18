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
