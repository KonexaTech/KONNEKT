// Offline triage of privately exported user_reports rows.
// Usage: node scripts/beta/summarize-checklists.mjs /secure/export.json
// Does not contact Supabase, print users' names/emails, or make GitHub issues.
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

export const IDS = ['A01','A02','A03','C01','C02','C03','C04','N01','V01','V02','V03','S01','R01','D01','P01','S02','O01','O02'];
const heading = /^KONNEKT BETA CHECKLIST v1$/m;
export function summarize(records) {
  const reports = records.filter(row => row?.reason === 'App bug: Beta checklist' && typeof row.details === 'string' && heading.test(row.details));
  const byTester = new Map();
  for (const report of reports) {
    const tester = /^Tester: (T(?:0[1-9]|1[0-9]|20))$/m.exec(report.details)?.[1];
    if (!tester) continue;
    const date = Date.parse(/^Submitted: (.+)$/m.exec(report.details)?.[1] || '') || 0;
    const prior = byTester.get(tester);
    if (!prior || date > prior.date) byTester.set(tester, { details:report.details, date });
  }
  const totals = IDS.map(id => ({ id, pass:0, fail:0, notTested:0, examples:[] }));
  for (const { details } of byTester.values()) {
    for (const item of totals) {
      const line = details.split('\n').find(s => s.startsWith(item.id + ': '));
      if (line?.startsWith(item.id + ': Pass')) item.pass++;
      else if (line?.startsWith(item.id + ': Fail')) {
        item.fail++;
        const note = line.slice((item.id + ': Fail - ').length).replace(/[\r\n|]/g,' ').slice(0,55);
        if (line.includes(' - ') && note && item.examples.length < 3) item.examples.push(note);
      } else item.notTested++;
    }
  }
  // Prioritize by reproducible failure count; don't classify a "Not tested" as a pass.
  totals.sort((a,b)=>b.fail-a.fail||b.notTested-a.notTested||a.id.localeCompare(b.id));
  return { submitted:reports.length, uniqueTesters:byTester.size, missing:20-byTester.size, totals };
}
export function renderMarkdown(result) {
  const lines = ['# KONNEKT beta — end-of-test repair report','',
    'Submitted checklist records: '+result.submitted,
    'Unique tester codes: '+result.uniqueTesters+' / 20',
    'Missing tester reports: '+result.missing,
    '',
    '**Important:** Missing or untested checks are not passes. Investigate crashes, data leaks, security and access-control problems first regardless of their frequency.',
    '',
    '| Feature ID | Pass | Fail | Not tested | Example failure notes |',
    '|---|---:|---:|---:|---|',
    ...result.totals.map(r=>`| ${r.id} | ${r.pass} | ${r.fail} | ${r.notTested} | ${r.examples.join('; ').replace(/\|/g,' ')} |`),
    '',
    '## Repair sequence',
    '1. Immediately triage any account/security/privacy or data-loss report; stop release if confirmed.',
    '2. Reproduce high-frequency failures on the recorded Android versions.',
    '3. Create small fixes on a separate branch with regression tests.',
    '4. Retest failed cases on physical devices and verify no navigation/design/data regressions.',
    '5. Only approve public launch after release-gate sign-off.',
    ''
  ]; return lines.join('\n');
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const file=process.argv[2];
  if (!file) { console.error('Usage: node scripts/beta/summarize-checklists.mjs /private/export.json'); process.exitCode=2; }
  else {
    try {
      const data=JSON.parse(await readFile(file,'utf8'));
      if (!Array.isArray(data)) throw Error('Expected array of user_reports rows');
      console.log(renderMarkdown(summarize(data)));
    } catch (e) { console.error('Unable to summarize private export: '+e.message); process.exitCode=1; }
  }
}
