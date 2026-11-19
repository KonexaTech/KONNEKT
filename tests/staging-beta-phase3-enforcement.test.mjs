import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const sql=readFileSync(new URL('../docs/release/staging-beta-phase3-enforcement-HOLD.sql',import.meta.url),'utf8');

test('phase-three deployment requires 20 testers, one owner and private media',()=>{
 assert.match(sql,/count\(\*\) from konnekt_beta\.testers\)<>20/i);
 assert.match(sql,/count\(\*\) from konnekt_beta\.owner_access\)<>1/i);
 assert.match(sql,/storage\.buckets where public/i);
 assert.match(sql,/not c\.relrowsecurity/i);
});
test('phase-three only prepares restrictive policies; never starts expiry clock',()=>{
 assert.match(sql,/as restrictive for all to public/i);
 assert.match(sql,/with check \(\(select konnekt_beta\.allowed\(\)\)\)/i);
 assert.doesNotMatch(sql,/\bupdate konnekt_beta\.control set enabled\s*=\s*true/i);
 assert.match(sql,/INTENTIONALLY NO ENABLE\/START COMMAND/i);
});
test('session guard preserves MFA and deletion checks',()=>{
 assert.match(sql,/account_deletion_requests/i);
 assert.match(sql,/auth\.mfa_factors/i);
 assert.match(sql,/and \(select konnekt_beta\.allowed\(\)\)/i);
});

const phase2=readFileSync(new URL('../docs/release/staging-beta-phase2-private-controls.sql',import.meta.url),'utf8');

test('phase-two beta timestamps cannot be moved or extended after activation',()=>{
 assert.match(phase2,/create function konnekt_beta\.enforce_control_window\(\)/i);
 assert.match(phase2,/NEW\.started_at is distinct from OLD\.started_at or NEW\.ends_at is distinct from OLD\.ends_at/i);
 assert.match(phase2,/The beta start and end times are immutable/i);
 assert.match(phase2,/NEW\.ends_at is distinct from NEW\.started_at\+interval '14 days'/i);
 assert.match(phase2,/before update on konnekt_beta\.control/i);
});
test('phase-two shutdown cannot be reversed and activation requires a complete roster',()=>{
 assert.match(phase2,/NOT OLD\.enabled and NEW\.enabled/i);
 assert.match(phase2,/Stopped beta cannot be restarted/i);
 assert.match(phase2,/count\(\*\) from konnekt_beta\.testers\)<>20/i);
 assert.match(phase2,/count\(\*\) from konnekt_beta\.owner_access\)<>1/i);
 assert.match(phase2,/pg_catalog\.pg_advisory_xact_lock/i);
});
