import { before,after,test } from 'node:test';
import assert from 'node:assert/strict';
import { startServer,setup,session,user,openFeature } from './helpers.mjs';
let server;before(async()=>{server=await startServer();});after(()=>server?.stop());
const part=value=>Buffer.from(JSON.stringify(value)).toString('base64url');
const factor={id:'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',factor_type:'totp',status:'verified',friendly_name:'Fixture authenticator'};
const elevated={...session,access_token:part({alg:'HS256',typ:'JWT'})+'.'+part({...JSON.parse(Buffer.from(session.access_token.split('.')[1],'base64url').toString()),aal:'aal2'})+'.fixture',user:{...user,factors:[factor]}};
test('enrolled AAL1 cannot enter app; invalid OTP and refresh retain gate, correct OTP enters app without downgrading password verification',async()=>{
 const f=await setup(server.base);try{
  const {page,context,requests}=f;let updateAal=null;
  await page.getByRole('tab',{name:'Profile',exact:true}).waitFor();
  await context.route('**/auth/v1/**',route=>{
   const req=route.request(),path=new URL(req.url()).pathname;
   if(path.endsWith('/user')){if(req.method()==='PUT')updateAal=JSON.parse(Buffer.from(req.headers().authorization.split(' ')[1].split('.')[1],'base64url')).aal;return route.fulfill({json:{...user,factors:[factor]}});}
   if(path.endsWith('/challenge'))return route.fulfill({json:{id:'fixture-challenge',type:'totp',expires_at:4102444800}});
   if(path.endsWith('/verify'))return req.postDataJSON().code==='123456'?route.fulfill({json:elevated}):route.fulfill({status:422,json:{message:'Invalid fixture authenticator code'}});
   return route.fallback();
  });
  await page.reload();await page.getByText('Verify your sign-in',{exact:true}).waitFor();
  assert.equal(await page.getByRole('tab',{name:'Profile',exact:true}).count(),0);
  const writesBefore=requests.filter(r=>r.method==='POST'&&r.path.endsWith('/profiles')).length;
  await page.getByLabel('Sign-in authenticator code').fill('000000');await page.getByRole('button',{name:'Verify sign-in',exact:true}).click();
  await page.getByText('Invalid fixture authenticator code',{exact:true}).waitFor();
  assert.equal(requests.filter(r=>r.method==='POST'&&r.path.endsWith('/profiles')).length,writesBefore);
  await page.reload();await page.getByText('Verify your sign-in',{exact:true}).waitFor();
  await page.getByLabel('Sign-in authenticator code').fill('123456');await page.getByRole('button',{name:'Verify sign-in',exact:true}).click();
  await page.getByRole('tab',{name:'Profile',exact:true}).click();await page.getByText('☰  ALL FEATURES',{exact:true}).click();await page.getByRole('button',{name:'Open Change password',exact:true}).click();
  await page.getByPlaceholder('Enter current password',{exact:true}).fill('Fixture-current-123!');await page.getByPlaceholder('Enter new password',{exact:true}).fill('Fixture-new-456!');await page.getByPlaceholder('Confirm new password',{exact:true}).fill('Fixture-new-456!');
  await page.getByText('Update password',{exact:true}).click();await page.getByText('Password changed',{exact:true}).waitFor();assert.equal(updateAal,'aal2');
  assert.deepEqual(f.errors,[]);
 }finally{await f.close();}
});
test('failed security lookup fails closed, Retry recovers, and challenge Sign out returns to public screens',async()=>{
 const f=await setup(server.base);try{
  const {page,context}=f;let available=false;
  await context.route('**/auth/v1/user',route=>available?route.fulfill({json:{...user,factors:[factor]}}):route.fulfill({status:503,json:{message:'Fixture security lookup outage'}}));
  await page.reload();await page.getByText('Security check unavailable',{exact:true}).waitFor();assert.equal(await page.getByRole('tab',{name:'Profile',exact:true}).count(),0);
  available=true;await page.getByRole('button',{name:'Retry security check',exact:true}).click();await page.getByText('Verify your sign-in',{exact:true}).waitFor();
  await page.getByRole('button',{name:'Sign out',exact:true}).click();await page.getByText('SIGN UP',{exact:true}).waitFor();assert.deepEqual(f.errors,[]);
 }finally{await f.close();}
});


test('authenticator setup encodes its QR, resumes pending factors and verifies removal with a fresh code',async()=>{
 const f=await setup(server.base);try{
  const {page,context}=f;let factors=[],enrollments=0;
  await page.getByRole('tab',{name:'Profile',exact:true}).waitFor();
  await context.route('**/auth/v1/**',route=>{
   const req=route.request(),path=new URL(req.url()).pathname;
   if(path.endsWith('/user'))return route.fulfill({json:{...user,factors}});
   if(path.endsWith('/factors')&&req.method()==='POST'){
    enrollments++;factors=[{...factor,status:'unverified'}];
    return route.fulfill({json:{id:factor.id,type:'totp',totp:{qr_code:'<svg xmlns="http://www.w3.org/2000/svg" width="96" height="96"><rect width="96" height="96" fill="#000"/></svg>',secret:'FIXTURE-ONLY-SECRET',uri:'otpauth://totp/fixture'}}});
   }
   if(path.endsWith('/challenge'))return route.fulfill({json:{id:'fixture-challenge',type:'totp',expires_at:4102444800}});
   if(path.endsWith('/verify')){
    if(req.postDataJSON().code!=='123456')return route.fulfill({status:422,json:{message:'Invalid fixture authenticator code'}});
    factors=[{...factor}];return route.fulfill({json:{...elevated,user:{...user,factors}}});
   }
   if(path.includes('/factors/')&&req.method()==='DELETE'){factors=[];return route.fulfill({json:{id:factor.id}});}
   return route.fallback();
  });
  await openFeature(page,'Two-step verification');await page.getByRole('button',{name:'Set up authenticator',exact:true}).click();
  await page.waitForFunction(()=>[...document.images].some(img=>img.naturalWidth===96));
  await page.getByLabel('Authenticator code').fill('000000');await page.getByRole('button',{name:'Verify and enable',exact:true}).click();await page.getByText('Invalid fixture authenticator code',{exact:true}).waitFor();
  await page.reload();await openFeature(page,'Two-step verification');await page.getByText('Authenticator setup pending',{exact:true}).waitFor();assert.equal(enrollments,1);
  await page.getByLabel('Authenticator code').fill('123456');await page.getByRole('button',{name:'Verify and enable',exact:true}).click();await page.getByText('Authenticator enabled',{exact:true}).waitFor();
  await page.getByText('Connecting securely…',{exact:true}).waitFor({state:'hidden'});
  if(await page.getByRole('alertdialog').count())await page.getByRole('alertdialog').getByRole('button',{name:'OK',exact:true}).click();
  await page.getByLabel('Authenticator code').fill('000000');await page.getByRole('button',{name:'Remove authenticator',exact:true}).click();await page.getByRole('alertdialog').getByRole('button',{name:'Remove',exact:true}).click();await page.getByText('Invalid fixture authenticator code',{exact:true}).waitFor();assert.equal(factors.length,1);
  await page.getByLabel('Authenticator code').fill('123456');await page.getByRole('button',{name:'Remove authenticator',exact:true}).click();await page.getByRole('alertdialog').getByRole('button',{name:'Remove',exact:true}).click();await page.getByRole('button',{name:'Set up authenticator',exact:true}).waitFor();assert.equal(factors.length,0);assert.deepEqual(f.errors,[]);
 }finally{await f.close();}
});
