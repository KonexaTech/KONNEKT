import {mkdir,writeFile} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import assert from 'node:assert/strict';
import {stagingSession} from './staging-session.mjs';
const file=process.env.KONNEKT_ACCEPTANCE_CONFIG;
const report={runId:randomUUID(),project:'konnekt-staging',decision:'NOT_RUN',checks:[]};
let session,phase='sessions';
const pass=check=>{report.checks.push({check,result:'PASS'});console.log('PASS '+check);};
try{
 session=await stagingSession(file);
 for(let i=0;i<3;i++){
  phase='signed-account-'+i;const page=session.pages[i],owner=session.profiles[i].id;
  const response=page.waitForResponse(r=>r.request().method()==='GET'&&new URL(r.url()).pathname==='/rest/v1/notifications');
  assert.equal(await page.evaluate(async other=>{
   const{notificationOpener}=await import('/KONNEKT/src/services/pushOpen.js');
   return notificationOpener.receive({notification:{additionalData:{screen:'Notifications',recipient_id:other,url:'https://untrusted.invalid',conversation_id:other}}});
  },session.profiles[(i+1)%3].id),true);
  await page.getByText('Notifications',{exact:true}).waitFor();
  const actual=await response;assert.equal(actual.ok(),true);
  assert.equal(new URL(actual.url()).searchParams.get('recipient_id'),'eq.'+owner);
  const rows=await actual.json();assert.equal(Array.isArray(rows)&&rows.every(row=>row.recipient_id===owner),true);
  assert.equal(await page.evaluate(async()=>{
   const{notificationOpener}=await import('/KONNEKT/src/services/pushOpen.js');
   return notificationOpener.receive({notification:{additionalData:{screen:'Moderator',recipient_id:'forged'}}});
  }),false);
  await page.getByRole('button',{name:'Back',exact:true}).click();await page.getByRole('tab',{name:'Reels',exact:true}).waitFor();
 }
 pass('three actual signed accounts open their own notification inbox despite forged provider recipient, URL and conversation parameters');
 pass('all actual notification responses and query filters remain scoped to the signed account; arbitrary privileged routes are rejected');
 pass('the Notifications Back button returns each actual account to the existing tabs');
 assert.equal(session.violations.length,0);pass('no unexpected network origin was contacted');
 report.decision='PASS_SCOPED_IN_APP_NOTIFICATION_NAVIGATION_ONLY';
}catch{report.failedPhase=phase;report.decision='FAIL_OR_BLOCKED';process.exitCode=1;console.error('FAIL_OR_BLOCKED: '+phase);}
finally{
 await session?.close();
 if(file){await mkdir(file+'.notification-open.local',{recursive:true,mode:0o700});await writeFile(file+'.notification-open.local/report.json',JSON.stringify(report,null,2),{mode:0o600});}
 console.log('Sanitized notification navigation report saved; native delivery and phone behavior are not accepted by this runner.');
}
