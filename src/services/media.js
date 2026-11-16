import { supabase } from '../lib_supabase';

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

export async function uploadMedia(file, bucket = 'konnekt-public-media', folder = 'uploads') {
  if (!file) return null;
  const isVideo = file.type.startsWith('video/');
  const isAudio = file.type.startsWith('audio/');
  const maxBytes = isVideo ? 45 * 1024 * 1024 : 15 * 1024 * 1024;
  if (file.size > maxBytes) throw new Error(isVideo ? 'Videos must be 45 MB or smaller on this free-tier setup.' : 'Images and audio must be 15 MB or smaller.');
  if (!isVideo && !isAudio && !file.type.startsWith('image/')) throw new Error('Choose an image, video or audio file.');
  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
  const unique = globalThis.crypto?.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const path = `${folder}/${unique}-${safeName}`;
  const { error } = await supabase.storage.from(bucket).upload(path, file, { upsert: false, contentType: file.type });
  if (error) throw error;
  const type = isVideo ? 'video' : isAudio ? 'audio' : 'image';
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

// Only remove an upload after a successful lookup proves no owned row uses it.
// Ambiguous network failures retain media instead of breaking a committed post.
export async function cleanupUnusedPublicMedia(table, userId, media) {
  const column = table === 'reels' ? 'media_path' : table === 'statuses' ? 'media_url' : null;
  if (!column || !media?.path || !userId) throw new Error('Cannot verify unused media.');
  const { data, error } = await supabase.from(table).select('id')
    .eq('user_id', userId).eq(column, table === 'reels' ? media.path : media.url).limit(1);
  if (error) throw error;
  if (data?.length) return false;
  const result = await supabase.storage.from('konnekt-public-media').remove([media.path]);
  if (result.error) throw result.error;
  return true;
}
