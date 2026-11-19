import { supabase } from '../lib_supabase';

export const PUBLIC_MEDIA_BUCKET = 'konnekt-public-media';
// Short streaming URLs are deliberately temporary, not permanent share links.
// Revocation is NOT immediate for issued signed URLs: see release documentation.
export const PRIVATE_MEDIA_URL_TTL_SECONDS = 60;

export function publicMediaPath(value, projectUrl) {
  if (typeof value !== 'string' || !value.trim()) return null;
  const raw = value.trim();
  if (!/^https?:\/\//i.test(raw)) {
    if (raw.startsWith('/') || raw.includes('..') || raw.includes('?') || raw.includes('#')) return null;
    return raw;
  }
  try {
    const url = new URL(raw);
    const expected = new URL(projectUrl);
    if (url.origin !== expected.origin || url.search || url.hash) return null;
    const markers = [
      '/storage/v1/object/public/' + PUBLIC_MEDIA_BUCKET + '/',
      '/storage/v1/object/sign/' + PUBLIC_MEDIA_BUCKET + '/'
    ];
    const marker = markers.find(m => url.pathname.startsWith(m));
    if (!marker) return null;
    const path = decodeURIComponent(url.pathname.slice(marker.length));
    if (!path || path.startsWith('/') || path.includes('..') || path.includes('?') || path.includes('#')) return null;
    return path;
  } catch { return null; }
}

export async function authorizedPublicMediaUrl(value) {
  const projectUrl = import.meta.env.VITE_SUPABASE_URL;
  const path = publicMediaPath(value, projectUrl);
  if (!path) throw new Error('Media path is not from the expected staging bucket.');
  // A caller must have a current authenticated session, and Storage SELECT RLS
  // must authorize signing the URL; never expose a service-role key in the app.
  const { data: sessionData, error: sessionError } = await supabase.auth.getUser();
  if (sessionError || !sessionData?.user?.id) throw new Error('Sign in to view this media.');
  const { data, error } = await supabase.storage.from(PUBLIC_MEDIA_BUCKET)
    .createSignedUrl(path, PRIVATE_MEDIA_URL_TTL_SECONDS);
  if (error || !data?.signedUrl) throw new Error('Media access denied or unavailable.');
  return data.signedUrl;
}
