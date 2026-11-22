import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { startServer, setup, OTHER } from './helpers.mjs';
import { installPrivateSocialMedia } from './social-media-fixture.mjs';
let server;
before(async () => { server = await startServer(); });
after(() => server?.stop());
const reel = { id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', user_id: OTHER, caption: 'Private bucket fixture Reel', media_path: `reels/${OTHER}/private.webm`, visibility: 'public', published_at: '2026-11-22T00:00:00Z', deleted_at: null };
test('private-bucket Reels play without public object access and denied signing remains unavailable', async () => {
  for (const deny of [false, true]) {
    const f = await setup(server.base, { db: { reels: [reel], reel_likes: [], reel_comments: [] } });
    try {
      const signed = await installPrivateSocialMedia(f.context, { deny });
      await f.page.reload();
      await f.page.getByText(reel.caption, { exact: true }).waitFor();
      if (deny) {
        await f.page.getByText(/some details could not load: video access/).waitFor();
        assert.equal(await f.page.locator('video').count(), 0);
      } else {
        await f.page.waitForFunction(() => document.querySelector('video')?.readyState >= 2);
        assert.match(await f.page.locator('video').getAttribute('src'), /\/object\/sign\//);
      }
      assert(signed.length > 0);
      assert(signed.every(request => request.expiresIn === 300));
      assert.equal(f.requests.filter(request => request.path.includes('/object/public/')).length, 0);
    } finally { await f.close(); }
  }
});
