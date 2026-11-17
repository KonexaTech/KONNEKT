import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { startServer, setup, ME } from './helpers.mjs';
let server;
before(async () => { server = await startServer(); });
after(() => server?.stop());

test('Creator Analytics reads exact own-period counts and keeps unsupported metrics unavailable', async () => {
  const f = await setup(server.base);
  const seen = [];
  let denied = false;
  try {
    await f.context.route(/\/rest\/v1\/(reel_likes|reel_comments|follows)\?/, async route => {
      const request = route.request();
      if (request.method() !== 'HEAD') return route.fallback();
      const url = new URL(request.url()), table = url.pathname.split('/').pop();
      const owner = url.searchParams.get(table === 'follows' ? 'followed_id' : 'reels.user_id');
      assert.equal(owner, `eq.${ME}`);
      assert(url.searchParams.getAll('created_at').some(v => v.startsWith('gte.')));
      assert(url.searchParams.getAll('created_at').some(v => v.startsWith('lt.')));
      assert(request.headers().prefer.includes('count=exact'));
      if (table !== 'follows') assert(url.searchParams.get('select').includes('reels!inner(user_id)'));
      seen.push(table);
      if (denied && table === 'reel_likes') return route.fulfill({ status: 403, headers: { 'access-control-allow-origin': '*' } });
      const count = { reel_likes: 2300, reel_comments: 0, follows: 8 }[table];
      return route.fulfill({ status: 200, headers: { 'access-control-allow-origin': '*', 'access-control-expose-headers': 'content-range', 'content-range': `*/${count}` } });
    });
    await f.page.getByRole('tab', { name: 'Profile', exact: true }).click();
    await f.page.getByText('☰  ALL FEATURES', { exact: true }).click();
    await f.page.getByRole('button', { name: 'Open Creator analytics', exact: true }).click();
    await f.page.getByLabel('Likes: 2300', { exact: true }).waitFor();
    await f.page.getByLabel('Comments: 0', { exact: true }).waitFor();
    await f.page.getByLabel('New followers: 8', { exact: true }).waitFor();
    for (const name of ['Video views', 'Shares', 'Engagement']) await f.page.getByLabel(`${name}: unavailable`, { exact: true }).waitFor();
    assert.deepEqual([...new Set(seen)].sort(), ['follows', 'reel_comments', 'reel_likes']);
    assert([3, 6].includes(seen.length), 'One request set, or development StrictMode replay');
    const initialRequests = seen.length;
    denied = true;
    await f.page.getByText('30 days', { exact: true }).click();
    await f.page.getByLabel('Likes: unavailable', { exact: true }).waitFor();
    await f.page.getByText(/Some recorded counts are unavailable: likes/).waitFor();
    await f.page.getByLabel('New followers: 8', { exact: true }).waitFor();
    assert.equal(seen.length, initialRequests + 3);
    assert.equal(f.requests.filter(r => /messages|user_device_keys|user_key_backups/.test(r.path)).length, 0);
  } finally { await f.close(); }
});

test('a slow old period response cannot overwrite the newly selected analytics period', async () => {
  const f = await setup(server.base);
  let release;
  const held = new Promise(resolve => { release = resolve; });
  let initialWindow;
  try {
    await f.context.route(/\/rest\/v1\/(reel_likes|reel_comments|follows)\?/, async route => {
      const request = route.request();
      if (request.method() !== 'HEAD') return route.fallback();
      const url = new URL(request.url());
      const since = url.searchParams.getAll('created_at').find(v => v.startsWith('gte.'));
      initialWindow ??= since;
      if (since === initialWindow) await held;
      return route.fulfill({ status: 200, headers: { 'access-control-allow-origin': '*', 'access-control-expose-headers': 'content-range', 'content-range': `*/${since === initialWindow ? 7 : 30}` } }).catch(() => {});
    });
    await f.page.getByRole('tab', { name: 'Profile', exact: true }).click();
    await f.page.getByText('☰  ALL FEATURES', { exact: true }).click();
    const started = f.page.waitForRequest(r => r.method() === 'HEAD' && r.url().includes('reel_likes'));
    await f.page.getByRole('button', { name: 'Open Creator analytics', exact: true }).click();
    await started;
    await f.page.getByText('30 days', { exact: true }).click();
    await f.page.getByLabel('Likes: 30', { exact: true }).waitFor();
    const completed = f.page.waitForResponse(r => r.request().method() === 'HEAD' && new URL(r.url()).searchParams.getAll('created_at').includes(initialWindow));
    release();
    await completed;
    await f.page.getByLabel('Likes: 30', { exact: true }).waitFor();
    assert.equal(await f.page.getByLabel('Likes: 7', { exact: true }).count(), 0);
  } finally { release(); await f.close(); }
});
