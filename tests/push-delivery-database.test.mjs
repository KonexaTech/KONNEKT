import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile,readdir} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
const A='11111111-1111-4111-8111-111111111111',B='22222222-2222-4222-8222-222222222222',C='33333333-3333-4333-8333-333333333333';
const KEY='a'.repeat(64),OTHERKEY='b'.repeat(64);
const SA='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',SB='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',SC='cccccccc-cccc-4ccc-8ccc-cccccccccccc';
test('push aliases are owner/session-bound; dispatch excludes revoked, expired, blocked, read, deleted, banned, MFA and opted-out targets',async()=>{
 const db=new PGlite();
 const actor=async(id,sid,aal='aal1')=>db.exec(`reset role;set role authenticated;select set_config('request.jwt.claim.sub','${id}',false);select set_config('request.jwt.claims','{"aal":"${aal}","session_id":"${sid}"}',false)`);
 const delivery=async id=>{await db.exec('reset role');return(await db.query(`select public.konnekt_push_delivery('${id}') as value`)).rows[0].value;};
 try{
  await db.exec(await readFile('tests/fixtures/live-schema-2026-11-15.sql','utf8'));
  await db.exec(`alter table auth.users add column banned_until timestamptz;create function auth.jwt() returns jsonb language sql stable as $$select coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb$$;create table auth.mfa_factors(id uuid,user_id uuid,status text);create table auth.sessions(id uuid primary key,user_id uuid references auth.users(id) on delete cascade,not_after timestamptz,created_at timestamptz default now(),aal text default 'aal1');insert into auth.users(id) values('${A}'),('${B}'),('${C}');insert into profiles(id,username) values('${A}','fixture_a'),('${B}','fixture_b'),('${C}','fixture_c');insert into auth.sessions(id,user_id) values('${SA}','${A}'),('${SB}','${B}'),('${SC}','${C}')`);
  for(const file of(await readdir('supabase/migrations')).sort())await db.exec(await readFile('supabase/migrations/'+file,'utf8'));
  for(const file of ['staging-profile-and-function-grants.sql','staging-opt-in-mfa.sql','staging-account-deletion.sql'])await db.exec(await readFile('docs/release/'+file,'utf8'));
  const sql=await readFile('docs/release/staging-push-delivery.sql','utf8');await db.exec(sql);await db.exec(sql);
  await actor(A,SA);await assert.rejects(db.query(`select konnekt_register_push_session('${KEY}','${B}')`),/account changed/);
  await actor(A,SB);await assert.rejects(db.query(`select konnekt_register_push_session('${KEY}','${A}')`),/no longer active/);
  const aliases=[];
  for(const[id,sid]of[[A,SA],[B,SB],[C,SC]]){
   const deviceKey=id===A?KEY:id===B?OTHERKEY:'c'.repeat(64);
   await actor(id,sid);const x=(await db.query(`select konnekt_register_push_session('${deviceKey}','${id}') as value`)).rows[0].value;
   assert.equal(x.user_id,id);assert.match(x.external_id,/^ks_[a-f0-9]{64}$/);assert(!x.external_id.includes(id.replaceAll('-','')));aliases.push(x.external_id);
   assert.equal((await db.query(`select konnekt_register_push_session('${deviceKey}','${id}') as value`)).rows[0].value.external_id,x.external_id);
   await assert.rejects(db.query('select * from konnekt_private.push_sessions'),/permission denied/);
   await assert.rejects(db.query(`select konnekt_push_delivery('${A}')`),/permission denied/);
  }
  assert.equal(new Set(aliases).size,3);
  await db.exec(`reset role;insert into notifications(id,recipient_id,actor_id,type,body) values('${A}','${B}','${A}','message','PRIVATE BODY MUST NOT LEAVE DB')`);
  const event=await delivery(A);assert.deepEqual(event.aliases,[aliases[1]]);assert.equal(event.category,'messages');assert(!JSON.stringify(event).includes('PRIVATE BODY'));
  await db.exec(`update auth.sessions set created_at=now()-interval '2 minutes' where id='${SA}';update auth.sessions set created_at=now()-interval '1 minute' where id='${SB}';insert into notifications(id,recipient_id,actor_id,type,body) values('${C}','${A}','${B}','message','private fixture')`);
  assert.deepEqual((await delivery(C)).aliases,[aliases[0]]);
  await actor(B,SB);await db.query(`select konnekt_register_push_session('${KEY}','${B}')`);
  assert.deepEqual((await delivery(C)).aliases,[],'Account switch retires old push even while its Auth session remains active');
  await actor(A,SA);await assert.rejects(db.query(`select konnekt_register_push_session('${KEY}','${A}')`),/newer sign-in/);
  await db.query(`select konnekt_unregister_push_session('${KEY}')`);
  assert.deepEqual((await delivery(A)).aliases,[aliases[1]],'A late logout cannot remove the new account target');
  await actor(B,SB);await db.query(`select konnekt_register_push_session('${OTHERKEY}','${B}',false,true,true,true)`);assert.deepEqual((await delivery(A)).aliases,[]);
  await actor(B,SB);await db.query(`select konnekt_register_push_session('${OTHERKEY}','${B}')`);
  await db.exec(`reset role;insert into user_blocks(blocker_id,blocked_id) values('${A}','${B}')`);assert.deepEqual((await delivery(A)).aliases,[]);await db.exec('delete from user_blocks');
  await db.exec(`update notifications set read_at=now() where id='${A}'`);assert.deepEqual((await delivery(A)).aliases,[]);await db.exec(`update notifications set read_at=null where id='${A}'`);
  await db.exec(`update auth.sessions set not_after=now()-interval '1 second' where id='${SB}'`);assert.deepEqual((await delivery(A)).aliases,[]);await actor(B,SB);await assert.rejects(db.query(`select konnekt_register_push_session('${KEY}','${B}')`),/no longer active/);await db.exec(`reset role;update auth.sessions set not_after=null where id='${SB}'`);
  await db.exec(`insert into auth.mfa_factors(user_id,status) values('${B}','verified')`);assert.deepEqual((await delivery(A)).aliases,[]);await actor(B,SB);await assert.rejects(db.query(`select konnekt_register_push_session('${KEY}','${B}')`),/Verify your sign-in/);
  await db.exec(`reset role;update auth.sessions set aal='aal2' where id='${SB}'`);assert.deepEqual((await delivery(A)).aliases,[aliases[1]]);
  await db.exec(`update auth.users set banned_until=now()+interval '1 day' where id='${B}'`);assert.deepEqual((await delivery(A)).aliases,[]);await db.exec(`update auth.users set banned_until=null where id='${B}'`);
  await db.exec(`insert into account_deletion_requests(user_id,status) values('${B}','processing')`);assert.deepEqual((await delivery(A)).aliases,[]);await db.exec('delete from account_deletion_requests');
  await db.exec(`update notifications set created_at=now()-interval '2 hours' where id='${A}'`);assert.deepEqual((await delivery(A)).aliases,[]);await db.exec(`update notifications set created_at=now() where id='${A}'`);
  await db.exec(`delete from auth.sessions where id='${SB}'`);assert.deepEqual((await delivery(A)).aliases,[]);await actor(B,SB,'aal2');await assert.rejects(db.query(`select konnekt_register_push_session('${KEY}','${B}')`),/no longer active/);
  await db.exec('reset role');assert.equal((await db.query(`select count(*)::int as n from konnekt_private.push_sessions where session_id='${SB}'`)).rows[0].n,0);
  await db.exec(`set role anon`);await assert.rejects(db.query(`select konnekt_register_push_session('${KEY}','${A}')`),/permission denied/);
 }finally{await db.close();}
});

