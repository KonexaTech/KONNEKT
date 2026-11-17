import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { stagingSession, moduleUrl, tab } from './staging-session.mjs';

// Uses only the three explicitly approved mutable staging fixtures.
// Run with KONNEKT_ACCEPTANCE_CONFIG=/path/to/private-config.local.
// Leaves one labelled report in staging as auditable evidence; never touches production.
const file = process.env.KONNEKT_ACCEPTANCE_CONFIG;
const marker = 'KONNEKT ACCEPTANCE BUG ' + randomUUID();
const output = file ? file + '.bug-reports.local' : null;
const result = { decision: 'NOT_RUN', checks: [], marker };
let session;
const pass = check => { result.checks.push({ check, result: 'PASS' }); console.log('PASS ' + check); };
try {
  if (!file) throw Error('KONNEKT_ACCEPTANCE_CONFIG must point to the private staging .local file.');
  session = await stagingSession(file);
  const [reporter, , outsider] = session.pages;
  const reporterId = session.profiles[0].id;
  const description = marker + ' voice note did not appear after sending';
  await tab(reporter, 'Profile');
  await reporter.getByRole('button', { name: /Report a Problem/ }).click();
  await reporter.getByTestId('bug-submit').click();
  await reporter.getByText(/at least 10 characters/).waitFor();
  pass('empty report is rejected by the real staging UI');

  await reporter.getByTestId('bug-problem').fill(description);
  await reporter.getByLabel('Expected result').fill('Voice note should appear');
  await reporter.getByLabel('Device details').fill('Android staging acceptance');
  const submitted = reporter.waitForResponse(response =>
    response.url().includes('/rest/v1/user_reports') && response.request().method() === 'POST'
  );
  await reporter.getByTestId('bug-submit').click();
  assert((await submitted).ok(), 'Live staging insert was rejected');
  await reporter.getByText('Report submitted. Thank you for helping test KONNEKT.').waitFor();
  pass('real signed-in fixture submitted an app bug through the UI');

  const own = await reporter.evaluate(async ({ moduleUrl, marker }) => {
    const { supabase } = await import(moduleUrl);
    const response = await supabase.from('user_reports')
      .select('id,reporter_id,reason,content_type,details,status')
      .ilike('details', '%' + marker + '%');
    if (response.error) throw response.error;
    return response.data;
  }, { moduleUrl, marker });
  assert.equal(own.length, 1, 'Expected exactly one matching report');
  assert.equal(own[0].reporter_id, reporterId);
  assert.equal(own[0].reason, 'App bug: Chats');
  assert.equal(own[0].content_type, 'other');
  assert.equal(own[0].status, 'open');
  pass('reporter can read exactly one correctly labelled persisted report');

  const other = await outsider.evaluate(async ({ moduleUrl, id }) => {
    const { supabase } = await import(moduleUrl);
    const response = await supabase.from('user_reports').select('id').eq('id', id);
    if (response.error) throw response.error;
    return response.data;
  }, { moduleUrl, id: own[0].id });
  assert.deepEqual(other, [], 'An unrelated authenticated account could read the report');
  pass('authenticated outsider cannot read another tester\'s report');

  assert.deepEqual(session.violations, [], 'A request escaped the staging-only network boundary');
  pass('no production requests observed');
  result.decision = 'PASS_SCOPED_LIVE_REPORT_ONLY';
} catch (error) {
  result.decision = 'FAIL_OR_BLOCKED';
  result.error = error.message;
  process.exitCode = 1;
  console.error('FAIL_OR_BLOCKED: ' + error.message);
} finally {
  await session?.close();
  if (output) {
    await mkdir(output, { recursive: true, mode: 0o700 });
    await writeFile(output + '/report.json', JSON.stringify(result, null, 2), { mode: 0o600 });
    console.log('Sanitized staging bug report acceptance result saved locally.');
  }
}
