import { supabase } from '../lib_supabase';
import { uploadMedia, cleanupUnusedChatMedia } from './media';
import { isConversationId } from './conversationId';
import { validateVoiceFile, voiceMetadata, voiceMessageId } from './voiceNoteFormat';
import { getGroupKonnektCryptoKey, getKonnektConversationCryptoKey, encryptKonnektBinary, encryptWithKonnektCryptoKey } from './konnektEncryption';

const uncertain = () => Object.assign(new Error('Voice note status could not be confirmed. Its attachment was retained. Retry checks the same message before sending again.'), { code: 'VOICE_CONFIRMATION_REQUIRED' });
async function assertSession(userId) {
  const { data, error } = await supabase.auth.getUser();
  if (error) throw error;
  if (data.user?.id !== userId) throw new Error('Your account changed. Reopen the conversation before sending.');
}
async function findAttempt(draft) {
  const { data, error } = await supabase.from('messages').select('id,media_path')
    .eq('id', draft.id).eq('sender_id', draft.userId).eq('conversation_id', draft.conversationId).limit(1);
  if (error) throw uncertain();
  const row = data?.[0];
  if (row && row.media_path !== draft.path) throw new Error('Voice message identity conflict. Refresh the conversation before retrying.');
  return row;
}

// The screen retains one in-memory attempt per recording. A stable messages.id
// lets the existing primary key reject racing/lost-response retry inserts.
export function sendEncryptedVoiceMessage(file, conversationId, userId, options = {}) {
  const draft = options.draft || {};
  if (draft.pending) {
    if (draft.request.file !== file || draft.request.conversationId !== conversationId || draft.request.userId !== userId) return Promise.reject(new Error('Another voice recording is already being sent.'));
    return draft.pending;
  }
  draft.request = { file, conversationId, userId };
  const task = sendAttempt(file, conversationId, userId, options, draft);
  draft.pending = task;
  return task.finally(() => { if (draft.pending === task) draft.pending = null; });
}

async function sendAttempt(file, conversationId, userId, options, draft) {
  if (!isConversationId(conversationId) || !userId) throw new Error('Open an active conversation first.');
  validateVoiceFile(file);
  const metadata = options.durationMs == null ? null : voiceMetadata(file, options.durationMs);
  if (draft.file && (draft.file !== file || draft.userId !== userId || draft.conversationId !== conversationId)) throw new Error('The voice recording belongs to another attempt. Reopen the conversation.');
  await assertSession(userId);
  draft.file = file; draft.userId = userId; draft.conversationId = conversationId;
  draft.id ||= voiceMessageId();
  if (!isConversationId(draft.id)) throw new Error('Invalid voice message identity.');
  if (draft.complete) return { id: draft.id };
  if (draft.attempted && draft.path) {
    options.onStage?.('Checking previous send…');
    if (await findAttempt(draft)) { draft.complete = true; return { id: draft.id }; }
  }
  if (draft.path && !draft.payload) {
    // A Storage success response may also be lost. Reconcile its known path
    // before allocating another object, preserving anything already referenced.
    if (!(await cleanupUnusedChatMedia(userId, conversationId, draft.path))) throw uncertain();
    draft.path = null;
  }
  if (!draft.payload) {
    options.onStage?.('Preparing encryption…');
    const { data: conversation, error } = await supabase.from('conversations').select('is_group').eq('id', conversationId).single();
    if (error) throw error;
    let key;
    if (conversation.is_group) key = await getGroupKonnektCryptoKey(conversationId, userId);
    else {
      const { data: members, error: memberError } = await supabase.from('conversation_members').select('user_id').eq('conversation_id', conversationId);
      if (memberError) throw memberError;
      if (!members?.some(member => member.user_id === userId)) throw new Error('You are not a conversation member.');
      const other = members.find(member => member.user_id !== userId);
      if (!other) throw new Error('The other conversation member could not be found.');
      const { data: profile, error: profileError } = await supabase.from('profiles').select('encryption_public_key').eq('id', other.user_id).single();
      if (profileError) throw profileError;
      if (!profile.encryption_public_key) throw new Error('Ask the other member to open KONNEKT before sending secure voice notes.');
      key = await getKonnektConversationCryptoKey(userId, profile.encryption_public_key);
    }
    if (!key) throw new Error('Secure group encryption is not ready.');
    const encrypted = await encryptKonnektBinary(key, file);
    const body = await encryptWithKonnektCryptoKey(key, metadata ? JSON.stringify(metadata) : 'Voice note');
    try {
      options.onStage?.('Uploading encrypted audio…');
      const uploaded = await uploadMedia(new File([encrypted.blob], `${file.name}.enc`, { type: file.type }),
        'konnekt-chat-media', `${conversationId}/${userId}`, { onPath: path => { draft.path = path; } });
      draft.path = uploaded.path;
      draft.payload = { id: draft.id, conversation_id: conversationId, sender_id: userId, ...body,
        media_path: uploaded.path, media_type: 'audio', media_encrypted: true,
        media_encryption_iv: encrypted.iv, media_mime_type: file.type };
    } catch (error) {
      if (draft.path) {
        try { if (await cleanupUnusedChatMedia(userId, conversationId, draft.path)) draft.path = null; }
        catch { throw uncertain(); }
      }
      throw error;
    }
  }
  try {
    await assertSession(userId);
    options.onStage?.('Saving voice message…');
    draft.attempted = true;
    const { error } = await supabase.from('messages').insert(draft.payload);
    if (error) throw error;
    draft.complete = true;
    return { id: draft.id };
  } catch (error) {
    if (await findAttempt(draft)) { draft.complete = true; return { id: draft.id }; }
    try {
      if (!(await cleanupUnusedChatMedia(userId, conversationId, draft.path))) throw uncertain();
      draft.payload = null; draft.path = null;
    } catch { throw uncertain(); }
    throw error;
  }
}
