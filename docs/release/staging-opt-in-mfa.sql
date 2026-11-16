-- STAGING ONLY: optional enrolled-account MFA. Apply after client challenge UI.
-- Existing accounts without a verified factor keep their current sign-in flow.
BEGIN;
CREATE SCHEMA IF NOT EXISTS konnekt_private;
REVOKE ALL ON SCHEMA konnekt_private FROM PUBLIC, anon;
GRANT USAGE ON SCHEMA konnekt_private TO authenticated;
CREATE OR REPLACE FUNCTION konnekt_private.session_allowed()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT (SELECT auth.uid()) IS NOT NULL AND (
    coalesce((SELECT auth.jwt())->>'aal', 'aal1') = 'aal2'
    OR NOT EXISTS (SELECT 1 FROM auth.mfa_factors f
      WHERE f.user_id = (SELECT auth.uid()) AND f.status = 'verified')
  );
$$;
REVOKE ALL ON FUNCTION konnekt_private.session_allowed() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION konnekt_private.session_allowed() TO authenticated;

-- Restrictive policies supplement existing ownership, membership and block RLS.
DO $policy$
DECLARE target record;
BEGIN
  FOR target IN SELECT n.nspname, c.relname, c.relrowsecurity
    FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE c.relkind='r' AND (n.nspname='public' OR (n.nspname='storage' AND c.relname='objects'))
  LOOP
    IF NOT target.relrowsecurity THEN RAISE EXCEPTION 'RLS required on %.%', target.nspname, target.relname; END IF;
    EXECUTE format('DROP POLICY IF EXISTS release_opt_in_mfa ON %I.%I', target.nspname, target.relname);
    EXECUTE format('CREATE POLICY release_opt_in_mfa ON %I.%I AS RESTRICTIVE FOR ALL TO authenticated USING ((SELECT konnekt_private.session_allowed())) WITH CHECK ((SELECT konnekt_private.session_allowed()))', target.nspname, target.relname);
  END LOOP;
END;
$policy$;

-- These SECURITY DEFINER helpers are used in RLS and as read-only RPCs. Keep
-- their OIDs/dependencies, but make direct calls respect the same MFA gate.
DO $helpers$
DECLARE target record; body text;
BEGIN
  FOR target IN SELECT p.oid,p.proname,p.prosrc,l.lanname,pg_get_function_arguments(p.oid) AS args
    FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace JOIN pg_language l ON l.oid=p.prolang
    WHERE n.nspname='public' AND p.proname IN ('is_konnekt_conversation_creator','is_konnekt_conversation_member','is_konnekt_moderator','konnekt_can_view_reel','konnekt_is_blocked_pair')
  LOOP
    IF target.lanname <> 'sql' THEN RAISE EXCEPTION 'Review non-SQL helper %', target.proname; END IF;
    IF position('konnekt_private.session_allowed' IN target.prosrc)=0 THEN
      body := regexp_replace(trim(target.prosrc), ';\s*$', '');
      EXECUTE format('CREATE OR REPLACE FUNCTION public.%I(%s) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = %L AS %L', target.proname, target.args, '', 'SELECT CASE WHEN (SELECT konnekt_private.session_allowed()) THEN (' || body || ') ELSE false END');
    END IF;
  END LOOP;
END;
$helpers$;

-- Definer write RPCs bypass RLS. Put their existing implementation outside the
-- exposed schema, revoke client execution, and gate the public entry points.
DO $rpcs$
DECLARE target record; signature text; original text; args text; parameters text;
BEGIN
  FOR target IN SELECT * FROM (VALUES
    ('create_direct_conversation','uuid',1),
    ('konnekt_start_direct_conversation','text',1),
    ('konnekt_create_group_conversation','text,text,uuid[]',3)
  ) AS entries(name,types,arity)
  LOOP
    original := 'original_' || target.name;
    IF to_regprocedure('konnekt_private.' || original || '(' || target.types || ')') IS NULL THEN
      EXECUTE format('ALTER FUNCTION public.%I(%s) SET SCHEMA konnekt_private', target.name, target.types);
      EXECUTE format('ALTER FUNCTION konnekt_private.%I(%s) RENAME TO %I', target.name, target.types, original);
    END IF;
    signature := 'konnekt_private.' || original || '(' || target.types || ')';
    SELECT pg_get_function_arguments(to_regprocedure(signature)) INTO args;
    SELECT string_agg('$'||n,',' ORDER BY n) INTO parameters FROM generate_series(1,target.arity) AS n;
    EXECUTE format('REVOKE ALL ON FUNCTION konnekt_private.%I(%s) FROM PUBLIC, anon, authenticated', original, target.types);
    EXECUTE format('CREATE OR REPLACE FUNCTION public.%I(%s) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = %L AS %L', target.name, args, '', 'BEGIN IF NOT konnekt_private.session_allowed() THEN RAISE EXCEPTION USING ERRCODE = ''42501'', MESSAGE = ''Complete authenticator verification before accessing KONNEKT.''; END IF; RETURN konnekt_private.' || original || '(' || parameters || '); END;');
    EXECUTE format('REVOKE ALL ON FUNCTION public.%I(%s) FROM PUBLIC, anon',target.name,target.types);
    EXECUTE format('GRANT EXECUTE ON FUNCTION public.%I(%s) TO authenticated',target.name,target.types);
  END LOOP;
END;
$rpcs$;
NOTIFY pgrst, 'reload schema';
COMMIT;
