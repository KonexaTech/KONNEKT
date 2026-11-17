import { Capacitor } from '@capacitor/core';
import { createPushIdentity } from './services/pushIdentity';
import { supabase,SUPABASE_URL,SUPABASE_PUBLISHABLE_KEY } from './lib_supabase';
import { resolvePushIdentity,installationKey } from './services/pushRegistration';
import { notificationOpener } from './services/pushOpen';

const appId = import.meta.env.VITE_ONESIGNAL_APP_ID;
const enabled=!!appId&&Capacitor.isNativePlatform();
export async function syncPushPreferences(userId){
  if(enabled)await resolvePushIdentity({client:supabase,userId,appId});
}
export async function retirePushSession(accessToken){
  if(!enabled||!accessToken)return;
  try{
    const response=await fetch(SUPABASE_URL+'/rest/v1/rpc/konnekt_unregister_push_session',{method:'POST',
      headers:{apikey:SUPABASE_PUBLISHABLE_KEY,Authorization:'Bearer '+accessToken,'Content-Type':'application/json'},
      body:JSON.stringify({p_device_key:installationKey(globalThis.localStorage)}),signal:AbortSignal.timeout(5000)});
    if(!response.ok)throw Error();
  }catch{console.warn('Notification session cleanup will retry at the next sign-in.');}
}
export const initialisePushNotifications = createPushIdentity({
  enabled,
  resolveIdentity:userId=>resolvePushIdentity({client:supabase,userId,appId}),
  loadClient: async () => {
    const sdk = await import('onesignal-cordova-plugin');
    const client = sdk.default || sdk.OneSignal;
    client.initialize(appId);
    client.Notifications.addEventListener('click', event=>notificationOpener.receive(event));
    return client;
  },
  onError: () => console.warn('KONNEKT push identity update failed; retry sign-in before relying on notifications.'),
});
