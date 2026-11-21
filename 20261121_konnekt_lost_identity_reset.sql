-- Additive, review-before-deploy migration. No existing identity, backup or
-- message is changed by installing this function.
--
-- Execution is SECURITY INVOKER: the authenticated caller's existing RLS
-- policies must authorize both the profile update and encrypted backup insert.
-- Production rollout must validate authorization, existing MFA controls and
-- recovery/device acceptance before enabling the reset action.
CREATE OR REPLACE FUNCTION public.konnekt_replace_lost_encryption_identity(
  p_previous_public_key text,
  p_next_public_key text,
  p_ciphertext text,
  p_salt text,
  p_iv text,
  p_iterations integer,
  p_key_version integer
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_account uuid := (select auth.uid());
  v_registered_key text;
  v_public_jwk jsonb;
BEGIN
  IF v_account IS NULL THEN
    RAISE EXCEPTION 'Sign in to replace a lost encryption identity.';
  END IF;
  IF p_previous_public_key IS NULL
     OR p_next_public_key IS NULL
     OR p_previous_public_key = p_next_public_key THEN
    RAISE EXCEPTION 'Invalid replacement encryption identity.';
  END IF;
  IF length(p_next_public_key) NOT BETWEEN 100 AND 4096
     OR length(p_ciphertext) NOT BETWEEN 100 AND 65536
     OR length(p_salt) NOT BETWEEN 20 AND 64
     OR length(p_iv) NOT BETWEEN 12 AND 64
     OR p_iterations NOT BETWEEN 100000 AND 1000000
     OR p_key_version IS DISTINCT FROM 1 THEN
    RAISE EXCEPTION 'Invalid encrypted key backup parameters.';
  END IF;

  BEGIN
    v_public_jwk := p_next_public_key::jsonb;
  EXCEPTION WHEN others THEN
    RAISE EXCEPTION 'Invalid public encryption key.';
  END;
  IF v_public_jwk->>'kty' IS DISTINCT FROM 'EC'
     OR v_public_jwk->>'crv' IS DISTINCT FROM 'P-256'
     OR length(coalesce(v_public_jwk->>'x', '')) NOT BETWEEN 40 AND 50
     OR length(coalesce(v_public_jwk->>'y', '')) NOT BETWEEN 40 AND 50
     OR v_public_jwk ? 'd' THEN
    RAISE EXCEPTION 'Expected an ECDH P-256 public key without private material.';
  END IF;

  SELECT encryption_public_key INTO v_registered_key
    FROM public.profiles
    WHERE id = v_account
    FOR UPDATE;
  IF NOT FOUND OR v_registered_key IS DISTINCT FROM p_previous_public_key THEN
    RAISE EXCEPTION 'Encryption identity changed elsewhere; no reset was performed.';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.user_key_backups WHERE user_id = v_account
  ) THEN
    RAISE EXCEPTION 'An existing encrypted recovery backup must be restored; reset refused.';
  END IF;

  -- Both statements are one transaction. A failure restores the old public
  -- key and leaves no new backup. No private plaintext key reaches PostgreSQL.
  UPDATE public.profiles
     SET encryption_public_key = p_next_public_key
   WHERE id = v_account;
  INSERT INTO public.user_key_backups
    (user_id, ciphertext, salt, iv, iterations, key_version, updated_at)
    VALUES
    (v_account, p_ciphertext, p_salt, p_iv, p_iterations, p_key_version, now());
  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.konnekt_replace_lost_encryption_identity(
  text, text, text, text, text, integer, integer
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.konnekt_replace_lost_encryption_identity(
  text, text, text, text, text, integer, integer
) TO authenticated;
