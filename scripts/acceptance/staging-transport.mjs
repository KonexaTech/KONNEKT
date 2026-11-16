import { chromium } from 'playwright';
import { acceptanceProxy,STAGING_ORIGIN } from './staging-config.mjs';
import { installStagingNetwork } from './staging-network.mjs';
const key=process.env.KONNEKT_STAGING_PUBLISHABLE_KEY;
if(!/^sb_publishable_[A-Za-z0-9_-]+$/.test(key||''))throw new Error('Supply only the staging publishable key for this read-only transport check.');
const proxy=acceptanceProxy(process.env);
let browser,cleanup;
try{
  browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||undefined,headless:true,args:['--no-sandbox'],proxy});
  const context=await browser.newContext();const violations=[],metrics={upstreamConnections:0};
  cleanup=await installStagingNetwork(context,{proxy,onViolation:m=>violations.push(m),metrics});
  const page=await context.newPage();page.setDefaultTimeout(15000);
  const status=await page.evaluate(async({origin,key})=>(await fetch(origin+'/auth/v1/health',{headers:{apikey:key}})).status,{origin:STAGING_ORIGIN,key});
  if(status!==200)throw new Error('Health response rejected');
  await page.evaluate(({origin,key})=>{
    const socket=new WebSocket(origin.replace('https:','wss:')+'/realtime/v1/websocket?apikey='+key+'&vsn=1.0.0');
    socket.onopen=()=>socket.send(JSON.stringify({topic:'phoenix',event:'heartbeat',payload:{},ref:'transport-check'}));
    socket.onmessage=e=>{const m=JSON.parse(e.data);if(m.ref==='transport-check'&&m.event==='phx_reply'&&m.payload?.status==='ok')window.transportReply=true;};
  },{origin:STAGING_ORIGIN,key});
  await page.waitForFunction(()=>window.transportReply===true);
  if(violations.length||(proxy&&metrics.upstreamConnections!==1))throw new Error('Transport did not stay healthy');
  console.log('PASS_TRANSPORT_ONLY: real staging HTTP 200 and Realtime heartbeat; TLS checks enabled. No account login or database writes.');
}catch{console.error('FAIL_OR_BLOCKED_TRANSPORT: inspect network/proxy/CA configuration privately; no account acceptance granted.');process.exitCode=1;}
finally{cleanup?.();await browser?.close();}
