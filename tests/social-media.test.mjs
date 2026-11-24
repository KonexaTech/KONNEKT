import { test } from 'node:test';
import assert from 'node:assert/strict';
import { socialObjectPath, resolveSocialMedia } from '../src/services/socialMedia.js';
const origin = 'https://fixture.supabase.co';
function fixture(error = null) {
  const requests = [];
  const client = { storage: { from(bucket) { return { async createSignedUrl(path, ttl) {
    requests.push({ bucket, path, ttl });
    return { data: error ? null : { signedUrl: `${origin}/storage/v1/object/sign/${bucket}/${path}?token=fixture` }, error };
  } }; } } };
  return { client, requests };
}
test('private social media resolves object paths and legacy public URLs through authenticated signing', async () => {
  for (const value of ['reels/member/a b.webm', `${origin}/storage/v1/object/public/konnekt-public-media/reels/member/a%20b.webm`]) {
    const f = fixture();
    const url = await resolveSocialMedia(f.client, origin, value);
    assert.match(url, /\/object\/sign\//);
    assert.deepEqual(f.requests, [{ bucket: 'konnekt-public-media', path: 'reels/member/a b.webm', ttl: 300 }]);
  }
});
test('status signing is bounded by expiry and expired or invalid expiry never requests a token', async () => {
  const f = fixture(), now = Date.parse('2026-11-22T10:00:00Z');
  await resolveSocialMedia(f.client, origin, 'statuses/member/a.png', { now, expiresAt: new Date(now + 19500).toISOString() });
  assert.equal(f.requests[0].ttl, 19);
  for (const expiresAt of [new Date(now).toISOString(), 'invalid']) await assert.rejects(resolveSocialMedia(f.client, origin, 'statuses/member/a.png', { now, expiresAt }), /expired/);
  assert.equal(f.requests.length, 1);
});
test('storage denial does not fall back to public URLs; unrelated buckets and traversal are rejected', async () => {
  const f = fixture(new Error('Not authorized'));
  await assert.rejects(resolveSocialMedia(f.client, origin, 'reels/member/a.webm'), /Not authorized/);
  for (const value of ['../secret', '/reels/a', 'reels//a', 'reels/a?token=x', `${origin}/storage/v1/object/public/other/file`, `${origin}/storage/v1/object/public/konnekt-public-media/reels/%2e%2e%2fsecret`]) assert.throws(() => socialObjectPath(value, origin));
  const other = fixture();
  assert.equal(await resolveSocialMedia(other.client, origin, 'https://cdn.example.test/existing.webm'), 'https://cdn.example.test/existing.webm');
  assert.equal(other.requests.length, 0);
});
