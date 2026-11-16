import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { PUBLIC_PROFILE_FIELDS } from '../src/services/profileFields.js';
const A='11111111-1111-4111-8111-111111111111',B='22222222-2222-4222-8222-222222222222';
test('staging grant repairs protect phones and anonymous RPCs while preserving actual authenticated calls', async () => {
  const db=new PGlite();
  const sql=await readFile('docs/release/staging-profile-and-function-grants.sql','utf8');
  const actor=async id=>db.exec(`reset role;set role authenticated;select set_config('request.jwt.claim.sub','${id}',false);`);
  try {
    await db.exec(await readFile('tests/fixtures/live-schema-2026-11-15.sql','utf8'));
    await db.exec(`insert into auth.users(id) values('${A}'),('${B}');insert into profiles(id,username,full_name,phone) values('${A}','fixture_a','A','private-fixture'),('${B}','fixture_b','B',null);`);
    for(const name of (await readdir('supabase/migrations')).sort())await db.exec(await readFile('supabase/migrations/'+name,'utf8'));
    await actor(B);
    assert.equal((await db.query('select phone from profiles')).rows.length,2,'baseline exposure reproduced');
    await db.exec('reset role');await db.exec(sql);await db.exec(sql);
    await actor(B);
    await assert.rejects(db.query('select phone from profiles'),/permission denied/);
    await assert.rejects(db.query('select * from profiles'),/permission denied/);
    assert.equal((await db.query('select '+PUBLIC_PROFILE_FIELDS+' from profiles')).rows.length,2);
    await db.exec(`update profiles set bio='fixture bio' where id='${B}'`);
    assert.equal((await db.query(`select bio from profiles where id='${B}'`)).rows[0].bio,'fixture bio');
    const {rows:[{id:direct}]}=await db.query("select konnekt_start_direct_conversation('fixture_a') as id");
    assert.equal((await db.query(`select is_konnekt_conversation_member('${direct}') as ok`)).rows[0].ok,true);
    assert.equal((await db.query(`select create_direct_conversation('${A}') as id`)).rows[0].id,direct);
    const {rows:[{id:group}]}=await db.query(`select konnekt_create_group_conversation('Fixture','description',array['${A}'::uuid]) as id`);
    assert.equal((await db.query(`select is_konnekt_conversation_creator('${group}') as ok`)).rows[0].ok,true);
    assert.equal((await db.query(`select konnekt_is_blocked_pair('${A}') as blocked`)).rows[0].blocked,false);
    assert.equal((await db.query('select is_konnekt_moderator() as ok')).rows[0].ok,false);
    assert.equal((await db.query(`select konnekt_can_view_reel('${A}') as ok`)).rows[0].ok,false);
    await db.exec(`insert into messages(conversation_id,sender_id,body) values('${group}','${B}','fixture encrypted payload')`);
    await db.exec('reset role');
    assert.equal((await db.query(`select phone from profiles where id='${A}'`)).rows[0].phone,'private-fixture','private data preserved');
    const functions=['create_direct_conversation(uuid)','is_konnekt_conversation_creator(uuid)','is_konnekt_conversation_member(uuid)','is_konnekt_moderator()','konnekt_can_view_reel(uuid)','konnekt_create_group_conversation(text,text,uuid[])','konnekt_is_blocked_pair(uuid)','konnekt_start_direct_conversation(text)'];
    for(const signature of functions) {
      const {rows:[row]}=await db.query(`select has_function_privilege('anon','public.${signature}','EXECUTE') as anon,has_function_privilege('authenticated','public.${signature}','EXECUTE') as member`);
      assert.equal(row.anon,false);assert.equal(row.member,true);
    }
    await db.exec(await readFile('docs/release/staging-unused-direct-rpc.sql','utf8'));
    await db.exec(await readFile('docs/release/staging-unused-direct-rpc.sql','utf8'));
    await actor(B);
    await assert.rejects(db.query(`select create_direct_conversation('${A}')`),/permission denied/);
    assert.equal((await db.query("select konnekt_start_direct_conversation('fixture_a') as id")).rows[0].id,direct);
    const newGroup=await db.query(`select konnekt_create_group_conversation('After revoke','',array['${A}'::uuid]) as id`);
    assert(newGroup.rows[0].id);
  } finally {await db.close();}
});
