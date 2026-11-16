import { readFile, stat } from 'node:fs/promises';
export const STAGING_URL='https://oiwtfkgrnpzirghbsvim.supabase.co';
export async function readOperationsConfig(file) {
  if (!file?.endsWith('.local')) throw new Error('Use an owner-only ignored .local operations configuration.');
  const info=await stat(file);
  if(!info.isFile()||(info.mode&0o077)!==0)throw new Error('Operations configuration must be an owner-only file (chmod 600).');
  let config;
  try { config=JSON.parse(await readFile(file,'utf8')); } catch { throw new Error('Invalid private operations configuration; contents are not logged.'); }
  if(config.projectUrl!==STAGING_URL)throw new Error('Operations are restricted to the existing konnekt-staging project.');
  let legacyRole;
  try{legacyRole=JSON.parse(Buffer.from(config.serviceKey.split('.')[1],'base64url')).role;}catch{ /* Modern secret keys are opaque. */ }
  if(!/^sb_secret_[A-Za-z0-9_-]+$/.test(config.serviceKey||'')&&legacyRole!=='service_role')throw new Error('A server-only staging secret/service-role key is required; publishable keys are not accepted.');
  return config;
}
