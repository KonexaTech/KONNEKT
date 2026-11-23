import { readFile } from 'node:fs/promises';
import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { installPrivateSocialMedia } from './social-media-fixture.mjs';
import { startServer, setup, ME, OTHER } from './helpers.mjs';
let server;
before(async()=>{server=await startServer();});after(()=>server?.stop());
const reel=(id,caption,published_at)=>({id,user_id:OTHER,caption,media_path:`reels/${OTHER}/${id}.webm`,visibility:'public',published_at,created_at:published_at,deleted_at:null});
const reels=[reel('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','Newest fixture Reel #new','2026-11-15T00:00:00Z'),reel('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','Selected fixture Reel #selected','2026-11-14T00:00:00Z')];
async function app(options={}){
  const fixture=await setup(server.base,{db:{reels,reel_likes:[],reel_comments:[],...options.db}});
  await installPrivateSocialMedia(fixture.context);
  await fixture.page.reload();fixture.page.setDefaultTimeout(12000);return fixture;
}
test('multi-Reel feed stays within the viewport and a Discover selection opens that Reel',async()=>{
  const f=await app();try{
    const {page}=f;
    await page.getByText('Newest fixture Reel #new',{exact:true}).waitFor();
    await page.waitForTimeout(500);
    assert(await page.evaluate(()=>document.documentElement.scrollHeight<=innerHeight+2),'Reels caused the page to grow past the viewport');
    assert.deepEqual(await page.getByRole('tab').allTextContents(),['✉Chats','▶Reels','◉Status','◎Discover','☎Calls','◌Profile'],'main navigation unchanged');
    await page.getByRole('tab',{name:'Discover',exact:true}).click();
    await page.getByLabel('Search Discover').fill('Selected fixture Reel');
    await page.getByRole('tab',{name:'Videos',exact:true}).click();
    await page.getByText('Selected fixture Reel #selected',{exact:true}).click();
    await page.waitForFunction(()=>[...document.querySelectorAll('video')].some(video=>video.src.includes('bbbbbbbb-bbbb')&&video.getBoundingClientRect().top<innerHeight&&video.getBoundingClientRect().bottom>150&&video.readyState>=2));
  }finally{await f.close();}
});
test('Reel playback, like rollback/persistence and comment retries use actual UI',async()=>{
  const f=await app({db:{reels:[reels[0]]}});try{
    const {page,db,failures}=f;
    await page.waitForFunction(()=>document.querySelector('video')?.readyState>=2);
    await page.locator('video').evaluate(video=>{video.muted=true;void video.play().catch(()=>{});});
    await page.waitForFunction(()=>document.querySelector('video').currentTime>0);
    failures.set('POST:reel_likes',{message:'Fixture like outage'});
    await page.getByText('🤍 Like · 0',{exact:true}).click();
    await page.getByText(/Like could not be saved/).waitFor();
    await page.getByText('🤍 Like · 0',{exact:true}).waitFor();assert.equal(db.reel_likes.length,0);
    failures.delete('POST:reel_likes');
    await page.getByText('🤍 Like · 0',{exact:true}).click();await page.getByText('❤️ Liked · 1',{exact:true}).waitFor();
    await page.getByPlaceholder('Add a comment…').fill('TEST fixture comment');
    failures.set('POST:reel_comments',{message:'Fixture comment outage'});await page.getByText('Send',{exact:true}).click();
    await page.getByText(/Comment could not be sent/).waitFor();assert.equal(await page.getByPlaceholder('Add a comment…').inputValue(),'TEST fixture comment');
    failures.delete('POST:reel_comments');await page.getByText('Send',{exact:true}).click();await page.getByText(/TEST fixture comment/).waitFor();
    assert.equal(db.reel_comments.length,1);
    await page.reload();await page.getByText('❤️ Liked · 1',{exact:true}).waitFor();await page.getByText(/TEST fixture comment/).waitFor();
  }finally{await f.close();}
});
test('an open status removes its content and stops video at expiry',{timeout:25000},async()=>{
  const now=Date.now();
  const f=await app({db:{statuses:[{id:'cccccccc-cccc-4ccc-8ccc-cccccccccccc',user_id:OTHER,text_content:'Expiring fixture status',media_url:`https://itkoagpigiifodfhoujt.supabase.co/storage/v1/object/public/konnekt-public-media/status.webm`,media_type:'video',created_at:new Date(now).toISOString(),expires_at:new Date(now+60000).toISOString()}]}});
  try{
    const {page}=f;await page.clock.install({time:now});await page.getByRole('tab',{name:'Status',exact:true}).click();
    await page.getByText('Expiring fixture status',{exact:true}).click();await page.getByText('Expiring fixture status',{exact:true}).waitFor();
    await page.locator('video').evaluate(video=>{video.muted=true;void video.play().catch(()=>{});});
    await page.waitForFunction(()=>document.querySelector('video')?.readyState>=2);
    await page.clock.fastForward(61000);
    await page.getByText('This status is no longer available.',{exact:true}).waitFor();
    assert.equal(await page.locator('video').count(),0);assert.equal(await page.getByText('Expiring fixture status',{exact:true}).count(),0);
    await page.getByText('Go back',{exact:true}).click();
  }finally{await f.close();}
});


