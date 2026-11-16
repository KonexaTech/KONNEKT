import { createClient } from '@supabase/supabase-js';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import { readOperationsConfig } from './staging-config.mjs';
import {providerCredentials,createProviderEraser} from './erase-push-identities.mjs';

const checked=async promise=>{const result=await promise;if(result.error)throw new Error('Deletion operation failed; keep any processing account locked for operator retry. No completion confirmed.');return result.data;};

// All targets come from the private operator config, never a browser request.
// Normal operation is a read-only plan. Execute requires explicit backup and
// disposable-account confirmations; only the existing staging URL is accepted.
export async function deleteStagingAccount({ client, config, execute=false, confirmUserId, fetchProvider, pause }) {
  const target=config.deletionUserId;
  if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(target||''))throw new Error('Select a dedicated staging deletion account UUID in private config.');
  if(config.projectUrl!=='https://oiwtfkgrnpzirghbsvim.supabase.co'||(client.supabaseUrl&&client.supabaseUrl.replace(/\/$/,'')!==config.projectUrl))throw new Error('Staging only.');
  const requests=await checked(client.from('account_deletion_requests').select('status').eq('user_id',target));
  if(requests?.some(row=>row.status==='completed')&&!requests.some(row=>['requested','processing'].includes(row.status))){
    const result=await client.auth.admin.getUserById(target);
    if(result.error&&Number(result.error.status)===404)return {status:'ALREADY_COMPLETED'};
    if(result.data?.user)throw Error('A completed deletion has a restored Auth identity; use the reviewed tombstone/restore procedure.');
    throw Error('Completed account absence could not be verified; no completion confirmed.');
  }
  const plan=await checked(client.rpc('konnekt_deletion_plan',{target_user:target}));
  if(typeof plan?.account_exists!=='boolean'||!Number.isSafeInteger(plan?.owned_files))throw Error('Invalid trusted deletion plan.');
  const providerPlan=await checked(client.rpc('konnekt_deletion_push_plan',{target_user:target}));
  if(!providerPlan||!Number.isSafeInteger(providerPlan.pending_targets))throw Error('The trusted provider-erasure plan is unavailable; no changes made.');
  if(!execute)return {status:'PLAN_ONLY',plan:{account_exists:plan.account_exists,sent_messages:plan.sent_messages,owned_files:plan.owned_files,provider_targets:providerPlan.pending_targets}};
  if(confirmUserId!==target||config.allowStagingDeletion!==true||config.disposableStagingAccount!==true||config.backupVerified!==true)throw new Error('Execution needs matching --confirm UUID, allowStagingDeletion, disposableStagingAccount and backupVerified; no changes made.');
  const keys=providerCredentials(config,providerPlan);
  const eraser=createProviderEraser({keys,targetUserId:target,fetchProvider,pause});
  await eraser.verifyApplications(); // Read-only proof that each key belongs to its recorded app.
  await checked(client.rpc('konnekt_deletion_push_prepare',{target_user:target}));
  for(let batch=0;;batch++){
    if(batch>=1000)throw Error('Provider-erasure batch limit reached; keep the account locked and retry.');
    const manifest=await checked(client.rpc('konnekt_deletion_push_plan',{target_user:target}));
    providerCredentials(config,manifest);
    if(!manifest.pending_targets)break;
    if(!manifest.targets.length)throw Error('Provider-erasure manifest did not progress; account remains locked.');
    for(const identity of manifest.targets){
      await eraser.erase(identity);
      const marked=await checked(client.rpc('konnekt_deletion_push_mark_erased',{target_user:target,p_app_id:identity.app_id,p_external_id:identity.external_id}));
      if(marked!==true)throw Error('Provider-erasure result could not be recorded; keep the account locked and retry.');
    }
  }
  let previousBatch=null;
  for(let batch=0; ;batch++){
    if(batch>=1000)throw new Error('Deletion batch limit reached; keep the account locked and retry.');
    const files=await checked(client.rpc('konnekt_deletion_files',{target_user:target}));
    if(!files?.length)break;
    const fingerprint=JSON.stringify(files);
    if(fingerprint===previousBatch)throw new Error('Storage removal did not progress; keep the account locked and retry.');
    previousBatch=fingerprint;
    const buckets=new Map();
    for(const file of files){
      if(typeof file.bucket_id!=='string'||typeof file.name!=='string'||!file.name)throw new Error('Invalid server-owned file manifest.');
      if(!buckets.has(file.bucket_id))buckets.set(file.bucket_id,[]);
      buckets.get(file.bucket_id).push(file.name);
    }
    for(const [bucket,paths] of buckets)await checked(client.storage.from(bucket).remove(paths));
  }
  if(plan.account_exists)await checked(client.auth.admin.deleteUser(target));
  await checked(client.rpc('konnekt_deletion_complete',{target_user:target}));
  return {status:'COMPLETED'};
}

if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
  try{
    const config=await readOperationsConfig(process.env.KONNEKT_OPERATIONS_CONFIG);
    const client=createClient(config.projectUrl,config.serviceKey,{auth:{persistSession:false,autoRefreshToken:false}});
    const index=process.argv.indexOf('--confirm');
    const result=await deleteStagingAccount({client,config,execute:process.argv.includes('--execute'),confirmUserId:index<0?undefined:process.argv[index+1]});
    console.log(JSON.stringify(result));
  }catch(error){console.error(error.message.startsWith('Unexpected')?'Invalid private operations configuration.':error.message);process.exitCode=1;}
}
