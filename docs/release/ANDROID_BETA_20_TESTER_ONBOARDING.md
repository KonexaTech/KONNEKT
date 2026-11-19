# KONNEKT — controlled 20-person Android tester readiness (STAGING)

**Status: RECRUITMENT / ONBOARDING PREPARATION ONLY. NOT APPROVED TO DISTRIBUTE.**
**Target:** 25 November 2026, subject to verified release gates. **Duration:** 14 days from actual server-side activation, not from the target date.
**Environment:** staging Supabase only, no production accounts/data copied. Every public-launch user must register again.
**Scope:** exactly **20 separately approved staging Auth UUIDs**, Android **8.0+**, no unrestricted download link.

## Coordinator checklist (before contacting testers)
- [ ] Name one tester coordinator and a private way to receive issues; do not collect credentials.
- [ ] Recruit 20 consenting people with distinct phones/accounts; reserve a few willing alternates but do **not** enroll any alternate as a 21st account.
- [ ] Ask each to confirm Android version, access to Wi-Fi/mobile data, ability to install a signed beta APK, consent to test, and a time for an initial session.
- [ ] Store names, phone numbers, emails and UUIDs in an access-restricted private roster **outside this public GitHub repository**. Do not commit invitation lists, device IDs, tokens or passwords.
- [ ] Assign private T01–T20 codes; include the 2 initial functional test accounts only if they qualify and their owners consent.
- [ ] Set aside **one separate unapproved staging account** to test exclusion; it is **not** an approved tester and must never be included in the 20.

## Backend admission conditions (must all pass BEFORE sharing the APK)
- [ ] Audit public media buckets, existing signed URLs, Storage, Realtime sessions, privileged RPCs, TURN and push delivery, including service-role/Edge Function paths. PR #29 currently blocks deployment while any public Storage bucket exists.
- [ ] Install and validate reviewed staging-only beta gate; existing staging functionality must have a deliberate controlled rollout/rollback.
- [ ] Privately enroll **exactly 20** approved staging Auth UUIDs; verify count and no duplicate identities.
- [ ] Demonstrate 0/19/21-enrolled fail-closed outcomes, rejected outsider, a formerly allowed but expired **existing session**, and emergency disable for existing sessions.
- [ ] Verify read/write/RPC/media/Realtime/push/call access closes as required at expiry and shutdown; check pre-existing links/tokens separately.
- [ ] Verify one authorized user succeeds while active; backend expiry is set to **activation timestamp + 14 days**; the app UI offers an understandable ended notice.
- [ ] Confirm staged data is isolated from production; log acceptance evidence without collecting sensitive account data.

## Android distribution conditions
- [ ] Android 8.0+ build, verified release signing fingerprint, clean installation and same-key update on physical devices.
- [ ] Beta binary points **only** to staging endpoints and cannot fall back to production.
- [ ] Confirm version/code, checksum, trusted restricted delivery link and revocation plan. **Do not send APK until these pass.**
- [ ] Test on 2 physical devices first: sign-in, direct/group messaging, encryption, attachment upload/download, closed-app push, 1:1/group calls, status/reels, issue report.
- [ ] Securely deliver individual invitations after acceptance; never publish a public APK link or enrollment credentials.

## Tester workflow
1. Receive private code T01–T20, eligibility notice and privacy/consent terms.
2. Register a dedicated staging account using their **own** credentials; complete any required verification and MFA. Do not share passwords or OTPs.
3. Wait for coordinator's explicit approved status; signing in alone does not grant beta admission.
4. Once notified that gates passed, install the signed test APK from the private distribution channel.
5. Complete the script: first launch/login; chat and encrypted media with a partner; status/reels; push when app closed; voice/video call; background/foreground and network-loss recovery; report a defect.
6. Report device Android version, app version, action performed, expected/actual result, time, and sanitized screenshot (no private chats, tokens or OTPs).
7. At beta end, expect access to stop. Public launch requires fresh registration.

## Private roster template (DO NOT fill in this repository)
| Tester code | Consent | Android 8+ | Staging Auth UUID recorded privately | Approved | APK installed | Core flow passed | Issues |
|---|---|---|---|---|---|---|---|
| T01–T20 | pending | pending | no | no | no | no | — |

## Release decision
This document prepares recruitment, not approval. **Hold distribution and activation** until the gate has live fail-closed acceptance evidence, no unresolved bypasses, and physical-device tests pass. Keep production and existing navigation/design unchanged.

## Tester checklist software (development branch; not yet distributed)
- The **Profile → Beta Testing Checklist** screen contains 18 checks. Every item is marked Pass, Fail or Not tested; every failure requires a short description.
- A private **T01–T20** code and Android model/version are required. A code alone does not authenticate or approve a tester; verify the signed-in `reporter_id` against the private enrollment roster.
- A draft is saved locally on the tester's own installation and submitted to the **existing `public.user_reports` moderation queue** with reason `App bug: Beta checklist`. Do not mistake locally saved ticks for submitted reports.
- If submission fails, the UI shows an error; the tester retries while access is still active.
- Ask testers to submit their full checklist **before the backend 14-day expiry**, preferably by day 13. Once access expires, the server must refuse further submissions. An alternative private coordinator channel can accept late feedback without re-enabling app access.
- An urgent bug should also be sent immediately via **Profile → Report a Problem**, not held until the end.
- Store the association of Txx codes to approved Auth IDs **only** in a private roster. The reporter must not include passwords, recovery phrases, access tokens or private chats.
- This screen is on the **PR #29 development branch** only; it is not a shipped feature or a claim that the beta security gate has passed.

## After the test: generate an actionable fix list
1. With authorized administrative access, privately export staging `user_reports` rows whose `reason` is `App bug: Beta checklist`. Include only `reason` and `details` in the local analysis export; retain `reporter_id` only in the secure roster if you need to verify identity. Do not upload participant records to a public repository.
2. Run locally: `node scripts/beta/summarize-checklists.mjs /private/staging-beta-reports.json > /private/konnekt-beta-fix-list.md`
3. The script groups reports by tester code, uses the latest submission for each tester, counts Pass/Fail/Not tested for every feature and lists short example failures.
4. Compare the unique codes with the private signed-in-user roster; a claimed code is not proof of a tester's identity. Follow up missing checklists individually.
5. Categorize issues as **release blockers** (security, unauthorized access, crashes, data loss), **major** (messaging, media, notifications, calls) or **minor** (layout/usability). Counts determine frequency, **not** security severity.
6. Create one minimal-risk issue per reproducible defect, include test conditions and acceptance criteria, fix on separate branches, and rerun regressions and device tests before public release.

## Enrollment operator notes
- Do **not** enroll by email/password export. Approved testers register using their own credentials; the coordinator resolves their verified staging Auth UUIDs through authorized administration.
- The database-controlled roster `konnekt_beta.testers` is **not installed yet**. Do not create or enroll live records until the reviewed beta restrictions are safe to deploy and all bypass paths are addressed.
- Keep tester consent and contact details in a protected private roster, not GitHub, and use separate test accounts/data from production.
- Exactly twenty approved user IDs is an application admission condition, not an invitation to recruit a twenty-first active tester.
