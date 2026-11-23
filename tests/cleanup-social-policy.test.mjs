import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
import {cleanupFixture,ACTOR as A,OTHER as B,SESSION as S} from './cleanup-social-fixture.mjs';
const proposal=await readFile(new URL('../docs/release/staging-social-media-cleanup.sql',import.meta.url),'utf8');
const sessionGuard=await readFile(new URL('../docs/release/staging-active-session-authorization.sql',import.meta.url),'utf8');
test('server cleanup claims preserve every active reference, close both publication orders, and require current authorization',async t=>{
 const db=new PGlite();
 const path=(name,kind='reels')=>`${kind}/${A}/${name}`;
 async function claim(p){await db.exec('SET ROLE service_role');try{return(await db.query('SELECT public.konnekt_claim_social_cleanup($1,$2,$3) permit',[A,S,p])).rows[0].permit;}finally{await db.exec('RESET ROLE');}}
 async function object(p,owner=A){await db.query("INSERT INTO storage.objects VALUES('konnekt-public-media',$1,$2::uuid,$2::text)",[p,owner]);}
 try{
  await db.exec(cleanupFixture());await db.exec(sessionGuard);await db.exec(proposal);
  await t.test('all-row definer checks retain unpublished Reel, active Status, post and foreign-owned objects',async()=>{
   const draft=path('draft.webm');await object(draft);await db.query('INSERT INTO reels(user_id,media_path) VALUES($1,$2)',[A,draft]);assert.equal((await claim(draft)).claimed,false);
   const active=path('active.png','statuses');await object(active);await db.query("INSERT INTO statuses(user_id,media_url,expires_at) VALUES($1,$2,now()+interval '1 hour')",[A,active]);assert.equal((await claim(active)).claimed,false);
   const post=path('post.png','posts');await object(post);await db.query('INSERT INTO posts(user_id,media_url) VALUES($1,$2)',[A,post]);assert.equal((await claim(post)).claimed,false);
   const foreign=path('foreign.webm');await object(foreign,B);assert.equal((await claim(foreign)).claimed,false);
   await assert.rejects(claim(`reels/${B}/wrong.webm`),e=>e.code==='42501');
  });
  await t.test('expired/softdeleted own media can retire without weakening reader SELECT; publication after claim fails',async()=>{
   for(const [kind,file] of [['statuses','expired.png'],['reels','deleted.webm']]){
    const p=path(file,kind);await object(p);
    if(kind==='statuses')await db.query("INSERT INTO statuses(user_id,media_url,expires_at) VALUES($1,$2,now()-interval '1 hour')",[A,`https://oiwtfkgrnpzirghbsvim.supabase.co/storage/v1/object/public/konnekt-public-media/${p}`]);
    else await db.query('INSERT INTO reels(user_id,media_path,deleted_at) VALUES($1,$2,now())',[A,p]);
    assert.equal((await claim(p)).claimed,true);assert.equal((await claim(p)).claimed,true,'uncertain Storage outcome can retry same retired path');
    if(kind==='statuses')await assert.rejects(db.query("UPDATE statuses SET expires_at=now()+interval '1 day' WHERE user_id=$1 AND media_url LIKE $2",[A,'%'+file]),e=>e.code==='23514');
    else await assert.rejects(db.query('UPDATE reels SET deleted_at=null WHERE media_path=$1',[p]),e=>e.code==='23514');
   }
  });
  await t.test('publication before claim retains object, orphan claim prevents future publication and all aliases fail closed',async()=>{
   const published=path('published.webm');await object(published);await db.query('INSERT INTO reels(user_id,media_path,published_at) VALUES($1,$2,now())',[A,published]);assert.equal((await claim(published)).claimed,false);
   const orphan=path('orphan.webm');await object(orphan);assert.equal((await claim(orphan)).claimed,true);
   await assert.rejects(db.query('INSERT INTO reels(user_id,media_path,published_at) VALUES($1,$2,now())',[A,orphan]),e=>e.code==='23514');
   await assert.rejects(db.query('INSERT INTO statuses(user_id,media_url,expires_at) VALUES($1,$2,now())',[A,'https://oiwtfkgrnpzirghbsvim.supabase.co/storage/v1/object/public/konnekt-public-media/statuses/'+A+'/%61.png']),e=>e.code==='23514');
   const result=(await db.query('SELECT public.konnekt_social_cleanup_absent($1,$2) result',[A,orphan])).rows[0].result;assert.equal(result.absent,false,'Storage success alone cannot confirm removal');
   // Simulate Storage API metadata completion locally, never delete cloud rows.
   await db.query('DELETE FROM storage.objects WHERE name=$1',[orphan]);assert.equal((await db.query('SELECT public.konnekt_social_cleanup_absent($1,$2) result',[A,orphan])).rows[0].result.absent,true);
  });
  await t.test('caller cannot invoke server-only cleanup and claim independently denies stale/MFA/beta/deletion state',async()=>{
   await db.exec('SET ROLE authenticated');try{await assert.rejects(db.query('SELECT public.konnekt_claim_social_cleanup($1,$2,$3)',[A,S,path('unauthorized.webm')]),e=>e.code==='42501');}finally{await db.exec('RESET ROLE');}
   const p=path('auth-gate.webm');await object(p);
   await db.exec("UPDATE auth.sessions SET not_after=now()-interval '1 second'");await assert.rejects(claim(p),e=>e.code==='42501');await db.exec('UPDATE auth.sessions SET not_after=null');
   await db.query("INSERT INTO auth.mfa_factors VALUES($1,'verified')",[A]);await assert.rejects(claim(p),e=>e.code==='42501');await db.exec("UPDATE auth.sessions SET aal='aal2'");
   await db.exec('UPDATE konnekt_beta.fixture_control SET admitted=false');await assert.rejects(claim(p),e=>e.code==='42501');await db.exec('UPDATE konnekt_beta.fixture_control SET admitted=true');
   await db.query("INSERT INTO account_deletion_requests VALUES($1,'processing')",[A]);await assert.rejects(claim(p),e=>e.code==='42501');await db.exec('DELETE FROM account_deletion_requests');
   await db.query('UPDATE auth.users SET banned_until=now()+interval \'1 day\' WHERE id=$1',[A]);await assert.rejects(claim(p),e=>e.code==='42501');await db.exec('UPDATE auth.users SET banned_until=null');
   assert.equal((await claim(p)).claimed,true);
  });
 }finally{await db.close();}
});
