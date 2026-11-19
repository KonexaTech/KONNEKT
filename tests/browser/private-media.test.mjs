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
 assert.match(privateMedia,/PRIVATE_MEDIA_URL_TTL_SECONDS = 60/);
 assert.match(privateMedia,/\.createSignedUrl\(path, PRIVATE_MEDIA_URL_TTL_SECONDS\)/);
});
