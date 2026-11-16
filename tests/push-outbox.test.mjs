import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
const N='11111111-1111-4111-8111-111111111111',P='22222222-2222-4222-8222-222222222222';
async function fixture(){const db=new PGlite();await db.exec(`create role anon;create role authenticated;create role service_role;create schema konnekt_private;create table public.notifications(id uuid primary key);grant usage on schema public,konnekt_private to anon,authenticated,service_role`);const sql=await readFile('docs/release/staging-push-outbox.sql','utf8');await db.exec(sql);await db.exec(sql);return db;}
test('push outbox leases prevent duplicate claims; retries back off, stale completion cannot win, acceptance requires provider evidence',async()=>{
 const db=await fixture();try{
  await db.exec(`insert into notifications values('${N}')`);
  const claim=async()=> (await db.query(`select * from konnekt_claim_push_notifications('${N}',1)`)).rows;
  let rows=await claim();assert.equal(rows.length,1);const first=rows[0];assert.equal((await claim()).length,0);
  await assert.rejects(db.query(`select konnekt_complete_push_notification('${N}','${first.lease_token}','accepted')`),/Invalid push completion/);
  assert.equal((await db.query(`select konnekt_complete_push_notification('${N}','${first.lease_token}','retry') as ok`)).rows[0].ok,true);
  assert.equal((await claim()).length,0,'Backoff must be honored');
  await db.exec(`update konnekt_private.push_outbox set next_attempt_at=now()-interval '1 second'`);
  rows=await claim();assert.equal(rows.length,1);assert.notEqual(rows[0].lease_token,first.lease_token);
  assert.equal((await db.query(`select konnekt_complete_push_notification('${N}','${first.lease_token}','skipped') as ok`)).rows[0].ok,false);
  assert.equal((await db.query(`select konnekt_complete_push_notification('${N}','${rows[0].lease_token}','accepted','${P}') as ok`)).rows[0].ok,true);
  assert.equal((await claim()).length,0);assert.equal((await db.query('select status from konnekt_private.push_outbox')).rows[0].status,'accepted');
  await db.exec(`set role authenticated`);await assert.rejects(db.query('select * from konnekt_private.push_outbox'),/permission denied/);await assert.rejects(db.query('select * from konnekt_claim_push_notifications()'),/permission denied/);await assert.rejects(db.query(`select konnekt_complete_push_notification('${N}','${first.lease_token}','skipped')`),/permission denied/);
 }finally{await db.close();}
});
test('abandoned leases recover, retry exhaustion terminates, batches are bounded and notification deletion removes queue records',async()=>{
 const db=await fixture();try{
  await db.exec(`insert into notifications select gen_random_uuid() from generate_series(1,8)`);
  let rows=(await db.query('select * from konnekt_claim_push_notifications(NULL,1000)')).rows;assert.equal(rows.length,5);
  await db.exec(`update konnekt_private.push_outbox set lease_until=now()-interval '1 second',attempts=8 where notification_id='${rows[0].notification_id}'`);
  const recovered=(await db.query(`select * from konnekt_claim_push_notifications('${rows[0].notification_id}',1)`)).rows;assert.equal(recovered.length,0);
  assert.equal((await db.query(`select status from konnekt_private.push_outbox where notification_id='${rows[0].notification_id}'`)).rows[0].status,'failed');
  await db.exec(`update konnekt_private.push_outbox set lease_until=now()-interval '1 second' where notification_id='${rows[1].notification_id}'`);
  const next=(await db.query(`select * from konnekt_claim_push_notifications('${rows[1].notification_id}',1)`)).rows;assert.equal(next.length,1);assert.notEqual(next[0].lease_token,rows[1].lease_token);
  await db.exec('delete from notifications');assert.equal((await db.query('select * from konnekt_private.push_outbox')).rows.length,0);
 }finally{await db.close();}
});
