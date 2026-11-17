import {before,after,test} from 'node:test';
import assert from 'node:assert/strict';
import {startServer,setup,ME,OTHER,CHAT} from './helpers.mjs';
let server;before(async()=>{server=await startServer();});after(()=>server?.stop());
const frames=page=>page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));

async function holdLookup(f,table,match){
 let release;const gate=new Promise(resolve=>{release=resolve;});
 const matches=request=>request.method()==='GET'&&new URL(request.url()).pathname==='/rest/v1/'+table&&match(new URL(request.url()));
 const requested=f.page.waitForRequest(matches);
 await f.context.route('**/rest/v1/'+table+'**',async route=>{if(matches(route.request()))await gate;await route.fallback();});
 return{requested,release,matches};
}

test('expired direct calls do not ring after reopening; a fresh call can still be declined',async()=>{
 const f=await setup(server.base,{db:{call_sessions:[]}});let held;
 try{
  await f.page.getByRole('tab',{name:'Reels',exact:true}).waitFor();
  held=await holdLookup(f,'call_sessions',url=>url.searchParams.has('callee_id'));
  f.db.call_sessions.push({id:CHAT,caller_id:OTHER,callee_id:ME,status:'ringing',call_type:'voice',created_at:new Date(Date.now()-60000).toISOString()});
  await f.page.reload();await held.requested;
  const response=f.page.waitForResponse(r=>held.matches(r.request()));held.release();await(await response).finished();await frames(f.page);
  assert.equal(await f.page.getByRole('alertdialog',{name:'Incoming voice call',exact:true}).count(),0);
  f.db.call_sessions[0].created_at=new Date().toISOString();await f.page.reload();
  const dialog=f.page.getByRole('alertdialog',{name:'Incoming voice call',exact:true});await dialog.waitFor();const declined=f.page.waitForResponse(r=>r.request().method()==='PATCH'&&new URL(r.url()).pathname==='/rest/v1/call_sessions');await dialog.getByRole('button',{name:'Decline',exact:true}).click();
  await(await declined).finished();
  assert.equal(f.db.call_sessions[0].status,'rejected');assert.deepEqual(f.errors,[]);
 }finally{held?.release();await f.close();}
});

test('a delayed group title lookup cannot show a private invitation after sign-out',async()=>{
 const f=await setup(server.base,{db:{group_call_sessions:[{id:CHAT,conversation_id:CHAT,call_type:'voice',created_by:OTHER,status:'active',created_at:new Date().toISOString()}],group_call_participants:[{call_id:CHAT,user_id:ME,status:'declined'}],conversations:[{id:CHAT,title:'PRIVATE GROUP FIXTURE',is_group:true,created_by:OTHER}]}});let held;
 try{
  await f.page.getByRole('tab',{name:'Reels',exact:true}).waitFor();
  held=await holdLookup(f,'conversations',url=>url.searchParams.get('select')==='title');
  f.db.group_call_participants[0].status='invited';await f.page.reload();await held.requested;
  await f.page.getByRole('tab',{name:'Profile',exact:true}).click();await f.page.getByText('LOG OUT',{exact:true}).click();await f.page.getByText('SIGN UP',{exact:true}).waitFor();
  const response=f.page.waitForResponse(r=>held.matches(r.request()));held.release();await(await response).finished();await frames(f.page);
  assert.equal(await f.page.getByRole('alertdialog',{name:'Group call invitation',exact:true}).count(),0);
  assert.equal(await f.page.getByText(/PRIVATE GROUP FIXTURE/).count(),0);assert.deepEqual(f.errors,[]);
 }finally{held?.release();await f.close();}
});

