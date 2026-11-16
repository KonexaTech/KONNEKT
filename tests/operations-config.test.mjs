import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp,writeFile,chmod,rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readOperationsConfig,STAGING_URL } from '../scripts/ops/staging-config.mjs';
test('operator secrets stay private and configuration rejects production, publishable keys and malformed secret payloads',async()=>{
 const root=await mkdtemp(join(tmpdir(),'konnekt-ops-config-'));const file=join(root,'operations.local');
 try{
  const config={projectUrl:STAGING_URL,serviceKey:'sb_secret_DISPOSABLE_FIXTURE_ONLY'};
  await writeFile(file,JSON.stringify(config),{mode:0o600});assert.equal((await readOperationsConfig(file)).projectUrl,STAGING_URL);
  await chmod(file,0o644);await assert.rejects(readOperationsConfig(file),/owner-only/);await chmod(file,0o600);
  await writeFile(file,JSON.stringify({...config,projectUrl:'https://production.invalid'}));await assert.rejects(readOperationsConfig(file),/restricted/);
  await writeFile(file,JSON.stringify({...config,serviceKey:'sb_publishable_FIXTURE'}));await assert.rejects(readOperationsConfig(file),/server-only/);
  await writeFile(file,'{"private":"DO_NOT_EXPOSE_IN_ERROR"');
  await assert.rejects(readOperationsConfig(file),e=>!e.message.includes('DO_NOT_EXPOSE')&&e.message.includes('not logged'));
 }finally{await rm(root,{recursive:true,force:true});}
});
