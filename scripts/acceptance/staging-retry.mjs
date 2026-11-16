import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {randomUUID,createHash} from 'node:crypto';
import {stagingSession,direct,moduleUrl} from './staging-session.mjs';
const file=process.env.KONNEKT_ACCEPTANCE_CONFIG;
const report={runId:randomUUID(),decision:'NOT_RUN',checks:[]};let session,phase='start',interceptor;
try{
 session=await stagingSession(file);const[a,b]=session.pages;
 const id=await direct(a,session.profiles[1].username);assert.equal(await direct(b,session.profiles[0].username),id);
 const text='TEST ACCEPTANCE retry '+report.runId;await a.getByPlaceholder('Message securely…').fill(text);
 // Reject before forwarding the INSERT. This cannot disguise a committed write.
 phase='reject-before-message-write';let rejectedPayload;
 interceptor=async route=>{if(route.request().method()==='POST'){rejectedPayload=route.request().postDataJSON();await route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({message:'TEST ACCEPTANCE injected rejection before insert',code:'QA503'})});}else await route.fallback();};
 await a.context().route('**/rest/v1/messages',interceptor);
 const image=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aOuoAAAAASUVORK5CYII=','base64');
 const chooser=a.waitForEvent('filechooser');await a.getByRole('button',{name:'Attach media',exact:true}).click();
 const removed=a.waitForResponse(r=>r.url().includes('/storage/v1/object/konnekt-chat-media')&&r.request().method()==='DELETE');
 await(await chooser).setFiles({name:'test-retry.png',mimeType:'image/png',buffer:image});assert((await removed).ok());
 assert(rejectedPayload?.media_path);assert.equal(rejectedPayload.media_encrypted,true);
 const absent=await a.evaluate(async({moduleUrl,path,body,id})=>{const{supabase}=await import(moduleUrl);const rows=await supabase.from('messages').select('id').eq('conversation_id',id).eq('body',body);if(rows.error)throw rows.error;const media=await supabase.storage.from('konnekt-chat-media').download(path);return{rows:rows.data.length,readable:!!media.data,status:Number(media.error?.status||media.error?.statusCode)};},{moduleUrl,path:rejectedPayload.media_path,body:rejectedPayload.body,id});
 assert.equal(absent.rows,0);assert.equal(absent.readable,false);assert([400,403,404].includes(absent.status));assert.equal(await a.getByPlaceholder('Message securely…').inputValue(),text);
 report.checks.push({check:'real encrypted upload followed by an injected pre-insert rejection removes the unused file and preserves the draft',result:'PASS'});console.log('PASS failed-upload cleanup and preserved draft');
 await a.context().unroute('**/rest/v1/messages',interceptor);interceptor=null;
 phase='retry';const chooser2=a.waitForEvent('filechooser');await a.getByRole('button',{name:'Attach media',exact:true}).click();const written=a.waitForResponse(r=>r.url().includes('/rest/v1/messages')&&r.request().method()==='POST');await(await chooser2).setFiles({name:'test-retry.png',mimeType:'image/png',buffer:image});const response=await written;assert(response.ok());const payload=response.request().postDataJSON();assert.notEqual(payload.media_path,rejectedPayload.media_path);await b.getByText(text,{exact:true}).waitFor();
 const count=await a.evaluate(async({moduleUrl,body,id})=>{const{supabase}=await import(moduleUrl);const r=await supabase.from('messages').select('id').eq('conversation_id',id).eq('body',body);if(r.error)throw r.error;return r.data.length;},{moduleUrl,body:payload.body,id});assert.equal(count,1);assert.equal(session.violations.length,0);
 report.checks.push({check:'retry uploads a new encrypted file and delivers exactly one real message to B',result:'PASS'});console.log('PASS retry delivers once');
 phase='lost-success-response';const ambiguousText='TEST ACCEPTANCE lost response '+report.runId;await a.getByPlaceholder('Message securely…').fill(ambiguousText);let committedPayload,deletes=0;
 const deletionObserver=request=>{if(request.method()==='DELETE'&&request.url().includes('/storage/v1/'))deletes++;};a.on('request',deletionObserver);
 interceptor=async route=>{if(route.request().method()==='POST'){committedPayload=route.request().postDataJSON();const upstream=await route.fetch({maxRedirects:0});assert(upstream.ok());await route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({message:'TEST ACCEPTANCE simulated lost success response',code:'QA503'})});}else await route.fallback();};
 await a.context().route('**/rest/v1/messages',interceptor);
 const chooser3=a.waitForEvent('filechooser');await a.getByRole('button',{name:'Attach media',exact:true}).click();await(await chooser3).setFiles({name:'test-lost-response.png',mimeType:'image/png',buffer:image});
 await a.getByText('Your attachment was saved. Refresh the chat before retrying.',{exact:true}).waitFor();await b.getByText(ambiguousText,{exact:true}).waitFor();
 const evidence=await a.evaluate(async({moduleUrl,payload})=>{const{supabase}=await import(moduleUrl);const rows=await supabase.from('messages').select('id').eq('media_path',payload.media_path).eq('conversation_id',payload.conversation_id);if(rows.error)throw rows.error;const media=await supabase.storage.from('konnekt-chat-media').download(payload.media_path);if(media.error)throw media.error;return{count:rows.data.length,id:rows.data[0]?.id,bytes:media.data.size};},{moduleUrl,payload:committedPayload});assert.equal(evidence.count,1);assert(evidence.bytes>0);assert.equal(deletes,0);
 await b.waitForFunction(async({id,expected})=>{const img=document.querySelector(`[data-testid="message-${id}"] img`);if(!img?.complete||!img.naturalWidth||!img.src.startsWith('blob:'))return false;const bytes=await(await fetch(img.src)).arrayBuffer();return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),x=>x.toString(16).padStart(2,'0')).join('')===expected;},{id:evidence.id,expected:createHash('sha256').update(image).digest('hex')});
 a.off('request',deletionObserver);await a.context().unroute('**/rest/v1/messages',interceptor);interceptor=null;assert.equal(session.violations.length,0);
 report.checks.push({check:'actual server-committed message with injected lost-success response retains its file and remote decrypted image; no cleanup DELETE or duplicate row',result:'PASS'});console.log('PASS committed message survives lost response without file deletion');report.decision='PASS_SCOPED_LIVE_RETRY_AND_LOST_RESPONSE';
}catch{report.failedPhase=phase;report.decision='FAIL_OR_BLOCKED';process.exitCode=1;console.error('FAIL_OR_BLOCKED: '+phase);}
finally{if(interceptor&&session)await session.pages[0].context().unroute('**/rest/v1/messages',interceptor).catch(()=>{});await session?.close();if(file){await mkdir(file+'.retry.local',{recursive:true,mode:0o700});await writeFile(file+'.retry.local/report.json',JSON.stringify(report,null,2),{mode:0o600});}console.log('Sanitized retry report saved beside private configuration.');}
