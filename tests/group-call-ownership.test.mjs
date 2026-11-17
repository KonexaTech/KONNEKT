import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
const A='11111111-1111-4111-8111-111111111111',B='22222222-2222-4222-8222-222222222222',CALL='33333333-3333-4333-8333-333333333333';
test('a permissive member update cannot bypass host-only group session changes; reads and own participant decline remain usable',async()=>{
 const db=new PGlite();
 try{
  await db.exec(`create role authenticated;create role service_role bypassrls;create schema auth;
   create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
   grant usage on schema auth to authenticated,service_role;grant execute on function auth.uid() to authenticated,service_role;
   create table public.group_call_sessions(id uuid primary key,created_by uuid,status text,ended_at timestamptz);
   create table public.group_call_participants(call_id uuid,user_id uuid,status text);
   alter table group_call_sessions enable row level security;alter table group_call_participants enable row level security;
   grant select,update on group_call_sessions,group_call_participants to authenticated,service_role;
   create policy member_read on group_call_sessions for select to authenticated using(true);
   create policy legacy_member_update on group_call_sessions for update to authenticated using(true) with check(true);
   create policy participant_read on group_call_participants for select to authenticated using(true);
   create policy own_status on group_call_participants for update to authenticated using(user_id=auth.uid()) with check(user_id=auth.uid());
   insert into group_call_sessions values('${CALL}','${A}','active',null);
   insert into group_call_participants values('${CALL}','${B}','invited');
   set role authenticated;select set_config('request.jwt.claim.sub','${B}',false);`);
  assert.equal((await db.query(`update group_call_sessions set status='ended' where id='${CALL}' returning id`)).rows.length,1,'Reproduce the old member privilege');
  await db.exec(`reset role;update group_call_sessions set status='active';`);
  const sql=await readFile(new URL('../docs/release/staging-group-call-ownership.sql',import.meta.url),'utf8');await db.exec(sql);await db.exec(sql);
  await db.exec(`set role authenticated;select set_config('request.jwt.claim.sub','${B}',false);`);
  assert.equal((await db.query(`update group_call_sessions set status='ended' where id='${CALL}' returning id`)).rows.length,0);
  assert.equal((await db.query(`update group_call_sessions set created_by='${B}' where id='${CALL}' returning id`)).rows.length,0);
  assert.equal((await db.query(`select status from group_call_sessions where id='${CALL}'`)).rows[0].status,'active');
  assert.equal((await db.query(`update group_call_participants set status='declined' where call_id='${CALL}' and user_id='${B}' returning status`)).rows[0].status,'declined');
  await db.exec(`select set_config('request.jwt.claim.sub','${A}',false);`);
  await assert.rejects(db.query(`update group_call_sessions set created_by='${B}' where id='${CALL}'`),/row-level security/);
  assert.equal((await db.query(`update group_call_sessions set status='ended',ended_at=now() where id='${CALL}' returning id`)).rows.length,1);
  await db.exec(`select set_config('request.jwt.claim.sub','${B}',false);`);assert.equal((await db.query(`select status from group_call_sessions where id='${CALL}'`)).rows[0].status,'ended');
  await db.exec(`reset role;set role service_role;`);assert.equal((await db.query(`update group_call_sessions set status='active' returning id`)).rows.length,1);
 }finally{await db.close();}
});
