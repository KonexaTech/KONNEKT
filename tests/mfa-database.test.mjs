import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile,readdir } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
const A='11111111-1111-4111-8111-111111111111',B='22222222-2222-4222-8222-222222222222';
test('optional MFA denies enrolled AAL1 across RLS, storage, helpers and definer RPCs; AAL2 and unenrolled users retain access',async()=>{
 const db=new PGlite();
 const actor=async(id,aal)=>db.exec(`reset role;set role authenticated;select set_config('request.jwt.claim.sub','${id}',false);select set_config('request.jwt.claims','{"aal":"${aal}"}',false);`);
 try{
  await db.exec(await readFile('tests/fixtures/live-schema-2026-11-15.sql','utf8'));
  await db.exec(`create function auth.jwt() returns jsonb language sql stable as $$select coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb$$;create table auth.mfa_factors(id uuid,user_id uuid,status text);insert into auth.users(id) values('${A}'),('${B}');insert into profiles(id,username,full_name) values('${A}','fixture_a','A'),('${B}','fixture_b','B');`);
  for(const file of (await readdir('supabase/migrations')).sort())await db.exec(await readFile('supabase/migrations/'+file,'utf8'));
  await db.exec(await readFile('docs/release/staging-profile-and-function-grants.sql','utf8'));
  const sql=await readFile('docs/release/staging-opt-in-mfa.sql','utf8');await db.exec(sql);await db.exec(sql);
  await actor(A,'aal1');
  const {rows:[{id:chat}]}=await db.query("select konnekt_start_direct_conversation('fixture_b') as id");
  await db.exec(`insert into messages(conversation_id,sender_id,body) values('${chat}','${A}','ciphertext');insert into storage.objects(bucket_id,name) values('konnekt-chat-media','${chat}/${A}/file.enc')`);
  await db.exec(`reset role;insert into auth.mfa_factors values('${A}','${B}','unverified')`);
  await actor(B,'aal1');assert.equal((await db.query('select id from messages')).rows.length,1,'unfinished factor must not lock account');
  await db.exec(`reset role;update auth.mfa_factors set status='verified'`);
  await actor(B,'aal1');
  assert.equal((await db.query('select id from messages')).rows.length,0);
  assert.equal((await db.query('select name from storage.objects')).rows.length,0);
  assert.equal((await db.query('select id from profiles')).rows.length,0);
  assert.equal((await db.query(`select is_konnekt_conversation_member('${chat}') as ok`)).rows[0].ok,false);
  for(const sql of [`select konnekt_start_direct_conversation('fixture_a')`,`select create_direct_conversation('${A}')`,`select konnekt_create_group_conversation('Fixture','',array['${A}'::uuid])`,`insert into messages(conversation_id,sender_id,body) values('${chat}','${B}','bad')`])await assert.rejects(db.query(sql),/authenticator|row-level security/);
  await assert.rejects(db.query("select konnekt_private.original_konnekt_start_direct_conversation('fixture_a')"),/permission denied/);
  await actor(B,'aal2');
  assert.equal((await db.query('select id from messages')).rows.length,1);
  assert.equal((await db.query('select name from storage.objects')).rows.length,1);
  assert.equal((await db.query(`select is_konnekt_conversation_member('${chat}') as ok`)).rows[0].ok,true);
  assert.equal((await db.query("select konnekt_start_direct_conversation('fixture_a') as id")).rows[0].id,chat);
  assert.equal((await db.query(`select create_direct_conversation('${A}') as id`)).rows[0].id,chat);
  const {rows:[{id:group}]}=await db.query(`select konnekt_create_group_conversation('Fixture','',array['${A}'::uuid]) as id`);
  await db.exec(`insert into messages(conversation_id,sender_id,body) values('${group}','${B}','allowed')`);
  await actor(A,'aal1');assert.equal((await db.query('select id from messages')).rows.length,2,'unenrolled A retains membership access');
  await db.exec(`reset role;delete from auth.mfa_factors`);await actor(B,'aal1');assert.equal((await db.query('select id from messages')).rows.length,2,'unenrollment restores AAL1 access');
 }finally{await db.close();}
});
