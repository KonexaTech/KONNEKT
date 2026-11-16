import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile,readdir} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
const A='11111111-1111-4111-8111-111111111111',B='22222222-2222-4222-8222-222222222222',SA='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',SB='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',APP='cccccccc-cccc-4ccc-8ccc-cccccccccccc',OTHERAPP='dddddddd-dddd-4ddd-8ddd-dddddddddddd',DEVICE='a'.repeat(64);
test('provider identities survive logout; locked deletion snapshots targets, revokes sessions/calls and requires erasure before completion',async()=>{
 const db=new PGlite();const actor=async id=>db.exec(`reset role;set role authenticated;select set_config('request.jwt.claim.sub','${id}',false);select set_config('request.jwt.claims','{"session_id":"${id===A?SA:SB}","aal":"aal1"}',false)`);
 try{
  await db.exec(await readFile('tests/fixtures/live-schema-2026-11-15.sql','utf8'));
  await db.exec(`alter table auth.users add column banned_until timestamptz;alter table storage.objects add column owner uuid;alter table storage.objects add column owner_id text;create function auth.jwt() returns jsonb language sql stable as $$select coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb$$;create table auth.mfa_factors(id uuid,user_id uuid,status text);create table auth.sessions(id uuid primary key,user_id uuid references auth.users(id) on delete cascade,created_at timestamptz default now(),not_after timestamptz,aal text default 'aal1');insert into auth.users(id) values('${A}'),('${B}');insert into profiles(id,username,encryption_public_key) values('${A}','fixture_a','public-a'),('${B}','fixture_b','public-b');insert into auth.sessions(id,user_id) values('${SA}','${A}'),('${SB}','${B}')`);
  for(const name of(await readdir('supabase/migrations')).sort())await db.exec(await readFile('supabase/migrations/'+name,'utf8'));
  for(const name of ['staging-profile-and-function-grants.sql','staging-opt-in-mfa.sql','staging-account-deletion.sql','staging-push-delivery.sql','staging-push-outbox.sql','staging-turn-authorization.sql'])await db.exec(await readFile('docs/release/'+name,'utf8'));
  const sql=await readFile('docs/release/staging-provider-erasure.sql','utf8');await db.exec(sql);await db.exec(sql);
  await actor(A);let alias=(await db.query(`select konnekt_register_push_session('${DEVICE}','${A}') as x`)).rows[0].x;assert.equal(alias.app_id,null);
  await assert.rejects(db.query(`select konnekt_configure_push_app('${APP}')`),/permission denied/);
  await db.exec(`reset role;select konnekt_configure_push_app('${APP}')`);await actor(A);let current=(await db.query(`select konnekt_register_push_session('${DEVICE}','${A}') as x`)).rows[0].x;assert.equal(current.app_id,APP);assert.notEqual(current.external_id,alias.external_id);
  await db.query(`select konnekt_unregister_push_session('${DEVICE}')`);await db.exec('reset role');assert.equal((await db.query(`select count(*)::int as n from konnekt_private.push_provider_identities where user_id='${A}'`)).rows[0].n,1);
  await actor(A);alias=(await db.query(`select konnekt_register_push_session('${DEVICE}','${A}') as x`)).rows[0].x;assert.notEqual(alias.external_id,current.external_id);
  await db.exec('reset role');const group=(await db.query(`insert into conversations(created_by,is_group) values('${A}',true) returning id`)).rows[0].id;
  await db.exec(`insert into conversation_members(conversation_id,user_id) values('${group}','${A}'),('${group}','${B}');insert into call_sessions(caller_id,callee_id,call_type) values('${A}','${B}','voice');insert into group_call_sessions(id,conversation_id,created_by,call_type,status) values('${SA}','${group}','${A}','voice','active');insert into group_call_participants(call_id,user_id,status) values('${SA}','${A}','joined'),('${SA}','${B}','joined')`);
  await actor(A);await db.exec(`insert into account_deletion_requests(user_id) values('${A}')`);
  for(const name of ['konnekt_deletion_push_plan','konnekt_deletion_push_prepare'])await assert.rejects(db.query(`select ${name}('${A}')`),/permission denied/);
  await assert.rejects(db.query('select * from konnekt_private.push_provider_identities'),/permission denied/);
  await db.exec('reset role');let plan=(await db.query(`select konnekt_deletion_push_plan('${A}') as x`)).rows[0].x;assert.equal(plan.pending_targets,3);assert.deepEqual(plan.app_ids,[APP]);assert(plan.targets.some(t=>t.external_id===A),'Include the legacy public-UUID identity for this recorded app');
  await db.query(`select konnekt_deletion_push_prepare('${A}')`);assert.equal((await db.query(`select count(*)::int as n from auth.sessions where user_id='${A}'`)).rows[0].n,0);assert.equal((await db.query(`select status from call_sessions where caller_id='${A}'`)).rows[0].status,'ended');assert.equal((await db.query(`select status from group_call_sessions where created_by='${A}'`)).rows[0].status,'ended');
  await assert.rejects(db.query(`select konnekt_configure_push_app('${OTHERAPP}')`),/Finish processing deletions/);
  await actor(A);await assert.rejects(db.query(`select konnekt_register_push_session('${DEVICE}','${A}')`),/Verify your sign-in/);
  await db.exec('reset role');plan=(await db.query(`select konnekt_deletion_push_plan('${A}') as x`)).rows[0].x;
  // Even a prematurely removed Auth identity must leave durable provider work.
  await db.exec(`delete from auth.users where id='${A}'`);await assert.rejects(db.query(`select konnekt_deletion_complete('${A}')`),/Provider erasure/);
  for(const target of plan.targets)assert.equal((await db.query(`select konnekt_deletion_push_mark_erased('${A}','${target.app_id}','${target.external_id}') as ok`)).rows[0].ok,true);
  await db.query(`select konnekt_deletion_complete('${A}')`);await db.query(`select konnekt_deletion_complete('${A}')`);assert.equal((await db.query('select count(*)::int as n from konnekt_private.deletion_push_manifest')).rows[0].n,0);
  await db.exec(`insert into auth.users(id) values('${A}')`);await actor(A);assert.equal((await db.query('select konnekt_private.session_allowed() as ok')).rows[0].ok,false,'Completed deletion tombstones block a restored identity');
  await db.exec('reset role');await assert.rejects(db.query(`select konnekt_deletion_complete('${A}')`),/Auth account and owned files/);assert.equal((await db.query(`select created_by from conversations where id='${group}'`)).rows[0].created_by,B);
 }finally{await db.close();}
});