async function installMedia(f,{pendingFirst=false}={}){
 await f.page.evaluate(pendingFirst=>{
  window.__mediaTracks=[];window.__peers=[];
  const stream=()=>{const canvas=document.createElement('canvas');canvas.width=32;canvas.height=32;canvas.getContext('2d').fillRect(0,0,32,32);const value=canvas.captureStream(1);const track=value.getVideoTracks()[0];track.getSettings=()=>({deviceId:'front'});window.__mediaTracks.push(track);return value;};
  let requests=0;
  Object.defineProperty(navigator,'mediaDevices',{configurable:true,value:{enumerateDevices:async()=>[{kind:'videoinput',deviceId:'front'},{kind:'videoinput',deviceId:'back'}],getUserMedia:async()=>{requests++;if((requests===1&&pendingFirst)||requests>1)return new Promise(resolve=>{window.__grantCamera=()=>resolve(stream());});return stream();}}});
  window.RTCPeerConnection=class{
   constructor(){this.senders=[];window.__peers.push(this);}
   addTrack(track){this.senders.push({track,replaceTrack:async next=>{this.senders[0].track=next;}});}
   getSenders(){return this.senders;}
   async createOffer(){return{type:'offer',sdp:'fixture'};}
   async setLocalDescription(value){this.localDescription={...value,toJSON:()=>value};}
   close(){this.closed=true;}
  };
 },pendingFirst);
}
async function mediaFixture(f,{pendingFirst=false}={}){
 await installMedia(f,{pendingFirst});
 await f.page.getByRole('tab',{name:'Calls',exact:true}).click();await f.page.getByRole('button',{name:'Start video call with Other Member',exact:true}).click();await f.page.getByText('VIDEO CALL',{exact:true}).waitFor();
 if(!pendingFirst)await f.page.getByText('Ringing…',{exact:true}).waitFor().catch(async()=>{throw Error('Fixture call view: '+await f.page.locator('body').innerText());});
}

test('a camera granted after hang-up is stopped instead of surviving the call',async()=>{
 const f=await setup(server.base);
 try{
  await mediaFixture(f);await f.page.getByText('Ringing…',{exact:true}).waitFor();
  await f.page.getByText('Switch camera',{exact:true}).click();await f.page.waitForFunction(()=>typeof window.__grantCamera==='function');
  await f.page.getByText('End call',{exact:true}).click();await f.page.getByRole('tab',{name:'Calls',exact:true}).waitFor();
  await f.page.evaluate(()=>window.__grantCamera());await frames(f.page);
  assert.equal(await f.page.evaluate(()=>window.__mediaTracks.length),2);
  assert.equal(await f.page.evaluate(()=>window.__mediaTracks.every(track=>track.readyState==='ended')),true);
  assert.equal(await f.page.evaluate(()=>window.__peers.every(pc=>pc.closed)),true);assert.deepEqual(f.errors,[]);
 }finally{await f.close();}
});

test('hang-up remains available during camera consent and cleans up a late first grant',async()=>{
 const f=await setup(server.base);
 try{
  await mediaFixture(f,{pendingFirst:true});await f.page.waitForFunction(()=>typeof window.__grantCamera==='function');
  assert.equal(await f.page.getByText('End call',{exact:true}).isEnabled(),true);
  await f.page.getByText('End call',{exact:true}).click();await f.page.getByRole('tab',{name:'Calls',exact:true}).waitFor();
  await f.page.evaluate(()=>window.__grantCamera());await frames(f.page);
  assert.equal(await f.page.evaluate(()=>window.__mediaTracks.every(track=>track.readyState==='ended')),true);
  assert.equal(await f.page.evaluate(()=>window.__peers.length),0);assert.deepEqual(f.errors,[]);
 }finally{await f.close();}
});

test('a notification tap cannot unmount an ongoing call',async()=>{
 const f=await setup(server.base);
 try{
  await mediaFixture(f);await f.page.getByText('Ringing…',{exact:true}).waitFor();
  await f.page.evaluate(async()=>{const{notificationOpener}=await import('/KONNEKT/src/services/pushOpen.js');notificationOpener.receive({notification:{additionalData:{screen:'Notifications'}}});});await frames(f.page);
  assert.equal(await f.page.getByText('VIDEO CALL',{exact:true}).count(),1);
  assert.equal(await f.page.evaluate(()=>window.__mediaTracks.every(track=>track.readyState==='live')),true);
  await f.page.getByText('End call',{exact:true}).click();await f.page.getByRole('tab',{name:'Calls',exact:true}).waitFor();assert.deepEqual(f.errors,[]);
 }finally{await f.close();}
});

