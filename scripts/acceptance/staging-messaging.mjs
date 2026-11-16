import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { readFile, stat, mkdir, writeFile, chmod } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID, createHash } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import assert from 'node:assert/strict';
import { validateConfig, assertIsolation, APP_ORIGIN, STAGING_ORIGIN, acceptanceProxy } from './staging-config.mjs';
import { installStagingNetwork } from './staging-network.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const base = APP_ORIGIN + '/KONNEKT/';
const configPath = process.env.KONNEKT_ACCEPTANCE_CONFIG;
if (!configPath || !configPath.endsWith('.local')) throw new Error('Set KONNEKT_ACCEPTANCE_CONFIG to an ignored, private JSON file ending in .local.');
if ((await stat(configPath)).mode & 0o077) throw new Error('Restrict the private configuration to its owner (chmod 600).');
let config;
try { config = JSON.parse(await readFile(configPath, 'utf8')); }
catch { throw new Error('The private configuration must contain valid JSON; its contents have not been logged.'); }
validateConfig(config);
if (process.argv.includes('--check-config')) { console.log('PASS staging-only configuration validated; no network requests or writes performed'); process.exit(0); }
const output = resolve(configPath + '.artifacts.local');
await mkdir(output, { recursive: true, mode: 0o700 });
await chmod(output, 0o700);
const report = { runId: randomUUID(), project: 'konnekt-staging', decision: 'NOT_RUN', checks: [], protectedMessages: [] };
const contexts = [], pages = [], profiles = [], networkViolations = [];
const networkCleanups = [];
let server, phase = 'start-staging-server';
const pass = check => { report.checks.push({ check, result:'PASS' }); console.log('PASS ' + check); };
const moduleUrl = '/KONNEKT/src/lib_supabase.js';
const image = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aOuoAAAAASUVORK5CYII=', 'base64');
const imageHash = createHash('sha256').update(image).digest('hex');

