import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createCleanupSocialHandler,ownedSocialPath} from '../supabase/functions/cleanup-social-media/handler.mjs';
const A='11111111-1111-4111-8111-111111111111',S='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',PATH=`reels/${A}/fixture.webm`;
function fixture(overrides={}){
 const calls=[];
 const handler=createCleanupSocialHandler({projectUrl:'https://oiwtfkgrnpzirghbsvim.supabase.co',configured:true,
  authorize:async()=>{calls.push('authorize');return{id:A,sessionId:S};},
  claim:async(actor,path)=>{calls.push('claim');assert.equal(actor.id,A);return{guardVersion:1,path,claimed:true};},
  remove:async path=>{calls.push('remove');assert.equal(path,PATH);},
  verifyAbsent:async(actor,path)=>{calls.push('verify');return{guardVersion:1,path,absent:true};},...overrides});
 return{calls,handler,request:(body={path:PATH},options={})=>handler(new Request('https://fixture.test/cleanup',{method:'POST',headers:{Authorization:'Bearer fixture-token','Content-Type':'application/json',...options.headers},body:JSON.stringify(body),...options}))};
}
test('social cleanup accepts only exact canonical own paths and rejects buckets, actor injection, traversal and aliases',async()=>{
 for(const path of [PATH,`statuses/${A}/fixture.png`,`posts/${A}/fixture.jpg`])assert(ownedSocialPath(path,A));
 for(const path of [null,'',`reels/${S}/fixture.webm`,`reels/${A}/../fixture`,`reels/${A}/%66ixture`,`reels/${A}/.`,`reels/${A}/..`,`${PATH}?token=1`,`${PATH}#x`,PATH+'\\x','/'+PATH,'https://fixture.test/'+PATH,`konnekt-chat-media/${A}/fixture`]){
  const f=fixture(),response=await f.request({path});assert.equal(response.status,400);assert(!f.calls.includes('claim'));
 }
 const f=fixture();assert.equal((await f.request({path:PATH,bucket:'other'})).status,400);
});
test('cleanup verifies caller and permanent DB claim before Storage API removal and confirms exact-path absence',async()=>{
 const f=fixture(),response=await f.request();assert.equal(response.status,200);assert.deepEqual(await response.json(),{removed:true,path:PATH});assert.deepEqual(f.calls,['authorize','claim','remove','verify']);
});
test('denied, missing or wrong-path DB guard never calls Storage.remove',async()=>{
 for(const permit of [null,{claimed:true,path:PATH},{guardVersion:1,path:PATH+'wrong',claimed:true},{guardVersion:1,path:PATH,claimed:false}]){
  const f=fixture({claim:async()=>permit});assert([409,503].includes((await f.request()).status));assert(!f.calls.includes('remove'));
 }
 const f=fixture({claim:async()=>{throw Error('RPC not installed');}});assert.equal((await f.request()).status,503);assert(!f.calls.includes('remove'));
});
test('Storage success alone, a wrong absence acknowledgment or uncertain deletion never claims removal',async()=>{
 for(const result of [null,{guardVersion:1,path:PATH,absent:false},{guardVersion:1,path:PATH+'wrong',absent:true}]){
  const f=fixture({verifyAbsent:async()=>result});assert.equal((await f.request()).status,503);
 }
 const f=fixture({remove:async()=>{throw Error('Response lost');}});assert.equal((await f.request()).status,503);assert(!f.calls.includes('verify'));
});
test('authorization, configuration, origins and methods fail closed without cleanup side effects',async()=>{
 for(const overrides of [{authorize:async()=>null},{authorize:async()=>{throw Error();}},{configured:false},{projectUrl:'https://production.example'}]){
  const f=fixture(overrides);assert([401,503].includes((await f.request()).status));assert(!f.calls.includes('claim'));
 }
 const f=fixture();assert.equal((await f.handler(new Request('https://fixture.test',{method:'POST',headers:{Origin:'https://attacker.example'}}))).status,403);
 assert.equal((await f.handler(new Request('https://fixture.test'))).status,405);
 assert.equal((await f.handler(new Request('https://fixture.test',{method:'POST'}))).status,401);
 assert.equal((await f.handler(new Request('https://fixture.test',{method:'OPTIONS',headers:{Origin:'https://localhost'}}))).status,204);
 assert.deepEqual(f.calls,[]);
});
test('server adapter keeps service credentials server-only and uses authenticated session guard plus Storage API',async()=>{
 const source=await readFile(new URL('../supabase/functions/cleanup-social-media/index.ts',import.meta.url),'utf8');
 assert.match(source,/Deno\.env\.get\('SUPABASE_SERVICE_ROLE_KEY'\)/);assert.match(source,/auth\.getUser\(token\)/);assert.match(source,/rpc\('konnekt_authorize_turn'/);assert.match(source,/storage\.from\('konnekt-public-media'\)\.remove\(\[path\]\)/);assert(!/\.from\('objects'\)\.delete/.test(source));
});
test('cleanup streams enforce a 2048-byte limit and require JSON without buffering an arbitrary body',async()=>{
 const f=fixture();let cancelled=false;
 const stream=new ReadableStream({pull(controller){controller.enqueue(new Uint8Array(1024));},cancel(){cancelled=true;}});
 const request=new Request('https://fixture.test/cleanup',{method:'POST',duplex:'half',headers:{Authorization:'Bearer fixture-token','Content-Type':'application/json'},body:stream});
 assert.equal((await f.handler(request)).status,413);assert(cancelled);assert(!f.calls.includes('claim'));
 const rejected=await f.handler(new Request('https://fixture.test/cleanup',{method:'POST',headers:{Authorization:'Bearer fixture-token','Content-Type':'text/plain'},body:'{}'}));assert.equal(rejected.status,415);
 const declared=await f.handler(new Request('https://fixture.test/cleanup',{method:'POST',headers:{Authorization:'Bearer fixture-token','Content-Type':'application/json','Content-Length':'10000000'},body:'{}'}));assert.equal(declared.status,413);
});