test('turning the camera off during a pending switch also disables the replacement track',async()=>{
 const f=await setup(server.base);
 try{
  await mediaFixture(f);await f.page.getByText('Switch camera',{exact:true}).click();await f.page.waitForFunction(()=>typeof window.__grantCamera==='function');
  await f.page.getByText('Camera off',{exact:true}).click();await f.page.evaluate(()=>window.__grantCamera());await frames(f.page);
  assert.equal(await f.page.evaluate(()=>window.__mediaTracks.length),2);
  assert.equal(await f.page.evaluate(()=>window.__mediaTracks[1].enabled),false);
  await f.page.getByText('Camera on',{exact:true}).click();assert.equal(await f.page.evaluate(()=>window.__mediaTracks[1].enabled),true);
  await f.page.getByText('End call',{exact:true}).click();await f.page.getByRole('tab',{name:'Calls',exact:true}).waitFor();assert.deepEqual(f.errors,[]);
 }finally{await f.close();}
});

test('a visible incoming ring expires without waiting for the caller to reconnect',async()=>{
 const f=await setup(server.base,{db:{call_sessions:[]}});
 try{
  await f.page.getByRole('tab',{name:'Reels',exact:true}).waitFor();await f.page.clock.install({time:new Date()});
  f.db.call_sessions.push({id:CHAT,caller_id:OTHER,callee_id:ME,status:'ringing',call_type:'voice',created_at:new Date().toISOString()});await f.page.reload();
  await f.page.getByRole('alertdialog',{name:'Incoming voice call',exact:true}).waitFor();await f.page.clock.fastForward(46000);await frames(f.page);
  assert.equal(await f.page.getByRole('alertdialog',{name:'Incoming voice call',exact:true}).count(),0);assert.deepEqual(f.errors,[]);
 }finally{await f.close();}
});

test('an unanswered outgoing call stops capture and records missed status after the ring window',async()=>{
 const f=await setup(server.base);
 try{
  await f.page.clock.install({time:new Date()});await mediaFixture(f);
  const missed=f.page.waitForResponse(r=>r.request().method()==='PATCH'&&new URL(r.url()).pathname==='/rest/v1/call_sessions'&&r.request().postDataJSON()?.status==='missed');
  await f.page.clock.fastForward(46000);await f.page.getByRole('alertdialog',{name:'Call not answered',exact:true}).waitFor();await(await missed).finished();
  assert.equal(f.db.call_sessions[0].status,'missed');assert.equal(await f.page.evaluate(()=>window.__mediaTracks.every(track=>track.readyState==='ended')),true);assert.deepEqual(f.errors,[]);
 }finally{await f.close();}
});

async function groupFixture(){
 const f=await setup(server.base,{db:{conversations:[{id:CHAT,title:'Lifecycle Group',is_group:true,created_by:ME}]}});
 try{
  await installMedia(f,{pendingFirst:true});await f.page.getByRole('tab',{name:'Chats',exact:true}).click();await f.page.getByText('Lifecycle Group',{exact:true}).click();
  await f.page.getByRole('button',{name:'Start video call',exact:true}).click();await f.page.getByText('Join call',{exact:true}).waitFor();return f;
 }catch(error){await f.close();throw error;}
}

test('a group camera grant arriving after sign-out is stopped and cannot join the old call',async()=>{
 const f=await groupFixture();
 try{
  await f.page.getByText('Join call',{exact:true}).click();await f.page.waitForFunction(()=>typeof window.__grantCamera==='function');
  await f.page.evaluate(async()=>{const{supabase}=await import('/KONNEKT/src/lib_supabase.js');await supabase.auth.signOut({scope:'local'});});await f.page.getByText('SIGN UP',{exact:true}).waitFor();
  await f.page.evaluate(()=>window.__grantCamera());await frames(f.page);
  assert.equal(await f.page.evaluate(()=>window.__mediaTracks.length),1);
  assert.equal(await f.page.evaluate(()=>window.__mediaTracks.every(track=>track.readyState==='ended')),true);
  assert.equal(f.db.group_call_participants.some(row=>row.user_id===ME&&row.status==='joined'),false);assert.deepEqual(f.errors,[]);
 }finally{await f.close();}
});

