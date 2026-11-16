import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile,readdir } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { deleteStagingAccount } from '../scripts/ops/delete-account.mjs';
const A='11111111-1111-4111-8111-111111111111',B='22222222-2222-4222-8222-222222222222',C='33333333-3333-4333-8333-333333333333';

test('deletion locks old JWTs, removes authored content and preserves other participants history and group keys',async()=>{
 const db=new PGlite();
 const actor=async(id,aal='aal1')=>db.exec(`reset role;set role authenticated;select set_config('request.jwt.claim.sub','${id}',false);select set_config('request.jwt.claims','{"aal":"${aal}"}',false)`);
 try{
  await db.exec(await readFile('tests/fixtures/live-schema-2026-11-15.sql','utf8'));
  await db.exec(`create function auth.jwt() returns jsonb language sql stable as $$select coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb$$;create table auth.mfa_factors(id uuid,user_id uuid,status text);alter table storage.objects add column owner uuid;alter table storage.objects add column owner_id text;insert into auth.users(id) values('${A}'),('${B}'),('${C}');insert into profiles(id,username,encryption_public_key) values('${A}','fixture_a','public-key-fixture'),('${B}','fixture_b','other-key'),('${C}','fixture_c','outsider-key')`);
  for(const file of (await readdir('supabase/migrations')).sort())await db.exec(await readFile('supabase/migrations/'+file,'utf8'));
  await db.exec(await readFile('docs/release/staging-profile-and-function-grants.sql','utf8'));
  await db.exec(await readFile('docs/release/staging-opt-in-mfa.sql','utf8'));
  const sql=await readFile('docs/release/staging-account-deletion.sql','utf8');await db.exec(sql);await db.exec(sql);
  await actor(A);
  const direct=(await db.query("select konnekt_start_direct_conversation('fixture_b') as id")).rows[0].id;
  const group=(await db.query(`select konnekt_create_group_conversation('Shared group','',array['${B}'::uuid]) as id`)).rows[0].id;
  await db.exec(`reset role;insert into messages(conversation_id,sender_id,body,is_encrypted) values('${direct}','${A}','delete A',true),('${direct}','${B}','retain B',true),('${group}','${A}','delete group A',true),('${group}','${B}','retain group B',true);insert into group_key_envelopes(conversation_id,user_id,sender_id,sender_public_key,wrapped_key,wrap_iv) values('${group}','${B}','${A}','public-key-fixture','wrapped-key','iv');insert into storage.objects(bucket_id,name,owner,owner_id) values('konnekt-chat-media','${direct}/${A}/a.enc','${A}','${A}'),('konnekt-chat-media','${direct}/${B}/b.enc','${B}','${B}');`);
  await actor(A);await assert.rejects(db.exec(`insert into account_deletion_requests(user_id,status) values('${A}','processing')`),/row-level security/);
  await db.exec(`insert into account_deletion_requests(user_id,reason) values('${A}','private reason')`);
  for(const fn of ['plan','prepare','files','complete'])await assert.rejects(db.query(`select konnekt_deletion_${fn}('${A}')`),/permission denied/);
  await db.exec('reset role');assert.equal((await db.query(`select konnekt_deletion_plan('${A}') as plan`)).rows[0].plan.owned_files,1);
  await db.exec(`select konnekt_deletion_prepare('${A}')`);
  await actor(A,'aal2');assert.equal((await db.query('select konnekt_private.session_allowed() as ok')).rows[0].ok,false,'processing account with an old AAL2 JWT is denied');
  assert.equal((await db.query('select id from profiles')).rows.length,0);
  await assert.rejects(db.exec(`insert into messages(conversation_id,sender_id,body) values('${group}','${A}','blocked')`),/row-level security/);
  await db.exec(`reset role;delete from storage.objects where owner='${A}';delete from auth.users where id='${A}';select konnekt_deletion_complete('${A}')`);
  assert.equal((await db.query(`select count(*)::int as count from messages where sender_id='${A}'`)).rows[0].count,0);
  assert.equal((await db.query(`select count(*)::int as count from messages where sender_id='${B}'`)).rows[0].count,2);
  assert.equal((await db.query(`select created_by from conversations where id='${group}'`)).rows[0].created_by,B);
  const envelope=(await db.query(`select sender_id,sender_public_key from group_key_envelopes where user_id='${B}'`)).rows[0];assert.equal(envelope.sender_id,null);assert.equal(envelope.sender_public_key,'public-key-fixture');
  assert.equal((await db.query('select name from storage.objects')).rows.length,1,'other user media preserved');
  const request=(await db.query(`select status,reason from account_deletion_requests where user_id='${A}'`)).rows[0];assert.deepEqual(request,{status:'completed',reason:''});
  await actor(B);const retired=(await db.query(`select konnekt_retired_peer('${direct}') as peer`)).rows[0].peer;assert.equal(retired.encryption_public_key,'public-key-fixture');assert.equal(retired.retired,true);
  assert.equal((await db.query('select id from messages')).rows.length,2);
  await actor(C);assert.equal((await db.query(`select konnekt_retired_peer('${direct}') as peer`)).rows[0].peer,null);
  await actor(A,'aal2');assert.equal((await db.query('select konnekt_private.session_allowed() as ok')).rows[0].ok,false,'deleted account old JWT denied');
 }finally{await db.close();}
});