async function tab(page, name) {
  const target = page.getByRole('tab', { name, exact:true });
  const back = page.getByText(/^‹(?: Back.*)?$/).first();
  for(let n=0;n<6;n++){
    await target.or(back).first().waitFor({state:'visible'});
    if(await target.isVisible()){await target.click();return;}
    await back.click();
  }
  throw new Error('Could not return to a main tab.');
}
async function hub(page) { await tab(page,'Profile'); await page.getByText('☰  ALL FEATURES', { exact:true }).click(); }
async function openDirect(page, username) {
  await tab(page,'Chats');
  await page.getByRole('button', { name:'New conversation', exact:true }).click();
  await page.getByPlaceholder('Search name or @username').fill(username);
  await page.getByText('Search', { exact:true }).click();
  const response = page.waitForResponse(r => r.url().includes('/rpc/konnekt_start_direct_conversation') && r.request().method()==='POST');
  await page.getByText('@' + username, { exact:true }).click();
  const result = await response;
  assert(result.ok(), 'direct conversation RPC rejected');
  const id = await result.json();
  assert.match(id, /^[0-9a-f-]{36}$/i);
  await page.getByPlaceholder('Message securely…').waitFor();
  await appChannelReady(page,id);
  return id;
}
async function appChannelReady(page,id) {
  await page.waitForFunction(async ({ moduleUrl,id }) => {
    const { supabase } = await import(moduleUrl);
    return supabase.getChannels().some(c => c.topic===`realtime:messages-${id}` && c.state==='joined');
  }, {moduleUrl,id});
}
async function observe(page) {
  await page.evaluate(async moduleUrl => {
    const {supabase} = await import(moduleUrl);
    window.__acceptance = { events:[], healthy:true };
    const channel = supabase.channel('acceptance-observer-' + crypto.randomUUID())
      .on('postgres_changes',{event:'INSERT',schema:'public',table:'messages'}, p => {
        window.__acceptance.events.push({id:p.new.id,conversation_id:p.new.conversation_id});
      });
    await new Promise((resolve,reject) => {
      const timer = setTimeout(() => reject(new Error('Observer subscription timeout')),15000);
      channel.subscribe(status => {
        if(status==='SUBSCRIBED'){clearTimeout(timer);resolve();}
        if(['CHANNEL_ERROR','TIMED_OUT','CLOSED'].includes(status)) {
          window.__acceptance.healthy=false; clearTimeout(timer);reject(new Error('Observer subscription failed'));
        }
      });
    });
  },moduleUrl);
}
async function send(page,conversationId,label,attachment=false) {
  const text = `TEST ACCEPTANCE ${report.runId} ${label}`;
  await page.getByPlaceholder('Message securely…').fill(text);
  const response = page.waitForResponse(r => r.url().includes('/rest/v1/messages') && r.request().method()==='POST');
  if(attachment) {
    const chooser = page.waitForEvent('filechooser');
    await page.getByRole('button',{name:'Attach media',exact:true}).click();
    await (await chooser).setFiles({name:'test-acceptance.png',mimeType:'image/png',buffer:image});
  } else await page.getByRole('button',{name:'Send message',exact:true}).click();
  const result = await response;
  assert(result.ok(),'message write rejected');
  const payload = result.request().postDataJSON();
  assert.equal(payload.conversation_id,conversationId);
  assert.equal(payload.is_encrypted,true);
  assert.notEqual(payload.body,text);
  if(attachment){assert.equal(payload.media_encrypted,true);assert(!/^https?:/.test(payload.media_path));}
  const rows = await page.evaluate(async ({moduleUrl,conversationId,body}) => {
    const {supabase} = await import(moduleUrl);
    const {data,error} = await supabase.from('messages').select('id,conversation_id').eq('conversation_id',conversationId).eq('body',body);
    if(error)throw error;return data;
  },{moduleUrl,conversationId,body:payload.body});
  assert.equal(rows.length,1,'message duplicated or absent');
  await page.getByText(text,{exact:true}).waitFor();
  report.protectedMessages.push({id:rows[0].id,conversationId,label});
  return {id:rows[0].id,text,mediaPath:attachment?payload.media_path:null};
}
async function denyFiles(paths){
  const result=await pages[2].evaluate(async({moduleUrl,paths})=>{
    const {supabase}=await import(moduleUrl);
    const before=await supabase.auth.getUser();
    if(before.error||!before.data.user)throw Error('Outsider session is not authenticated');
    const probes=[];
    for(const path of paths){
      const download=await supabase.storage.from('konnekt-chat-media').download(path);
      const signed=await supabase.storage.from('konnekt-chat-media').createSignedUrl(path,60);
      probes.push({readable:!!download.data,signed:!!signed.data?.signedUrl,downloadStatus:Number(download.error?.status||download.error?.statusCode),signedStatus:Number(signed.error?.status||signed.error?.statusCode)});
    }
    const after=await supabase.auth.getUser();
    if(after.error||after.data.user?.id!==before.data.user.id)throw Error('Outsider session changed');
    return probes;
  },{moduleUrl,paths});
  assert.equal(result.length,paths.length);
  for(const probe of result){assert.equal(probe.readable,false);assert.equal(probe.signed,false);assert([400,403,404].includes(probe.downloadStatus));assert([400,403,404].includes(probe.signedStatus));}
}
async function receive(page,text,attachment=false) {
  await page.getByText(text,{exact:true}).waitFor(); // No reload/polling of message data.
  if(attachment) await page.waitForFunction(async ({text,expected}) => {
    const caption = [...document.querySelectorAll('div')].find(el => el.textContent===text && el.children.length===0);
    const img = caption?.parentElement?.querySelector('img');
    if(!img?.src.startsWith('blob:') || !img.complete || !img.naturalWidth)return false;
    try {
      const bytes=await(await fetch(img.src)).arrayBuffer();
      const digest=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),b=>b.toString(16).padStart(2,'0')).join('');
      return digest===expected;
    } catch { return false; }
  },{text,expected:imageHash});
}
async function waitEvent(page,id) { await page.waitForFunction(id => window.__acceptance.events.some(e=>e.id===id),id); }
async function checkIsolation(conversationId,protectedIds,beforeControlId,afterControlId) {
  await waitEvent(pages[2],afterControlId);
  await pages[2].waitForTimeout(5000); // Bounded negative-observation window after a positive control.
  const [member,outsider] = await Promise.all([pages[1],pages[2]].map(p=>p.evaluate(()=>window.__acceptance)));
  assertIsolation({conversationId,protectedIds,beforeControlId,afterControlId,memberEvents:member.events,outsiderEvents:outsider.events,subscriptionHealthy:member.healthy&&outsider.healthy});
  const hidden = await pages[2].evaluate(async ({moduleUrl,conversationId}) => {
    const {supabase}=await import(moduleUrl);
    const {data,error}=await supabase.from('messages').select('id').eq('conversation_id',conversationId);
    if(error)throw error;return data;
  },{moduleUrl,conversationId});
  assert.equal(hidden.length,0,'outsider can read protected history');
}

