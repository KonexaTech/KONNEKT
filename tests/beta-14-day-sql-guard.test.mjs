import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const sql = readFileSync(new URL('../docs/release/beta-14-day-staging-gate.sql', import.meta.url), 'utf8');

test('staging beta access fails closed without exact enrollment and active window', () => {
  assert.match(sql, /\(select auth\.uid\(\)\) is not null/i);
  assert.match(sql, /c\.enabled/i);
  assert.match(sql, /c\.started_at\s*<=\s*now\(\)/i);
  assert.match(sql, /now\(\)\s*<\s*c\.ends_at/i);
  assert.match(sql, /count\(\*\) from konnekt_beta\.testers\)\s*=\s*20/i);
  assert.match(sql, /t\.user_id\s*=\s*\(select auth\.uid\(\)\)/i);
  assert.match(sql, /ends_at\s*=\s*started_at\s*\+\s*interval\s*'14 days'/i);
});

test('beta table policies remain restrictive and require both read and write authorization', () => {
  assert.match(sql, /r\.relrowsecurity\s+then raise exception/i);
  assert.match(sql, /create policy beta_14_day_gate.*as restrictive for all to public using.*with check/i);
  assert.doesNotMatch(sql, /create policy beta_14_day_gate.*to authenticated using/i);
  assert.match(sql, /n\.nspname='public'.*n\.nspname='storage'.*c\.relname='objects'/i);
  assert.match(sql, /revoke all on all tables in schema konnekt_beta from public, anon, authenticated/i);
  assert.match(sql, /revoke all on function konnekt_beta\.allowed\(\) from public, anon/i);
});
