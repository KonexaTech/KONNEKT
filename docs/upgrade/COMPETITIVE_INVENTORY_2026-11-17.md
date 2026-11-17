# KONNEKT competitive upgrade inventory

Inspected baseline: `origin/main` at `e5c6a6993d345eeac7dad3f1aef38d8080752713` (PR #19 merged). No open PRs at inspection. Existing historical development branches were inspected; the original dirty checkout was not changed. This work uses `development/competitive-foundations-20261117`. Public release: **HOLD**.

Classification applies to the stated scope, not to every possible network/device. VERIFIED WORKING means observable evidence for that scope. Browser fixtures are not physical-device or production acceptance. The earlier staging reports remain historical evidence; this inventory does not claim to rerun them.

## Communication and accounts

| Feature | Baseline classification | Evidence and limits |
| --- | --- | --- |
| Direct messaging | VERIFIED WORKING | Three-account staging encrypted text/image exchange, refresh/decryption and outsider denial: `docs/release/LIVE_ACCEPTANCE_2026-11-16.json` |
| Group creation/messaging | VERIFIED WORKING | Same report; real membership, encrypted messages and outsider Realtime/file denial |
| Delivery/read receipts | VERIFIED WORKING | Actual staging recipient-open read transition; accessible sent/delivered/read browser cases in `tests/browser/release-operations.test.mjs` |
| Text/media attachments | VERIFIED WORKING | Actual encrypted image/video transfer; synthetic voice recording/playback and file denial; not a physical microphone test |
| Voice/video calls | BLOCKED BY EXTERNAL CONFIGURATION | Invitation lifecycle verified in `CALL_LIFECYCLE_ACCEPTANCE_2026-11-17.json`; two-way media across phones/networks requires TURN and hardware |
| Group calling | PARTIALLY IMPLEMENTED | Mesh signalling, participants and host-only completion exist; live invitation/authorization checks pass, physical media unverified |
| Status text/photo/video | VERIFIED WORKING | Three published formats observed in the live social suite |
| Background notifications | BLOCKED BY EXTERNAL CONFIGURATION | Registration/session controls and generic inbox routing verified; OneSignal/FCM transport and phone delivery unavailable |
| Encryption/privacy | VERIFIED WORKING | Scoped staging ciphertext, key recovery and access isolation. `src/konnektEncryption.js`: ECDH P-256, AES-GCM, versioned group keys, IndexedDB identity, PBKDF2 encrypted backups. No claim of Signal protocol, ratcheting/forward secrecy, metadata secrecy or independent cryptographic audit |
| Blocking/reporting | PARTIALLY IMPLEMENTED | Actual blocked direct RPC/message/call denial and unblock verified; reporting and moderator authorization exist; operational moderation capacity unverified |
| Key recovery/MFA | VERIFIED WORKING | Actual isolated key restore/wrong-passphrase rejection and signed AAL1/AAL2 acceptance in the security suite |
| Email/password recovery | BLOCKED BY EXTERNAL CONFIGURATION | UI/request paths tested; actual inbox delivery/link/new-password acceptance still required |
| Ordering/duplicate prevention/retry | PARTIALLY IMPLEMENTED | Latest-300 load, encrypted send locks, retained draft, failed-upload cleanup and lost-success response checks exist. No durable offline outbox or general idempotent send token |

## Reels, discovery and creator capabilities

| Feature | Baseline classification | Evidence and limits |
| --- | --- | --- |
| Vertical feed | VERIFIED WORKING | `WatchScreen.jsx`; viewport/paging and Discover selection browser test |
| Smooth playback | PARTIALLY IMPLEMENTED | Actual short video playable in staging; inactive video only changes `autoPlay`, without explicit pause. Low-memory/Android performance unverified |
| Nearby preload/low data | PARTIALLY IMPLEMENTED | Active `auto`, inactive `metadata`; no adaptive bitrate, data-saver or transcoder |
| Likes/comments | VERIFIED WORKING | Actual staging persistence; browser rollback/retry cases |
| Creator follow/profile | VERIFIED WORKING | Existing follows/profile services and browser/staging social evidence; full recommendation use absent |
| Sharing | MISSING | No share action wired in the active Reels player |
| Save/bookmark | PARTIALLY IMPLEMENTED | `SavedVideosScreen.jsx` empty local scaffold; no active save action/backend |
| Report video | IMPLEMENTED BUT UNVERIFIED | Watch routes to existing ReportUser with content ID/type; content-specific workflow not covered by live social acceptance |
| Upload/error cleanup | VERIFIED WORKING | Actual staging upload/playback and fixture failed insert/cleanup; 45 MB cap; no percent progress/resumable upload/processing pipeline |
| Personalised recommendations | MISSING | Active query is chronological, limited to 60; no ranking or completion events |
| Following/discovery feeds | PARTIALLY IMPLEMENTED | General feed and follows exist; no separate feed mode |
| Interests/unwanted controls | PARTIALLY IMPLEMENTED | Device-local ContentPreferences scaffold; categories/ranking/safety/autoplay controls not connected to feed |
| New creator exposure/diversity/dedup | MISSING | No ranking policy beyond recent order; no content fingerprinting |
| Creator Studio | PARTIALLY IMPLEMENTED | Working route hub; content manager reads legacy `posts`, not the active `reels` table |
| Analytics | PARTIALLY IMPLEMENTED | CreatorAnalytics contains dash placeholders; follows/likes/comments have recorded rows. No views/watch-time/shares event tables |
| Published/top-performing videos | PARTIALLY IMPLEMENTED | Reels exist; creator content manager/top-video analytics need reconciliation, with pagination and genuine counts |
| Monetisation/eligibility/earnings/payouts | BLOCKED BY EXTERNAL CONFIGURATION | Routes deliberately deferred; no verified ad revenue/provider/financial ledger. No raw-view earnings allowed |
| Brand partnerships/subscriptions | BLOCKED BY EXTERNAL CONFIGURATION | Disabled routes and placeholder screens; no approved provider or campaign records |
| Sponsored disclosures | MISSING | No disclosure field in inspected Reels schema |
| Creator verification | PARTIALLY IMPLEMENTED | Informational screen; no approved verification process or verified badge issuance |
| Creator safety controls | PARTIALLY IMPLEMENTED | CreatorSafety local toggles/placeholders do not enforce restrictions; existing central block/report controls are separate |
| Livestreaming | BLOCKED BY EXTERNAL CONFIGURATION | Deferred centrally in releaseScope.js; metadata/chat are not broadcast delivery. No paid SFU/provider introduced |
| User/creator/content/hashtag search | VERIFIED WORKING | Discover People/Videos/Hashtags filters, explicit public fields; staging username/profile/video evidence. Search is limited to fetched 200 profiles/100 Reels |
| Trending | PARTIALLY IMPLEMENTED | Hashtags count captions in bounded fetched content, not verified engagement or a global trend metric |
| Public profile privacy | PARTIALLY IMPLEMENTED | Explicit public field reads; staging phone-grant fix exists. Private-account/audience controls not enforced; production grant rollout pending |

## Status, security and Android

| Feature | Baseline classification | Evidence and limits |
| --- | --- | --- |
| Status expiry | PARTIALLY IMPLEMENTED | RLS rejects expired rows; browser removes an open expired video. Public media URLs remain downloadable after expiry |
| Status audience privacy | MISSING | Inspected staging SELECT policy permits active rows to authenticated users; disabled UI truthfully warns. No contact-only enforcement |
| Status viewers | PARTIALLY IMPLEMENTED | Route-provided list scaffold; no status-view recording table in inspected public schema |
| Status delete/report | IMPLEMENTED BUT UNVERIFIED | Existing owner deletion/report entry points require dedicated live acceptance |
| Supabase RLS/private chat storage | VERIFIED WORKING | Scoped three-account message/file/Realtime isolation; private chat bucket. This is not production security acceptance |
| Social media access | PARTIALLY IMPLEMENTED | Reels row visibility is enforced by RLS; `konnekt-public-media` is public, so follower-only row visibility cannot protect its file URLs |
| Auth/sessions/notification privacy | VERIFIED WORKING | Scoped MFA, session-bound registration/revoke, generic alerts and in-app navigation evidence; real native delivery still blocked |
| Moderation/rate limiting/spam | PARTIALLY IMPLEMENTED | Reports/admin actions and permissions exist; full abuse controls, queue/response operations and load testing remain unverified |
| Creator earnings integrity | MISSING | No financial/event ledger in inspected public schema; disabled UI is not a revenue system |
| Account deletion | BLOCKED BY EXTERNAL CONFIGURATION | Server worker/manifests tested; provider-enabled disposable deletion plus supported recovery backup not observed |
| Android 8+ binary compatibility | VERIFIED WORKING | Exact-source staging APK run 44029897950: signed package com.konnekt.staging, actual minSdk 26. Does not establish device behavior |
| Stable upgrade/physical installation | BLOCKED BY EXTERNAL CONFIGURATION | Four owner signing secrets and retained key/phone tests missing; temporary-signing APK cannot satisfy continuity |
| Android offline/low-memory/battery/data/crash | IMPLEMENTED BUT UNVERIFIED | Web/PWA/build tests exist, no physical acceptance for these conditions |

## Read-only staging inspection

On 17 November: 30 public tables; no Reels view/completion/share/bookmark/revenue tables. `reels` has id/user_id/caption/media_path/visibility/published_at/created_at/deleted_at. Existing engagement tables have timestamps and Reel foreign keys. The public media bucket is public; chat media is private. No migration was applied for this upgrade.

Advisors retain eleven reviewed authenticated-definer warnings, five private default-deny/no-policy INFO findings and disabled leaked-password protection. See the prior release review and [definer guidance](https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable). These are not automatically fixed by adding UI features.

## Plan and boundaries

1. Reproduce inactive video playback; repair only media lifecycle, preserving DOM controls/layout and feed order.
2. Populate existing analytics cards for recorded period likes/comments/current follower rows with exact server counts; do not invent views, shares or engagement.
3. Prepare a bounded pure ranking function with public-content allowlisting, explicit opt-out, follows/interests/recency/aggregate engagement, diversity and ID/path dedup. Do not activate it or collect watch events before approval.
4. Document a disabled 60/40 server ledger design, secure provider verification, unique events, immutable adjustments/reconciliation and proposed R100 threshold. No earnings, payouts, new tables or paid provider activation.
5. Prepare the owner-requested five-tab change separately. Preserve Calls as a secondary route; never mix that navigation change into this upgrade PR.

Public readiness remains blocked by stable signing, physical calls/push and provider configuration, deletion fulfillment, supported full-service backup/restore, actual email recovery, social audience/file privacy and separately approved production security/operations acceptance. A new recommendation system or an unreviewed migration must not bypass these gates.