test('incoming call creates generic activity and late or ended calls cannot ring through push',async()=>{
 const db=new PGlite();try{
  await db.exec(await readFile('tests/fixtures/live-schema-2026-11-15.sql','utf8'));
  await db.exec(`alter table auth.users add column banned_until timestamptz;create schema konnekt_private;create table auth.sessions(id uuid primary key,user_id uuid,not_after timestamptz,created_at timestamptz default now(),aal text);create table auth.mfa_factors(user_id uuid,status text);create function auth.jwt() returns jsonb language sql as $$select '{}'::jsonb$$;create function konnekt_private.session_allowed() returns boolean language sql as $$select true$$`);
  for(const file of(await readdir('supabase/migrations')).sort())await db.exec(await readFile('supabase/migrations/'+file,'utf8'));
  await db.exec(await readFile('docs/release/staging-push-delivery.sql','utf8'));
  await db.exec(`insert into auth.users(id) values('${A}'),('${B}');insert into auth.sessions(id,user_id,aal) values('${SB}','${B}','aal1');insert into konnekt_private.push_sessions(session_id,user_id,device_key) values('${SB}','${B}','${OTHERKEY}');insert into call_sessions(id,caller_id,callee_id,call_type) values('${A}','${A}','${B}','voice')`);
  const notification=(await db.query(`select id,type,body from notifications where reference_id='${A}'`)).rows[0];assert.equal(notification.type,'call');assert.equal(notification.body,'Incoming KONNEKT call.');
  let result=(await db.query(`select konnekt_push_delivery('${notification.id}') as x`)).rows[0].x;assert.equal(result.aliases.length,1);assert(result.ttl<=45&&result.ttl>0);
  await db.exec(`update call_sessions set status='ended' where id='${A}'`);assert.deepEqual((await db.query(`select konnekt_push_delivery('${notification.id}') as x`)).rows[0].x.aliases,[]);
  await db.exec(`update call_sessions set status='ringing',created_at=now()-interval '1 minute' where id='${A}'`);assert.deepEqual((await db.query(`select konnekt_push_delivery('${notification.id}') as x`)).rows[0].x.aliases,[]);
  await db.exec(`insert into conversations(id,created_by,is_group) values('${C}','${A}',true);insert into conversation_members(conversation_id,user_id) values('${C}','${A}'),('${C}','${B}');insert into group_call_sessions(id,conversation_id,created_by,call_type,status) values('${C}','${C}','${A}','voice','active');insert into group_call_participants(call_id,user_id,status) values('${C}','${A}','invited'),('${C}','${B}','invited')`);
  const group=(await db.query(`select id from notifications where type='group_call' and reference_id='${C}'`)).rows;assert.equal(group.length,1);
  assert.equal((await db.query(`select konnekt_push_delivery('${group[0].id}') as x`)).rows[0].x.aliases.length,1);
  await db.exec(`update group_call_participants set status='joined' where call_id='${C}' and user_id='${B}'`);
  assert.deepEqual((await db.query(`select konnekt_push_delivery('${group[0].id}') as x`)).rows[0].x.aliases,[]);

 }finally{await db.close();}
});
