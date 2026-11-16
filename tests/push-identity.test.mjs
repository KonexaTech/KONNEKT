import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createPushIdentity as createIdentity } from '../src/services/pushIdentity.js';
const createPushIdentity=options=>createIdentity({resolveIdentity:async id=>id,...options});
const deferred = () => { let resolve; const promise = new Promise(r => { resolve = r; }); return { promise, resolve }; };

test('cold-start sign-out clears an identity cached by native code without prompting permission', async () => {
  let nativeUser='previous-account',prompts=0;
  const client={login:id=>{nativeUser=id;},logout:()=>{nativeUser=null;},Notifications:{requestPermission(){prompts++;}}};
  const change=createPushIdentity({enabled:true,loadClient:async()=>client});
  await change(null);assert.equal(nativeUser,null);assert.equal(prompts,0);
});

test('pending SDK load cannot register the signed-out account', async () => {
  const pending = deferred(), started = deferred(), events = [];
  const client = { login: id => events.push(id), logout: () => events.push('logout'), Notifications: { requestPermission() {} } };
  const change = createPushIdentity({ enabled: true, loadClient: () => { started.resolve(); return pending.promise; } });
  const first = change('A'); await started.promise;
  const last = change(null); pending.resolve(client); await Promise.all([first,last]);
  assert(!events.includes('A')); assert.equal(events.at(-1),'logout');
});
test('an unresolved permission prompt does not block logout or account switching', async () => {
  const events = [], permission = deferred();
  const client = { login: id => events.push(id), logout: () => events.push('logout'), Notifications: { requestPermission: () => permission.promise } };
  const change = createPushIdentity({ enabled: true, loadClient: async () => client });
  await change('A'); await change('B'); await change(null);
  assert.deepEqual(events,['logout','A','logout','B','logout']); permission.resolve(false);
});
test('a delayed native login is cleared before the next account registers', async () => {
  const pending = deferred(), started = deferred(), events = [];
  const client = { login: async id => { events.push(id); if(id==='A') { started.resolve(); await pending.promise; } }, logout: () => events.push('logout'), Notifications: { requestPermission() {} } };
  const change = createPushIdentity({ enabled: true, loadClient: async () => client });
  const first = change('A'); await started.promise; const last = change('B'); pending.resolve(); await Promise.all([first,last]);
  assert.deepEqual(events,['logout','A','logout','B']);
});
test('failed login clears partial native state; later sign-in can recover', async () => {
  const events = [];let fail = true, errors = 0;
  const client = { login: id => { events.push(id);if(fail)throw Error('provider private payload'); }, logout: () => events.push('logout'), Notifications: { requestPermission() {} } };
  const change = createPushIdentity({ enabled: true, loadClient: async () => client, onError: () => errors++ });
  await change('A');fail=false;await change('B');await change(null);
  assert.deepEqual(events,['logout','A','logout','B','logout']);assert.equal(errors,1);
});

test('transient permission-request errors can recover on a later sign-in without repeatedly prompting after an ordinary denial',async()=>{
 let prompts=0,errors=0;
 const client={login(){},logout(){},Notifications:{requestPermission(){prompts++;if(prompts===1)return Promise.reject(Error('transient native failure'));return Promise.resolve(false);}}};
 const change=createPushIdentity({enabled:true,loadClient:async()=>client,onError:()=>errors++});
 await change('A');await new Promise(resolve=>setImmediate(resolve));
 await change('B');await new Promise(resolve=>setImmediate(resolve));
 await change(null);await change('C');
 assert.equal(prompts,2);assert.equal(errors,1);
});

test('secure resolver is required and a delayed old-account identity never logs in',async()=>{
 assert.throws(()=>createIdentity({enabled:true,loadClient:async()=>({})}),/secure notification identity resolver/);
 const pending=deferred(),started=deferred(),events=[];
 const client={login:id=>events.push(id),logout:()=>events.push('logout'),Notifications:{requestPermission(){}}};
 const change=createPushIdentity({enabled:true,loadClient:async()=>client,resolveIdentity:async id=>{if(id==='A'){started.resolve();await pending.promise;}return 'private-alias-'+id;}});
 const a=change('A');await started.promise;const b=change('B');pending.resolve();await Promise.all([a,b]);
 assert(!events.includes('private-alias-A'));assert(events.includes('private-alias-B'));
});

test('a renewed sign-in for the same account replaces its old provider alias',async()=>{
 let alias='old-private-alias';const events=[];
 const client={login:id=>events.push(id),logout(){},Notifications:{requestPermission(){}}};
 const change=createPushIdentity({enabled:true,loadClient:async()=>client,resolveIdentity:async()=>alias});
 await change('A');alias='new-private-alias';await change('A');assert.deepEqual(events,['old-private-alias','new-private-alias']);
});
