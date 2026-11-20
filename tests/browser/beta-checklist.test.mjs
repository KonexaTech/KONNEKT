import { before, after, test } from 'node:test';
import assert from 'node:assert/strict';
import { startServer, setup, ME } from './helpers.mjs';

let server;
before(async () => { server = await startServer(); });
after(() => server?.stop());

test('approved-account UI can record and submit all feature checks to existing report queue', async () => {
  const f = await setup(server.base);
  try {
    const { page, requests } = f;
    await page.getByRole('tab', { name: 'Profile', exact: true }).click();
    await page.getByTestId('beta-checklist-link').click();
    await page.getByTestId('beta-submit').click();
    await page.getByText(/Enter your private tester code/).waitFor();
    assert.equal(requests.filter(x => x.method === 'POST' && x.path.endsWith('/user_reports')).length, 0);
    await page.getByTestId('beta-code').fill('T01');
    await page.getByTestId('beta-device').fill('Android 14 test phone');
    // All checks must be reviewed explicitly; an untested item is not a silent pass.
    const checks = ['A01','A02','A03','C01','C02','C03','C04','N01','V01','V02','V03','S01','R01','D01','P01','S02','O01','O02'];
    for (const id of checks) await page.getByTestId('beta-' + id + '-Pass').click();
    await page.getByTestId('beta-C02-Fail').click();
    await page.getByTestId('beta-submit').click();
    await page.getByText(/Add a short explanation/).waitFor();
    await page.getByTestId('beta-note-C02').fill('Photo upload fails on poor network');
    await page.getByTestId('beta-submit').click();
    await page.getByText(/Checklist submitted to KONNEKT for review/).waitFor();
    const writes = requests.filter(x => x.method === 'POST' && x.path.endsWith('/user_reports'));
    assert.equal(writes.length, 1);
    assert.equal(writes[0].body.reporter_id, ME);
    assert.equal(writes[0].body.content_type, 'other');
    assert.equal(writes[0].body.reason, 'App bug: Beta checklist');
    assert.match(writes[0].body.details, /Tester: T01/);
    assert.match(writes[0].body.details, /C02: Fail - Photo upload fails/);
    assert.match(writes[0].body.details, /O02: Pass/);
    assert(writes[0].body.details.length <= 2000);
    assert.deepEqual(f.errors, []);
  } finally { await f.close(); }
});

test('failed checklist submission does not claim success or discard marked results', async () => {
  const f = await setup(server.base);
  try {
    const { page, failures } = f;
    failures.set('POST:user_reports', { code: '42501', message: 'Access denied' });
    await page.getByRole('tab', { name: 'Profile', exact: true }).click();
    await page.getByTestId('beta-checklist-link').click();
    await page.getByTestId('beta-code').fill('T02');
    await page.getByTestId('beta-device').fill('Android 13 test device');
    for (const id of ['A01','A02','A03','C01','C02','C03','C04','N01','V01','V02','V03','S01','R01','D01','P01','S02','O01','O02']) {
      await page.getByTestId('beta-' + id + '-Not-tested').click();
    }
    await page.getByTestId('beta-submit').click();
    await page.getByText(/Could not submit/).waitFor();
    await page.getByText('18/18 marked · 0 failed').waitFor();
    assert.deepEqual(f.errors, []);
  } finally { await f.close(); }
});
