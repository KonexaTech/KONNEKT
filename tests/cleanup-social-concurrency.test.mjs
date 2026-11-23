import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {readFile} from 'node:fs/promises';
import {randomBytes} from 'node:crypto';
import {setTimeout as delay} from 'node:timers/promises';
import {cleanupFixture,ACTOR as A,SESSION as S} from './cleanup-social-fixture.mjs';
const configured=process.env.KONNEKT_CLEANUP_TEST_DATABASE_URL;
function loopbackDatabase(value){
 const u=new URL(value);
 if(!['postgres:','postgresql:'].includes(u.protocol)||!['127.0.0.1','localhost','[::1]'].includes(u.hostname)||u.pathname!=='/konnekt_cleanup_test'||u.search||u.hash)throw Error('Cleanup concurrency tests require the dedicated loopback konnekt_cleanup_test database.');
 return value;
}
test('real PostgreSQL cleanup/publication locks serialize both race orders in isolated disposable schemas',{skip:!configured,timeout:45000},async()=>{
 const database=loopbackDatabase(configured),prefix='kc_'+randomBytes(6).toString('hex');
 const schemas={public:prefix+'_public',auth:prefix+'_auth',storage:prefix+'_storage',konnekt_private:prefix+'_private',konnekt_beta:prefix+'_beta'};
 const roles={anon:prefix+'_anon',authenticated:prefix+'_authenticated',service_role:prefix+'_service'};
 const children=new Set();
 function connection(application){
  const child=spawn('psql',['-X','-q','-A','-t','-v','ON_ERROR_STOP=1','--dbname',database],{env:{...process.env,PGAPPNAME:application,PGCONNECT_TIMEOUT:'5'},stdio:['pipe','pipe','pipe']});
  children.add(child);let stdout='',stderr='';child.stdout.on('data',chunk=>{stdout+=chunk;});child.stderr.on('data',chunk=>{stderr+=chunk;});
  const done=new Promise(resolve=>{child.on('error',()=>resolve({code:-1,stdout:'',stderr:'psql unavailable'}));child.on('close',code=>{children.delete(child);resolve({code,stdout,stderr});});});
  return{child,done,output:()=>stdout};
 }
 async function query(sql){const c=connection(prefix+'_control');c.child.stdin.end(sql);const result=await c.done;if(result.code!==0)throw Error('Isolated PostgreSQL query failed; no hosted targets are supported.');return result.stdout.trim();}
 function scoped(sql){
  sql=sql.replace(/\b(public|auth|storage|konnekt_private|konnekt_beta)\./g,(_,name)=>schemas[name]+'.');
  for(const[name,replacement]of Object.entries(schemas))sql=sql.replace(new RegExp('\\bCREATE SCHEMA '+name+';','g'),'CREATE SCHEMA '+replacement+';');
  sql=sql.replace(/SCHEMA public,auth\b/g,'SCHEMA '+schemas.public+','+schemas.auth);
  for(const[name,replacement]of Object.entries(roles))sql=sql.replace(new RegExp('\\b'+name+'\\b','g'),replacement);
  return sql;
 }
 async function held(sql,application){
  const c=connection(application);c.child.stdin.write('BEGIN;\n'+sql+'\n\\echo FIXTURE_LOCK_HELD\n');
  for(let i=0;i<150;i++){if(c.output().includes('FIXTURE_LOCK_HELD'))return c;await delay(50);}
  throw Error('Isolated fixture transaction did not acquire its lock.');
 }
 async function waiting(application){
  for(let i=0;i<50;i++){
   const state=await query("SELECT count(*) FROM pg_stat_activity WHERE application_name='"+application+"' AND wait_event_type='Lock' AND lower(wait_event)='advisory';");
   if(state==='1')return;await delay(25);
  }
  throw Error('Expected transaction-level advisory contention was not observed.');
 }
 const pub=schemas.public,auth=schemas.auth,storage=schemas.storage;
 const claims=JSON.stringify({sub:A,session_id:S,aal:'aal1',role:'authenticated'});
 const publish=path=>`SET ROLE ${roles.authenticated}; SELECT set_config('request.jwt.claim.sub','${A}',true),set_config('request.jwt.claims','${claims}',true); INSERT INTO ${pub}.reels(user_id,media_path,published_at) VALUES('${A}','${path}',now());`;
 const claim=path=>`SET ROLE ${roles.service_role}; SELECT ${pub}.konnekt_claim_social_cleanup('${A}','${S}','${path}')->>'claimed';`;
 try{
  const sessionGuard=await readFile(new URL('../docs/release/staging-active-session-authorization.sql',import.meta.url),'utf8');
  const proposal=await readFile(new URL('../docs/release/staging-social-media-cleanup.sql',import.meta.url),'utf8');
  await query('CREATE SCHEMA '+pub+';\n'+scoped(cleanupFixture()+sessionGuard+proposal));
  const first=`reels/${A}/publication-first.webm`,second=`reels/${A}/cleanup-first.webm`;
  await query(`INSERT INTO ${storage}.objects VALUES('konnekt-public-media','${first}','${A}','${A}'),('konnekt-public-media','${second}','${A}','${A}');`);
  const publisher=await held(publish(first),prefix+'_publication_first');
  const cleanup=connection(prefix+'_cleanup_waiter');cleanup.child.stdin.end(claim(first));
  await waiting(prefix+'_cleanup_waiter');publisher.child.stdin.end('COMMIT;\n');assert.equal((await publisher.done).code,0);
  const retained=await cleanup.done;assert.equal(retained.code,0);assert.equal(retained.stdout.trim(),'false','committed publication must retain its object');
  assert.equal(await query(`SELECT count(*) FROM ${storage}.objects WHERE name='${first}'`),'1');
  const cleaner=await held(claim(second),prefix+'_cleanup_first');
  const latePublisher=connection(prefix+'_publication_waiter');latePublisher.child.stdin.end('BEGIN;\n'+publish(second)+'\nCOMMIT;');
  await waiting(prefix+'_publication_waiter');cleaner.child.stdin.end('COMMIT;\n');assert.equal((await cleaner.done).code,0);
  const rejected=await latePublisher.done;assert.notEqual(rejected.code,0);assert.match(rejected.stderr,/This upload was retired/);
  assert.equal(await query(`SELECT count(*) FROM ${pub}.reels WHERE media_path='${second}'`),'0');
  assert.equal(await query(`SELECT count(*) FROM ${schemas.konnekt_private}.social_cleanup_claims WHERE object_path='${second}'`),'1');
 }finally{
  for(const child of children)child.kill('SIGTERM');
  await Promise.all([...children].map(child=>new Promise(resolve=>{child.once('close',resolve);setTimeout(resolve,1000).unref();})));
  await query(Object.values(schemas).map(name=>'DROP SCHEMA IF EXISTS '+name+' CASCADE;').join('\n')+'\n'+Object.values(roles).map(name=>'DROP ROLE IF EXISTS '+name+';').join('\n'));
 }
});
