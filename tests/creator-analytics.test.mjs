import { test } from 'node:test';
import assert from 'node:assert/strict';
import { getCreatorAnalytics } from '../src/services/creatorAnalytics.js';

function fixture(responses) {
  const queries = [];
  const client = { from(table) {
    const calls = []; queries.push({ table, calls });
    const query = { then(resolve, reject) { return Promise.resolve(responses[table]).then(resolve, reject); } };
    for (const name of ['select', 'eq', 'is', 'not', 'gte', 'lt']) query[name] = (...args) => { calls.push([name, ...args]); return query; };
    return query;
  } };
  return { client, queries };
}

test('creator metrics use exact server counts, own published Reels and a bounded time window', async () => {
  const f = fixture({ reel_likes: { count: 2300 }, reel_comments: { count: 0 }, follows: { count: 8 } });
  const r = await getCreatorAnalytics(f.client, 'creator-a', 7, Date.parse('2026-11-17T12:00:00Z'));
  assert.deepEqual(r.data, { views: null, shares: null, engagement: null, likes: 2300, comments: 0, followers: 8 });
  assert.deepEqual(r.unavailable, []);
  assert.equal(r.since, '2026-11-10T12:00:00.000Z');
  for (const q of f.queries) {
    assert.deepEqual(q.calls[0][2], { count: 'exact', head: true });
    assert(q.calls.some(c => c[0] === 'gte' && c[1] === 'created_at' && c[2] === r.since));
    assert(q.calls.some(c => c[0] === 'lt' && c[2] === r.until));
    assert(q.calls.some(c => c[0] === 'eq' && c[2] === 'creator-a'));
  }
  assert(f.queries[1].calls.some(c => c[0] === 'is' && c[1] === 'deleted_at'));
  assert(f.queries[0].calls.some(c => c[0] === 'is' && c[1] === 'reels.deleted_at'));
});

test('failed or missing metrics remain unavailable rather than fabricated zero totals', async () => {
  const f = fixture({ reel_likes: { count: 900, error: { message: 'denied' } }, reel_comments: { count: null }, follows: { count: -1 } });
  const r = await getCreatorAnalytics(f.client, 'creator-a', 30);
  assert.deepEqual(r.unavailable, ['likes', 'comments', 'followers']);
  assert(Object.values(r.data).every(v => v === null));
  await assert.rejects(getCreatorAnalytics(f.client, '', 7));
  await assert.rejects(getCreatorAnalytics(f.client, 'a', 365));
  await assert.rejects(getCreatorAnalytics(f.client, 'a', 7, NaN));
});
