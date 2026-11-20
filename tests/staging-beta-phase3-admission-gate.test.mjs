import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const sql = readFileSync(new URL('../docs/release/staging-beta-phase3-admission-gate.sql', import.meta.url), 'utf8');

test('staging admission gate targets only staging and cannot activate a beta', () => {
  assert.match(sql,/STAGING ONLY: oiwtfkgrnpzirghbsvim/);
  assert.match(sql,/Do NOT execute on production/);
  assert.doesNotMatch(sql,/^\s*update\s+konnekt_beta\.control\s+set\s+enabled\s*=\s*true/im);
  assert.match(sql,/started_at is null and not enabled/i);
});
test('pre-activation staging usage remains unchanged, but post-activation uses approved roster admission', () => {
  assert.match(sql,/not exists \(\s*select 1 from konnekt_beta\.control c\s*where c\.singleton and c\.started_at is not null\s*\) or \(select konnekt_beta\.allowed\(\)\)/i);
  assert.match(sql,/as restrictive for all to public using \(\(select konnekt_beta\.admission_open\(\)\)\) with check \(\(select konnekt_beta\.admission_open\(\)\)\)/i);
  assert.match(sql,/n\.nspname='public' or \(n\.nspname='storage' and c\.relname='objects'\)/i);
});
test('preflight fails closed on public storage, existing policies, or missing RLS', () => {
  assert.match(sql,/storage\.buckets where public/i);
  assert.match(sql,/not c\.relrowsecurity/i);
  assert.match(sql,/policyname='beta_14_day_gate'/i);
});
test('session access retains account deletion and MFA checks', () => {
  assert.match(sql,/account_deletion_requests/i);
  assert.match(sql,/auth\.mfa_factors/i);
  assert.match(sql,/and \(select konnekt_beta\.admission_open\(\)\)/i);
});
