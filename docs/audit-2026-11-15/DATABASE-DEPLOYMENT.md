# Approved KONNEKT database repairs — 15 November 2026

The user explicitly approved both database migrations after a fresh schema check. Both were applied successfully to Supabase project **`itkoagpigiifodfhoujt` (`konnekt`)**. This approval did not include merging PR #3 or deploying the frontend, and neither action was performed.

| Recorded version | Migration | Result |
| --- | --- | --- |
| `20261115104812` | `audit_compatibility_repairs` | Applied successfully |
| `20261115104836` | `audit_security_hardening` | Applied successfully |

The source filenames were renamed to match Supabase's actual recorded versions, preventing future CLI migration-history mismatches. The SQL contents are unchanged from the approved files. The review-time `PROPOSED ONLY` comments are retained as part of those immutable contents; this deployment record gives their current status. No base/reset SQL was run.

## Preflight

- Confirmed the connected project was healthy and matched the frontend configuration.
- Compared the current public columns/defaults, functions, policies and storage buckets with the audited snapshot. No material drift was found.
- All 30 public tables had RLS enabled. Saved a local pre-change schema, function, policy and grant snapshot without user records. This was not a full data backup or a backup/restore test.
- Rechecked health/security advisors and aggregate logs, and reran the isolated regression suite before applying.
- Applied the compatibility repair first, then the security repair, using the Supabase migration API. Both returned success and are present in migration history.

## Live verification

**All 18 catalog/permission checks passed:** expected group/media columns; RLS enabled; notification helper uses `reference_id`; helper execution restricted; legacy chat creation delegates to the checked RPC; anonymous legacy execution denied; direct conversation/member inserts denied; immutable call/group participant identities; allowed lifecycle updates; notification updates limited to `read_at`; six restrictive INSERT guards; trigger internals not client-callable; generic message notifications; and owner-scoped Reels upload policy.

**All 3 API checks passed:**

1. PostgREST recognizes all three added message media columns — HTTP 200.
2. PostgREST recognizes the group description column — HTTP 200.
3. Anonymous calls to the legacy direct-conversation RPC are denied — HTTP 401 / PostgreSQL `42501`.

The first two API requests used `limit=0` and read no user rows. The denied RPC used an all-zero synthetic target ID and no signed-in session. No test accounts, messages, follows, uploads or financial transactions were created in the live project. Storage bucket publicity, size limits and MIME allowlists were checked and remain unchanged.

See [machine-readable outcomes and migration hashes](database-verification.json). After filename alignment, the isolated suite was rerun: 6 runner tests passed, including 28 named PostgreSQL checks. This isolated result is separate from the 18 live catalog and 3 API checks.

## Remaining work

The health advisor returned no findings. Security advisors still report 2 anonymous-callable and 8 authenticated-callable `SECURITY DEFINER` functions, plus disabled leaked-password protection. Some checked RPC/helper exposure is intentional; these results are not a clean security certification. Review [definer-function exposure](https://supabase.com/docs/guides/database/database-linter?lint=0028_anon_security_definer_function_executable) and [password protection](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection).

Phone-number privacy, public-media/audience rules, MFA enforcement, other audit findings, external services and real two-account/device acceptance remain open. The deployed frontend still contains the old client code: for example, group message writes still include the unsupported `encryption_version` field, which PR #3 removes. The added database columns do not deploy that frontend correction. Do not mark the application launch-ready based on these database checks.

Further database/storage changes and a production merge/deployment require separate approval. PR #3 remains open and unmerged.
