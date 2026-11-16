import {pathToFileURL} from 'node:url';
export const STAGING_ORIGIN='https://oiwtfkgrnpzirghbsvim.supabase.co';
export function validateStagingIntegrations(env){
 if(env.VITE_SUPABASE_URL?.replace(/\/$/,'')!==STAGING_ORIGIN)throw Error('Use the existing konnekt-staging backend.');
 if(!/^sb_publishable_[a-zA-Z0-9_-]+$/.test(env.VITE_SUPABASE_PUBLISHABLE_KEY||''))throw Error('Only the staging publishable key is accepted.');
 if(env.VITE_ONESIGNAL_APP_ID&&!/^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(env.VITE_ONESIGNAL_APP_ID))throw Error('Supply only a public OneSignal App ID, never a server key.');
 if(env.VITE_TURN_CREDENTIALS_URL){
  let url;try{url=new URL(env.VITE_TURN_CREDENTIALS_URL);}catch{throw Error('Invalid staging TURN credential endpoint.');}
  if(url.origin!==STAGING_ORIGIN||url.pathname!=='/functions/v1/turn-credentials'||url.search||url.hash||url.username||url.password)throw Error('TURN credentials must come from the authenticated staging endpoint, without secrets in its URL.');
 }
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){validateStagingIntegrations(process.env);console.log('PASS public staging integration configuration; no server credentials accepted');}
