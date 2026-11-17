import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { startServer, setup, openFeature } from './helpers.mjs';

let server;
before(async () => { server = await startServer({ preview: process.env.KONNEKT_TEST_PREVIEW === '1' }); });
after(() => server?.stop());

for (const width of [390, 1280]) {
  test(`core release navigation and deferred feature notice at width ${width}`, async () => {
    const app = await setup(server.base, { width });
    try {
      const { page, errors, requests } = app;
      await page.getByRole('tab', { name: 'Profile', exact: true }).waitFor();
      assert.deepEqual(await page.getByRole('tab').allTextContents(), ['✉Chats','▶Reels','◉Status','◎Discover','◌Profile']);
      for (const name of ['Chats', 'Status', 'Discover', 'Profile', 'Reels']) {
        const tab = page.getByRole('tab', { name, exact: true });
        await tab.click();
        await page.waitForFunction(name => document.querySelector(`[role="tab"][aria-label="${name}"]`)?.getAttribute('aria-selected') === 'true', name);
      }
      await page.getByRole('tab', { name: 'Chats', exact: true }).click();
      await page.getByRole('button', { name: 'Create group', exact: true }).click();
      await page.getByPlaceholder('Enter group name').waitFor();
      await page.reload();
      await openFeature(page, 'Calls');
      await page.getByLabel('Search people to call').waitFor();
      await page.getByRole('button', { name: 'Back from Calls', exact: true }).click();
      await page.getByText('‹ Back', { exact: true }).click();
      await openFeature(page, 'Live rooms');
      await page.getByText('Unavailable in this release', { exact: true }).waitFor();
      assert.equal(requests.filter(r => /live_stream|payment|payout|subscription|gift/.test(r.path)).length, 0);
      assert.deepEqual(errors, [], 'No uncaught browser errors in the built app');
    } finally { await app.close(); }
  });
}

test('public welcome describes only the initial release capabilities', async () => {
  const app = await setup(server.base, { signedIn: false });
  try {
    await app.page.getByText('Discover people', { exact: true }).waitFor();
    assert.equal(await app.page.getByText('Live streaming', { exact: true }).count(), 0);
    await app.page.getByText('LOG IN', { exact: true }).click();
    await app.page.getByPlaceholder('Email address', { exact: true }).waitFor();
    assert.deepEqual(app.errors, []);
  } finally { await app.close(); }
});
