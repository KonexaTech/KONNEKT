import { after,before,test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { startServer,setup,ME,OTHER,CHAT } from './helpers.mjs';
let server;
before(async()=>{server=await startServer();});after(()=>server?.stop());

test('sent, delivered and read receipts have distinct accessible states and read ticks are visibly highlighted',async()=>{
 const id='77777777-7777-4777-8777-777777777777';
 for(const [label,delivered_at,read_at] of [['Message sent',null,null],['Message delivered','2026-11-16T00:00:00Z',null],['Message read','2026-11-16T00:00:00Z','2026-11-16T00:00:01Z']]){
  const f=await setup(server.base,{db:{messages:[{id,conversation_id:CHAT,sender_id:ME,body:'Receipt state fixture',is_encrypted:false,created_at:'2026-11-16T00:00:00Z'}],message_receipts:delivered_at?[{message_id:id,user_id:OTHER,delivered_at,read_at}]:[]}});
  try{
   await f.page.getByRole('tab',{name:'Chats',exact:true}).click();await f.page.getByText('Other Member',{exact:true}).click();
   const state=f.page.getByLabel(label,{exact:true});await state.waitFor();
   if(read_at)assert.equal(await state.evaluate(node=>getComputedStyle(node).color),'rgb(114, 190, 255)');
   assert.deepEqual(f.errors,[]);
  }finally{await f.close();}
 }
});

test('chat video attachments play inline with controls instead of requiring a new window',async()=>{
 const id='88888888-8888-4888-8888-888888888888';
 const f=await setup(server.base,{db:{messages:[{id,conversation_id:CHAT,sender_id:OTHER,body:'Video fixture',is_encrypted:false,media_path:'fixture/video.webm',media_type:'video',created_at:'2026-11-16T00:00:00Z'}]}});
 try{
  const video=await readFile(new URL('../fixtures/social-video.webm',import.meta.url));
  await f.context.route('**/storage/v1/object/**',route=>route.fulfill({status:200,contentType:'video/webm',body:video}));
  await f.page.getByRole('tab',{name:'Chats',exact:true}).click();await f.page.getByText('Other Member',{exact:true}).click();
  const player=f.page.getByLabel('Video attachment',{exact:true});await player.waitFor();
  assert(await player.evaluate(el=>el.controls&&el.playsInline&&el.src.startsWith('blob:')));
  await player.evaluate(async el=>{el.muted=true;await el.play();});
  await f.page.waitForFunction(()=>document.querySelector('video')?.currentTime>0.1);
  assert.deepEqual(f.errors,[]);
 }finally{await f.close();}
});

test('voice-note cleanup preserves a server-committed message after a lost INSERT response and retains media if verification fails',async()=>{
 const f=await setup(server.base);
 try{
  await f.page.getByRole('tab',{name:'Profile',exact:true}).waitFor();
  f.db.profiles[1].encryption_public_key=await f.page.evaluate(async()=>{const pair=await crypto.subtle.generateKey({name:'ECDH',namedCurve:'P-256'},true,['deriveKey']);return JSON.stringify(await crypto.subtle.exportKey('jwk',pair.publicKey));});
  await f.context.route('**/rest/v1/messages',async route=>{
   if(route.request().method()!=='POST')return route.fallback();
   f.db.messages.push({id:'99999999-9999-4999-8999-999999999999',...route.request().postDataJSON()});
   await route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({message:'Lost fixture response'})});
  });
  await f.page.evaluate(async({me,chat})=>{await(await import('/KONNEKT/src/services/voiceMessages.js')).sendEncryptedVoiceMessage(new File(['voice bytes'],'fixture.webm',{type:'audio/webm'}),chat,me);},{me:ME,chat:CHAT});
  assert.equal(f.db.messages.length,1);
  assert.equal(f.requests.filter(r=>r.method==='DELETE'&&r.path.includes('/storage/')).length,0);
  f.failures.set('GET:messages',{message:'Cannot confirm fixture status'});
  const error=await f.page.evaluate(async({me,chat})=>{try{await(await import('/KONNEKT/src/services/voiceMessages.js')).sendEncryptedVoiceMessage(new File(['more voice bytes'],'fixture.webm',{type:'audio/webm'}),chat,me);}catch(error){return error.message;}},{me:ME,chat:CHAT});
  assert.match(error,/status could not be confirmed.*retained/);
  assert.equal(f.requests.filter(r=>r.method==='DELETE'&&r.path.includes('/storage/')).length,0);
 }finally{await f.close();}
});

