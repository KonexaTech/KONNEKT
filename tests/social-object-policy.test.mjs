import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
const A = '11111111-1111-4111-8111-111111111111', B = '22222222-2222-4222-8222-222222222222', C = '33333333-3333-4333-8333-333333333333';
const migration = await readFile(new URL('../docs/release/staging-social-object-authorization.sql', import.meta.url), 'utf8');
const rollback = await readFile(new URL('../docs/release/staging-social-object-authorization.rollback.sql', import.meta.url), 'utf8');
async function fixture() {
  const db = new PGlite();
  await db.exec(`CREATE ROLE authenticated; CREATE ROLE anon; CREATE SCHEMA auth; CREATE SCHEMA storage; CREATE SCHEMA konnekt_private;
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$SELECT nullif(current_setting('request.jwt.claim.sub', true),'')::uuid$$;
    GRANT USAGE ON SCHEMA public,auth,storage,konnekt_private TO authenticated,anon;
    CREATE TABLE follows(follower_id uuid, followed_id uuid); CREATE TABLE user_blocks(blocker_id uuid,blocked_id uuid);
    CREATE TABLE reels(id text,user_id uuid,media_path text,visibility text,published_at timestamptz,deleted_at timestamptz);
    CREATE TABLE statuses(id text,user_id uuid,media_url text,expires_at timestamptz);
    CREATE TABLE posts(id text,user_id uuid,media_url text);
    CREATE TABLE storage.objects(bucket_id text,name text);
    GRANT SELECT ON public.follows,public.reels,public.statuses,public.posts,storage.objects TO authenticated,anon;
    CREATE FUNCTION public.konnekt_is_blocked_pair(other_user uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$SELECT EXISTS(SELECT 1 FROM public.user_blocks WHERE (blocker_id=auth.uid() AND blocked_id=other_user) OR (blocked_id=auth.uid() AND blocker_id=other_user))$$;
    ALTER TABLE reels ENABLE ROW LEVEL SECURITY; ALTER TABLE statuses ENABLE ROW LEVEL SECURITY; ALTER TABLE posts ENABLE ROW LEVEL SECURITY; ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;
    CREATE POLICY visible ON reels FOR SELECT TO authenticated USING(user_id=auth.uid() OR (deleted_at IS NULL AND published_at IS NOT NULL AND (visibility='public' OR (visibility='followers' AND EXISTS(SELECT 1 FROM follows WHERE follower_id=auth.uid() AND followed_id=user_id)))));
    CREATE POLICY active ON statuses FOR SELECT TO authenticated USING(expires_at>now());
    CREATE POLICY visible ON posts FOR SELECT TO authenticated USING(true);
    CREATE POLICY "public media readable by signed in users" ON storage.objects FOR SELECT TO authenticated USING(bucket_id='konnekt-public-media');
    CREATE POLICY "existing chat membership" ON storage.objects FOR SELECT TO authenticated USING(bucket_id='konnekt-chat-media' AND split_part(name,'/',1)=auth.uid()::text);
    INSERT INTO follows VALUES('${A}','${B}');
    INSERT INTO reels VALUES('public','${B}','reels/${B}/public.webm','public',now(),null),('followers','${B}','reels/${B}/followers.webm','followers',now(),null),('deleted','${B}','reels/${B}/deleted.webm','public',now(),now()),('draft','${B}','reels/${B}/draft.webm','public',null,null),('forged','${A}','reels/${B}/unreferenced.webm','public',now(),null);
    INSERT INTO statuses VALUES('active','${B}','https://oiwtfkgrnpzirghbsvim.supabase.co/storage/v1/object/public/konnekt-public-media/statuses/${B}/active.png',now()+interval '1 hour'),('expired','${B}','https://oiwtfkgrnpzirghbsvim.supabase.co/storage/v1/object/public/konnekt-public-media/statuses/${B}/expired.png',now()-interval '1 hour');
    INSERT INTO posts VALUES('post','${B}','posts/${B}/post.png');
    INSERT INTO storage.objects SELECT 'konnekt-public-media',media_path FROM reels WHERE id<>'forged';
    INSERT INTO storage.objects VALUES('konnekt-public-media','reels/${B}/unreferenced.webm'),('konnekt-public-media','statuses/${B}/active.png'),('konnekt-public-media','statuses/${B}/expired.png'),('konnekt-public-media','posts/${B}/post.png'),('konnekt-chat-media','${A}/existing.enc');`);
  return db;
}
async function visible(db, actor, role = 'authenticated') {
  await db.exec(`SET ROLE ${role}; SELECT set_config('request.jwt.claim.sub','${actor}',false);`);
  try { return (await db.query('SELECT bucket_id,name FROM storage.objects ORDER BY name')).rows; }
  finally { await db.exec('RESET ROLE'); }
}
test('social policy repairs the reproduced follower-file bypass and preserves existing chat policy', async () => {
  const db = await fixture(); try {
    assert((await visible(db,C)).some(row => row.name.endsWith('/followers.webm')), 'Baseline must reproduce the known broad read');
    await db.exec(migration);
    const follower = await visible(db,A), outsider = await visible(db,C);
    assert(follower.some(row => row.name.endsWith('/followers.webm')));
    assert(!outsider.some(row => row.name.endsWith('/followers.webm')));
    assert(outsider.some(row => row.name.endsWith('/public.webm')));
    assert(follower.some(row => row.bucket_id==='konnekt-chat-media'));
    assert(!outsider.some(row => row.bucket_id==='konnekt-chat-media'));
  } finally { await db.close(); }
});
test('deleted, unpublished, expired, orphan and spoofed-owner media stay unreadable, including to the uploader', async () => {
  const db = await fixture(); try { await db.exec(migration);
    for (const actor of [A,B,C]) {
      const rows = await visible(db,actor);
      for (const suffix of ['deleted.webm','draft.webm','expired.png','unreferenced.webm']) assert(!rows.some(row=>row.name.endsWith('/'+suffix)),suffix);
      assert(rows.some(row=>row.name.endsWith('/active.png')));
      assert(rows.some(row=>row.name.endsWith('/post.png')));
    }
    assert.equal((await visible(db,C,'anon')).length,0);
  } finally { await db.close(); }
});
test('blocking denies otherwise visible social objects, helper is invoker-only, and captured rollback restores policy only', async () => {
  const db=await fixture(); try { await db.exec(migration); await db.exec(`INSERT INTO user_blocks VALUES('${B}','${A}')`);
    assert.equal((await visible(db,A)).filter(row=>row.bucket_id==='konnekt-public-media').length,0);
    assert((await visible(db,C)).some(row=>row.name.endsWith('/public.webm')));
    const security=await db.query("SELECT prosecdef FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='konnekt_private' AND proname='can_read_social_object'");
    assert.equal(security.rows[0].prosecdef,false);
    const count=(await db.query('SELECT count(*)::int n FROM storage.objects')).rows[0].n;
    await db.exec(rollback);
    assert((await visible(db,C)).some(row=>row.name.endsWith('/followers.webm')));
    assert.equal((await db.query('SELECT count(*)::int n FROM storage.objects')).rows[0].n,count);
  } finally { await db.close(); }
});
