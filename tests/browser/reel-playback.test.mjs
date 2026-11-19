import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { startServer, setup, OTHER } from './helpers.mjs';

let server;
before(async () => { server = await startServer(); });
after(() => server?.stop());

async function feed() {
  const reels = ['first', 'second'].map((id, index) => ({
    id, user_id: OTHER, caption: `${id} playback fixture`, media_path: `${id}.webm`,
    visibility: 'public', published_at: `2026-11-${15 - index}T00:00:00Z`, deleted_at: null
  }));
  const f = await setup(server.base, { db: { reels, reel_likes: [], reel_comments: [] } });
  const bytes = await readFile(new URL('../fixtures/social-video.webm', import.meta.url));
  await f.context.route('**/storage/v1/object/sign/konnekt-public-media/**', route => route.fulfill({ status: 200, contentType: 'video/webm', body: bytes }));
  await f.page.reload();
  await f.page.waitForFunction(() => document.querySelector('video')?.readyState >= 2);
  return f;
}

test('scrolling to the next Reel pauses the previously active video', async () => {
  const f = await feed();
  try {
    const first = f.page.locator('video').first();
    await first.evaluate(video => video.play());
    await f.page.waitForFunction(() => !document.querySelector('video').paused);
    await f.page.locator('video').nth(1).evaluate(video => video.scrollIntoView({ block: 'center' }));
    await f.page.waitForFunction(() => document.querySelectorAll('video')[1]?.autoplay);
    await f.page.waitForFunction(() => document.querySelector('video').paused, null, { timeout: 2500 });
    assert(await first.evaluate(video => video.paused));
    await f.page.waitForFunction(() => !document.querySelectorAll('video')[1].paused);
  } finally { await f.close(); }
});

test('hidden-page playback stops and a manual pause survives foregrounding', async () => {
  const f = await feed();
  try {
    const video = f.page.locator('video').first();
    await video.evaluate(node => node.play());
    await f.page.evaluate(() => {
      Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'hidden' });
      document.dispatchEvent(new Event('visibilitychange'));
    });
    assert(await video.evaluate(node => node.paused), 'Hidden page kept playing');
    await f.page.evaluate(() => {
      Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' });
      document.dispatchEvent(new Event('visibilitychange'));
    });
    await f.page.waitForFunction(() => !document.querySelector('video').paused);
    await video.evaluate(node => node.pause());
    await f.page.evaluate(() => {
      Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'hidden' });
      document.dispatchEvent(new Event('visibilitychange'));
      Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' });
      document.dispatchEvent(new Event('visibilitychange'));
    });
    assert(await video.evaluate(node => node.paused), 'Foregrounding overrode the viewer pause');
  } finally { await f.close(); }
});
