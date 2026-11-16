import { createClient } from 'npm:@supabase/supabase-js@2.119.0';
import { createPushHandler } from './handler.mjs';
const projectUrl=Deno.env.get('SUPABASE_URL');
const client=createClient(projectUrl||'https://invalid.local',Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')||'unconfigured',{
  auth:{persistSession:false,autoRefreshToken:false},
});
Deno.serve(createPushHandler({projectUrl,
  appId:Deno.env.get('KONNEKT_ONESIGNAL_APP_ID'),apiKey:Deno.env.get('KONNEKT_ONESIGNAL_API_KEY'),
  webhookSecret:Deno.env.get('KONNEKT_PUSH_WEBHOOK_SECRET'),
  resolveDelivery:async(notificationId:string)=>{
    const result=await client.rpc('konnekt_push_delivery',{notification_id:notificationId});
    if(result.error)throw Error('Delivery lookup failed');
    return result.data;
  },
}));
