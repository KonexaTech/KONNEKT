import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createNotificationOpener} from '../src/services/pushOpen.js';
import {browserAlertFor} from '../src/services/browserAlerts.js';
const click={notification:{additionalData:{screen:'Notifications',recipient_id:'OTHER',conversation_id:'PRIVATE',url:'https://untrusted.invalid'}}};

test('cold notification taps wait for authenticated security readiness; only a generic navigation is delivered',()=>{
 let time=0,opens=0;const opener=createNotificationOpener({now:()=>time});
 assert.equal(opener.receive(click),true);
 const stop=opener.subscribe((...args)=>{assert.deepEqual(args,[]);opens++;});
 opener.setSession({userId:'A',ready:false,loading:true});assert.equal(opens,0);
 opener.setSession({userId:'A',ready:false,loading:false});assert.equal(opens,0,'MFA or recovery must not be bypassed');
 opener.setSession({userId:'A',ready:true,loading:false});assert.equal(opens,1);
 opener.setSession({userId:'A',ready:true,loading:false});assert.equal(opens,1);
 assert.equal(opener.receive({notification:{additionalData:{screen:'Moderator'}}}),false);assert.equal(opens,1);
 stop();opener.receive(click);time=60001;opener.subscribe(()=>opens++);assert.equal(opens,1,'Expired taps must not navigate later');
});

test('logout, account switches and pending authentication never replay another account intent',()=>{
 let opens=0;const opener=createNotificationOpener();opener.subscribe(()=>opens++);
 opener.setSession({userId:'A',ready:false,loading:false});opener.receive(click);
 opener.setSession({userId:'B',ready:true,loading:false});assert.equal(opens,0);
 opener.setSession({userId:'A',ready:false,loading:true});opener.receive(click);
 opener.setSession({userId:null,ready:false,loading:false});assert.equal(opener.receive(click),false);
 opener.setSession({userId:'B',ready:true,loading:false});assert.equal(opens,0);
 opener.receive(click);assert.equal(opens,1);
});

test('browser alerts contain no private text and honor only the current recipient preferences',()=>{
 const saved=new Map(),storage={getItem:key=>saved.get(key)};
 const record={id:'private-id',recipient_id:'A',actor_id:'private-actor',type:'message',body:'PRIVATE TEXT',reference_id:'PRIVATE CHAT'};
 assert.deepEqual(browserAlertFor(record,{userId:'A',storage}),{title:'KONNEKT',options:{body:'You have new activity on KONNEKT.'}});
 for(const change of [{recipient_id:'B'},{read_at:'2026-11-17T00:00:00Z'},{type:'unknown'}])assert.equal(browserAlertFor({...record,...change},{userId:'A',storage}),null);
 saved.set('konnekt-notification-preferences:B',JSON.stringify({settings:[{id:'messages',value:false}]}));
 assert(browserAlertFor(record,{userId:'A',storage}));
 saved.set('konnekt-notification-preferences:A',JSON.stringify({settings:[{id:'messages',value:false}]}));
 assert.equal(browserAlertFor(record,{userId:'A',storage}),null);
 assert(browserAlertFor({...record,type:'follow'},{userId:'A',storage}));
});
