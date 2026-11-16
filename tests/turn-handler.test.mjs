import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createHmac} from 'node:crypto';
import {createTurnHandler} from '../supabase/functions/turn-credentials/handler.mjs';
const SECRET='disposable-relay-shared-secret-fixture-only',URLS=['turn:relay.example.invalid:3478?transport=udp','turns:relay.example.invalid:5349?transport=tcp'];
const request=(auth='Bearer fixture-token',origin='https://localhost',method='GET')=>new Request('https://fixture.invalid/turn-credentials?ttl=86400',{method,headers:{Authorization:auth,Origin:origin}});
const setup=extra=>createTurnHandler({projectUrl:'https://oiwtfkgrnpzirghbsvim.supabase.co',relayUrls:URLS,secret:SECRET,authorize:async()=>true,now:()=>1700000000000,nonce:()=> 'private-fixture-nonce-123',...extra});
test('TURN credential issuance is authenticated, five-minute scoped, protocol-correct and contains no permanent secret or account ID',async()=>{
 const response=await setup()(request());assert.equal(response.status,200);assert.equal(response.headers.get('cache-control'),'no-store');assert.equal(response.headers.get('access-control-allow-origin'),'https://localhost');
 const data=await response.json();assert.equal(data.ttlSeconds,300);assert.deepEqual(data.iceServers[0].urls,URLS);assert.equal(data.iceServers[0].username,'1700000300:private-fixture-nonce-123');
 assert.equal(data.iceServers[0].credential,createHmac('sha1',SECRET).update(data.iceServers[0].username).digest('base64'));assert(!JSON.stringify(data).includes(SECRET));assert(!JSON.stringify(data).includes('fixture-token'));
});
test('TURN denies unknown origins, missing/invalid identity, unavailable authorization, production and malformed relay settings',async()=>{
 assert.equal((await setup()(request('','https://localhost'))).status,401);assert.equal((await setup()(request('Bearer token','https://evil.invalid'))).status,403);
 assert.equal((await setup({authorize:async()=>false})(request())).status,401);const failed=await setup({authorize:async()=>{throw Error('PRIVATE_AUTH_ERROR');}})(request());assert.equal(failed.status,503);assert(!(await failed.text()).includes('PRIVATE_AUTH_ERROR'));
 for(const extra of [{projectUrl:'https://itkoagpigiifodfhoujt.supabase.co'},{secret:''},{relayUrls:['https://relay.invalid']},{relayUrls:['turn:user:secret@relay.invalid']},{relayUrls:['turn:relay.invalid:99999']}])assert.equal((await setup(extra)(request())).status,503);
 const preflight=await setup()(request('','https://localhost','OPTIONS'));assert.equal(preflight.status,204);assert.equal((await setup()(request('Bearer token','https://localhost','POST'))).status,405);
});
