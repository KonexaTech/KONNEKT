import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createPushIdentity } from '../src/services/pushIdentity.js';
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
