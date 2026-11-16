import assert from 'node:assert/strict';
import { readFile,writeFile,mkdir } from 'node:fs/promises';
import { createHash,randomUUID } from 'node:crypto';
import { stagingSession,direct,tab,feature,moduleUrl } from './staging-session.mjs';
const file=process.env.KONNEKT_ACCEPTANCE_CONFIG;
const report={runId:randomUUID(),decision:'NOT_RUN',checks:[]};
const pass=check=>{report.checks.push({check,result:'PASS'});console.log('PASS '+check);};
let session,phase='start',blocked=false;
async function row(page,payload){
 return page.evaluate(async({moduleUrl,payload})=>{
  const {supabase}=await import(moduleUrl);const r=await supabase.from('messages').select('id').eq('conversation_id',payload.conversation_id).eq('body',payload.body);if(r.error)throw r.error;if(r.data.length!==1)throw Error('Absent/duplicate write');return r.data[0].id;
 },{moduleUrl,payload});
}
async function receive(page,id,kind,expected){
 const media=page.getByTestId('message-'+id).locator(kind);await media.waitFor();
 await media.evaluate(async(el,expected)=>{
  if(!el.src.startsWith('blob:'))throw Error('Media was not locally decrypted');
  const b=await(await fetch(el.src)).arrayBuffer();const hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',b)),x=>x.toString(16).padStart(2,'0')).join('');if(hash!==expected)throw Error('Decrypted byte mismatch');
  el.muted=true;await el.play();
 },expected);
 await page.waitForFunction(id=>{const e=document.querySelector(`[data-testid="message-${id}"] audio,[data-testid="message-${id}"] video`);return !!e&&e.currentTime>0.1;},id);
 await media.evaluate(el=>el.pause());
}
async function deny(page,path){
 const r=await page.evaluate(async({moduleUrl,path})=>{
  const {supabase}=await import(moduleUrl);const u=await supabase.auth.getUser();if(u.error||!u.data.user)throw Error('No authenticated outsider');
  const a=await supabase.storage.from('konnekt-chat-media').download(path),b=await supabase.storage.from('konnekt-chat-media').createSignedUrl(path,60);
  return{read:!!a.data,signed:!!b.data?.signedUrl,a:Number(a.error?.status||a.error?.statusCode),b:Number(b.error?.status||b.error?.statusCode)};
 },{moduleUrl,path});assert.equal(r.read,false);assert.equal(r.signed,false);assert([400,403,404].includes(r.a));assert([400,403,404].includes(r.b));
}
try{
 session=await stagingSession(file);const [a,b,c]=session.pages,[pa,pb]=session.profiles;
 const directId=await direct(a,pb.username);assert.equal(await direct(b,pa.username),directId);
 const prior=JSON.parse(await readFile(file+'.artifacts.local/report.json','utf8'));assert.equal(prior.decision,'PASS_SCOPED_MESSAGING_ONLY');
 const groups=await a.evaluate(async({moduleUrl,id})=>{const {supabase}=await import(moduleUrl);const r=await supabase.from('conversations').select('id,title').eq('id',id).single();if(r.error)throw r.error;return r.data;},{moduleUrl,id:prior.groupId});
 const video=await readFile(new URL('../../tests/fixtures/social-video.webm',import.meta.url));
 for(const scope of ['direct','group']){
  if(scope==='group')for(const p of [a,b]){await tab(p,'Chats');await p.getByText(groups.title,{exact:true}).click();await p.getByPlaceholder('Message securely…').waitFor();}
  const conversationId=scope==='direct'?directId:groups.id;
  for(const [sender,recipient,direction] of [[a,b,'A to B'],[b,a,'B to A']]){
   phase=scope+' voice '+direction;
   await sender.evaluate(()=>{
    const original=URL.createObjectURL.bind(URL);URL.createObjectURL=blob=>{const url=original(blob);if(blob.type.startsWith('audio/'))window.__voiceSource=blob;return url;};
    navigator.mediaDevices.getUserMedia=async()=>{const ctx=new AudioContext(),osc=ctx.createOscillator(),dest=ctx.createMediaStreamDestination();osc.connect(dest);osc.start();window.__tone={ctx,osc,stream:dest.stream};return dest.stream;};
   });
   await sender.getByRole('button',{name:'Record voice note',exact:true}).click();await sender.getByText('Start recording',{exact:true}).click();
   await sender.getByText('Stop recording',{exact:true}).waitFor();await sender.waitForTimeout(1200);await sender.getByText('Stop recording',{exact:true}).click();await sender.getByText('Send voice note',{exact:true}).waitFor();
   const expected=await sender.evaluate(async()=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',await window.__voiceSource.arrayBuffer())),x=>x.toString(16).padStart(2,'0')).join(''));
   const response=sender.waitForResponse(r=>r.url().includes('/rest/v1/messages')&&r.request().method()==='POST');await sender.getByText('Send voice note',{exact:true}).click();const written=await response;assert(written.ok());const payload=written.request().postDataJSON();assert.equal(payload.conversation_id,conversationId);assert.equal(payload.is_encrypted,true);assert.equal(payload.media_encrypted,true);
   await sender.getByRole('alertdialog',{name:'Voice note sent',exact:true}).getByRole('button',{name:'OK',exact:true}).click();
   const id=await row(sender,payload);await receive(recipient,id,'audio',expected);await deny(c,payload.media_path);
   assert(await sender.evaluate(async()=>{const ended=window.__tone.stream.getTracks().every(t=>t.readyState==='ended');window.__tone.osc.stop();await window.__tone.ctx.close();return ended;}));
   pass(scope+' encrypted synthetic voice note '+direction+': remote bytes and playback, stopped recording tracks, outsider file denial');
   phase=scope+' video '+direction;const text='TEST ACCEPTANCE video '+report.runId+' '+scope+' '+direction;
   await sender.getByPlaceholder('Message securely…').fill(text);const chooser=sender.waitForEvent('filechooser');await sender.getByRole('button',{name:'Attach media',exact:true}).click();const response2=sender.waitForResponse(r=>r.url().includes('/rest/v1/messages')&&r.request().method()==='POST');await(await chooser).setFiles({name:'test-acceptance.webm',mimeType:'video/webm',buffer:video});const written2=await response2;assert(written2.ok());const payload2=written2.request().postDataJSON();assert.equal(payload2.media_encrypted,true);assert.equal(payload2.is_encrypted,true);const id2=await row(sender,payload2);await receive(recipient,id2,'video',createHash('sha256').update(video).digest('hex'));await deny(c,payload2.media_path);pass(scope+' encrypted video attachment '+direction+': remote bytes and playback, outsider file denial');
  }
 }
 phase='block';await a.evaluate(async id=>{const s=await import('/KONNEKT/src/services/safety.js');await s.blockKonnektUser(id);},pb.id);blocked=true;
 const denial=await b.evaluate(async({moduleUrl,username,calleeId,conversationId})=>{
  const {supabase}=await import(moduleUrl);const rpc=await supabase.rpc('konnekt_start_direct_conversation',{target_username:username});
  const msg=await supabase.from('messages').insert({conversation_id:conversationId,sender_id:(await supabase.auth.getUser()).data.user.id,body:'TEST BLOCK DENIAL',is_encrypted:false});
  const call=await supabase.from('call_sessions').insert({caller_id:(await supabase.auth.getUser()).data.user.id,callee_id:calleeId,conversation_id:conversationId,call_type:'voice',status:'ringing'});
  return{rpc:rpc.error?.code,msg:msg.error?.code,call:call.error?.code};
 },{moduleUrl,username:pa.username,calleeId:pa.id,conversationId:directId});assert(['42501','P0001'].includes(denial.rpc));assert.equal(denial.msg,'42501');assert.equal(denial.call,'42501');pass('live blocking denies direct-conversation RPC, message insertion and call creation by the blocked account');
 phase='unblock';await feature(a,'Blocked contacts');await a.getByText('@'+pb.username,{exact:true}).waitFor();await a.getByText('Unblock',{exact:true}).click();await a.getByRole('alertdialog',{name:'Account unblocked',exact:true}).getByRole('button',{name:'OK',exact:true}).click();blocked=false;assert.equal(await direct(b,pa.username),directId);pass('UI unblock removes the block and legitimate direct-conversation creation works again');
 assert.equal(session.violations.length,0);report.decision='PASS_SCOPED_SYNTHETIC_MEDIA_AND_BLOCKING';
}catch(error){report.errorType=error.name;report.errorLocation=error.stack?.split('\n').find(line=>line.includes('staging-session.mjs')||line.includes('staging-media.mjs'))?.replace(/^.*(file:\/\/.*?:\d+:\d+).*$/,'$1');report.decision='FAIL_OR_BLOCKED';report.failedPhase=phase;process.exitCode=1;console.error('FAIL_OR_BLOCKED: '+phase);}
finally{
 if(blocked&&session)try{await session.pages[0].evaluate(async id=>{await(await import('/KONNEKT/src/services/safety.js')).unblockKonnektUser(id);},session.profiles[1].id);report.blockCleanup=true;}catch{report.blockCleanup=false;}
 await session?.close();if(file){await mkdir(file+'.media.local',{recursive:true,mode:0o700});await writeFile(file+'.media.local/report.json',JSON.stringify(report,null,2),{mode:0o600});}console.log('Sanitized media/blocking report saved beside private configuration.');
}
