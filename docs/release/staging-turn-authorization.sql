-- STAGING ONLY; requires the inspected Auth schema and MFA/deletion helper.
BEGIN;
CREATE OR REPLACE FUNCTION public.konnekt_authorize_turn(p_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
  SELECT auth.uid()=p_user_id AND konnekt_private.session_allowed() AND EXISTS(
    SELECT 1 FROM auth.sessions s JOIN auth.users u ON u.id=s.user_id
      WHERE s.id=nullif(auth.jwt()->>'session_id','')::uuid AND s.user_id=p_user_id
        AND (s.not_after IS NULL OR s.not_after>now())
        AND (u.banned_until IS NULL OR u.banned_until<=now())
  );
$$;
REVOKE ALL ON FUNCTION public.konnekt_authorize_turn(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.konnekt_authorize_turn(uuid) TO authenticated;
COMMIT;
