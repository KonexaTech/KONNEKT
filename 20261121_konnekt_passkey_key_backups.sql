-- Additive passkey-backed encrypted key recovery. Run in reviewed staging only.
-- Every row contains encrypted private-key material, never plaintext keys.
-- Enrollment requires an existing private key and WebAuthn PRF-capable passkey.
CREATE TABLE IF NOT EXISTS public.user_key_passkey_backups (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  credential_id text NOT NULL CHECK (length(credential_id) BETWEEN 16 AND 2048),
  salt text NOT NULL CHECK (length(salt) BETWEEN 16 AND 256),
  iv text NOT NULL CHECK (length(iv) BETWEEN 12 AND 256),
  ciphertext text NOT NULL CHECK (length(ciphertext) BETWEEN 100 AND 65536),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.user_key_passkey_backups ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users select own passkey encrypted backup"
  ON public.user_key_passkey_backups FOR SELECT TO authenticated
  USING (user_id = (select auth.uid()));
CREATE POLICY "users insert own passkey encrypted backup"
  ON public.user_key_passkey_backups FOR INSERT TO authenticated
  WITH CHECK (user_id = (select auth.uid()));
CREATE POLICY "users update own passkey encrypted backup"
  ON public.user_key_passkey_backups FOR UPDATE TO authenticated
  USING (user_id = (select auth.uid()))
  WITH CHECK (user_id = (select auth.uid()));
GRANT SELECT, INSERT, UPDATE ON public.user_key_passkey_backups TO authenticated;
REVOKE ALL ON public.user_key_passkey_backups FROM anon;

-- No existing key/backup/account/message rows are changed by this migration.
