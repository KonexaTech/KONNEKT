# Session revocation acceptance — staging review required

The existing staging guard checks Auth-user existence, pending deletion fulfillment, MFA and beta admission, but not membership in the canonical Auth session table. A new nonpersistent approved fixture-B sign-in could read its own protected backup metadata; after revoking only that new sign-in, the same unexpired access token still returned the protected row. The diagnostic correctly recorded FAIL. Original browser profiles, keys, backups and other sessions were preserved. This is an existing access-token lifetime limitation, not evidence that encryption was broken or another user's keys were exposed.

The Active Sessions success notice previously implied immediate removal of all access. The UI now accurately explains that revoked sessions cannot renew their sign-in and some existing access tokens may remain valid until expiry. The actual API request remains scope=others and the current sign-in is preserved; no authentication bypass or key change was introduced.

## Proposed server correction

`docs/release/staging-active-session-authorization.sql` adds session ID/owner/expiry validation to the exact inspected staging helper. It preserves every existing Auth-user, deletion, MFA and beta check, the SECURITY DEFINER configuration and existing grants. Missing, malformed, expired, nonexistent or wrong-owner session claims fail closed. It changes no Auth user/session records. The accompanying rollback contains the captured prior helper; rollback would reopen the observed access limitation and requires owner review.

Three actual embedded PostgreSQL RLS regression cases reproduce the prior access after fixture revocation, then verify the proposed check, ownership/expiry failures and independent MFA/beta/deletion gates. The browser regression verifies the scoped logout request and accurate success text. These do not establish that the server correction has been deployed.

**No remote session-guard migration was applied.** This is a separate reviewed change from the pending social-object policy repair. Neither previous MFA approval nor a social-policy approval alone authorizes this additional helper replacement. Before application, re-inspect the current helper and Auth session schema for drift, capture its exact definition/ACL, verify rollback, and confirm the staging project `oiwtfkgrnpzirghbsvim`. Never apply these staging SQL files to production.

After approval/application, rerun only the prepared fresh-session diagnostic, then confirm legitimate active A/B encryption/recovery/media access and negative expired/revoked requests. Verify affected RPCs, Storage authorization, Realtime subscriptions and push/call authorization separately. Already issued bearer media links, downloaded content and established peer media are separate revocation surfaces; this SQL proposal is not proof of universal immediate shutdown.

Account-deletion fulfillment remains a separate acceptance gate. No account deletion, production data change, key rotation, financial activation or public rollout occurred. Controlled public beta remains HOLD while these security gates are unresolved. Sanitized before-fix evidence: `SESSION_REVOCATION_FINDING.json`; private credentials/tokens are excluded.
