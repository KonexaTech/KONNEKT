import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { startServer, setup, ME } from './helpers.mjs';

let server;
before(async () => { server = await startServer(); });
after(() => server?.stop());

test('Profile bug report validates and sends one protected report with no secrets', async () => {
  const f = await setup(server.base);
  try {
    const { page, requests } = f;
    await page.getByRole('tab', { name: 'Profile', exact: true }).click();
    await page.getByRole('button', { name: /Report a Problem/ }).click();
    await page.getByTestId('bug-submit').click();
    await page.getByText(/at least 10 characters/).waitFor();
    assert.equal(requests.filter(r => r.method === 'POST' && r.path.endsWith('/user_reports')).length, 0);

    await page.getByTestId('bug-problem').fill('Voice note did not appear after sending');
    await page.getByLabel('Expected result').fill('Voice note should appear in the conversation');
    await page.getByLabel('Device details').fill('Android 14 test device');
    await page.getByTestId('bug-submit').click();
    await page.getByText('Report submitted. Thank you for helping test KONNEKT.').waitFor();

    const writes = requests.filter(r => r.method === 'POST' && r.path.endsWith('/user_reports'));
    assert.equal(writes.length, 1);
    assert.equal(writes[0].body.reporter_id, ME);
    assert.equal(writes[0].body.content_type, 'other');
    assert.equal(writes[0].body.reason, 'App bug: Chats');
    assert.match(writes[0].body.details, /Voice note did not appear/);
    assert.equal(writes[0].body.details.length <= 2000, true);
    assert.equal('moderator_id' in writes[0].body, false);
    assert.equal('status' in writes[0].body, false);
    assert.deepEqual(f.errors, []);
  } finally { await f.close(); }
});

test('Failed bug report submission displays failure rather than false success', async () => {
  const f = await setup(server.base);
  try {
    const { page, failures } = f;
    failures.set('POST:user_reports', { code: '42501', message: 'RLS rejected insert' });
    await page.getByRole('tab', { name: 'Profile', exact: true }).click();
    await page.getByRole('button', { name: /Report a Problem/ }).click();
    await page.getByTestId('bug-problem').fill('The feature fails repeatedly after tapping send');
    await page.getByTestId('bug-submit').click();
    await page.getByText('Report could not be submitted. Check your connection and try again.').waitFor();
    assert.equal(await page.getByText(/Report submitted. Thank you/).count(), 0);
    assert.deepEqual(f.errors, []);
  } finally { await f.close(); }
});
