import {createClient} from 'npm:@supabase/supabase-js@2.119.0';
import {createCleanupSocialHandler} from './handler.mjs';
const projectUrl=Deno.env.get('SUPABASE_URL');
const serviceKey=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
const publicKey=Deno.env.get('SUPABASE_ANON_KEY');
const options={auth:{persistSession:false,autoRefreshToken:false},global:{fetch:(input:string|Request|URL,init?:RequestInit)=>fetch(input,{...init,signal:init?.signal||AbortSignal.timeout(5000)})}};
// Server environment only. Never accept a project, bucket, actor or key from
// the browser body; one authenticated request can retire one owned social path.
const admin=createClient(projectUrl||'https://invalid.local',serviceKey||'unconfigured',options);
async function rpc(name:string,args:Record<string,unknown>){
 const result=await admin.rpc(name,args).abortSignal(AbortSignal.timeout(5000));
 if(result.error)throw Error('Cleanup guard unavailable');
 return result.data;
}
Deno.serve(createCleanupSocialHandler({projectUrl,configured:!!serviceKey&&!!publicKey,
 authorize:async(authorization:string)=>{
  const client=createClient(projectUrl||'https://invalid.local',publicKey||'unconfigured',{...options,global:{...options.global,headers:{Authorization:authorization}}});
  const token=authorization.slice(7),user=await client.auth.getUser(token);
  if(user.error||!user.data.user)return null;
  // Existing guarded RPC verifies session ownership/expiry, banned users,
  // enrolled MFA, deletion state and beta admission without exposing metadata.
  const allowed=await client.rpc('konnekt_authorize_turn',{p_user_id:user.data.user.id}).abortSignal(AbortSignal.timeout(5000));
  if(allowed.error)throw Error('Session authorization unavailable');
  if(allowed.data!==true)return null;
  const claims=JSON.parse(atob(token.split('.')[1].replace(/-/g,'+').replace(/_/g,'/')));
  return {id:user.data.user.id,sessionId:claims.session_id};
 },
 claim:(actor:{id:string,sessionId:string},path:string)=>rpc('konnekt_claim_social_cleanup',{p_actor:actor.id,p_session:actor.sessionId,p_path:path}),
 remove:async(path:string)=>{const result=await admin.storage.from('konnekt-public-media').remove([path]);if(result.error)throw Error('Storage cleanup failed');},
 verifyAbsent:(actor:{id:string},path:string)=>rpc('konnekt_social_cleanup_absent',{p_actor:actor.id,p_path:path}),
}));
