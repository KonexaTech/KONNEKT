import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const sql = readFileSync(new URL('../docs/release/beta-14-day-staging-gate.sql', import.meta.url), 'utf8');

test('staging beta gate remains fail-closed and requires exactly 20 enrolled users', () => {
  assert.match(sql, /STAGING PROJECT oiwtfkgrnpzirghbsvim/);
  assert.match(sql, /enabled boolean not null default false/i);
  assert.match(sql, /\(select count\(\*\) from konnekt_beta\.testers\) = 20/i);
  assert.match(sql, /t\.user_id = \(select auth\.uid\(\)\)/i);
  assert.match(sql, /c\.started_at <= now\(\) and now\(\) < c\.ends_at/i);
  assert.match(sql, /as restrictive for all to authenticated/i);
  assert.match(sql, /enable row level security/i);
  assert.match(sql, /revoke all on all tables in schema konnekt_beta from public, anon, authenticated/i);
});

test('beta proposal does not silently activate the gate or weaken its review-only status', () => {
  assert.match(sql, /REVIEW ONLY/);
  assert.match(sql, /Do not apply to production/);
  assert.doesNotMatch(sql, /^\s*update konnekt_beta\.control set enabled\s*=\s*true/im);
  assert.match(sql, /-- Do not activate until RPCs, Realtime, storage, Auth and bypass tests are accepted/);
});
