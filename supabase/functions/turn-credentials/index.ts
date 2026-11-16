import {createClient} from 'npm:@supabase/supabase-js@2.119.0';
import {createTurnHandler} from './handler.mjs';
const projectUrl=Deno.env.get('SUPABASE_URL');
let relayUrls;try{relayUrls=JSON.parse(Deno.env.get('KONNEKT_TURN_URLS')||'null');}catch{relayUrls=null;}
Deno.serve(createTurnHandler({projectUrl,relayUrls,secret:Deno.env.get('KONNEKT_TURN_SECRET'),
 authorize:async(authorization:string)=>{
  const client=createClient(projectUrl||'https://invalid.local',Deno.env.get('SUPABASE_ANON_KEY')||'unconfigured',{
   global:{headers:{Authorization:authorization},fetch:(input:string|Request|URL,init?:RequestInit)=>fetch(input,{...init,signal:init?.signal||AbortSignal.timeout(5000)})},auth:{persistSession:false,autoRefreshToken:false},
  });
  const token=authorization.slice('Bearer '.length);
  const user=await client.auth.getUser(token);if(user.error||!user.data.user)return false;
  const result=await client.rpc('konnekt_authorize_turn',{p_user_id:user.data.user.id}).abortSignal(AbortSignal.timeout(5000));
  if(result.error)throw Error('Session authorization failed');
  return result.data===true;
 },
}));
