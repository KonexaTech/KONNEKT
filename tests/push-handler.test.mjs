import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createPushHandler} from '../supabase/functions/dispatch-push/handler.mjs';
const ID='11111111-1111-4111-8111-111111111111',APP='22222222-2222-4222-8222-222222222222',ALIAS='ks_'+'a'.repeat(64),SECRET='disposable-webhook-fixture-secret-only',APIKEY='disposable-api-key-fixture-only';
const event={type:'INSERT',schema:'public',table:'notifications',record:{id:ID,recipient_id:'ATTACKER_TARGET',body:'PRIVATE MESSAGE',external_id:'FORGED_ALIAS'}};
const request=(body=event,secret=SECRET)=>new Request('https://fixture.invalid/dispatch',{method:'POST',headers:{Authorization:'Bearer '+secret},body:typeof body==='string'?body:JSON.stringify(body)});
function setup(extra={}){
 const calls=[],lookups=[];
 const handler=createPushHandler({projectUrl:'https://oiwtfkgrnpzirghbsvim.supabase.co',appId:APP,apiKey:APIKEY,webhookSecret:SECRET,
  resolveDelivery:async id=>{lookups.push(id);return{aliases:[ALIAS],category:'messages',ttl:3600};},
  fetchProvider:async(url,options)=>{calls.push({url,...options,body:JSON.parse(options.body)});return Response.json({id:ID});},...extra});
 return{handler,calls,lookups};
}
test('push webhook rejects missing configuration, production, wrong credentials, oversized or malformed requests without looking up targets',async()=>{
 for(const extra of [{apiKey:''},{projectUrl:'https://itkoagpigiifodfhoujt.supabase.co'},{webhookSecret:'short'}]){const f=setup(extra);assert.equal((await f.handler(request())).status,503);assert.equal(f.lookups.length,0);}
 const f=setup();assert.equal((await f.handler(request(event,'wrong'))).status,401);assert.equal((await f.handler(request('x'.repeat(9000)))).status,400);assert.equal((await f.handler(request('{'))).status,400);
 for(const change of [{type:'UPDATE'},{schema:'auth'},{table:'messages'},{record:{id:'bad'}}])assert.equal((await f.handler(request({...event,...change}))).status,400);
 assert.deepEqual(f.lookups,[]);assert.deepEqual(f.calls,[]);
});
test('trusted targets only; no plaintext, actor/recipient IDs or reference leak, fixed retry idempotency and no provider redirects',async()=>{
 const f=setup();for(let n=0;n<2;n++)assert.deepEqual(await(await f.handler(request())).json(),{status:'accepted'});
 assert.deepEqual(f.lookups,[ID,ID]);assert.equal(f.calls.length,2);
 for(const call of f.calls){assert.equal(call.url,'https://api.onesignal.com/notifications');assert.equal(call.redirect,'error');assert.equal(call.headers.Authorization,'Key '+APIKEY);assert.equal(call.body.idempotency_key,ID);assert.deepEqual(call.body.include_aliases,{external_id:[ALIAS]});assert.equal(call.body.target_channel,'push');assert.equal(call.body.ttl,3600);assert.deepEqual(call.body.data,{screen:'Notifications'});assert(!JSON.stringify(call.body).includes('PRIVATE MESSAGE'));assert(!JSON.stringify(call.body).includes('ATTACKER_TARGET'));assert(!JSON.stringify(call.body).includes('FORGED_ALIAS'));}
});
test('no active targets skips provider, invalid targets fail closed, provider outages and no-recipient responses never report acceptance',async()=>{
 let f=setup({resolveDelivery:async()=>({aliases:[],category:null,ttl:3600})});assert.deepEqual(await(await f.handler(request())).json(),{status:'skipped'});assert.equal(f.calls.length,0);
 for(const delivery of [{aliases:[ID],category:'messages',ttl:1},{aliases:[ALIAS],category:'forged',ttl:1},{aliases:[ALIAS],category:'messages',ttl:9000},{aliases:Array(101).fill(ALIAS),category:'messages',ttl:1}]){f=setup({resolveDelivery:async()=>delivery});assert.equal((await f.handler(request())).status,503);assert.equal(f.calls.length,0);}
 for(const fetchProvider of [async()=>{throw Error('PRIVATE_PROVIDER_ERROR');},async()=>Response.json({error:'PRIVATE_PROVIDER_ERROR'},{status:429}),async()=>Response.json({id:'',errors:['PRIVATE_PROVIDER_ERROR']})]){f=setup({fetchProvider});const response=await f.handler(request());assert.equal(response.status,503);assert(!(await response.text()).includes('PRIVATE_PROVIDER_ERROR'));}
});
