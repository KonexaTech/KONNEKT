import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readPushPreferences,installationKey,resolvePushIdentity,notificationPreferenceKey} from '../src/services/pushRegistration.js';
const storage=()=>{const data=new Map();return{getItem:k=>data.get(k)||null,setItem:(k,v)=>data.set(k,v)};};
test('device capability persists and notification preferences cannot bleed between accounts or accept malformed values',()=>{
 const store=storage(),key=installationKey(store);assert.match(key,/^[a-f0-9]{64}$/);assert.equal(installationKey(store),key);
 store.setItem('konnekt-notification-preferences',JSON.stringify({settings:[{id:'messages',value:false}]}));assert.equal(readPushPreferences(store,'A').messages,true);
 store.setItem(notificationPreferenceKey('A'),JSON.stringify({settings:[{id:'messages',value:false},{id:'calls',value:'false'},{id:'attacker',value:false}]}));assert.equal(readPushPreferences(store,'A').messages,false);assert.equal(readPushPreferences(store,'A').calls,true);assert.equal(readPushPreferences(store,'B').messages,true);
 assert.throws(()=>installationKey(null),/storage/);
});
test('native login uses only the current authenticated account opaque alias, never its public UUID',async()=>{
 const store=storage(),alias='ks_'+'b'.repeat(64),calls=[];
 let data={user_id:'A',external_id:alias};const client={rpc:async(name,args)=>{calls.push({name,args});return{data};}};
 assert.equal(await resolvePushIdentity({client,userId:'A',storage:store}),alias);assert.equal(calls[0].name,'konnekt_register_push_session');assert.match(calls[0].args.p_device_key,/^[a-f0-9]{64}$/);assert.equal(calls[0].args.p_messages,true);
 data={user_id:'B',external_id:alias};await assert.rejects(resolvePushIdentity({client,userId:'A',storage:store}),/unavailable/);
 data={user_id:'A',external_id:'A'};await assert.rejects(resolvePushIdentity({client,userId:'A',storage:store}),/unavailable/);
});
