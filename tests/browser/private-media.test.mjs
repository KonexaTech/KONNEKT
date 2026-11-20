import {after,before,test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {startServer,setup} from './helpers.mjs';
let server;
before(async()=>{server=await startServer();});
after(()=>server?.stop());
test('legacy public Status URLs resolve only to the exact authorized project and bucket',async()=>{
 const f=await setup(server.base);
 try{
  const result=await f.page.evaluate(async()=>{
   const {publicMediaPath}=await import('/KONNEKT/src/services/privateMedia.js');
   const project='https://oiwtfkgrnpzirghbsvim.supabase.co';
   return [
    publicMediaPath('statuses/u1/media.webm',project),
    publicMediaPath(project+'/storage/v1/object/public/konnekt-public-media/statuses/u1/media.webm',project),
    publicMediaPath('https://itkoagpigiifodfhoujt.supabase.co/storage/v1/object/public/konnekt-public-media/statuses/u1/media.webm',project),
    publicMediaPath(project+'/storage/v1/object/public/konnekt-chat-media/statuses/u1/media.webm',project),
    publicMediaPath('statuses/../secrets.txt',project),
    publicMediaPath(project+'/storage/v1/object/public/konnekt-public-media/media.webm?token=x',project)
   ];
  });
  assert.deepEqual(result,['statuses/u1/media.webm','statuses/u1/media.webm',null,null,null,null]);
  assert.deepEqual(f.errors,[]);
 }finally{await f.close();}
});
test('media uploads no longer persist public URLs and signed URL duration stays short',()=>{
 const service=readFileSync(new URL('../../src/services/media.js',import.meta.url),'utf8');
 const media=readFileSync(new URL('../../src/media.js',import.meta.url),'utf8');
 const privateMedia=readFileSync(new URL('../../src/services/privateMedia.js',import.meta.url),'utf8');
 assert.doesNotMatch(service,/\.getPublicUrl\(/);
 assert.doesNotMatch(media,/\.getPublicUrl\(/);
 assert.doesNotMatch(media,/\.createSignedUrl\(/);
 assert.match(media,/return \{ path, type \}/);
 assert.match(privateMedia,/PRIVATE_MEDIA_URL_TTL_SECONDS = 60/);
 assert.match(privateMedia,/\.createSignedUrl\(path, PRIVATE_MEDIA_URL_TTL_SECONDS\)/);
});

test('denied private-media signing does not fall back to a public URL',async()=>{
 const f=await setup(server.base);
 try{
  const {page,failures,requests}=f;
  failures.set('POST:media.webm',{code:'42501',message:'Storage SELECT denied'});
  const outcome=await page.evaluate(async()=>{
   const {authorizedPublicMediaUrl}=await import('/KONNEKT/src/services/privateMedia.js');
   try {
     const url=await authorizedPublicMediaUrl('statuses/user-1/media.webm');
     return {accepted:true,url};
   }catch(error){return {accepted:false,message:error.message};}
  });
  assert.deepEqual(outcome,{accepted:false,message:'Media access denied or unavailable.'});
  assert.equal(requests.some(x=>x.path.includes('/storage/v1/object/public/')),false);
  assert.deepEqual(f.errors,[]);
 }finally{await f.close();}
});