function fakeClient({failRemoval=false}={}){
 const calls=[];let files=[{bucket_id:'private',name:'owned.enc'}];
 const client={calls,from:()=>({select:()=>({eq:async()=>({data:[{status:'requested'}]})})}),rpc:async(name)=>{calls.push(name);return {data:name==='konnekt_deletion_push_plan'?{app_ids:[],pending_targets:0,targets:[]}:name.endsWith('_plan')?{account_exists:true,owned_files:files.length}:name.endsWith('_files')?[...files]:null};},storage:{from:()=>({remove:async paths=>{calls.push(['remove',paths]);if(failRemoval)return{error:{message:'private provider details'}};files=[];return{data:[]};}})},auth:{admin:{deleteUser:async()=>{calls.push('deleteAuth');return{data:{}};}}}};
 return client;
}
const config={projectUrl:'https://oiwtfkgrnpzirghbsvim.supabase.co',deletionUserId:A,allowStagingDeletion:true,disposableStagingAccount:true,backupVerified:true,pushProvider:'none'};
test('operator deletion defaults to plan-only; execution removes storage through API before Auth and completion',async()=>{
 const client=fakeClient();assert.equal((await deleteStagingAccount({client,config})).status,'PLAN_ONLY');assert.deepEqual(client.calls,['konnekt_deletion_plan','konnekt_deletion_push_plan']);
 await assert.rejects(deleteStagingAccount({client,config,execute:true,confirmUserId:B}),/matching/);
  await assert.rejects(deleteStagingAccount({client,config:{...config,pushProvider:'onesignal'},execute:true,confirmUserId:A}),/provider/);
 client.calls.length=0;
 assert.equal((await deleteStagingAccount({client,config,execute:true,confirmUserId:A})).status,'COMPLETED');
 assert(client.calls.findIndex(c=>Array.isArray(c))<client.calls.indexOf('deleteAuth'));assert(client.calls.indexOf('deleteAuth')<client.calls.indexOf('konnekt_deletion_complete'));
});
test('storage failure does not delete Auth or report completion; production is rejected',async()=>{
 const client=fakeClient({failRemoval:true});
 await assert.rejects(deleteStagingAccount({client,config,execute:true,confirmUserId:A}),/locked/);assert(!client.calls.includes('deleteAuth'));assert(!client.calls.includes('konnekt_deletion_complete'));
 await assert.rejects(deleteStagingAccount({client,config:{...config,projectUrl:'https://production.invalid'}}),/Staging only/);
});
