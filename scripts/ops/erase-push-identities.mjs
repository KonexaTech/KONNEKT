import {setTimeout as delay} from 'node:timers/promises';
const UUID=/^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;
const ALIAS=/^ks_[a-f0-9]{64}$/;
const failure=()=>new Error('Provider erasure could not be verified; preserve any processing lock and retry. No provider details are logged.');
export function providerCredentials(config,plan){
 if(!Array.isArray(plan?.app_ids)||!Array.isArray(plan?.targets)||!Number.isSafeInteger(plan?.pending_targets)||plan.pending_targets<0)throw Error('A trusted provider-erasure manifest is required.');
 if(plan.targets.length>100||plan.targets.length>plan.pending_targets||(plan.pending_targets>0&&!plan.targets.length))throw Error('Invalid trusted provider-erasure manifest.');
 if(config.pushProvider==='none'){
  if(plan.app_ids.length||plan.pending_targets)throw Error('A configured push provider requires verified erasure; pushProvider:none cannot bypass it.');
  return new Map();
 }
 if(config.pushProvider!=='onesignal'||!plan.app_ids.length)throw Error('A configured staging provider and its private credentials are required.');
 const entries=config.onesignalApps||[{appId:config.onesignalAppId,apiKey:config.onesignalApiKey}];
 if(!Array.isArray(entries))throw Error('Invalid private provider configuration.');
 const keys=new Map();
 for(const entry of entries){if(!UUID.test(entry?.appId||'')||typeof entry.apiKey!=='string'||entry.apiKey.length<16||keys.has(entry.appId))throw Error('Invalid private provider configuration.');keys.set(entry.appId,entry.apiKey);}
 for(const appId of plan.app_ids)if(!UUID.test(appId)||!keys.has(appId))throw Error('Credentials for every server-recorded provider app are required before deletion.');
 return new Map(plan.app_ids.map(appId=>[appId,keys.get(appId)]));
}
export function createProviderEraser({keys,targetUserId,fetchProvider=fetch,pause=delay}){
 async function call(url,method,appId){
  try{return await fetchProvider(url,{method,headers:{Authorization:'Key '+keys.get(appId),'Content-Type':'application/json'},redirect:'error',signal:AbortSignal.timeout(10000)});}catch{throw failure();}
 }
 return{
  async verifyApplications(){
   for(const appId of keys.keys()){
    const response=await call('https://api.onesignal.com/apps/'+appId+'?view=config','GET',appId);
    try{if(!response.ok||(await response.json())?.id!==appId)throw Error();}catch{throw failure();}
   }
  },
  async erase(target){
   if(!keys.has(target?.app_id)||(!ALIAS.test(target.external_id||'')&&target.external_id!==targetUserId))throw Error('Invalid server-owned provider target.');
   const url='https://api.onesignal.com/apps/'+target.app_id+'/users/by/external_id/'+encodeURIComponent(target.external_id);
   const deletion=await call(url,'DELETE',target.app_id);await deletion.body?.cancel().catch(()=>{});
   if(![200,202,204,404].includes(deletion.status))throw failure();
   for(let attempt=0;attempt<5;attempt++){
    const response=await call(url,'GET',target.app_id);await response.body?.cancel().catch(()=>{});
    if(response.status===404)return;
    if(response.status!==200)throw failure();
    if(attempt<4)await pause(1000);
   }
   throw failure();
  },
 };
}
