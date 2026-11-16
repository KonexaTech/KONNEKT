import { createClient } from 'npm:@supabase/supabase-js@2.119.0';
import { createPushHandler } from './handler.mjs';
const projectUrl=Deno.env.get('SUPABASE_URL');
const client=createClient(projectUrl||'https://invalid.local',Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')||'unconfigured',{
  auth:{persistSession:false,autoRefreshToken:false},
});
async function rpc(name:string,args:Record<string,unknown>){
  const result=await client.rpc(name,args).abortSignal(AbortSignal.timeout(5000));
  if(result.error)throw Error('Push operation unavailable');
  return result.data;
}
Deno.serve(createPushHandler({projectUrl,
  appId:Deno.env.get('KONNEKT_ONESIGNAL_APP_ID'),apiKey:Deno.env.get('KONNEKT_ONESIGNAL_API_KEY'),
  webhookSecret:Deno.env.get('KONNEKT_PUSH_WEBHOOK_SECRET'),
  claimNotifications:(notificationId:string|null,limit:number)=>rpc('konnekt_claim_push_notifications',{p_notification_id:notificationId,p_limit:limit}),
  completeNotification:(notificationId:string,leaseToken:string,result:string,providerId:string|null)=>rpc('konnekt_complete_push_notification',{
    p_notification_id:notificationId,p_lease_token:leaseToken,p_result:result,p_provider_id:providerId,
  }),
  resolveDelivery:(notificationId:string)=>rpc('konnekt_push_delivery',{notification_id:notificationId}),
}));
