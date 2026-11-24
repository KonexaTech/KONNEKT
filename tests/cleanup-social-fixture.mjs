// Synthetic schema only; reused by embedded-PG tests and optional loopback PG test.
export const ACTOR='11111111-1111-4111-8111-111111111111',OTHER='22222222-2222-4222-8222-222222222222',SESSION='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
export function cleanupFixture(){return `
 CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
 CREATE SCHEMA auth; CREATE SCHEMA storage; CREATE SCHEMA konnekt_private; CREATE SCHEMA konnekt_beta;
 CREATE TABLE auth.users(id uuid PRIMARY KEY,banned_until timestamptz);
 CREATE TABLE auth.sessions(id uuid PRIMARY KEY,user_id uuid,aal text,not_after timestamptz);
 CREATE TABLE auth.mfa_factors(user_id uuid,status text);
 CREATE TABLE public.account_deletion_requests(user_id uuid,status text);
 CREATE TABLE konnekt_beta.fixture_control(admitted boolean); INSERT INTO konnekt_beta.fixture_control VALUES(true);
 CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$SELECT coalesce(nullif(current_setting('request.jwt.claim.sub',true),''),nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'sub')::uuid$$;
 CREATE FUNCTION auth.jwt() RETURNS jsonb LANGUAGE sql STABLE AS $$SELECT coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb$$;
 CREATE FUNCTION konnekt_beta.admission_open() RETURNS boolean LANGUAGE sql STABLE AS $$SELECT admitted FROM konnekt_beta.fixture_control$$;
 CREATE TABLE public.reels(id uuid DEFAULT gen_random_uuid(),user_id uuid,media_path text,deleted_at timestamptz,published_at timestamptz);
 CREATE TABLE public.statuses(id uuid DEFAULT gen_random_uuid(),user_id uuid,media_url text,expires_at timestamptz);
 CREATE TABLE public.posts(id uuid DEFAULT gen_random_uuid(),user_id uuid,media_url text);
 CREATE TABLE storage.objects(bucket_id text,name text,owner uuid,owner_id text);
 ALTER TABLE public.reels ENABLE ROW LEVEL SECURITY; ALTER TABLE public.statuses ENABLE ROW LEVEL SECURITY; ALTER TABLE public.posts ENABLE ROW LEVEL SECURITY;
 CREATE POLICY visible_reels ON public.reels FOR SELECT TO authenticated USING(deleted_at IS NULL AND published_at IS NOT NULL);
 CREATE POLICY visible_statuses ON public.statuses FOR SELECT TO authenticated USING(expires_at>now());
 CREATE POLICY own_insert ON public.reels FOR INSERT TO authenticated WITH CHECK(user_id=auth.uid());
 GRANT USAGE ON SCHEMA public,auth TO authenticated,service_role;
 GRANT SELECT,INSERT ON public.reels,public.statuses,public.posts TO authenticated;
 INSERT INTO auth.users VALUES('${ACTOR}',null),('${OTHER}',null);
 INSERT INTO auth.sessions VALUES('${SESSION}','${ACTOR}','aal1',null);
 `;}
