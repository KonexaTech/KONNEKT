import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { startServer, setup, ME } from './helpers.mjs';

let server;
before(async () => { server = await startServer(); });
after(() => server?.stop());

test('moderator can separate app bug reports from safety reports without changing tabs', async () => {
  const f = await setup(server.base, { db: {
    moderation_admins: [{ user_id: ME }],
    user_reports: [
      { id: '44444444-4444-4444-8444-000000000001', reporter_id: ME, reason: 'App bug: Chats', content_type: 'other', details: 'Voice notes do not send', status: 'open', created_at: '2026-11-17T00:00:00Z' },
      { id: '44444444-4444-4444-8444-000000000002', reporter_id: ME, reason: 'Harassment', content_type: 'user', details: 'Abusive behaviour', status: 'open', created_at: '2026-11-17T00:00:00Z' }
    ]
  }});
  try {
    const { page } = f;
    await page.getByRole('tab', { name: 'Profile', exact: true }).click();
    await page.getByText('☰  ALL FEATURES', { exact: true }).click();
    await page.getByRole('button', { name: 'Open Moderation centre' }).click();
    await page.getByText('App bug: Chats · open').waitFor();
    await page.getByText('Harassment · open').waitFor();
    await page.getByRole('button', { name: 'App bugs' }).click();
    assert.equal(await page.getByText('App bug: Chats · open').count(), 1);
    assert.equal(await page.getByText('Harassment · open').count(), 0);
    await page.getByRole('button', { name: 'Safety' }).click();
    assert.equal(await page.getByText('App bug: Chats · open').count(), 0);
    assert.equal(await page.getByText('Harassment · open').count(), 1);
    assert.deepEqual(f.errors, []);
  } finally { await f.close(); }
});
