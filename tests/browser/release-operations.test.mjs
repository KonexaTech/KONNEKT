import { after,before,test } from 'node:test';
import assert from 'node:assert/strict';
import { startServer,setup,ME,OTHER,CHAT } from './helpers.mjs';
let server;
before(async()=>{server=await startServer();});after(()=>server?.stop());

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
