import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';

const proposal = await readFile(new URL('../docs/release/staging-passkey-backup-session-authorization.sql', import.meta.url), 'utf8');
const rollback = await readFile(new URL('../docs/release/staging-passkey-backup-session-authorization.rollback.sql', import.meta.url), 'utf8');
const sessionGuard = await readFile(new URL('../docs/release/staging-active-session-authorization.sql', import.meta.url), 'utf8');
const grantProposal = await readFile(new URL('../docs/release/staging-passkey-backup-grants.sql', import.meta.url), 'utf8');
const grantRollback = await readFile(new URL('../docs/release/staging-passkey-backup-grants.rollback.sql', import.meta.url), 'utf8');
const A = '11111111-1111-4111-8111-111111111111', B = '22222222-2222-4222-8222-222222222222';
const SESSION = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

async function fixture() {
  const db = new PGlite();
  await db.exec(`
    CREATE ROLE authenticated;
    CREATE SCHEMA auth; CREATE SCHEMA konnekt_private; CREATE SCHEMA konnekt_beta;
    CREATE TABLE auth.users(id uuid PRIMARY KEY);
    CREATE TABLE auth.sessions(id uuid PRIMARY KEY,user_id uuid,not_after timestamptz);
    CREATE TABLE auth.mfa_factors(user_id uuid,status text);
    CREATE TABLE public.account_deletion_requests(user_id uuid,status text);
    CREATE TABLE konnekt_beta.fixture_control(admitted boolean);
    INSERT INTO konnekt_beta.fixture_control VALUES(true);
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
    CREATE FUNCTION auth.jwt() RETURNS jsonb LANGUAGE sql STABLE AS $$SELECT current_setting('request.jwt.claims',true)::jsonb$$;
    CREATE FUNCTION konnekt_beta.admission_open() RETURNS boolean LANGUAGE sql STABLE AS $$SELECT admitted FROM konnekt_beta.fixture_control$$;
    CREATE TABLE public.user_key_passkey_backups(user_id uuid PRIMARY KEY,ciphertext text);
    ALTER TABLE public.user_key_passkey_backups ENABLE ROW LEVEL SECURITY;
    CREATE POLICY "users insert own passkey encrypted backup" ON public.user_key_passkey_backups FOR INSERT TO authenticated WITH CHECK(user_id=(SELECT auth.uid()));
    CREATE POLICY "users select own passkey encrypted backup" ON public.user_key_passkey_backups FOR SELECT TO authenticated USING(user_id=(SELECT auth.uid()));
    CREATE POLICY "users update own passkey encrypted backup" ON public.user_key_passkey_backups FOR UPDATE TO authenticated USING(user_id=(SELECT auth.uid())) WITH CHECK(user_id=(SELECT auth.uid()));
    GRANT USAGE ON SCHEMA public,auth,konnekt_private TO authenticated;
    GRANT ALL ON public.user_key_passkey_backups TO authenticated;
    INSERT INTO auth.users VALUES('${A}'),('${B}');
    INSERT INTO auth.sessions VALUES('${SESSION}','${A}',null);
    INSERT INTO public.user_key_passkey_backups VALUES('${A}','synthetic-encrypted-backup');
  `);
  await db.exec(sessionGuard);
  return db;
}

async function asUser(db, work, { id = A, aal = 'aal1', sid = SESSION } = {}) {
  await db.query("SELECT set_config('request.jwt.claim.sub',$1,false),set_config('request.jwt.claims',$2,false)", [id, JSON.stringify({ aal, session_id: sid })]);
  await db.exec('SET ROLE authenticated');
  try { return await work(); } finally { await db.exec('RESET ROLE'); }
}
async function visible(db, options) {
  return asUser(db, async () => (await db.query('SELECT ciphertext FROM public.user_key_passkey_backups')).rows, options);
}

test('new passkey policy closes reproduced revoked-session owner access and rollback changes only its policy', async () => {
  const db = await fixture();
  try {
    await db.exec('DELETE FROM auth.sessions');
    assert.equal((await visible(db)).length, 1, 'captured owner-only policies bypass the session helper');
    const before = (await db.query("SELECT policyname,cmd,qual,with_check FROM pg_policies WHERE tablename='user_key_passkey_backups' ORDER BY policyname")).rows;
    await db.exec(proposal);
    assert.equal((await visible(db)).length, 0);
    await db.exec(rollback);
    assert.equal((await visible(db)).length, 1);
    const after = (await db.query("SELECT policyname,cmd,qual,with_check FROM pg_policies WHERE tablename='user_key_passkey_backups' ORDER BY policyname")).rows;
    assert.deepEqual(after, before);
    assert.equal((await db.query('SELECT count(*)::int n FROM public.user_key_passkey_backups')).rows[0].n, 1);
    assert.equal((await db.query("SELECT has_table_privilege('authenticated','public.user_key_passkey_backups','SELECT') allowed")).rows[0].allowed, true);
  } finally { await db.close(); }
});

