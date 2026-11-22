import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { startServer, setup } from './helpers.mjs';
let server;
before(async () => { server = await startServer(); });
after(() => server?.stop());

for (const [name, mimeType, content] of [['fixture.pdf', 'application/pdf', '%PDF-1.4\nTEST PRIVATE PDF\n%%EOF'], ['fixture.txt', 'text/plain', 'TEST PRIVATE DOCUMENT']]) test(`private ${name} upload encrypts bytes, opens authorized decrypted data and survives reload`, async () => {
  const f = await setup(server.base), storage = new Map();
  try {
    f.db.profiles[1].encryption_public_key = await f.page.evaluate(async () => { const key = await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveKey']); return JSON.stringify(await crypto.subtle.exportKey('jwk', key.publicKey)); });
    await f.context.route('**/storage/v1/object/**', async route => {
      const request = route.request(), path = decodeURIComponent(new URL(request.url()).pathname).replace('/authenticated/', '/');
      if (request.method() === 'POST') {
        const data = request.postDataBuffer();
        const form = await new Response(data, { headers: { 'content-type': request.headers()['content-type'] } }).formData();
        const file = [...form.values()].find(value => typeof value !== 'string'); storage.set(path, Buffer.from(await file.arrayBuffer()));
        return route.fallback();
      }
      if (request.method() === 'GET' && storage.has(path)) return route.fulfill({ status: 200, contentType: 'application/octet-stream', body: storage.get(path) });
      return route.fallback();
    });
    await f.page.getByRole('tab', { name: 'Chats', exact: true }).click(); await f.page.getByText('Other Member', { exact: true }).click();
    const chooser = f.page.waitForEvent('filechooser'); await f.page.getByRole('button', { name: 'Attach media', exact: true }).click();
    await (await chooser).setFiles({ name, mimeType, buffer: Buffer.from(content) });
    const open = f.page.getByRole('button', { name: 'Open attachment', exact: true }); await open.waitFor();
    assert.equal(f.db.messages.length, 1); const row = f.db.messages[0];
    assert.equal(row.media_type, 'document'); assert(row.is_encrypted && row.media_encrypted); assert.equal(row.media_mime_type, mimeType);
    assert([...storage.values()].every(bytes => !bytes.equals(Buffer.from(content))));
    await f.page.evaluate(() => { window.open = (url, target, features) => { window.__openedPrivate = { url, target, features }; return null; }; });
    await open.click();
    const opened = await f.page.evaluate(async () => ({ ...window.__openedPrivate, body: await (await fetch(window.__openedPrivate.url)).text() }));
    assert.equal(opened.body, content); assert(opened.url.startsWith('blob:')); assert.equal(opened.features, 'noopener,noreferrer');
    await f.page.reload(); await f.page.getByRole('tab', { name: 'Chats', exact: true }).click(); await f.page.getByText('Other Member', { exact: true }).click(); await f.page.getByRole('button', { name: 'Open attachment', exact: true }).waitFor();
    assert.deepEqual(f.errors, []);
  } finally { await f.close(); }
});

test('invalid chat HTML files are rejected before any encrypted upload or message write', async () => {
  const f = await setup(server.base);
  try {
    await f.page.getByRole('tab', { name: 'Chats', exact: true }).click(); await f.page.getByText('Other Member', { exact: true }).click();
    const chooser = f.page.waitForEvent('filechooser'); await f.page.getByRole('button', { name: 'Attach media', exact: true }).click();
    await (await chooser).setFiles({ name: 'unsupported.html', mimeType: 'text/html', buffer: Buffer.from('<script>test</script>') });
    await f.page.getByText(/Choose an image, video, audio, PDF or plain-text file/).waitFor();
    assert.equal(f.db.messages.length, 0); assert.equal(f.requests.filter(request => request.method === 'POST' && request.path.includes('/storage/')).length, 0);
  } finally { await f.close(); }
});
