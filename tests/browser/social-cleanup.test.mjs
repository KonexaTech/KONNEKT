import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { startServer, setup, ME } from './helpers.mjs';
let server;
before(async () => { server = await startServer(); });
after(() => server?.stop());
const path = `reels/${ME}/unused.webm`;
async function cleanup(page) {
  return page.evaluate(async ({ path, user }) => {
    const { cleanupUnusedPublicMedia } = await import('/KONNEKT/src/services/media.js');
    try { return { result: await cleanupUnusedPublicMedia('reels', user, { path }) }; }
    catch (error) { return { error: error.message }; }
  }, { path, user: ME });
}
test('an existing committed post is retained without invoking cleanup', async () => {
  const f = await setup(server.base, { db: { reels: [{ id: 'existing', user_id: ME, media_path: path }] } });
  try {
    let invoked = false;
    await f.context.route('**/functions/v1/cleanup-social-media', route => { invoked = true; return route.abort(); });
    assert.equal((await cleanup(f.page)).result, false);
    assert.equal(invoked, false);
    assert.equal(f.requests.filter(row => row.method === 'DELETE' && row.path.includes('/storage/')).length, 0);
  } finally { await f.close(); }
});
test('invisible rows cannot authorize browser deletion; missing server guard reports cleanup failure', async () => {
  const f = await setup(server.base);
  try {
    let body;
    await f.context.route('**/functions/v1/cleanup-social-media', route => {
      body = route.request().postDataJSON();
      return route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: 'Cleanup authorization unavailable' }) });
    });
    assert((await cleanup(f.page)).error);
    assert.deepEqual(body, { path });
    assert.equal(f.requests.filter(row => row.method === 'DELETE' && row.path.includes('/storage/')).length, 0);
  } finally { await f.close(); }
});
test('cleanup succeeds only for a server acknowledgement of the exact requested path', async () => {
  const f = await setup(server.base);
  try {
    let reply = { removed: true, path: path + '-different' };
    await f.context.route('**/functions/v1/cleanup-social-media', route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(reply) }));
    assert.match((await cleanup(f.page)).error, /could not be confirmed/);
    reply = { removed: true, path };
    assert.equal((await cleanup(f.page)).result, true);
  } finally { await f.close(); }
});
