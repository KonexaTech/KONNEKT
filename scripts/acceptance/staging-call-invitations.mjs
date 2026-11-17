import {mkdir,writeFile} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import assert from 'node:assert/strict';
import {stagingSession,moduleUrl,tab} from './staging-session.mjs';
const file=process.env.KONNEKT_ACCEPTANCE_CONFIG;
const report={runId:randomUUID(),project:'konnekt-staging',decision:'NOT_RUN',checks:[],created:[]};
let session,phase='sessions';
const pass=check=>{report.checks.push({check,result:'PASS'});console.log('PASS '+check);};
async function finish(page,entry){
 await page.evaluate(async({moduleUrl,entry})=>{
  const{supabase}=await import(moduleUrl);const table=entry.group?'group_call_sessions':'call_sessions';
  const r=await supabase.from(table).select('status').eq('id',entry.id).single();if(r.error)throw Error('Call cleanup lookup failed');
  if(['ringing','accepted','active'].includes(r.data.status)){const ended=await supabase.from(table).update({status:'ended',ended_at:new Date().toISOString()}).eq('id',entry.id).select('status').single();if(ended.error||ended.data?.status!=='ended')throw Error('Call cleanup failed');}
 },{moduleUrl,entry});
}
async function startDirect(page,callee){
 const id=await page.evaluate(async callee=>{const{createCall}=await import('/KONNEKT/src/services/calls.js');return(await createCall({calleeId:callee,callType:'voice'})).id;},callee);
 const entry={id,group:false};report.created.push(entry);return entry;
}
async function outsider(page,entry){
 return page.evaluate(async({moduleUrl,entry})=>{const{supabase}=await import(moduleUrl);const r=await supabase.from(entry.group?'group_call_sessions':'call_sessions').select('id').eq('id',entry.id);if(r.error)throw Error('Call privacy probe failed');return r.data.length;},{moduleUrl,entry});
}
try{
 session=await stagingSession(file);const[a,b,c]=session.pages,[pa,pb,pc]=session.profiles;
 phase='preflight';
 for(const page of session.pages)await page.evaluate(async moduleUrl=>{const{supabase}=await import(moduleUrl);for(const table of ['call_sessions','group_call_sessions']){const r=await supabase.from(table).select('id').in('status',table==='call_sessions'?['ringing','accepted']:['ringing','active']);if(r.error||r.data.length)throw Error('Existing active fixture calls must be left untouched');}},moduleUrl);
 const eligible=await a.evaluate(async({moduleUrl,ids})=>{
  const{supabase}=await import(moduleUrl);
  const active=await supabase.from('call_sessions').select('id').in('status',['ringing','accepted']);if(active.error||active.data.length)throw Error('Existing active fixture calls must be left untouched');
  const groups=await supabase.from('conversations').select('id,title').eq('is_group',true).eq('created_by',ids[0]);if(groups.error)throw Error('Group lookup failed');
  for(const group of groups.data){if(!group.title)continue;const members=await supabase.from('conversation_members').select('user_id').eq('conversation_id',group.id);if(members.error)throw Error('Group membership failed');if(members.data.length===2&&ids.slice(0,2).every(id=>members.data.some(row=>row.user_id===id))){
   const live=await supabase.from('group_call_sessions').select('id').eq('conversation_id',group.id).in('status',['ringing','active']);if(live.error||live.data.length)throw Error('Existing group calls must be left untouched');return group;
  }}throw Error('An existing approved two-fixture group is required');
 },{moduleUrl,ids:[pa.id,pb.id,pc.id]});
 for(const page of session.pages)await page.evaluate(()=>{window.__qaMediaRequests=0;const devices=navigator.mediaDevices;if(devices)devices.getUserMedia=()=>{window.__qaMediaRequests++;return Promise.reject(Error('This acceptance run tests invitations only.'));};});
 const voice=page=>page.getByRole('alertdialog',{name:'Incoming voice call',exact:true});
 phase='positive-control';const control=await startDirect(a,pc.id);await voice(c).waitFor();assert.equal(await outsider(c,control),1);await finish(a,control);await voice(c).waitFor({state:'hidden'});pass('actual recipient C receives and dismisses its own call through Realtime as a positive control');
 phase='direct-decline-create';const declined=await startDirect(a,pb.id);phase='direct-decline-ring';await voice(b).waitFor();phase='direct-decline-outsider';assert.equal(await outsider(c,declined),0);
 const declineResponse=b.waitForResponse(r=>r.request().method()==='PATCH'&&new URL(r.url()).pathname==='/rest/v1/call_sessions').catch(()=>null);
 phase='direct-decline-click';await voice(b).getByRole('button',{name:'Decline',exact:true}).click();phase='direct-decline-response';assert.equal((await declineResponse)?.ok(),true);
 phase='direct-decline-verify';const status=await a.evaluate(async({moduleUrl,id})=>{const{supabase}=await import(moduleUrl);const r=await supabase.from('call_sessions').select('status').eq('id',id).single();if(r.error)throw Error('Decline verification failed');return r.data.status;},{moduleUrl,id:declined.id});assert.equal(status,'rejected');pass('actual B decline is stored while C cannot read the A/B call');
 phase='direct-caller-end';const ended=await startDirect(a,pb.id);await voice(b).waitFor();await finish(a,ended);await voice(b).waitFor({state:'hidden'});pass('actual caller hang-up update dismisses the recipient ringing dialog without interaction');
 phase='recipient-ring-expiry';const expired=await startDirect(a,pb.id);await voice(b).waitFor();console.log('ACCEPTANCE waiting for the actual 45-second invitation expiry');await voice(b).waitFor({state:'hidden',timeout:55000});await finish(a,expired);pass('actual recipient invitation expires when the caller sends no further update');
 phase='group-navigation';await tab(a,'Chats');await a.getByText(eligible.title,{exact:true}).click();
 const groupResponse=a.waitForResponse(r=>r.request().method()==='POST'&&new URL(r.url()).pathname==='/rest/v1/group_call_sessions').catch(()=>null);
 phase='group-create-response';await a.getByRole('button',{name:'Start voice call',exact:true}).click();const response=await groupResponse;report.groupCreateHttp=response?.status()??null;if(response&&!response.ok()){const error=await response.json().catch(()=>({}));report.groupCreateCode=error.code||null;report.groupCreateMessage=error.message?.replace(/[0-9a-f]{8}-[0-9a-f-]{27,}/gi,'[uuid]')||null;}assert.equal(response?.ok(),true);const created=await response.json();const group={id:created.id,group:true};report.created.push(group);
 phase='group-receive';const groupDialog=b.getByRole('alertdialog',{name:'Group call invitation',exact:true});await groupDialog.waitFor();phase='group-outsider';assert.equal(await outsider(c,group),0);
 const groupEnded=a.waitForResponse(r=>r.request().method()==='PATCH'&&new URL(r.url()).pathname==='/rest/v1/group_call_sessions'&&r.request().postDataJSON()?.status==='ended').catch(()=>null);
 phase='group-host-leave';await a.getByRole('button',{name:'Leave call',exact:true}).click();assert.equal((await groupEnded)?.ok(),true);phase='group-host-end-delivery';await groupDialog.waitFor({state:'hidden'});await a.getByRole('button',{name:'Start voice call',exact:true}).waitFor();pass('actual group host can leave before joining, ends the session and dismisses B invitation; C cannot read the group call');
 phase='group-decline';const secondId=await a.evaluate(async id=>{const{createGroupCall}=await import('/KONNEKT/src/services/calls.js');return(await createGroupCall({conversationId:id,callType:'voice'})).id;},eligible.id);const second={id:secondId,group:true};report.created.push(second);await groupDialog.waitFor();
 phase='group-owner-boundary';const forbidden=await b.evaluate(async({moduleUrl,id})=>{const{supabase}=await import(moduleUrl);const r=await supabase.from('group_call_sessions').update({status:'ended',ended_at:new Date().toISOString()}).eq('id',id).select('id');return{rows:r.data?.length||0,code:r.error?.code||null};},{moduleUrl,id:secondId});assert.equal(forbidden.rows,0);assert([null,'42501'].includes(forbidden.code));
 const stillActive=await a.evaluate(async({moduleUrl,id})=>{const{supabase}=await import(moduleUrl);const r=await supabase.from('group_call_sessions').select('status').eq('id',id).single();if(r.error)throw Error('Owner boundary verification failed');return r.data.status;},{moduleUrl,id:secondId});assert.equal(stillActive,'active');pass('actual non-host B cannot end the shared group session while member reads remain allowed');
 phase='group-decline';
 const groupDeclined=b.waitForResponse(r=>r.request().method()==='PATCH'&&new URL(r.url()).pathname==='/rest/v1/group_call_participants').catch(()=>null);await groupDialog.getByRole('button',{name:'Decline',exact:true}).click();assert.equal((await groupDeclined)?.ok(),true);
 const memberStatus=await a.evaluate(async({moduleUrl,id,member})=>{const{supabase}=await import(moduleUrl);const r=await supabase.from('group_call_participants').select('status').eq('call_id',id).eq('user_id',member).single();if(r.error)throw Error('Group decline verification failed');return r.data.status;},{moduleUrl,id:secondId,member:pb.id});assert.equal(memberStatus,'declined');await finish(a,second);pass('actual group invitation decline is persisted for the invited recipient');
 for(const page of session.pages)assert.equal(await page.evaluate(()=>window.__qaMediaRequests),0);assert.equal(session.violations.length,0);pass('no camera/microphone request or unexpected origin was used by the live invitation tests');
 report.decision='PASS_SCOPED_LIVE_CALL_INVITATIONS_ONLY';
}catch(error){
 report.failedPhase=phase;report.errorType=error?.name||'Error';report.decision='FAIL_OR_BLOCKED';process.exitCode=1;console.error('FAIL_OR_BLOCKED: '+phase);
 if(session){report.diagnostics=[];for(let i=0;i<session.pages.length;i++){try{report.diagnostics.push(await session.pages[i].evaluate(async({moduleUrl,owner,ids})=>{
  const{supabase}=await import(moduleUrl);const s=await supabase.auth.getSession();
  const r=ids.length?await supabase.from('call_sessions').select('id,status').in('id',ids).abortSignal(AbortSignal.timeout(5000)):{data:[],error:null};
  return{signedInAsExpected:s.data.session?.user?.id===owner,callChannelStates:supabase.getChannels().filter(ch=>ch.topic.includes('incoming-calls-')).map(ch=>ch.state),visibleCallCount:r.data?.length??null,statuses:r.data?.map(row=>row.status)||[],apiErrorCode:r.error?.code||null,alertTitles:[...document.querySelectorAll('[role=alertdialog] h2')].map(node=>node.textContent)};
 },{moduleUrl,owner:session.profiles[i].id,ids:report.created.filter(row=>!row.group).map(row=>row.id)}));}catch{report.diagnostics.push({unavailable:true});}}}
}
finally{
 report.cleanupComplete=true;
 if(session)for(const entry of report.created){try{await finish(session.pages[0],entry);}catch{report.cleanupComplete=false;}}
 if(!report.cleanupComplete){report.decision='FAIL_OR_BLOCKED';process.exitCode=1;}
 await session?.close();
 if(file){await mkdir(file+'.call-invitations.local',{recursive:true,mode:0o700});await writeFile(file+'.call-invitations.local/report.json',JSON.stringify(report,null,2),{mode:0o600});}
 console.log('Private call invitation report saved; no physical media, TURN or native push acceptance is claimed.');
}
