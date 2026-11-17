import { test } from 'node:test';
import assert from 'node:assert/strict';
import { rankReels } from '../src/services/reelRanking.js';
const now = Date.parse('2026-11-17T12:00:00Z');
const reel = (id, overrides = {}) => ({ id, user_id: `creator-${id}`, media_path: `${id}.webm`, published_at: new Date(now - 86400000).toISOString(), visibility: 'public', caption: '#music', ...overrides });

test('ranking explains explicit interests/follows and never reads private content fields', () => {
  const rows = [reel('a', { caption: '#food', body: 'secret music' }), reel('b', { caption: '#music', user_id: 'followed' })];
  const r = rankReels(rows, { now, interests: ['MUSIC'], followingIds: ['followed'] });
  assert.equal(r[0].reelId, 'b');
  assert(r[0].reasons.includes('selected interest'));
  assert(r[0].reasons.includes('followed creator'));
  assert.deepEqual(Object.keys(r[0]), ['reelId', 'score', 'reasons']);
  const copy = rows.map(row => ({ ...row, body: 'different private message', messages: ['private'], user_metadata: { interest: 'food' } }));
  assert.deepEqual(rankReels(copy, { now }), rankReels(rows, { now }));
});

test('opt-out uses recency without interest, popularity or follows', () => {
  const rows = [reel('old', { likeCount: 9999, published_at: new Date(now - 2 * 86400000).toISOString() }), reel('new')];
  const r = rankReels(rows, { now, personalized: false, interests: ['music'], followingIds: ['creator-old'] });
  assert.deepEqual(r.map(x => x.reelId), ['new', 'old']);
  assert(r.every(x => x.reasons.join() === 'recency'));
});

test('hidden, unsafe, duplicate, deleted, unpublished and private candidates are excluded', () => {
  const rows = [reel('a'), reel('a'), reel('same-path', { media_path: 'a.webm' }), reel('private', { visibility: 'private' }), reel('deleted', { deleted_at: '2026-11-17' }), reel('future', { published_at: new Date(now + 1).toISOString() }), reel('draft', { published_at: null }), reel('hidden'), reel('blocked'), reel('unsafe', { safety_status: 'rejected' }), reel('food', { caption: '#food' })];
  const r = rankReels(rows, { now, hiddenReelIds: ['hidden'], hiddenCreatorIds: ['creator-blocked'], excludedTopics: ['food'] });
  assert.deepEqual(r.map(x => x.reelId), ['a']);
});

test('following restricts candidates and discovery does not leak follower-only candidates', () => {
  const rows = [reel('a', { visibility: 'followers' }), reel('b'), reel('c', { visibility: 'followers' })];
  assert.deepEqual(rankReels(rows, { now, mode: 'following', followingIds: ['creator-a'] }).map(r => r.reelId), ['a']);
  assert.deepEqual(rankReels(rows, { now }).map(r => r.reelId), ['b']);
});

test('diversity and exploration avoid consecutive creators when alternatives exist', () => {
  const rows = Array.from({ length: 8 }, (_, i) => reel(`popular${i}`, { user_id: `creator${i % 2}`, likeCount: 9999 }));
  rows.push(reel('explore', { user_id: 'unseen' }));
  const r = rankReels(rows, { now, limit: 5 });
  assert.equal(r[4].reelId, 'explore');
  assert.notEqual(r[0].reelId, r[1].reelId);
  assert.equal(r.length, 5);
});

test('ranking is bounded, deterministic, non-mutating and handles invalid counts', () => {
  const rows = Array.from({ length: 100 }, (_, i) => reel(String(i), { likeCount: i === 0 ? Infinity : -1 }));
  const snapshot = structuredClone(rows);
  const first = rankReels(rows, { now, limit: 1000 });
  assert.equal(first.length, 60);
  assert.deepEqual(first, rankReels(rows, { now, limit: 1000 }));
  assert.deepEqual(rows, snapshot);
  assert(first.every(r => Number.isFinite(r.score)));
  assert.equal(rankReels(rows, { now, limit: 0 }).length, 0);
  assert.throws(() => rankReels(rows, { now: NaN }));
});