try {
  let serverOutput='';
  server=spawn(process.execPath,['node_modules/vite/bin/vite.js','--host','127.0.0.1','--port','5280','--strictPort','--mode','staging'],{
    cwd:root,stdio:['ignore','pipe','pipe'],env:{...process.env,VITE_SUPABASE_URL:config.projectUrl,VITE_SUPABASE_PUBLISHABLE_KEY:config.publishableKey},
  });
  server.stdout.on('data',data=>{serverOutput+=data;});
  server.stderr.on('data',()=>{});
  for(let n=0;n<100;n++){
    if(server.exitCode!==null)throw new Error('Staging server failed (port 5280 must be free).');
    try{if(serverOutput.includes(APP_ORIGIN) && (await fetch(base)).ok)break;}catch{} await delay(100);
    if(n===99)throw new Error('Staging server did not become ready');
  }
  for(let i=0;i<3;i++){
    phase=`account-${'ABC'[i]}-sign-in-and-key-check`;
    const directory=resolve(output,'profiles','account-'+i);
    await mkdir(directory,{recursive:true,mode:0o700});
    const context=await chromium.launchPersistentContext(directory,{headless:true,serviceWorkers:'block',viewport:{width:390,height:844},executablePath:process.env.CHROMIUM_PATH||undefined,args:['--no-sandbox'],proxy:acceptanceProxy(process.env)});
    contexts.push(context);
    networkCleanups.push(await installStagingNetwork(context,{proxy:acceptanceProxy(process.env),onViolation:message=>networkViolations.push(message)}));
    const page=await context.newPage();pages.push(page);page.setDefaultTimeout(30000);
    await page.goto(base);
    const existing=await page.evaluate(async moduleUrl=>{const {supabase}=await import(moduleUrl);return(await supabase.auth.getSession()).data.session?.user?.email;},moduleUrl);
    if(existing)assert.equal(existing.toLowerCase(),config.accounts[i].email.toLowerCase(),'persisted account does not match configuration');
    else {
      await page.getByText('LOG IN',{exact:true}).click();
      await page.getByPlaceholder('Email address',{exact:true}).fill(config.accounts[i].email);
      await page.getByPlaceholder('Password',{exact:true}).fill(config.accounts[i].password);
      await page.getByRole('button',{name:'LOG IN',exact:true}).click();
    }
    await page.getByRole('tab',{name:'Profile',exact:true}).waitFor();
    const profile=await page.evaluate(async ({moduleUrl,username})=>{
      const {supabase}=await import(moduleUrl);const {data:{user},error}=await supabase.auth.getUser();if(error)throw error;
      const result=await supabase.from('profiles').select('id,username').eq('id',user.id).single();if(result.error)throw result.error;
      if(result.data.username!==username)throw new Error('Staging profile mismatch');
      const {ensureKonnektIdentity}=await import('/KONNEKT/src/services/konnektEncryption.js');await ensureKonnektIdentity(user.id);
      return result.data;
    },{moduleUrl,username:config.accounts[i].username});
    profiles.push(profile);
  }
  assert.equal(new Set(profiles.map(p=>p.id)).size,3);pass('three distinct staging sessions with recoverable existing keys or first-time identities');
  phase='direct-chat-ui-and-subscriptions';
  const controlId=await openDirect(pages[2],profiles[0].username);
  const directId=await openDirect(pages[0],profiles[1].username);
  assert.equal(await openDirect(pages[1],profiles[0].username),directId);
  await Promise.all([observe(pages[1]),observe(pages[2])]);
  const before=await send(pages[2],controlId,'outsider control before direct');await waitEvent(pages[2],before.id);
  const directMessages=[],directFiles=[];
  for(const [sender,recipient,label,attachment] of [[0,1,'direct A to B',false],[1,0,'direct B to A',false],[0,1,'direct image A to B',true],[1,0,'direct image B to A',true]]){
    phase=label;const sent=await send(pages[sender],directId,label,attachment);await receive(pages[recipient],sent.text,attachment);directMessages.push(sent.id);if(sent.mediaPath)directFiles.push(sent.mediaPath);
  }
  phase='direct-read-receipt';await tab(pages[1],'Profile');
  const receiptProbe=await send(pages[0],directId,'read receipt waits for recipient');directMessages.push(receiptProbe.id);
  const receiptBubble=pages[0].getByText(receiptProbe.text,{exact:true}).locator('..');
  await receiptBubble.getByLabel('Message sent',{exact:true}).waitFor();
  assert.equal(await openDirect(pages[1],profiles[0].username),directId);await receive(pages[1],receiptProbe.text);
  await receiptBubble.getByLabel('Message read',{exact:true}).waitFor();pass('read receipt changes from sent to read when the recipient opens the conversation');
  const after=await send(pages[2],controlId,'outsider control after direct');
  phase='direct-realtime-isolation';await checkIsolation(directId,directMessages,before.id,after.id);pass('direct encrypted text/images in both directions; member Realtime delivery and outsider exclusion with positive controls');
  phase='direct-file-isolation';await denyFiles(directFiles);pass('authenticated outsider cannot download direct attachments or obtain signed links');
  phase='group-create-ui';await hub(pages[0]);await pages[0].getByRole('button',{name:'Open Create a group',exact:true}).click();
  const groupName=`TEST ACCEPTANCE ${report.runId.slice(0,8)}`;
  await pages[0].getByPlaceholder('Enter group name').fill(groupName);
  await pages[0].getByPlaceholder('Search members').fill(profiles[1].username);
  await pages[0].getByText('@'+profiles[1].username,{exact:true}).click();
  const groupResponse=pages[0].waitForResponse(r=>r.url().includes('/rpc/konnekt_create_group_conversation')&&r.request().method()==='POST');
  await pages[0].getByText('Create',{exact:true}).click();const created=await groupResponse;assert(created.ok());const groupId=await created.json();report.groupId=groupId;
  await appChannelReady(pages[0],groupId);
  await tab(pages[1],'Chats');await pages[1].getByText(groupName,{exact:true}).click();await appChannelReady(pages[1],groupId);
  const membership=await pages[0].evaluate(async ({moduleUrl,groupId})=>{const {supabase}=await import(moduleUrl);const {data,error}=await supabase.from('conversation_members').select('user_id').eq('conversation_id',groupId);if(error)throw error;return data.map(r=>r.user_id);},{moduleUrl,groupId});
  assert.deepEqual(membership.sort(),[profiles[0].id,profiles[1].id].sort());
  const groupBefore=await send(pages[2],controlId,'outsider control before group');await waitEvent(pages[2],groupBefore.id);
  const groupMessages=[],groupFiles=[];
  for(const [sender,recipient,label,attachment] of [[0,1,'group A to B',false],[1,0,'group B to A',false],[0,1,'group image A to B',true],[1,0,'group image B to A',true]]){
    phase=label;const sent=await send(pages[sender],groupId,label,attachment);await receive(pages[recipient],sent.text,attachment);groupMessages.push(sent.id);if(sent.mediaPath)groupFiles.push(sent.mediaPath);
  }
  const groupAfter=await send(pages[2],controlId,'outsider control after group');
  phase='group-realtime-isolation';await checkIsolation(groupId,groupMessages,groupBefore.id,groupAfter.id);pass('group encrypted text/images in both directions; actual membership and outsider Realtime exclusion');
  phase='group-file-isolation';await denyFiles(groupFiles);pass('authenticated outsider cannot download group attachments or obtain signed links');
  phase='refresh-persistence';await Promise.all(pages.slice(0,2).map(p=>p.reload()));
  for(const page of pages.slice(0,2)){await tab(page,'Chats');await page.getByText(groupName,{exact:true}).click();await receive(page,`TEST ACCEPTANCE ${report.runId} group A to B`);await receive(page,`TEST ACCEPTANCE ${report.runId} group B to A`);}
  pass('both independent browser refreshes retain keys and decrypt group history');
  assert.equal(networkViolations.length,0);report.decision='PASS_SCOPED_MESSAGING_ONLY';
} catch {
  // Raw browser errors may include input values, URLs or tokens: keep the report
  // deliberately limited to the phase, never traces/screenshots/storage state.
  report.decision='FAIL_OR_BLOCKED';report.failedPhase=phase;process.exitCode=1;
  console.error('FAIL_OR_BLOCKED: '+phase+'; no release acceptance granted');
} finally {
  for(const cleanup of networkCleanups)cleanup();
  for(const context of contexts)await context.close().catch(()=>{});
  server?.kill();
  await writeFile(resolve(output,'report.json'),JSON.stringify(report,null,2),{mode:0o600});
  console.log('Report saved beside the private configuration; browser profiles preserved.');
}
