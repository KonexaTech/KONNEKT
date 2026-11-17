import {before,after,test} from 'node:test';
import assert from 'node:assert/strict';
import {startServer,setup,openFeature,ME,OTHER,CHAT} from './helpers.mjs';
let server;before(async()=>{server=await startServer();});after(()=>server?.stop());
const tap=page=>page.evaluate(async()=>{
 const {notificationOpener}=await import('/KONNEKT/src/services/pushOpen.js');
 return notificationOpener.receive({notification:{additionalData:{screen:'Notifications',recipient_id:'FORGED',url:'https://untrusted.invalid'}}});
});

test('notification intent opens only the current account inbox; signed-out and unknown routes cannot open protected screens',async()=>{
 const f=await setup(server.base,{db:{notifications:[{id:CHAT,recipient_id:ME,type:'message',body:'Own account activity'},{id:OTHER,recipient_id:OTHER,type:'message',body:'OTHER PRIVATE ACTIVITY'}]}});
 try{
  assert.equal(await tap(f.page),true);await f.page.getByText('Notifications',{exact:true}).waitFor();await f.page.getByText('Own account activity',{exact:true}).waitFor();
  assert.equal(await f.page.getByText('OTHER PRIVATE ACTIVITY',{exact:true}).count(),0);
  for(const width of [320,390,1280]){await f.page.setViewportSize({width,height:844});assert.equal(await f.page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);}
  const reads=f.requests.filter(r=>r.method==='GET'&&r.path.endsWith('/notifications'));assert(reads.length);assert(reads.every(r=>new URLSearchParams(r.search).get('recipient_id')==='eq.'+ME));
  await tap(f.page);await f.page.getByText('‹ Back',{exact:true}).click();await f.page.getByRole('tab',{name:'Reels',exact:true}).waitFor();
  assert.equal(await f.page.evaluate(async()=>{const{notificationOpener}=await import('/KONNEKT/src/services/pushOpen.js');return notificationOpener.receive({notification:{additionalData:{screen:'Moderator'}}});}),false);
  await f.page.getByRole('tab',{name:'Profile',exact:true}).click();await f.page.getByText('LOG OUT',{exact:true}).click();await f.page.getByText('SIGN UP',{exact:true}).waitFor();
  assert.equal(await tap(f.page),false);assert.equal(await f.page.getByText('Own account activity',{exact:true}).count(),0);assert.deepEqual(f.errors,[]);
 }finally{await f.close();}
});

test('foreground browser alerts are generic, suppress wrong recipients and opt-outs, and stop after screen cleanup',async()=>{
 const f=await setup(server.base);
 try{
  await f.page.evaluate(async()=>{
   window.__desktopAlerts=[];
   window.Notification=class{static permission='granted';constructor(title,options){window.__desktopAlerts.push({title,options});}};
   const{supabase}=await import('/KONNEKT/src/lib_supabase.js');const original=supabase.channel.bind(supabase);
   supabase.channel=(name,...args)=>{const channel=original(name,...args);if(name.startsWith('notifications-')){const on=channel.on.bind(channel);channel.on=(type,filter,callback)=>{window.__notificationCallback=callback;return on(type,filter,callback);};}return channel;};
  });
  await openFeature(f.page,'Notifications');await f.page.getByText('Your notifications will appear here.',{exact:true}).waitFor();
  const result=await f.page.evaluate(({me,other})=>{
   const emit=(id,recipient)=>window.__notificationCallback({new:{id,recipient_id:recipient,type:'message',body:'PRIVATE FOREGROUND '+id}});
   emit('other',other);emit('enabled',me);
   localStorage.setItem('konnekt-notification-preferences:'+me,JSON.stringify({settings:[{id:'messages',value:false}]}));emit('muted',me);
   return window.__desktopAlerts;
  },{me:ME,other:OTHER});
  assert.deepEqual(result,[{title:'KONNEKT',options:{body:'You have new activity on KONNEKT.'}}]);
  await f.page.getByText('PRIVATE FOREGROUND muted',{exact:true}).waitFor();assert.equal(await f.page.getByText('PRIVATE FOREGROUND other',{exact:true}).count(),0);
  await f.page.getByText('‹ Back',{exact:true}).click();
  assert.equal(await f.page.evaluate(me=>{localStorage.removeItem('konnekt-notification-preferences:'+me);window.__notificationCallback({new:{id:'late',recipient_id:me,type:'message',body:'PRIVATE LATE'}});return window.__desktopAlerts.length;},ME),1);
  assert.deepEqual(f.errors,[]);
 }finally{await f.close();}
});