test('encrypted key backup recovers in a genuinely isolated browser and decrypts original ciphertext',async()=>{
 const source=await setup(server.base);let restored;
 try{
  await source.page.getByRole('tab',{name:'Profile',exact:true}).waitFor();
  const payload=await source.page.evaluate(async me=>{
   const encryption=await import('/KONNEKT/src/konnektEncryption.js');
   const identity=await encryption.ensureKonnektIdentity(me);
   const pair=await crypto.subtle.generateKey({name:'ECDH',namedCurve:'P-256'},true,['deriveKey']);
   const peer=JSON.stringify(await crypto.subtle.exportKey('jwk',pair.publicKey));
   const encrypted=await encryption.encryptKonnektText({userId:me,otherPublicKey:peer,text:'Recover this fixture ciphertext'});
   await encryption.createKonnektKeyBackup('disposable isolated fixture passphrase');
   return {encrypted,peer,fingerprint:await encryption.getKonnektIdentityFingerprint(identity.publicJwk)};
  },ME);
  restored=await setup(server.base,{db:source.db});
  await restored.page.getByRole('tab',{name:'Profile',exact:true}).waitFor();
  const result=await restored.page.evaluate(async({me,payload})=>{
   const encryption=await import('/KONNEKT/src/konnektEncryption.js');
   if(await encryption.getStoredKonnektIdentity(me))throw Error('Browser was not isolated');
   let rejected=false;try{await encryption.restoreKonnektKeyBackup('wrong fixture passphrase');}catch{rejected=true;}
   const stillEmpty=!(await encryption.getStoredKonnektIdentity(me));
   await encryption.restoreKonnektKeyBackup('disposable isolated fixture passphrase');
   const identity=await encryption.getStoredKonnektIdentity(me);
   const text=await encryption.decryptKonnektText({userId:me,otherPublicKey:payload.peer,...payload.encrypted});
   return {rejected,stillEmpty,text,fingerprint:await encryption.getKonnektIdentityFingerprint(identity.publicJwk)};
  },{me:ME,payload});
  assert(result.rejected);assert(result.stillEmpty);assert.equal(result.text,'Recover this fixture ciphertext');assert.equal(result.fingerprint,payload.fingerprint);
  assert.deepEqual(source.errors,[]);assert.deepEqual(restored.errors,[]);
 }finally{await restored?.close();await source.close();}
});

test('remaining direct messages stay readable after peer deletion; send, attachments, recording and calls are disabled',async()=>{
 const f=await setup(server.base);
 try{
  const {page,db,requests}=f;
  await page.getByRole('tab',{name:'Chats',exact:true}).click();
  const peer=await page.evaluate(async()=>{const pair=await crypto.subtle.generateKey({name:'ECDH',namedCurve:'P-256'},true,['deriveKey']);return JSON.stringify(await crypto.subtle.exportKey('jwk',pair.publicKey));});
  db.profiles[1].encryption_public_key=peer;
  await page.getByText('Other Member',{exact:true}).click();
  await page.getByPlaceholder('Message securely…').fill('My retained encrypted message');
  const sent=page.waitForResponse(r=>r.request().method()==='POST'&&r.url().includes('/rest/v1/messages'));
  await page.getByRole('button',{name:'Send message',exact:true}).click();
  await sent;
  await page.getByText('My retained encrypted message',{exact:true}).waitFor();
  assert.equal(db.messages.length,1);assert.notEqual(db.messages[0].body,'My retained encrypted message');
  db.profiles=db.profiles.filter(p=>p.id!==OTHER);
  db.conversation_members=db.conversation_members.filter(m=>m.user_id!==OTHER);
  await f.context.route('**/rest/v1/rpc/konnekt_retired_peer',route=>route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({id:OTHER,encryption_public_key:peer,retired:true})}));
  await page.reload();await page.getByRole('tab',{name:'Chats',exact:true}).click();
  await page.getByText('Conversation',{exact:true}).click();
  await page.getByText('My retained encrypted message',{exact:true}).waitFor();
  await page.getByText('This account was deleted. Your remaining messages are read-only.',{exact:true}).waitFor();
  for(const label of ['Send message','Attach media','Record voice note','Start voice call','Start video call'])assert(await page.getByRole('button',{name:label,exact:true}).isDisabled());
  assert.equal(await page.getByPlaceholder('Message securely…').isEditable(),false);
  assert.equal(requests.filter(r=>r.method==='POST'&&r.path.endsWith('/messages')).length,1);
  assert.equal(requests.filter(r=>r.method==='POST'&&r.path.endsWith('/call_sessions')).length,0);
  assert.equal(db.conversations[0].id,CHAT);assert.deepEqual(f.errors,[]);
 }finally{await f.close();}
});
