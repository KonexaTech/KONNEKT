import { mkdir, writeFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import assert from 'node:assert/strict';
import { stagingSession, feature, moduleUrl } from './staging-session.mjs';

const file = process.env.KONNEKT_ACCEPTANCE_CONFIG;
const report = { runId: randomUUID(), project: 'konnekt-staging', decision: 'NOT_RUN', checks: [] };
let session, phase = 'sessions';
async function save() {
  if (!file) return;
  await mkdir(file + '.creator-analytics.local', { recursive: true, mode: 0o700 });
  await writeFile(file + '.creator-analytics.local/report.json', JSON.stringify(report, null, 2), { mode: 0o600 });
}
const pass = async check => { report.checks.push({ check, result: 'PASS' }); await save(); console.log('PASS ' + check); };
process.once('SIGTERM', () => {
  report.decision = 'BLOCKED_TIMEOUT_OR_INTERRUPTED';
  report.failedPhase = phase;
  void save().then(() => session?.close()).finally(() => process.exit(1));
});
try {
  report.decision = 'RUNNING';
  await save();
  session = await stagingSession(file);
  for (let i = 0; i < 3; i++) {
    phase = 'creator-' + i;
    const page = session.pages[i], owner = session.profiles[i].id;
    const values = await page.evaluate(async ({ moduleUrl, owner }) => {
      const { supabase } = await import(moduleUrl);
      const { getCreatorAnalytics } = await import('/KONNEKT/src/services/creatorAnalytics.js');
      const result = await getCreatorAnalytics(supabase, owner, 7);
      if (result.unavailable.length) throw Error('Recorded metrics unavailable');
      // Independently enumerate only the small dedicated fixtures, never
      // interpret a capped response as a complete aggregate.
      const expected = {};
      for (const table of ['reel_likes', 'reel_comments', 'follows']) {
        let query = table === 'follows'
          ? supabase.from(table).select('follower_id').eq('followed_id', owner)
          : supabase.from(table).select('reel_id,reels!inner(user_id)')
            .eq('reels.user_id', owner).is('reels.deleted_at', null).not('reels.published_at', 'is', null);
        if (table === 'reel_comments') query = query.is('deleted_at', null);
        const raw = await query.gte('created_at', result.since).lt('created_at', result.until).limit(1000);
        if (raw.error || raw.data.length >= 1000) throw Error('Independent fixture comparison unavailable');
        expected[table === 'follows' ? 'followers' : table === 'reel_likes' ? 'likes' : 'comments'] = raw.data.length;
      }
      return { actual: result.data, expected };
    }, { moduleUrl, owner });
    for (const key of ['likes', 'comments', 'followers']) assert.equal(values.actual[key], values.expected[key]);
    assert.equal(values.actual.views, null);
    assert.equal(values.actual.shares, null);
    assert.equal(values.actual.engagement, null);
    await feature(page, 'Creator analytics');
    for (const [key, title] of [['likes', 'Likes'], ['comments', 'Comments'], ['followers', 'New followers']]) {
      await page.getByLabel(`${title}: ${values.actual[key]}`, { exact: true }).waitFor();
    }
    await pass(`fixture ${i}: real exact counts match independently read authorized activity and the actual Creator Analytics screen`);
  }
  assert.equal(session.violations.length, 0);
  await pass('three isolated accounts used only approved network origins; unsupported metrics remain unavailable');
  report.decision = 'PASS_SCOPED_RECORDED_CREATOR_COUNTS_ONLY';
} catch (error) {
  report.failedPhase = phase;
  report.decision = 'FAIL_OR_BLOCKED';
  process.exitCode = 1;
  console.error('FAIL_OR_BLOCKED: ' + phase);
  // Diagnostics may contain account or network details; keep them private.
  if (file) {
    await mkdir(file + '.creator-analytics.local', { recursive: true, mode: 0o700 });
    await writeFile(file + '.creator-analytics.local/error.local', String(error?.stack || error), { mode: 0o600 });
  }
} finally {
  await session?.close();
  await save();
  console.log('Private analytics report saved. No social content, engagement or financial records were created.');
}
