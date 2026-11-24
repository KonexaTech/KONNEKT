import { supabase } from '../lib_supabase';
import { validateMediaFile } from './mediaValidation';

export function chooseMedia(accept = 'image/*,video/*') {
  return new Promise((resolve, reject) => {
    if (typeof document === 'undefined') return reject(new Error('File selection is available in the web app.'));
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = accept;
    input.onchange = () => resolve(input.files?.[0] || null);
    input.oncancel = () => resolve(null);
    input.onerror = () => reject(new Error('Could not open the file picker.'));
    input.click();
  });
}

export async function uploadMedia(file, bucket = 'konnekt-public-media', folder = 'uploads', options = {}) {
  if (!file) return null;
  const type = validateMediaFile(file, bucket);
  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
  const unique = globalThis.crypto?.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const path = `${folder}/${unique}-${safeName}`;
  options.onPath?.(path);
  const { error } = await supabase.storage.from(bucket).upload(path, file, { upsert: false, contentType: file.type });
  if (error) throw error;
  if (bucket === 'konnekt-public-media') {
    const { data } = supabase.storage.from(bucket).getPublicUrl(path);
    return { path, url: data.publicUrl, type };
  }
  // Private attachments are fetched by authorized recipients when displayed.
  // Do not mint a long-lived bearer URL at upload time.
  return { path, type };
}

// A lost INSERT response does not prove that the message failed. Confirm the
// upload is unreferenced before deleting it; retain it if this lookup fails.
export async function cleanupUnusedChatMedia(userId, conversationId, path) {
  if (!userId || !conversationId || !path) throw new Error('Cannot verify unused attachment.');
  const { data, error } = await supabase.from('messages').select('id')
    .eq('sender_id', userId).eq('conversation_id', conversationId).eq('media_path', path).limit(1);
  if (error) throw error;
  if (data?.length) return false;
  const removed = await supabase.storage.from('konnekt-chat-media').remove([path]);
  if (removed.error) throw removed.error;
  return true;
}

// Retain media if an owned reference is visible. An empty client lookup alone
// cannot authorize deletion: RLS may hide references, and publication can race.
// The server must retire the path atomically before removing the Storage blob.
export async function cleanupUnusedPublicMedia(table, userId, media) {
  const column = table === 'reels' ? 'media_path' : table === 'statuses' ? 'media_url' : null;
  if (!column || !media?.path || !userId) throw new Error('Cannot verify unused media.');
  const { data, error } = await supabase.from(table).select('id')
    .eq('user_id', userId).eq(column, table === 'reels' ? media.path : media.url).limit(1);
  if (error) throw error;
  if (data?.length) return false;
  const result = await supabase.functions.invoke('cleanup-social-media', { body: { path: media.path } });
  if (result.error) throw result.error;
  if (result.data?.removed !== true || result.data?.path !== media.path) throw new Error('Unused media cleanup could not be confirmed.');
  return true;
}