test('authorized passkey owners can read, insert and upsert; outsider and revoked-session writes remain denied', async () => {
  const db = await fixture();
  try {
    await db.exec(proposal);
    assert.equal((await visible(db)).length, 1);
    assert.equal((await visible(db, { id: B })).length, 0);
    await asUser(db, () => db.query("INSERT INTO public.user_key_passkey_backups VALUES($1,'updated-fixture') ON CONFLICT(user_id) DO UPDATE SET ciphertext=excluded.ciphertext", [A]));
    assert.equal((await visible(db))[0].ciphertext, 'updated-fixture');
    await assert.rejects(asUser(db, () => db.query("INSERT INTO public.user_key_passkey_backups VALUES($1,'outsider-fixture')", [B])), error => error.code === '42501');
    await db.exec('DELETE FROM public.user_key_passkey_backups');
    await asUser(db, () => db.query("INSERT INTO public.user_key_passkey_backups VALUES($1,'insert-fixture')", [A]));
    assert.equal((await visible(db)).length, 1);
    await db.exec('DELETE FROM auth.sessions');
    await assert.rejects(asUser(db, () => db.query("INSERT INTO public.user_key_passkey_backups VALUES($1,'revoked-fixture') ON CONFLICT(user_id) DO UPDATE SET ciphertext=excluded.ciphertext", [A])), error => error.code === '42501');
    assert.equal((await db.query('SELECT ciphertext FROM public.user_key_passkey_backups')).rows[0].ciphertext, 'insert-fixture');
  } finally { await db.close(); }
});

test('passkey backups require valid canonical session plus MFA, deletion, beta and Auth-user authorization', async () => {
  const db = await fixture();
  try {
    await db.exec(proposal);
    for (const sid of [null, 'invalid', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb']) assert.equal((await visible(db, { sid })).length, 0);
    await db.exec("UPDATE auth.sessions SET not_after=now()-interval '1 second'");
    assert.equal((await visible(db)).length, 0);
    await db.exec('UPDATE auth.sessions SET not_after=null');
    await db.query('UPDATE auth.sessions SET user_id=$1', [B]);
    assert.equal((await visible(db)).length, 0);
    await db.query('UPDATE auth.sessions SET user_id=$1', [A]);
    await db.query("INSERT INTO auth.mfa_factors VALUES($1,'verified')", [A]);
    assert.equal((await visible(db)).length, 0);
    assert.equal((await visible(db, { aal: 'aal2' })).length, 1);
    await db.exec('UPDATE konnekt_beta.fixture_control SET admitted=false');
    assert.equal((await visible(db, { aal: 'aal2' })).length, 0);
    await db.exec('UPDATE konnekt_beta.fixture_control SET admitted=true');
    await db.query("INSERT INTO public.account_deletion_requests VALUES($1,'processing')", [A]);
    assert.equal((await visible(db, { aal: 'aal2' })).length, 0);
    await db.exec("UPDATE public.account_deletion_requests SET status='completed'");
    assert.equal((await visible(db, { aal: 'aal2' })).length, 0);
    await db.exec("UPDATE public.account_deletion_requests SET status='requested'");
    assert.equal((await visible(db, { aal: 'aal2' })).length, 1);
    await db.exec('DELETE FROM auth.users');
    assert.equal((await visible(db, { aal: 'aal2' })).length, 0);
  } finally { await db.close(); }
});

test('separate grant hardening removes unused administration privileges without altering ordinary CRUD or owner policies', async () => {
  const db = await fixture();
  try {
    const privileges = async () => (await db.query(`SELECT
      has_table_privilege('authenticated','public.user_key_passkey_backups','TRUNCATE') AS truncate,
      has_table_privilege('authenticated','public.user_key_passkey_backups','TRIGGER') AS trigger,
      has_table_privilege('authenticated','public.user_key_passkey_backups','REFERENCES') AS references,
      has_table_privilege('authenticated','public.user_key_passkey_backups','SELECT') AS select,
      has_table_privilege('authenticated','public.user_key_passkey_backups','INSERT') AS insert,
      has_table_privilege('authenticated','public.user_key_passkey_backups','UPDATE') AS update,
      has_table_privilege('authenticated','public.user_key_passkey_backups','DELETE') AS delete`)).rows[0];
    const before = await privileges();
    assert(Object.values(before).every(Boolean));
    await db.exec(grantProposal);
    assert.deepEqual(await privileges(), { truncate: false, trigger: false, references: false, select: true, insert: true, update: true, delete: true });
    await assert.rejects(asUser(db, () => db.exec('TRUNCATE public.user_key_passkey_backups')), error => error.code === '42501');
    assert.equal((await visible(db)).length, 1);
    await asUser(db, () => db.query("INSERT INTO public.user_key_passkey_backups VALUES($1,'still-upsertable') ON CONFLICT(user_id) DO UPDATE SET ciphertext=excluded.ciphertext", [A]));
    assert.equal((await visible(db))[0].ciphertext, 'still-upsertable');
    assert.equal((await db.query("SELECT count(*)::int n FROM pg_policies WHERE tablename='user_key_passkey_backups'")).rows[0].n, 3);
    await db.exec(grantRollback);
    assert.deepEqual(await privileges(), before);
  } finally { await db.close(); }
});
