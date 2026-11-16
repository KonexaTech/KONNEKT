const TYPES=['messages','calls','social','security'];
export const notificationPreferenceKey=userId=>'konnekt-notification-preferences:'+userId;
export function readPushPreferences(storage,userId){
  const flags=Object.fromEntries(TYPES.map(key=>[key,true]));
  try{const saved=JSON.parse(storage?.getItem(notificationPreferenceKey(userId))||'null');
    for(const setting of Array.isArray(saved?.settings)?saved.settings:[]){if(TYPES.includes(setting?.id)&&typeof setting.value==='boolean')flags[setting.id]=setting.value;}
  }catch{/* Account-scoped safe defaults; never borrow another account's settings. */}
  return flags;
}
export function installationKey(storage,cryptoImpl=globalThis.crypto){
  const name='konnekt-push-installation';let key=storage?.getItem(name);
  if(!/^[a-f0-9]{64}$/.test(key||'')){
    key=Array.from(cryptoImpl.getRandomValues(new Uint8Array(32)),x=>x.toString(16).padStart(2,'0')).join('');
    if(!storage)throw Error('Private device storage is unavailable.');
    storage.setItem(name,key);
  }
  return key;
}
export async function resolvePushIdentity({client,userId,appId,storage=globalThis.localStorage}){
  const prefs=readPushPreferences(storage,userId),key=installationKey(storage);
  const result=await client.rpc('konnekt_register_push_session',{p_device_key:key,p_user_id:userId,
    p_messages:prefs.messages,p_calls:prefs.calls,p_social:prefs.social,p_security:prefs.security});
  if(result.error||result.data?.user_id!==userId||(appId&&result.data?.app_id!==appId)||!/^ks_[a-f0-9]{64}$/.test(result.data?.external_id||''))throw Error('Secure notification registration is unavailable.');
  return result.data.external_id;
}
