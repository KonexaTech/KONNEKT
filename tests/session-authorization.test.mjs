import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
const proposed=await readFile(new URL('../docs/release/staging-active-session-authorization.sql',import.meta.url),'utf8');
const captured=await readFile(new URL('../docs/release/staging-active-session-authorization.rollback.sql',import.meta.url),'utf8');
const user='11111111-1111-4111-8111-111111111111',other='22222222-2222-4222-8222-222222222222',session='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
async function fixture(){
 const db=new PGlite();
 await db.exec(`CREATE ROLE authenticated; CREATE SCHEMA auth; CREATE SCHEMA konnekt_private; CREATE SCHEMA konnekt_beta;
 CREATE TABLE auth.users(id uuid PRIMARY KEY); CREATE TABLE auth.sessions(id uuid PRIMARY KEY,user_id uuid,not_after timestamptz);
 CREATE TABLE auth.mfa_factors(user_id uuid,status text); CREATE TABLE account_deletion_requests(user_id uuid,status text);
 CREATE TABLE konnekt_beta.fixture_control(admitted boolean); INSERT INTO konnekt_beta.fixture_control VALUES(true);
 CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
 CREATE FUNCTION auth.jwt() RETURNS jsonb LANGUAGE sql STABLE AS $$SELECT current_setting('request.jwt.claims',true)::jsonb$$;
 CREATE FUNCTION konnekt_beta.admission_open() RETURNS boolean LANGUAGE sql STABLE AS $$SELECT admitted FROM konnekt_beta.fixture_control$$;
 CREATE TABLE fixture_private_backup(user_id uuid PRIMARY KEY); ALTER TABLE fixture_private_backup ENABLE ROW LEVEL SECURITY;
 INSERT INTO auth.users VALUES('${user}'),('${other}'); INSERT INTO auth.sessions VALUES('${session}','${user}',null); INSERT INTO fixture_private_backup VALUES('${user}');
 GRANT USAGE ON SCHEMA public,auth,konnekt_private TO authenticated; GRANT SELECT ON fixture_private_backup TO authenticated;`);
 await db.exec(captured);
 await db.exec('CREATE POLICY protected ON fixture_private_backup FOR SELECT TO authenticated USING(user_id=auth.uid() AND konnekt_private.session_allowed())');
 return db;
}
async function read(db,options={}){
 const {id=user,aal='aal1'}=options;const claims={aal};if(!('sid' in options))claims.session_id=session;else if(options.sid!==undefined)claims.session_id=options.sid;
 await db.query("SELECT set_config('request.jwt.claim.sub',$1,false),set_config('request.jwt.claims',$2,false)",[id,JSON.stringify(claims)]);
 await db.exec('SET ROLE authenticated');try{return (await db.query('SELECT user_id FROM fixture_private_backup')).rows.length;}finally{await db.exec('RESET ROLE');}
}
test('session policy reproduces revoked-token private access, then denies it while preserving live sessions',async()=>{
 const db=await fixture();try{
  assert.equal(await read(db),1);await db.exec('DELETE FROM auth.sessions');
  assert.equal(await read(db),1,'captured old guard lacks canonical session check');
  await db.exec(proposed);assert.equal(await read(db),0);
  await db.query('INSERT INTO auth.sessions(id,user_id) VALUES($1,$2)',[session,user]);assert.equal(await read(db),1);
 }finally{await db.close();}
});
test('session ownership, invalid/missing claims and session expiry fail closed',async()=>{
 const db=await fixture();try{await db.exec(proposed);
  for(const sid of [undefined,'invalid','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'])assert.equal(await read(db,{sid}),0);
  await db.query('UPDATE auth.sessions SET user_id=$1',[other]);assert.equal(await read(db),0);
  await db.query("UPDATE auth.sessions SET user_id=$1,not_after=now()-interval '1 second'",[user]);assert.equal(await read(db),0);
  await db.exec("UPDATE auth.sessions SET not_after=now()+interval '1 hour'");assert.equal(await read(db),1);
 }finally{await db.close();}
});
test('active-session check retains independent MFA, beta, deletion and Auth-user gates',async()=>{
 const db=await fixture();try{await db.exec(proposed);
  await db.query("INSERT INTO auth.mfa_factors VALUES($1,'verified')",[user]);assert.equal(await read(db),0);assert.equal(await read(db,{aal:'aal2'}),1);
  await db.exec('UPDATE konnekt_beta.fixture_control SET admitted=false');assert.equal(await read(db,{aal:'aal2'}),0);
  await db.exec('UPDATE konnekt_beta.fixture_control SET admitted=true');
  await db.query("INSERT INTO account_deletion_requests VALUES($1,'processing')",[user]);assert.equal(await read(db,{aal:'aal2'}),0);
  await db.exec("UPDATE account_deletion_requests SET status='completed'");assert.equal(await read(db,{aal:'aal2'}),0);
  await db.exec("UPDATE account_deletion_requests SET status='requested'");assert.equal(await read(db,{aal:'aal2'}),1);
  await db.exec('DELETE FROM auth.users');assert.equal(await read(db,{aal:'aal2'}),0);
 }finally{await db.close();}
});
