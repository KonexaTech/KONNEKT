# Recommendation and creator revenue review

This package does not activate recommendations, tracking, advertising, earnings or payouts. No migrations are proposed for automatic application. Production data and infrastructure are unchanged. Existing deferred financial/live routes remain guarded. Approval of this package is not approval to activate financial transactions.

## Explainable ranking foundation

`src/services/reelRanking.js` is pure, tested and **not imported by WatchScreen**. The active feed remains chronological. It accepts at most the first 60 already-authorized candidate rows and returns at most 60 IDs, scores and explanations. It makes no network request, persists nothing and never accesses private messages, contacts, encryption keys, device identifiers or user metadata.

Candidate scope: existing signed-in Reels queries and RLS remain authoritative. Public discovery excludes follower-only/private/draft/deleted/future content. Following mode additionally requires a supplied followed-creator ID, with follower-only visibility allowed only there; this is filtering, not an access-control replacement. Explicit hidden Reel/creator/topic inputs apply even after personalisation opt-out. A supplied non-approved safety status excludes content; absent status is **not** moderation approval.

Formula: `5 / (1 + ageDays)` plus up to 3 engagement points (`log(1 + likes + 2*comments) / 3`), 3 followed-creator points and 4 explicitly selected hashtag-interest points. Counts must be nonnegative integers and are bounded. With personalisation off, ordering is chronological and explanations contain recency alone. No passive activity profile is inferred.

The re-ranker avoids consecutive creators where an alternative exists. Every fifth slot can expose low-recorded-engagement work from an unseen creator. This is an exposure opportunity, not a verified new-creator badge. Exact duplicate IDs/media paths are removed; re-encoded/re-uploaded content is not detected. Ties are stable by timestamp and ID. These heuristics require quality evaluation and abuse resistance before activation; aggregate likes/comments are not verified unique-human engagement.

### Approval-dependent activation plan

1. Approve feed behavior and existing-design controls for Following/Discovery, personalisation opt-out, Not interested, creator hiding and clearing preferences. Scope saved controls per account; current global localStorage preferences must not silently become cross-account targeting.
2. Integrate the function into the existing bounded query; fetch only approved public-content fields. Cache candidates in memory per account/mode with short expiry and invalidate on logout, blocks, follows, visibility/deletion and moderation. Do not persist private content or raw viewing histories in a public cache. No cache is implemented in this review-only foundation.
3. Use exact server aggregates or approved RPCs for engagement; current unbounded detail downloads cannot supply reliable global popularity. Inspect indexes/query plans before proposing query-specific DDL. Avoid broad scans, per-Reel request fan-out, or collecting all engagement rows on the client.
4. Add opt-in, minimal completion measurement only after a privacy/retention decision. Proposed server contract: authenticated session, authorized Reel, bounded watch duration, one deduplicated completion per view/session, replay limits, aggregated windows and rate limiting. Never read messages. No view/completion event table or tracking is added now.
5. Stage three-account visibility/block tests, opt-out/account-switch persistence, ranking reasons, deleted-content invalidation and Android data/memory benchmarks before enabling. Retain chronological fallback on unavailable aggregates.

Rollback: the active feed is unchanged today. A future activation must have a disabled-by-default flag and return to chronological order without deleting content or preferences. No ML provider or paid infrastructure is required for the foundation.

## Recorded creator analytics and index proposals

The existing cards now use three exact HEAD counts on signed-in queries: likes/comments joined through their Reel foreign keys and filtered to this creator's published, undeleted Reels, plus current follow rows for this creator. Each is limited to the selected 7/30/90-day creation window and excludes future timestamps; deleted comments are excluded. The server returns counts without downloading engagement identities or silently capping totals at 1,000. Partial failures remain unavailable, not zero. Changing account/period invalidates the displayed snapshot and late old responses are ignored. Views/shares/engagement/top-video ranking remain unavailable; this is not a historical immutable analytics event store.

Read-only staging index inspection found only the primary keys on these four tables. Before scaling, review these additive proposals against representative EXPLAIN plans and the real schema:

```sql
-- Review source only; not applied by this upgrade.
create index on public.follows (followed_id, created_at);
create index on public.reels (user_id, published_at) where deleted_at is null and published_at is not null;
create index on public.reel_likes (reel_id, created_at);
create index on public.reel_comments (reel_id, created_at) where deleted_at is null;
```

