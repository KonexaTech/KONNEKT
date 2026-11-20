import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { startServer, setup } from './helpers.mjs';
let server;
before(async () => { server = await startServer(); });
after(() => server?.stop());

for (const width of [320, 1280]) test(`six tabs expose Calls directly and retain feature-menu Back at ${width}px`, async () => {
  const f = await setup(server.base, { width });
  try {
    const { page } = f;
    await page.getByRole('tab', { name: 'Profile', exact: true }).waitFor();
    assert.deepEqual(await page.getByRole('tab').allTextContents(), ['✉Chats', '▶Reels', '◉Status', '◎Discover', '☎Calls', '◌Profile']);
    await page.getByRole('tab', { name: 'Calls', exact: true }).click();
    assert.equal(await page.getByRole('tab', { name: 'Calls', exact: true }).getAttribute('aria-selected'), 'true');
    await page.getByLabel('Search people to call').waitFor();
    assert.equal(await page.getByRole('button', { name: 'Back from Calls', exact: true }).count(), 0);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, 'Six tabs fit narrow screens');
    await page.getByRole('button', { name: 'Start voice call with Other Member', exact: true }).waitFor();
    await page.getByRole('button', { name: 'Start video call with Other Member', exact: true }).waitFor();
    await page.getByRole('tab', { name: 'Profile', exact: true }).click();
    await page.getByText('☰  ALL FEATURES', { exact: true }).click();
    await page.getByRole('button', { name: 'Open Calls', exact: true }).click();
    await page.getByLabel('Search people to call').waitFor();
    await page.getByRole('button', { name: 'Start video call with Other Member', exact: true }).waitFor();
    await page.getByRole('button', { name: 'Start voice call with Other Member', exact: true }).waitFor();
    await page.getByRole('button', { name: 'Back from Calls', exact: true }).click();
    await page.getByRole('button', { name: 'Open Calls', exact: true }).waitFor();
    assert.equal(f.requests.filter(r => r.method === 'POST' && /call_sessions/.test(r.path)).length, 0);
    assert.deepEqual(f.errors, []);
  } finally { await f.close(); }
});