test('failed Reel and Status inserts remove unused uploads; Status retry publishes once',async()=>{
  const f=await app({db:{statuses:[]}});try{
    const {page,db,requests,failures}=f;
    // Public social uploads are cleaned up by a private Edge Function,
    // not by DELETE requests from the browser. Handler authorization and
    // DB claim semantics are independently tested in social-cleanup tests.
    const cleanupRequests = [];
    await f.context.route('**/functions/v1/cleanup-social-media', route => {
      const request = route.request();
      if (request.method() === 'OPTIONS')
        return route.fulfill({ status: 204, headers: {
          'access-control-allow-origin': '*',
          'access-control-allow-headers': 'authorization,apikey,content-type'
        } });
      const body = request.postDataJSON();
      cleanupRequests.push({ method: request.method(), path: body?.path });
      const validPath = typeof body?.path === 'string' &&
        /^(reels|statuses)\/[0-9a-f-]{36}\/[A-Za-z0-9._-]+$/.test(body.path) &&
        body.path.split('/')[1] === ME;
      if (request.method() !== 'POST' || !validPath)
        return route.fulfill({ status: 400, contentType: 'application/json',
          headers: { 'access-control-allow-origin': '*' },
          body: JSON.stringify({ status: 'invalid_owned_path' }) });
      return route.fulfill({ status: 200, contentType: 'application/json',
        headers: { 'access-control-allow-origin': '*' },
        body: JSON.stringify({ removed: true, path: body.path }) });
    });
    await page.getByPlaceholder('Add a caption before uploading (optional)').fill('Failed fixture Reel');
    failures.set('POST:reels',{message:'Fixture publication failure'});
    let chooser=page.waitForEvent('filechooser');await page.getByText('＋ Create Reel',{exact:true}).click();
    await (await chooser).setFiles({name:'fixture.webm',mimeType:'video/webm',buffer:await readFile(new URL('../fixtures/social-video.webm',import.meta.url))});
    await page.getByText('Fixture publication failure',{exact:true}).waitFor();
    assert.equal(cleanupRequests.length,1);
    assert.equal(cleanupRequests[0].method,'POST');
    assert.match(cleanupRequests[0].path,new RegExp('^reels/' + ME + '/'));
    assert.equal(requests.filter(r=>r.method==='DELETE'&&r.path.includes('/storage/')).length,0);
    assert.equal(db.reels.length,2);
    await page.getByRole('tab',{name:'Profile',exact:true}).click();await page.getByText('☰  ALL FEATURES',{exact:true}).click();await page.getByRole('button',{name:'Open Create a status',exact:true}).click();
    await page.getByPlaceholder("What's happening?").fill('Fixture image status');
    chooser=page.waitForEvent('filechooser');await page.getByText('＋ Add photo or video',{exact:true}).click();
    await (await chooser).setFiles({name:'fixture.png',mimeType:'image/png',buffer:Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aOuoAAAAASUVORK5CYII=','base64')});
    failures.set('POST:statuses',{message:'Fixture status failure'});await page.getByText('PUBLISH STATUS',{exact:true}).click();
    await page.getByText('Fixture status failure',{exact:true}).waitFor();
    assert.equal(cleanupRequests.length,2);
    assert.equal(cleanupRequests[1].method,'POST');
    assert.match(cleanupRequests[1].path,new RegExp('^statuses/' + ME + '/'));
    assert.equal(requests.filter(r=>r.method==='DELETE'&&r.path.includes('/storage/')).length,0);
    assert.equal(db.statuses.length,0);
    failures.delete('POST:statuses');await page.getByText('PUBLISH STATUS',{exact:true}).click();await page.getByRole('button',{name:'Open Create a status',exact:true}).waitFor();
    assert.equal(db.statuses.length,1);assert.equal(db.statuses[0].user_id,ME);
  }finally{await f.close();}
});
