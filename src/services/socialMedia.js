// Resolve persisted object paths rather than persisting expiring bearer URLs.
export const SOCIAL_MEDIA_BUCKET = 'konnekt-public-media';
export const SOCIAL_MEDIA_TTL = 300;

export function socialObjectPath(value, supabaseUrl) {
  if (typeof value !== 'string' || !value) throw new Error('Missing media path.');
  let path = value;
  if (/^https?:\/\//i.test(value)) {
    const url = new URL(value);
    if (url.origin !== new URL(supabaseUrl).origin) return null;
    const prefix = `/storage/v1/object/`;
    const match = url.pathname.match(/^\/storage\/v1\/object\/(?:public|sign|authenticated)\/konnekt-public-media\/(.+)$/);
    if (!url.pathname.startsWith(prefix) || !match) throw new Error('Unsupported media location.');
    try { path = decodeURIComponent(match[1]); } catch { throw new Error('Invalid media path.'); }
  }
  if (!path || path.startsWith('/') || /[?#\\\x00-\x1f]/.test(path) || path.split('/').some(part => !part || part === '.' || part === '..')) throw new Error('Invalid media path.');
  return path;
}

export async function resolveSocialMedia(client, supabaseUrl, value, { expiresAt, now = Date.now() } = {}) {
  let lifetime = SOCIAL_MEDIA_TTL;
  if (expiresAt !== undefined) {
    const remaining = Math.floor((Date.parse(expiresAt) - now) / 1000);
    if (!Number.isFinite(remaining) || remaining < 1) throw new Error('This media has expired.');
    lifetime = Math.min(lifetime, remaining);
  }
  const path = socialObjectPath(value, supabaseUrl);
  // Existing externally hosted media remains supported; never attach credentials.
  if (path === null) return value;
  const { data, error } = await client.storage.from(SOCIAL_MEDIA_BUCKET).createSignedUrl(path, lifetime);
  if (error) throw error;
  if (!data?.signedUrl) throw new Error('Media could not be authorized.');
  return data.signedUrl;
}
