// Revoke only a newly created nonpersistent fixture session. Never touch the
// preserved account profiles, identities, other sessions or recovery secrets.
import { chromium } from 'playwright';
import { spawn, execFileSync } from 'node:child_process';
import { readFile, writeFile, mkdir, stat } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { createHash, randomUUID } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import { validateConfig, APP_ORIGIN, acceptanceProxy } from './staging-config.mjs';
import { installStagingNetwork } from './staging-network.mjs';
const file=process.env.KONNEKT_ACCEPTANCE_CONFIG;
let server,context,cleanup,phase='configuration';
const report={decision:'BLOCKED',checks:[],project:'konnekt-staging'};
const directory=file+'.session-revocation.local';
const save=async()=>{if(!file)return;await mkdir(directory,{recursive:true,mode:0o700});await writeFile(directory+'/report.json',JSON.stringify(report,null,2),{mode:0o600});};
process.once('SIGTERM',()=>{report.decision='BLOCKED_TIMEOUT';report.phase=phase;void save().finally(()=>process.exit(1));});
try{
 if(!file?.endsWith('.local')||(await stat(file)).mode&0o077)throw Error('Private approved configuration required');
 const config=validateConfig(JSON.parse(await readFile(file,'utf8')));
 if(config.allowExtendedAcceptance!==true||!config.fixtureRun)throw Error('Approved fixture scope required');
 report.sourceCommit=execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim();
 report.authContextSHA256=createHash('sha256').update(await readFile('src/AuthContext.jsx')).digest('hex');
 server=spawn(process.execPath,['node_modules/vite/bin/vite.js','--host','127.0.0.1','--port','5280','--strictPort','--mode','staging'],{stdio:'ignore',env:{...process.env,VITE_SUPABASE_URL:config.projectUrl,VITE_SUPABASE_PUBLISHABLE_KEY:config.publishableKey}});
 let ready=false;for(let n=0;n<100;n++){try{if((await fetch(APP_ORIGIN+'/KONNEKT/')).ok){ready=true;break;}}catch{}await delay(100);}if(!ready)throw Error('Local staging app unavailable');
 const proxy=acceptanceProxy(process.env),violations=[];
 context=await chromium.launchPersistentContext('',{headless:true,executablePath:existsSync('/usr/bin/chromium')?'/usr/bin/chromium':undefined,serviceWorkers:'block',args:['--no-sandbox'],proxy});
 cleanup=await installStagingNetwork(context,{proxy,onViolation:value=>violations.push(value)});
 const page=await context.newPage();await page.goto(APP_ORIGIN+'/KONNEKT/',{waitUntil:'domcontentloaded'});
 phase='fresh-session-and-stale-jwt-check';
 const result=await page.evaluate(async({config,storageKey})=>{
  await import('/KONNEKT/src/lib_supabase.js');
  const sdkUrl=performance.getEntriesByType('resource').map(row=>row.name).find(url=>url.includes('@supabase_supabase-js'));
  if(!sdkUrl?.startsWith(location.origin))throw Error('SDK unavailable');
  const {createClient}=await import(sdkUrl);
  const client=createClient(config.projectUrl,config.publishableKey,{auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false,storageKey}});
  let revoked=false;
  try{
   const signed=await client.auth.signInWithPassword({email:config.accounts[1].email,password:config.accounts[1].password});
   if(signed.error||signed.data.user?.app_metadata?.konnekt_test_run!==config.fixtureRun)throw Error('Not the approved staging fixture');
   const id=signed.data.user.id;
   const profile=await client.from('profiles').select('username').eq('id',id).single();
   if(profile.error||profile.data.username!==config.accounts[1].username)throw Error('Fixture identity mismatch');
   const before=await client.from('user_key_backups').select('user_id').eq('user_id',id);
   if(before.error||before.data.length!==1)throw Error('Expected fixture backup metadata unavailable; no conclusive positive control');
   const jwt=signed.data.session.access_token;
   const claims=JSON.parse(atob(jwt.split('.')[1].replace(/-/g,'+').replace(/_/g,'/')));
   if(typeof claims.session_id!=='string'||claims.exp*1000<Date.now()+5000)throw Error('Valid session claim and unexpired JWT required');
   const signedOut=await client.auth.signOut({scope:'local'});if(signedOut.error)throw Error('Fresh fixture session could not be revoked');revoked=true;
   const response=await fetch(config.projectUrl+'/rest/v1/user_key_backups?select=user_id&user_id=eq.'+encodeURIComponent(id),{headers:{apikey:config.publishableKey,authorization:'Bearer '+jwt,accept:'application/json'},cache:'no-store'});
   const rows=await response.json();
   const denied=response.ok&&Array.isArray(rows)&&rows.length===0;
   const exposed=response.ok&&Array.isArray(rows)&&rows.some(row=>row.user_id===id);
   if(!denied&&!exposed)throw Error('A network/API error is not evidence of session isolation');
   return{beforeRows:before.data.length,afterRows:rows.length,httpStatus:response.status,accessTokenStillUnexpired:claims.exp*1000>Date.now(),denied,exposed};
  }finally{if(!revoked)await client.auth.signOut({scope:'local'});}
 },{config,storageKey:'qa-revocation-'+randomUUID()});
 if(violations.length)throw Error('Network scope violation');
 report.observation=result;report.checks.push({check:'fresh approved fixture session can read its own backup metadata',result:'PASS'});
 report.checks.push({check:'revoked fresh session cannot reuse its still-unexpired JWT for protected backup metadata',result:result.denied?'PASS':'FAIL'});
 report.decision=result.denied?'PASS_SCOPED_LIVE_SESSION_REVOCATION':'FAIL_REVOKED_JWT_RETAINS_PRIVATE_DATA_ACCESS';
 if(result.exposed)process.exitCode=2;
 console.log(report.decision);
}catch(error){report.decision='BLOCKED';report.phase=phase;process.exitCode=1;await mkdir(directory,{recursive:true,mode:0o700});await writeFile(directory+'/error.local',String(error?.stack||error),{mode:0o600});console.error('BLOCKED: private diagnostics retained');}
finally{cleanup?.();await context?.close().catch(()=>{});server?.kill();await save();}
