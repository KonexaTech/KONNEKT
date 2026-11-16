import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { readFile,stat,mkdir } from 'node:fs/promises';
import { dirname,resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';
import { validateConfig,APP_ORIGIN,acceptanceProxy } from './staging-config.mjs';
import { installStagingNetwork } from './staging-network.mjs';
export const moduleUrl='/KONNEKT/src/lib_supabase.js';
export async function tab(page,name){
 const target=page.getByRole('tab',{name,exact:true}),back=page.getByText(/^‹(?: (?:Back.*|Close))?$/).first();
 for(let n=0;n<7;n++){await target.or(back).first().waitFor({state:'visible'});if(await target.isVisible()){await target.click();return;}await back.click();}
 throw Error('Main navigation unavailable');
}
export async function feature(page,name){await tab(page,'Profile');await page.getByText('☰  ALL FEATURES',{exact:true}).click();await page.getByRole('button',{name:'Open '+name,exact:true}).click();}
export async function direct(page,username){
 await tab(page,'Chats');await page.getByRole('button',{name:'New conversation',exact:true}).click();
 await page.getByPlaceholder('Search name or @username').fill(username);await page.getByText('Search',{exact:true}).click();
 const response=page.waitForResponse(r=>r.url().includes('/rpc/konnekt_start_direct_conversation')&&r.request().method()==='POST');
 await page.getByText('@'+username,{exact:true}).click();const result=await response;if(!result.ok())throw Error('Direct RPC rejected');
 const id=await result.json();await page.getByPlaceholder('Message securely…').waitFor();return id;
}
export async function login(page,account){
 await page.getByText('LOG IN',{exact:true}).click();await page.getByPlaceholder('Email address',{exact:true}).fill(account.email);
 await page.getByPlaceholder('Password',{exact:true}).fill(account.password);await page.getByRole('button',{name:'LOG IN',exact:true}).click();
}
export async function stagingSession(file){
 const progress=phase=>console.log("ACCEPTANCE "+phase);
 if(!file?.endsWith('.local')||(await stat(file)).mode&0o077)throw Error('Private .local configuration required');
 const config=validateConfig(JSON.parse(await readFile(file,'utf8')));
 if(config.allowExtendedAcceptance!==true||!config.fixtureRun)throw Error('Explicit mutable fixture-account acceptance configuration required');
 const root=resolve(dirname(fileURLToPath(import.meta.url)),'../..'),base=APP_ORIGIN+'/KONNEKT/';
 const contexts=[],stops=[],violations=[],pages=[],profiles=[];
 const server=spawn(process.execPath,['node_modules/vite/bin/vite.js','--host','127.0.0.1','--port','5280','--strictPort','--mode','staging'],{cwd:root,stdio:'ignore',env:{...process.env,VITE_SUPABASE_URL:config.projectUrl,VITE_SUPABASE_PUBLISHABLE_KEY:config.publishableKey}});
 const close=async()=>{for(const stop of stops)stop();for(const c of contexts)await c.close().catch(()=>{});server.kill();};
 const open=async(directory)=>{
  await mkdir(directory,{recursive:true,mode:0o700});const proxy=acceptanceProxy(process.env);
  const context=await chromium.launchPersistentContext(directory,{headless:true,executablePath:process.env.CHROMIUM_PATH||undefined,serviceWorkers:'block',viewport:{width:390,height:844},args:['--no-sandbox'],proxy});
  contexts.push(context);stops.push(await installStagingNetwork(context,{proxy,onViolation:m=>violations.push(m)}));
  const page=await context.newPage();page.setDefaultTimeout(30000);await page.goto(base);return page;
 };
 try{
  let ready=false;
  for(let n=0;n<100;n++){if(server.exitCode!==null)throw Error('Private staging server unavailable');try{if((await fetch(base)).ok){ready=true;break;}}catch{}await delay(100);}
  if(!ready)throw Error('Private staging server did not start');
  for(let i=0;i<3;i++){
   progress('open isolated fixture '+i);const page=await open(file+'.artifacts.local/profiles/account-'+i);pages.push(page);
   const home=page.getByRole('tab',{name:'Profile',exact:true}),signIn=page.getByText('LOG IN',{exact:true});
   await home.or(signIn).first().waitFor({state:'visible'});if(await signIn.isVisible())await login(page,config.accounts[i]);await home.waitFor();
   progress('authenticate fixture '+i);const profile=await page.evaluate(async({moduleUrl,expectedRun})=>{
    const {supabase}=await import(moduleUrl);const result=await supabase.auth.getUser();if(result.error||result.data.user?.app_metadata?.konnekt_test_run!==expectedRun)throw Error('Not an approved mutable fixture');
    const row=await supabase.from('profiles').select('id,username,encryption_public_key').eq('id',result.data.user.id).single();if(row.error)throw row.error;
    const enc=await import('/KONNEKT/src/konnektEncryption.js');await enc.ensureKonnektIdentity(result.data.user.id);return row.data;
   },{moduleUrl,expectedRun:config.fixtureRun});
   if(profile.username!==config.accounts[i].username)throw Error('Fixture identity mismatch');profiles.push(profile);
  }
  progress('fixture sessions ready');return{config,pages,profiles,violations,open,close};
 }catch(error){await close();throw error;}
}
