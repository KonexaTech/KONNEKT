import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { startServer, setup, openFeature } from './helpers.mjs';
let server;before(async()=>{server=await startServer();});after(()=>server?.stop());
test('other-session revocation sends the scoped request and explains access-token lifetime accurately',async()=>{
 const f=await setup(server.base);try{
  await openFeature(f.page,'Active sessions');
  await f.page.getByText(/Some existing access may continue until current access tokens expire/).waitFor();
  await f.page.getByText('Sign out other sessions',{exact:true}).click();
  await f.page.getByText('Other sign-ins revoked',{exact:true}).waitFor();
  await f.page.getByText('Other sessions can no longer renew their sign-in. Existing access tokens may remain valid until they expire.',{exact:true}).waitFor();
  const calls=f.requests.filter(r=>r.path.includes('/auth/v1/logout'));assert.equal(calls.length,1);assert.equal(calls[0].method,'POST');assert(calls[0].search.includes('scope=others'));
  assert.deepEqual(f.errors,[]);
 }finally{await f.close();}
});
