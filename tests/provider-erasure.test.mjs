import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createProviderEraser,providerCredentials} from '../scripts/ops/erase-push-identities.mjs';
import {deleteStagingAccount} from '../scripts/ops/delete-account.mjs';
const USER='11111111-1111-4111-8111-111111111111',APP='22222222-2222-4222-8222-222222222222',ALIAS='ks_'+'a'.repeat(64),KEY='disposable-provider-key-fixture-only';
const config={projectUrl:'https://oiwtfkgrnpzirghbsvim.supabase.co',deletionUserId:USER,allowStagingDeletion:true,disposableStagingAccount:true,backupVerified:true,pushProvider:'onesignal',onesignalAppId:APP,onesignalApiKey:KEY};
const plan={app_ids:[APP],pending_targets:1,targets:[{app_id:APP,external_id:ALIAS}]};
test('provider erasure verifies app/key, waits for actual absence after asynchronous delete and never exposes provider payloads',async()=>{
 const events=[];let checks=0;
 const eraser=createProviderEraser({keys:providerCredentials(config,plan),targetUserId:USER,pause:async()=>{},fetchProvider:async(url,options)=>{
  events.push([url,options.method]);assert.equal(options.redirect,'error');assert.equal(options.headers.Authorization,'Key '+KEY);
  if(url.includes('?view=config'))return Response.json({id:APP,fcm_credentials:'PRIVATE_PROVIDER_CREDENTIALS'});
  if(options.method==='DELETE')return Response.json({identity:'PRIVATE_PROVIDER_DATA'},{status:202});
  return checks++?new Response(null,{status:404}):Response.json({subscriptions:['PRIVATE_DEVICE_DATA']});
 }});
 await eraser.verifyApplications();assert.equal(await eraser.erase(plan.targets[0]),undefined);assert.deepEqual(events.map(x=>x[1]),['GET','DELETE','GET','GET']);
});
test('wrong app, unavailable credentials, never-completed deletion and provider errors fail before false completion',async()=>{
 assert.throws(()=>providerCredentials({...config,pushProvider:'none'},plan),/cannot bypass/);assert.throws(()=>providerCredentials({...config,onesignalApiKey:''},plan),/private provider/);
 for(const fetchProvider of [async()=>Response.json({id:USER}),async()=>Response.json({error:'PRIVATE_TOKEN'},{status:403})]){
  const eraser=createProviderEraser({keys:providerCredentials(config,plan),targetUserId:USER,fetchProvider,pause:async()=>{}});
  await assert.rejects(eraser.verifyApplications(),e=>!e.message.includes('PRIVATE_TOKEN'));
 }
 const eraser=createProviderEraser({keys:providerCredentials(config,plan),targetUserId:USER,pause:async()=>{},fetchProvider:async()=>Response.json({private:'PRIVATE_VALUE'})});
 await assert.rejects(eraser.erase(plan.targets[0]),/could not be verified/);await assert.rejects(eraser.erase({app_id:APP,external_id:'another-user'}),/server-owned/);
});
function clientFixture(){
 const events=[];let pending=true,files=true;
 const client={events,from:()=>({select:()=>({eq:async()=>({data:[{status:'requested'}]})})}),rpc:async name=>{
  events.push(name);if(name==='konnekt_deletion_plan')return{data:{account_exists:true,owned_files:1}};
  if(name==='konnekt_deletion_push_plan')return{data:{...plan,pending_targets:pending?1:0,targets:pending?plan.targets:[]}};
  if(name==='konnekt_deletion_push_mark_erased'){pending=false;return{data:true};}
  if(name==='konnekt_deletion_files')return{data:files?[{bucket_id:'private',name:'owned.enc'}]:[]};return{data:null};
 },storage:{from:()=>({remove:async()=>{events.push('removeFiles');files=false;return{};}})},auth:{admin:{deleteUser:async()=>{events.push('deleteAuth');return{};}}}};
 return client;
}
test('operator locks/revokes first, verifies provider erasure before files/Auth and stops on provider failure',async()=>{
 let client=clientFixture();const fetchProvider=async(url,options)=>{client.events.push('provider:'+options.method);return url.includes('?view=config')?Response.json({id:APP}):new Response(null,{status:options.method==='DELETE'?202:404});};
 const result=await deleteStagingAccount({client,config,execute:true,confirmUserId:USER,fetchProvider,pause:async()=>{}});assert.equal(result.status,'COMPLETED');
 assert(client.events.indexOf('konnekt_deletion_push_prepare')<client.events.indexOf('provider:DELETE'));assert(client.events.indexOf('konnekt_deletion_push_mark_erased')<client.events.indexOf('removeFiles'));assert(client.events.indexOf('removeFiles')<client.events.indexOf('deleteAuth'));
 client=clientFixture();await assert.rejects(deleteStagingAccount({client,config,execute:true,confirmUserId:USER,pause:async()=>{},fetchProvider:async(url)=>url.includes('?view=config')?Response.json({id:APP}):Response.json({error:'PRIVATE_PROVIDER_FAILURE'},{status:503})}),/could not be verified/);
 assert(!client.events.includes('deleteAuth'));assert(!client.events.includes('removeFiles'));assert(!client.events.includes('konnekt_deletion_complete'));
 client=clientFixture();let providerCalls=0;assert.equal((await deleteStagingAccount({client,config,fetchProvider:async()=>{providerCalls++;}})).status,'PLAN_ONLY');assert.equal(providerCalls,0);assert(!client.events.includes('konnekt_deletion_push_prepare'));
});

test('completed deletion cannot silently approve a restored Auth identity and mismatched backend clients are rejected',async()=>{
 const client=clientFixture();client.from=()=>({select:()=>({eq:async()=>({data:[{status:'completed'}]})})});
 client.auth.admin.getUserById=async()=>({data:{user:{id:USER}}});await assert.rejects(deleteStagingAccount({client,config}),/restored Auth identity/);
 client.auth.admin.getUserById=async()=>({error:{status:404}});assert.equal((await deleteStagingAccount({client,config})).status,'ALREADY_COMPLETED');
 client.supabaseUrl='https://itkoagpigiifodfhoujt.supabase.co';await assert.rejects(deleteStagingAccount({client,config}),/Staging only/);
});
