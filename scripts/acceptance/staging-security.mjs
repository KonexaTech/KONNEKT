import { readFile,writeFile,mkdir } from 'node:fs/promises';
import { randomBytes,randomUUID } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import assert from 'node:assert/strict';
import { stagingSession,feature,direct,login,moduleUrl } from './staging-session.mjs';
import { totp } from './totp.mjs';
const file=process.env.KONNEKT_ACCEPTANCE_CONFIG,runId=randomUUID();
const output=file+'.security.local';await mkdir(output,{recursive:true,mode:0o700});
const privateFile=output+'/secrets.local';
let secrets;try{secrets=JSON.parse(await readFile(privateFile,'utf8'));}catch{secrets={backupPassphrase:randomBytes(32).toString('base64url')};}
const save=()=>writeFile(privateFile,JSON.stringify(secrets),{mode:0o600});await save();
const report={runId,project:'konnekt-staging',decision:'NOT_RUN',checks:[]};
let session,phase='open-approved-fixtures',factorActive=false,lastCounter=-1;
const pass=check=>{report.checks.push({check,result:'PASS'});console.log('PASS '+check);};
async function freshCode(){const counter=Math.floor(Date.now()/30000);if(counter===lastCounter)await delay(31000-Date.now()%30000);lastCounter=Math.floor(Date.now()/30000);return totp(secrets.totpSecret);}
try{
 session=await stagingSession(file);const [a,,c]=session.pages;
 phase='backup-original-key';
 const fingerprint=await a.evaluate(async me=>{const e=await import('/KONNEKT/src/konnektEncryption.js');return e.getKonnektIdentityFingerprint((await e.getStoredKonnektIdentity(me)).publicJwk);},session.profiles[0].id);
 await feature(a,'Encryption key recovery');await a.getByPlaceholder('At least 12 characters').fill(secrets.backupPassphrase);await a.getByPlaceholder('Enter the same passphrase again').fill(secrets.backupPassphrase);
 const backup=a.waitForResponse(r=>r.url().includes('/rest/v1/user_key_backups')&&r.request().method()==='POST');
 await a.getByRole('button',{name:'CREATE / UPDATE BACKUP',exact:true}).click();assert((await backup).ok());
 await a.getByText(/^Your encrypted recovery backup has been saved/).waitFor();pass('actual UI saved an encrypted backup of the original registered identity');
 phase='outsider-backup-denial';
 const hidden=await c.evaluate(async({moduleUrl,id})=>{const {supabase}=await import(moduleUrl);const r=await supabase.from('user_key_backups').select('user_id').eq('user_id',id);if(r.error)throw r.error;return r.data;},{moduleUrl,id:session.profiles[0].id});assert.equal(hidden.length,0);pass('authenticated outsider cannot read the encrypted key backup');
 phase='authenticator-enrollment';await feature(a,'Two-step verification');
 await a.getByText('Authenticator not enabled',{exact:true}).waitFor();
 const enrolled=a.waitForResponse(r=>/\/auth\/v1\/factors\/?$/.test(new URL(r.url()).pathname)&&r.request().method()==='POST');
 await a.getByRole('button',{name:'Set up authenticator',exact:true}).click();const response=await enrolled;assert(response.ok());const data=await response.json();
 assert(data.id&&data.totp?.secret);secrets.factorId=data.id;secrets.totpSecret=data.totp.secret;secrets.factorRemoved=false;factorActive=true;await save();
 await a.getByLabel('Authenticator code',{exact:true}).fill(await freshCode());
 const verified=a.waitForResponse(r=>r.url().includes('/verify')&&r.request().method()==='POST');
 await a.getByRole('button',{name:'Verify and enable',exact:true}).click();assert((await verified).ok());factorActive=true;
 await a.getByText('Authenticator enabled',{exact:true}).waitFor();
 const dialog=a.getByRole('alertdialog');if(await dialog.isVisible())await dialog.getByRole('button',{name:'OK',exact:true}).click();
 pass('actual Auth factor enrolled and verified through the application');
 phase='isolated-aal1-sign-in';const isolated=await session.open(output+'/isolated-'+runId);await login(isolated,session.config.accounts[0]);
 await isolated.getByText('Verify your sign-in',{exact:true}).waitFor();assert.equal(await isolated.getByRole('tab').count(),0);
 const originalReport=JSON.parse(await readFile(file+'.artifacts.local/report.json','utf8'));
 const directId=originalReport.protectedMessages.find(m=>m.label==='direct A to B').conversationId;
 const denial=await isolated.evaluate(async({moduleUrl,directId,other})=>{
  const {supabase}=await import(moduleUrl);const identity=await supabase.auth.getUser();if(identity.error)throw identity.error;
  const assurance=await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
  const rows=await supabase.from('messages').select('id').eq('conversation_id',directId);
  const rpc=await supabase.rpc('konnekt_start_direct_conversation',{target_username:other});
  return{authenticated:!!identity.data.user,aal:assurance.data?.currentLevel,rows:rows.data?.length,rowError:!!rows.error,rpcDenied:!!rpc.error,rpcCode:rpc.error?.code};
 },{moduleUrl,directId,other:session.config.accounts[1].username});
 assert(denial.authenticated);assert.equal(denial.aal,'aal1');assert.equal(denial.rows,0);assert.equal(denial.rowError,false);assert(denial.rpcDenied);assert.equal(denial.rpcCode,'42501');
 pass('real signed AAL1 session is gated in-app and denied direct message/RPC access for an enrolled account');
 phase='invalid-authenticator-code';const valid=totp(secrets.totpSecret),wrong=String((Number(valid)+1)%1000000).padStart(6,'0');
 await isolated.getByLabel('Sign-in authenticator code',{exact:true}).fill(wrong);
 const invalid=isolated.waitForResponse(r=>r.url().includes('/verify')&&r.request().method()==='POST');await isolated.getByRole('button',{name:'Verify sign-in',exact:true}).click();assert.equal((await invalid).ok(),false);
 assert.equal(await isolated.getByRole('tab').count(),0);pass('wrong real authenticator code does not open protected screens');
 phase='valid-authenticator-code';await isolated.getByLabel('Sign-in authenticator code',{exact:true}).fill(await freshCode());
 const validResponse=isolated.waitForResponse(r=>r.url().includes('/verify')&&r.request().method()==='POST');await isolated.getByRole('button',{name:'Verify sign-in',exact:true}).click();assert((await validResponse).ok());await isolated.getByRole('tab',{name:'Profile',exact:true}).waitFor();
 const allowed=await isolated.evaluate(async({moduleUrl,directId})=>{const {supabase}=await import(moduleUrl);const aal=await supabase.auth.mfa.getAuthenticatorAssuranceLevel();const r=await supabase.from('messages').select('id').eq('conversation_id',directId);if(r.error)throw r.error;return{aal:aal.data?.currentLevel,count:r.data.length};},{moduleUrl,directId});assert.equal(allowed.aal,'aal2');assert(allowed.count>0);pass('correct real code upgrades to AAL2 and restores legitimate direct API access');
 phase='wrong-key-recovery-passphrase';await feature(isolated,'Encryption key recovery');
 await isolated.getByText('No local identity found',{exact:true}).waitFor();
 await isolated.getByPlaceholder('At least 12 characters').fill('wrong disposable acceptance passphrase');await isolated.getByRole('button',{name:'RESTORE ON THIS DEVICE',exact:true}).click();await isolated.getByText(/Recovery passphrase is incorrect or the backup is damaged/).waitFor();
 const empty=await isolated.evaluate(async id=>!(await(await import('/KONNEKT/src/konnektEncryption.js')).getStoredKonnektIdentity(id)),session.profiles[0].id);assert(empty);pass('wrong recovery passphrase fails without writing an identity in the isolated browser');
 phase='correct-key-recovery';await isolated.getByPlaceholder('At least 12 characters').fill(secrets.backupPassphrase);await isolated.getByRole('button',{name:'RESTORE ON THIS DEVICE',exact:true}).click();await isolated.getByText(/^Your encryption identity has been restored/).waitFor();
 const recovered=await isolated.evaluate(async me=>{const e=await import('/KONNEKT/src/konnektEncryption.js');return e.getKonnektIdentityFingerprint((await e.getStoredKonnektIdentity(me)).publicJwk);},session.profiles[0].id);assert.equal(recovered,fingerprint);
 await direct(isolated,session.config.accounts[1].username);
 await isolated.getByText(`TEST ACCEPTANCE ${originalReport.runId} direct A to B`,{exact:true}).waitFor();
 pass('correct passphrase recovers the same identity and decrypts original live ciphertext in a new isolated browser');
 phase='authenticator-removal';await feature(isolated,'Two-step verification');await isolated.getByText('Authenticator enabled',{exact:true}).waitFor();await isolated.getByLabel('Authenticator code',{exact:true}).fill(await freshCode());
 await isolated.getByRole('button',{name:'Remove authenticator',exact:true}).click();
 const removed=isolated.waitForResponse(r=>r.url().includes('/factors/')&&r.request().method()==='DELETE');await isolated.getByRole('alertdialog').getByRole('button',{name:'Remove',exact:true}).click();assert((await removed).ok());factorActive=false;secrets.factorRemoved=true;await save();await isolated.getByText('Authenticator not enabled',{exact:true}).waitFor();pass('fresh-code removal succeeds and the dedicated account is left without the test factor');
 assert.equal(session.violations.length,0);report.decision='PASS_SCOPED_LIVE_SECURITY_ONLY';
}catch{report.decision='FAIL_OR_BLOCKED';report.failedPhase=phase;process.exitCode=1;console.error('FAIL_OR_BLOCKED: '+phase+'; no broad acceptance granted');}
finally{
 if(factorActive&&session){
  try{const code=await freshCode();const cleaned=await session.pages[0].evaluate(async({moduleUrl,factorId,code})=>{const {supabase}=await import(moduleUrl);const r=await supabase.auth.mfa.challengeAndVerify({factorId,code});if(r.error)return false;return !(await supabase.auth.mfa.unenroll({factorId})).error;},{moduleUrl,factorId:secrets.factorId,code});report.testFactorCleanup=cleaned;if(cleaned){secrets.factorRemoved=true;await save();}}
  catch{report.testFactorCleanup=false;}
 }
 await session?.close();await writeFile(output+'/report.json',JSON.stringify(report,null,2),{mode:0o600});console.log('Sanitized security report saved beside private configuration.');
}