test('a group call can be left before joining and while camera consent is pending',async()=>{
 for(const joinFirst of [false,true]){
  const f=await groupFixture();
  try{
   if(joinFirst){await f.page.getByText('Join call',{exact:true}).click();await f.page.waitForFunction(()=>typeof window.__grantCamera==='function');}
   await f.page.getByText('Leave call',{exact:true}).click();await f.page.getByRole('button',{name:'Start video call',exact:true}).waitFor();
   if(joinFirst){await f.page.evaluate(()=>window.__grantCamera());await frames(f.page);assert.equal(await f.page.evaluate(()=>window.__mediaTracks.every(track=>track.readyState==='ended')),true);}
   assert.deepEqual(f.errors,[]);
  }finally{await f.close();}
 }
});

test('hang-up stops capture immediately and still ends the server session when its signal fails',async()=>{
 const f=await setup(server.base);
 try{
  await mediaFixture(f);f.failures.set('POST:call_signals',{message:'Fixture signal unavailable'});
  const ended=f.page.waitForResponse(r=>r.request().method()==='PATCH'&&new URL(r.url()).pathname==='/rest/v1/call_sessions'&&r.request().postDataJSON()?.status==='ended');
  await f.page.getByText('End call',{exact:true}).click();await f.page.getByRole('tab',{name:'Calls',exact:true}).waitFor();
  assert.equal(await f.page.evaluate(()=>window.__mediaTracks.every(track=>track.readyState==='ended')),true);
  await(await ended).finished();assert.equal(f.db.call_sessions[0].status,'ended');assert.deepEqual(f.errors,[]);
 }finally{await f.close();}
});

test('canonical and legacy terminal updates stop media, preserve history and cancel the missed-call timer',async()=>{
 for(const [status,label] of [['rejected','Declined'],['failed','Failed'],['declined','Declined']]){
  const f=await setup(server.base);
  try{
   await f.page.clock.install({time:new Date()});
   await f.page.evaluate(async()=>{const{supabase}=await import('/KONNEKT/src/lib_supabase.js');const original=supabase.channel.bind(supabase);supabase.channel=(name,...args)=>{const channel=original(name,...args);if(name.startsWith('konnekt-call-')){const on=channel.on.bind(channel);channel.on=(type,filter,callback)=>{if(filter.table==='call_sessions'&&filter.event==='UPDATE')window.__callSessionChanged=callback;return on(type,filter,callback);};}return channel;};});
   await mediaFixture(f);f.db.call_sessions[0].status=status;
   await f.page.evaluate(status=>window.__callSessionChanged({new:{status}}),status);await f.page.getByRole('tab',{name:'Calls',exact:true}).waitFor();
   await f.page.getByText(new RegExp('Outgoing.*'+label)).waitFor();assert.equal(await f.page.evaluate(()=>window.__mediaTracks.every(track=>track.readyState==='ended')),true);
   await f.page.clock.fastForward(46000);await frames(f.page);assert.equal(f.db.call_sessions[0].status,status);
   assert.equal(await f.page.getByRole('alertdialog',{name:'Call not answered',exact:true}).count(),0);assert.deepEqual(f.errors,[]);
  }finally{await f.close();}
 }
});

test('chat call controls wait for the selected conversation before creating a call',async()=>{
 const f=await setup(server.base,{db:{conversations:[{id:CHAT,title:'Loading Group',is_group:true,created_by:ME}]}});let held;
 try{
  await f.page.getByRole('tab',{name:'Chats',exact:true}).click();await f.page.getByText('Loading Group',{exact:true}).waitFor();
  held=await holdLookup(f,'conversations',url=>url.searchParams.get('select')==='is_group,created_by');
  await f.page.getByText('Loading Group',{exact:true}).click();await held.requested;
  const voice=f.page.getByRole('button',{name:'Start voice call',exact:true}),video=f.page.getByRole('button',{name:'Start video call',exact:true});
  assert.equal(await voice.isEnabled(),false);assert.equal(await video.isEnabled(),false);
  assert.equal(f.requests.filter(r=>r.method==='POST'&&r.path.endsWith('/group_call_sessions')).length,0);
  held.release();await voice.click();await f.page.getByText('Join call',{exact:true}).waitFor();
  await f.page.getByRole('button',{name:'Leave call',exact:true}).click();await f.page.getByRole('button',{name:'Start voice call',exact:true}).waitFor();assert.deepEqual(f.errors,[]);
 }finally{held?.release();await f.close();}
});
