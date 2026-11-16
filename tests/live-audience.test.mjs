import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile,readdir } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
const A='11111111-1111-4111-8111-111111111111',B='22222222-2222-4222-8222-222222222222';
test('restricted live rooms and their comments are owner-only; public room callers remain supported',async()=>{
 const db=new PGlite();try{
  await db.exec(await readFile('tests/fixtures/live-schema-2026-11-15.sql','utf8'));
  for(const file of(await readdir('supabase/migrations')).sort())await db.exec(await readFile('supabase/migrations/'+file,'utf8'));
  await db.exec(`insert into auth.users(id) values('${A}'),('${B}');insert into profiles(id,username) values('${A}','fixture_a'),('${B}','fixture_b');`);
  const {rows:[{id:privateId}]}=await db.query(`insert into live_streams(host_id,title,audience,status) values('${A}','Legacy private','Private','live') returning id`);
  await db.exec(`insert into live_stream_comments(stream_id,user_id,body) values('${privateId}','${A}','private fixture')`);
  const sql=await readFile('docs/release/staging-live-room-audience.sql','utf8');await db.exec(sql);await db.exec(sql);
  await db.exec(`set role authenticated;select set_config('request.jwt.claim.sub','${B}',false)`);
  assert.equal((await db.query('select id from live_streams')).rows.length,0);assert.equal((await db.query('select body from live_stream_comments')).rows.length,0);
  await assert.rejects(db.query(`insert into live_stream_comments(stream_id,user_id,body) values('${privateId}','${B}','denied')`),/row-level security/);
  await assert.rejects(db.query(`insert into live_streams(host_id,title,audience) values('${B}','Denied','Private')`),/row-level security/);
  const {rows:[{id:publicId}]}=await db.query(`insert into live_streams(host_id,title,audience,status) values('${B}','Public fixture','Everyone','live') returning id`);
  await db.exec(`reset role;set role authenticated;select set_config('request.jwt.claim.sub','${A}',false)`);
  assert.equal((await db.query('select id from live_streams')).rows.length,2,'owner sees own private and public room');
  await db.exec(`insert into live_stream_comments(stream_id,user_id,body) values('${publicId}','${A}','allowed public fixture')`);
  assert.equal((await db.query(`select body from live_stream_comments where stream_id='${publicId}'`)).rows.length,1);
 }finally{await db.close();}
});
