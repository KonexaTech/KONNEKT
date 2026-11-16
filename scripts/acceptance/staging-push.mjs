import {mkdir,writeFile} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import assert from 'node:assert/strict';
import {stagingSession,feature,login,moduleUrl} from './staging-session.mjs';
const file=process.env.KONNEKT_ACCEPTANCE_CONFIG,report={runId:randomUUID(),project:'konnekt-staging',decision:'NOT_RUN',checks:[]};
let session,isolated,phase='sessions';const pass=check=>{report.checks.push({check,result:'PASS'});console.log('PASS '+check);};
async function register(page,id){return page.evaluate(async({moduleUrl,id})=>{
 const{resolvePushIdentity}=await import('/KONNEKT/src/services/pushRegistration.js');const{supabase}=await import(moduleUrl);
 const alias=await resolvePushIdentity({client:supabase,userId:id});window.__qaAlias=alias;
 return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(alias))),x=>x.toString(16).padStart(2,'0')).join('');
},{moduleUrl,id});}
async function send(page,recipientId){return page.evaluate(async({moduleUrl,recipientId,label})=>{
 const{supabase}=await import(moduleUrl);const{createDirectConversation}=await import('/KONNEKT/src/services/social.js');const e=await import('/KONNEKT/src/konnektEncryption.js');
 const user=(await supabase.auth.getUser()).data.user;
 const p=await supabase.from('profiles').select('encryption_public_key').eq('id',recipientId).single();if(p.error)throw p.error;
 const conversationId=await createDirectConversation(user.id,recipientId);
 const encrypted=await e.encryptKonnektText({userId:user.id,otherPublicKey:p.data.encryption_public_key,text:label});
 const result=await supabase.from('messages').insert({conversation_id:conversationId,sender_id:user.id,...encrypted});if(result.error)throw result.error;
 return conversationId;
},{moduleUrl,recipientId,label:'TEST ACCEPTANCE push '+report.runId});}
try{
 session=await stagingSession(file);const[a,b,c]=session.pages,[pa,pb,pc]=session.profiles;
 phase='registration';const hashes=[];for(let i=0;i<3;i++)hashes.push(await register(session.pages[i],session.profiles[i].id));assert.equal(new Set(hashes).size,3);pass('three actual authenticated fixtures receive distinct opaque identities without public-ID login');
 phase='outsider-denial';const denial=await c.evaluate(async({moduleUrl,other})=>{
  const{supabase}=await import(moduleUrl),{installationKey}=await import('/KONNEKT/src/services/pushRegistration.js');
  const forged=await supabase.rpc('konnekt_register_push_session',{p_device_key:installationKey(localStorage),p_user_id:other});
  const targets=await supabase.rpc('konnekt_push_delivery',{notification_id:other});
  const rows=await supabase.schema('konnekt_private').from('push_sessions').select('external_id');
  const claim=await supabase.rpc('konnekt_claim_push_notifications',{});
  const finish=await supabase.rpc('konnekt_complete_push_notification',{p_notification_id:other,p_lease_token:other,p_result:'skipped'});
  const turn=await supabase.rpc('konnekt_authorize_turn',{p_user_id:other});
  return{forged:forged.error?.code,targets:targets.error?.code,private:rows.error?.code,claim:claim.error?.code,finish:finish.error?.code,turn:turn.data};
 },{moduleUrl,other:pa.id});assert.equal(denial.forged,'42501');assert.equal(denial.targets,'42501');assert.equal(denial.claim,'42501');assert.equal(denial.finish,'42501');assert.equal(denial.turn,false);assert(['PGRST106','42501'].includes(denial.private));pass('actual outsider cannot register another account, enumerate private identities or call server-only targeting');
 phase='turn-authorization';const ownTurn=await a.evaluate(async({moduleUrl,id})=>{const{supabase}=await import(moduleUrl);const r=await supabase.rpc('konnekt_authorize_turn',{p_user_id:id});if(r.error)throw r.error;return r.data;},{moduleUrl,id:pa.id});assert.equal(ownTurn,true);pass('actual TURN session authorization accepts its signed owner and rejects another account');
 phase='preferences';await feature(a,'Notification settings');const toggle=a.getByRole('switch',{name:'Messages',exact:true});if(await toggle.isChecked())await toggle.uncheck();await a.getByText('Save notification settings',{exact:true}).click();await a.getByRole('alertdialog',{name:'Settings saved',exact:true}).getByRole('button',{name:'OK',exact:true}).click();assert.equal(await register(a,pa.id),hashes[0]);pass('actual settings UI stores an account-scoped opt-out and sync preserves its identity');
 phase='actual-notification-records';const toA=await send(c,pa.id),toB=await send(a,pb.id);
 const lookup=async(page,actor,conversationId)=>page.evaluate(async({moduleUrl,actor,conversationId})=>{const{supabase}=await import(moduleUrl);const r=await supabase.from('notifications').select('id,type,body,read_at').eq('actor_id',actor).eq('reference_id',conversationId).eq('type','message').order('created_at',{ascending:false}).limit(1).single();if(r.error)throw r.error;if(r.data.read_at||r.data.body!=='You received a new message.')throw Error('Invalid unread activity');return r.data.id;},{moduleUrl,actor,conversationId});
 report.probes={optedOutNotification:await lookup(a,pc.id,toA),activeNotification:await lookup(b,pa.id,toB)};pass('real encrypted messages create generic unread notifications for server target probes');
 phase='isolated-switch';isolated=await session.open(file+'.push.local/isolated-'+report.runId);await login(isolated,session.config.accounts[0]);await isolated.getByRole('tab',{name:'Profile',exact:true}).waitFor();await register(isolated,pa.id);
 await isolated.evaluate(async moduleUrl=>{const{supabase}=await import(moduleUrl);const session=(await supabase.auth.getSession()).data.session;window.__qaOldToken=session.access_token;window.__qaOldSession=JSON.parse(atob(session.access_token.split('.')[1].replace(/-/g,'+').replace(/_/g,'/'))).session_id;},moduleUrl);
 await isolated.evaluate(async({moduleUrl,account})=>{const{supabase}=await import(moduleUrl);const r=await supabase.auth.signInWithPassword({email:account.email,password:account.password});if(r.error)throw r.error;},{moduleUrl,account:session.config.accounts[1]});
 const changedHash=await register(isolated,pb.id);const check=await isolated.evaluate(async({moduleUrl,oldUserId})=>{
  const{SUPABASE_URL,SUPABASE_PUBLISHABLE_KEY,supabase}=await import(moduleUrl);const{installationKey,readPushPreferences}=await import('/KONNEKT/src/services/pushRegistration.js');const key=installationKey(localStorage);
  const headers={apikey:SUPABASE_PUBLISHABLE_KEY,Authorization:'Bearer '+window.__qaOldToken,'Content-Type':'application/json'};
  const old=await fetch(SUPABASE_URL+'/rest/v1/rpc/konnekt_register_push_session',{method:'POST',headers,body:JSON.stringify({p_device_key:key,p_user_id:oldUserId})});
  const error=await old.json();
  const clean=await fetch(SUPABASE_URL+'/rest/v1/rpc/konnekt_unregister_push_session',{method:'POST',headers,body:JSON.stringify({p_device_key:key})});if(!clean.ok)throw Error('Old registration cleanup failed');
  const current=(await supabase.auth.getSession()).data.session;const currentSid=JSON.parse(atob(current.access_token.split('.')[1].replace(/-/g,'+').replace(/_/g,'/'))).session_id;
  return{status:old.status,code:error.code,oldSession:window.__qaOldSession,currentSession:currentSid,messages:readPushPreferences(localStorage,current.user.id).messages};
 },{moduleUrl,oldUserId:pa.id});assert.equal(check.status,403);assert.equal(check.code,'42501');assert.equal(check.messages,true);assert.equal(await register(isolated,pb.id),changedHash);pass('actual newer account switch rejects the stale JWT registration and a late old-account cleanup cannot remove the new target');
 phase='logout';await isolated.evaluate(async moduleUrl=>{const{supabase}=await import(moduleUrl);const r=await supabase.auth.signOut({scope:'local'});if(r.error)throw r.error;const{SUPABASE_URL,SUPABASE_PUBLISHABLE_KEY}=await import(moduleUrl);const r2=await fetch(SUPABASE_URL+'/auth/v1/logout?scope=local',{method:'POST',headers:{apikey:SUPABASE_PUBLISHABLE_KEY,Authorization:'Bearer '+window.__qaOldToken}});if(!r2.ok)throw Error('Fixture old session logout failed');},moduleUrl);
 report.probes.revokedSessionIds=[check.oldSession,check.currentSession];const revokedTurn=await isolated.evaluate(async({moduleUrl,id})=>{const{SUPABASE_URL,SUPABASE_PUBLISHABLE_KEY}=await import(moduleUrl);const r=await fetch(SUPABASE_URL+'/rest/v1/rpc/konnekt_authorize_turn',{method:'POST',headers:{apikey:SUPABASE_PUBLISHABLE_KEY,Authorization:'Bearer '+window.__qaOldToken,'Content-Type':'application/json'},body:JSON.stringify({p_user_id:id})});if(!r.ok)throw Error('Revoked TURN probe failed');return r.json();},{moduleUrl,id:pa.id});assert.equal(revokedTurn,false);pass('both isolated fixture sessions are signed out and the genuine old JWT cannot authorize fresh TURN credentials');
 assert.equal(session.violations.length,0);report.decision='PASS_SCOPED_PUSH_REGISTRATION_ONLY';
}catch{report.failedPhase=phase;report.decision='FAIL_OR_BLOCKED';process.exitCode=1;console.error('FAIL_OR_BLOCKED: '+phase);}
finally{if(isolated&&report.decision!=='PASS_SCOPED_PUSH_REGISTRATION_ONLY'){try{await isolated.evaluate(async moduleUrl=>{const{supabase,SUPABASE_URL,SUPABASE_PUBLISHABLE_KEY}=await import(moduleUrl);await supabase.auth.signOut({scope:'local'});if(window.__qaOldToken)await fetch(SUPABASE_URL+'/auth/v1/logout?scope=local',{method:'POST',headers:{apikey:SUPABASE_PUBLISHABLE_KEY,Authorization:'Bearer '+window.__qaOldToken}});},moduleUrl);report.isolatedSessionCleanup=true;}catch{report.isolatedSessionCleanup=false;}}await session?.close();if(file){await mkdir(file+'.push.local',{recursive:true,mode:0o700});await writeFile(file+'.push.local/report.json',JSON.stringify(report,null,2),{mode:0o600});}console.log('Sanitized push registration report saved; no provider delivery acceptance claimed.');}
