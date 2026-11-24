import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';

const inventory = await readFile(new URL('../docs/release/staging-beta-authorization-inventory.sql', import.meta.url), 'utf8');

async function fixture() {
  const db = new PGlite();
  await db.exec(`
    CREATE ROLE anon;
    CREATE ROLE authenticated;
    CREATE SCHEMA storage;
    CREATE SCHEMA konnekt_beta;
    CREATE TABLE storage.buckets (
      id text PRIMARY KEY, name text, public boolean,
      file_size_limit bigint, allowed_mime_types text[]
    );
    INSERT INTO storage.buckets VALUES ('fixture-media','Fixture',false,1024,ARRAY['audio/webm']);
    CREATE TABLE public.inventory_messages (id integer PRIMARY KEY, body text);
    INSERT INTO public.inventory_messages VALUES (1,'fixture retained');
    ALTER TABLE public.inventory_messages ENABLE ROW LEVEL SECURITY;
    CREATE POLICY inventory_member_read ON public.inventory_messages
      FOR SELECT TO authenticated USING (true);
    CREATE VIEW public.inventory_member_view WITH (security_invoker=true)
      AS SELECT id FROM public.inventory_messages;
    REVOKE ALL ON public.inventory_member_view FROM PUBLIC, anon;
    GRANT SELECT ON public.inventory_member_view TO authenticated;
    CREATE FUNCTION public.inventory_guard() RETURNS boolean
      LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS 'SELECT true';
    REVOKE ALL ON FUNCTION public.inventory_guard() FROM PUBLIC, anon;
    GRANT EXECUTE ON FUNCTION public.inventory_guard() TO authenticated;
    CREATE FUNCTION public.inventory_unpinned_guard() RETURNS boolean
      LANGUAGE sql STABLE SECURITY DEFINER AS 'SELECT true';
    REVOKE ALL ON FUNCTION public.inventory_unpinned_guard() FROM PUBLIC, anon;
    GRANT EXECUTE ON FUNCTION public.inventory_unpinned_guard() TO authenticated;
    CREATE FUNCTION public.inventory_sum_state(integer,integer) RETURNS integer
      LANGUAGE sql IMMUTABLE AS 'SELECT $1+$2';
    CREATE AGGREGATE public.inventory_sum(integer)
      (SFUNC=public.inventory_sum_state,STYPE=integer,INITCOND='0');
  `);
  return db;
}

async function snapshot(db) {
  return (await db.query(`SELECT
    (SELECT count(*) FROM pg_class WHERE relnamespace IN ('public'::regnamespace,'storage'::regnamespace,'konnekt_beta'::regnamespace)) AS relations,
    (SELECT count(*) FROM pg_proc WHERE pronamespace='public'::regnamespace) AS functions,
    (SELECT count(*) FROM pg_policy) AS policies,
    (SELECT body FROM public.inventory_messages WHERE id=1) AS retained_body,
    (SELECT public FROM storage.buckets WHERE id='fixture-media') AS bucket_public`)).rows[0];
}

test('inventory rejects aggregate definitions safely and executes all catalog queries inside a read-only transaction', async () => {
  const db = await fixture();
  try {
    const before = await snapshot(db);
    const aggregate = (await db.query(`SELECT p.prokind,has_function_privilege('authenticated',p.oid,'EXECUTE') AS callable
      FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
      WHERE n.nspname='public' AND p.proname='inventory_sum'`)).rows[0];
    assert.deepEqual(aggregate, { prokind: 'a', callable: true });
    const unfiltered = inventory.replace(/\s+and p\.prokind in \('f','p'\)/i, '');
    assert.notEqual(unfiltered, inventory, 'regression must remove the actual aggregate guard');
    await assert.rejects(db.exec(unfiltered), /aggregate function/);
    await db.exec('ROLLBACK');

    assert.match(inventory, /^BEGIN READ ONLY;$/m);
    assert.match(inventory, /ROLLBACK;\s*$/);
    assert.equal((inventory.match(/\bBEGIN READ ONLY\b/g) || []).length, 1);
    const results = await db.exec(inventory);
    const rows = results.flatMap(result => result.rows || []);
    const guarded = rows.find(row => row.function_name === 'inventory_guard' && row.definition_for_manual_review);
    assert(guarded, 'callable protected function must be inventoried');
    assert.equal(guarded.security_definer, true);
    assert.equal(guarded.anon_can_execute, false);
    assert.equal(guarded.authenticated_can_execute, true);
    assert.match(guarded.definition_for_manual_review, /SECURITY DEFINER/);
    assert(!rows.some(row => row.function_name === 'inventory_sum'), 'aggregate is not an RPC function definition');

    const policy = rows.find(row => row.policyname === 'inventory_member_read');
    assert.deepEqual(policy.roles, ['authenticated']);
    assert.equal(policy.cmd, 'SELECT');
    const view = rows.find(row => row.view_name === 'inventory_member_view');
    assert(view.view_options.includes('security_invoker=true'));
    assert.equal(view.view_owner, (await db.query('SELECT current_user AS owner')).rows[0].owner);
    assert.equal(view.anon_can_select, false);
    assert.equal(view.authenticated_can_select, true);
    const pinned = rows.find(row => row.function_name === 'inventory_guard' && Object.hasOwn(row, 'no_explicit_search_path'));
    const unpinned = rows.find(row => row.function_name === 'inventory_unpinned_guard' && Object.hasOwn(row, 'no_explicit_search_path'));
    assert.equal(pinned.no_explicit_search_path, false);
    assert.equal(unpinned.no_explicit_search_path, true);
    assert(rows.some(row => row.beta_schema_present === true));
    assert(rows.some(row => row.id === 'fixture-media' && row.public === false));
    assert.deepEqual(await snapshot(db), before, 'inventory must preserve catalog and fixture data');

    // Prove the script's actual transaction boundary blocks writes, rather than
    // merely matching a read-only comment. Inject only in this isolated fixture.
    const attemptedWrite = inventory.replace(/\bROLLBACK;\s*$/, "INSERT INTO public.inventory_messages VALUES (2,'must not persist');\nROLLBACK;");
    await assert.rejects(db.exec(attemptedWrite), /read-only transaction/);
    await db.exec('ROLLBACK');
    assert.deepEqual(await snapshot(db), before);
  } finally { await db.close(); }
});