An approved migration must assign stable index names, inspect existing equivalent indexes, budget build/storage cost under R0 and select a safe concurrent build strategy for production. Test latency/RLS with representative volumes; the small staging fixtures do not establish production performance. Rollback drops only the newly named indexes after inspection, preserving all rows and existing keys. No index or other DDL is deployed here.

## Disabled creator revenue design

Approved split: **60% creator / 40% KONNEKT**, only on verified eligible advertising revenue. Raw views, likes, gifts or client-reported completions never create a monetary entitlement. The **R100 (10,000 ZAR minor units) withdrawal threshold remains proposed, not approved**. Do not display projected earnings as verified balances.

No ad provider, financial ledger, earnings API or payout execution exists in this upgrade. Existing disabled earnings routes stay disabled. Before implementation, inspect the actual provider contract, jurisdiction/tax/age/consent requirements, chargeback rules and advertiser settlement semantics. Owner/provider/legal access is required; no paid service is procured automatically.

### Proposed server-only data boundary (not an executable migration)

| Record | Required invariants |
| --- | --- |
| Provider event inbox | Provider + environment + event ID unique; signed raw-body verification before parsing; payload digest; amount/currency/campaign/creator attribution verified against provider settlement data; timestamps and minimal audit provenance; replay rejection |
| Eligibility decision | Creator, policy version, effective period, review actor and reason; approved age/region/tax/identity requirements; append decisions rather than overwrite history |
| Revenue ledger | Private unexposed schema, RLS/default deny, server-only grants; unique provider event/line; integer minor-unit or exact-decimal amounts; immutable attribution, currency and split-policy version; immutable compensating entries for refunds/adjustments; no client writes or security-definer function open to PUBLIC |
| Reconciliation run | Provider settled totals versus event and ledger sums by environment/currency/campaign; mismatches stop payable eligibility; reviewer, reason, report digest and immutable run reference |
| Payout request | Disabled by default; verified eligible settled balance less holds/reservations/paid totals; approved threshold; locked balance reservation; unique idempotency key; two-person review where possible; verified provider result required before marking paid |

Server split for each verified eligible line: compute creator minor units using an approved documented rounding rule, then KONNEKT share as `gross - creator` so totals conserve value. Proposed rule is floor of `gross * 60 / 100`; final approval must address residual rounding, currencies and tax/fee attribution. Reversals reference original entries, enforce cumulative reversal not exceeding the original gross, and reverse original allocations proportionally using cumulative totals to prevent rounding drift. Never recalculate historical entries using a changed policy.

Fraud controls must detect duplicate provider identities, self-dealing/invalid traffic, suspicious attribution, conflicting payloads for an event ID and negative/over-reversed balances. Machine signals create review holds, not automatic irreversible confiscation. Keep financial evidence under an approved retention/access policy; audit immutability is enforced against application roles, not a claim that a database superuser cannot alter data.

Required sandbox tests: valid settlement; signature/creator/currency/amount mismatch; repeated and concurrent duplicate events; same event ID with altered digest; ineligible creator; full/partial/repeated refunds; out-of-order events; provider failure/timeout; concurrent payout reservation; account deletion/financial retention; reconciliation discrepancy; client/anon privilege denial. None of these is claimed passed by this design document.

Migration/rollback prerequisites: separately review an exact migration after provider/schema decisions; deploy only to approved staging with an encrypted recoverable backup; test ACLs and server callers. Rollback disables ingestion/payouts and preserves immutable financial records. Never drop a ledger to roll back a UI feature or production deployment.

## Social privacy change requiring review

The inspected public media bucket bypasses download RLS. Status list expiry and follower-only Reel row policies do not revoke public media URLs. Repair needs an approved transition to private objects for restricted content, signed URLs bounded to audience/expiry, explicit authorized Storage policies and treatment of already-public historical objects/caches. Do not flip the shared public bucket private: that would break public avatars/Reels and existing URLs. Propose a separate bucket/path transition and migration/backfill/rollback plan with staging evidence before production approval. Existing Status privacy controls remain disabled and truthful.
