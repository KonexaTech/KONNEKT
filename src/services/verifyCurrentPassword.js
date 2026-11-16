import { createClient } from '@supabase/supabase-js';
import { SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY } from '../lib_supabase';

// Password confirmation must not replace the active, possibly MFA-verified session.
export async function verifyCurrentPassword(credentials) {
  const client = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false, storageKey: 'konnekt-password-check' },
  });
  const result = await client.auth.signInWithPassword(credentials);
  if (result.data?.session) await client.auth.signOut({ scope: 'local' });
  return result;
}
