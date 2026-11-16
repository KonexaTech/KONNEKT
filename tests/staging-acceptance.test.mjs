import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtemp, writeFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { validateConfig, assertIsolation, STAGING_ORIGIN, acceptanceProxy } from '../scripts/acceptance/staging-config.mjs';
test('staging browser proxy preserves direct local access and never logs proxy credentials',()=>{
  assert.equal(acceptanceProxy({}),undefined);
  const proxy=acceptanceProxy({HTTPS_PROXY:'http://fixture:private%20fixture@proxy.invalid:8080'});
  assert.deepEqual(proxy,{server:'http://proxy.invalid:8080',bypass:'127.0.0.1,localhost',username:'fixture',password:'private fixture'});
  assert.throws(()=>acceptanceProxy({KONNEKT_ACCEPTANCE_PROXY:'invalid PRIVATE_FIXTURE_VALUE'}),e=>!e.message.includes('PRIVATE_FIXTURE_VALUE')&&e.message.includes('not logged'));
  assert.throws(()=>acceptanceProxy({HTTPS_PROXY:'file:///private/path'}),/Invalid acceptance/);
});
const fixture = () => ({ projectUrl: STAGING_ORIGIN, publishableKey: 'sb_publishable_fixture', confirmStagingWrites: true, accounts: ['a','b','c'].map(x => ({ email: `${x}@example.invalid`, password: 'fixture-only', username: `fixture_${x}` })) });
test('live acceptance rejects production, unknown projects, privileged keys and unapproved writes', () => {
  assert.equal(validateConfig(fixture()).accounts.length, 3);
  for (const projectUrl of ['https://itkoagpigiifodfhoujt.supabase.co','https://other.supabase.co', 'http://localhost']) assert.throws(() => validateConfig({ ...fixture(), projectUrl }));
  for (const publishableKey of ['sb_secret_fixture','service_role','eyJ.fixture.jwt','']) assert.throws(() => validateConfig({ ...fixture(), publishableKey }));
  assert.throws(() => validateConfig({ ...fixture(), confirmStagingWrites: false }));
});
test('live acceptance requires three distinct, fully configured accounts', () => {
  for (const accounts of [[],fixture().accounts.slice(0,2),Array(3).fill(fixture().accounts[0]),fixture().accounts.map(a => ({ ...a, password: '' }))]) assert.throws(() => validateConfig({ ...fixture(), accounts }));
});
const evidence = () => ({ conversationId:'protected', protectedIds:['m1','m2'], memberEvents:[{id:'m1',conversation_id:'protected'},{id:'m2',conversation_id:'protected'}], outsiderEvents:[{id:'before',conversation_id:'own'},{id:'after',conversation_id:'own'}], beforeControlId:'before', afterControlId:'after', subscriptionHealthy:true });
test('Realtime isolation needs member delivery and outsider positive controls', () => {
  assert.doesNotThrow(() => assertIsolation(evidence()));
  for (const change of [{ outsiderEvents:[] },{ memberEvents:[] },{ protectedIds:[] },{ subscriptionHealthy:false },{ afterControlId:'before' }]) assert.throws(() => assertIsolation({ ...evidence(), ...change }));
});
test('Realtime isolation fails for any protected row leaked to outsider', () => {
  for (const leak of [{id:'m1',conversation_id:'other'},{id:'new',conversation_id:'protected'}]) assert.throws(() => assertIsolation({ ...evidence(), outsiderEvents:[...evidence().outsiderEvents,leak] }));
});


test('configuration-only CLI validates privately without creating browser profiles or reports', async () => {
  const directory = await mkdtemp(join(tmpdir(),'konnekt-preflight-'));
  try {
    const file = join(directory,'accounts.local');
    await writeFile(file,JSON.stringify(fixture()),{mode:0o600});
    const output = execFileSync(process.execPath,[resolve('scripts/acceptance/staging-messaging.mjs'),'--check-config'],{env:{...process.env,KONNEKT_ACCEPTANCE_CONFIG:file},encoding:'utf8'});
    assert.match(output,/no network requests or writes/);
    assert(!output.includes('fixture-only'));
    assert.deepEqual(await readdir(directory),['accounts.local']);
  } finally {await rm(directory,{recursive:true,force:true});}
});
