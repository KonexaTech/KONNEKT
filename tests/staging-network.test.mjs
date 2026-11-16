import { test } from 'node:test';
import assert from 'node:assert/strict';
import { installStagingNetwork } from '../scripts/acceptance/staging-network.mjs';
import { APP_ORIGIN,STAGING_ORIGIN } from '../scripts/acceptance/staging-config.mjs';
function context(){const handlers={};return{handlers,route:async(_pattern,handler)=>{handlers.http=handler;},routeWebSocket:async(_pattern,handler)=>{handlers.ws=handler;}};}
test('staging network blocks production/unknown origins and retains native local sockets',async()=>{
 const c=context(),violations=[];const stop=await installStagingNetwork(c,{onViolation:m=>violations.push(m)});
 try{
  let aborted=false,closed=false,local=false;
  await c.handlers.http({request:()=>({url:()=> 'https://itkoagpigiifodfhoujt.supabase.co/rest/v1/profiles'}),abort:()=>{aborted=true;}});
  c.handlers.ws({url:()=> 'wss://unknown.invalid/socket',close:()=>{closed=true;}});
  c.handlers.ws({url:()=>APP_ORIGIN.replace('http:','ws:')+'/KONNEKT/',connectToServer:()=>{local=true;}});
  assert(aborted);assert(closed);assert(local);assert.equal(violations.length,2);
 }finally{stop();}
});
test('proxied HTTP forwards real responses without following redirects or fabricating data',async()=>{
 const c=context(),violations=[];const stop=await installStagingNetwork(c,{proxy:{server:'http://proxy.invalid:8080'},onViolation:m=>violations.push(m)});
 try{
  const upstream={fixture:'opaque server response'};let forwarded,options;
  await c.handlers.http({request:()=>({url:()=>STAGING_ORIGIN+'/auth/v1/health'}),fetch:async opts=>{options=opts;return upstream;},fulfill:async value=>{forwarded=value;},abort:async()=>{throw Error('Unexpected abort');}});
  assert.deepEqual(options,{maxRedirects:0});assert.equal(forwarded.response,upstream);assert.equal(violations.length,0);
 }finally{stop();}
});
