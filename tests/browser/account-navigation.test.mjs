import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { startServer, setup, openFeature } from './helpers.mjs';
let server;
before(async () => { server = await startServer(); });
after(() => server?.stop());
test('account personal information opens the existing profile editor and persists the saved name', async () => {
  const f = await setup(server.base);
  try {
    await openFeature(f.page, 'Account settings');
    await f.page.getByText('Personal information', { exact: true }).click();
    await f.page.getByPlaceholder('Your name', { exact: true }).fill('Fixture audited name');
    await f.page.getByText('SAVE PROFILE', { exact: true }).click();
    await f.page.getByText('Profile saved successfully.', { exact: true }).waitFor();
    await f.page.reload(); await f.page.getByRole('tab', { name: 'Profile', exact: true }).click();
    assert.equal(await f.page.getByPlaceholder('Your name', { exact: true }).inputValue(), 'Fixture audited name');
    assert.deepEqual(f.errors, []);
  } finally { await f.close(); }
});
