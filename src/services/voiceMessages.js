import { supabase } from '../lib_supabase';
import { uploadMedia, cleanupUnusedChatMedia } from './media';
import { isConversationId } from './conversationId';
import {
  getGroupKonnektCryptoKey, getKonnektConversationCryptoKey,
  encryptKonnektBinary, encryptWithKonnektCryptoKey
} from './konnektEncryption';

export async function sendEncryptedVoiceMessage(file, conversationId, userId) {
  if (!isConversationId(conversationId) || !userId) throw new Error('Open an active conversation first.');
  const { data: conversation, error } = await supabase.from('conversations')
    .select('is_group').eq('id', conversationId).single();
  if (error) throw error;
  let key;
  if (conversation.is_group) {
    key = await getGroupKonnektCryptoKey(conversationId, userId);
  } else {
    const { data: members, error: memberError } = await supabase.from('conversation_members')
      .select('user_id').eq('conversation_id', conversationId);
    if (memberError) throw memberError;
    const other = (members || []).find(member => member.user_id !== userId);
    if (!other) throw new Error('The other conversation member could not be found.');
    const { data: profile, error: profileError } = await supabase.from('profiles')
      .select('encryption_public_key').eq('id', other.user_id).single();
    if (profileError) throw profileError;
    if (!profile.encryption_public_key) throw new Error('Ask the other member to open KONNEKT before sending secure voice notes.');
    key = await getKonnektConversationCryptoKey(userId, profile.encryption_public_key);
  }
  if (!key) throw new Error('Secure group encryption is not ready.');
  const encrypted = await encryptKonnektBinary(key, file);
  const uploaded = await uploadMedia(new File([encrypted.blob], `${file.name}.enc`, { type: file.type }),
    'konnekt-chat-media', `${conversationId}/${userId}`);
  try {
  const { error: sendError } = await supabase.from('messages').insert({
    conversation_id: conversationId, sender_id: userId,
    ...(await encryptWithKonnektCryptoKey(key, 'Voice note')),
    media_path: uploaded.path, media_type: 'audio', media_encrypted: true,
    media_encryption_iv: encrypted.iv, media_mime_type: file.type
  });
  if (sendError) throw sendError;
  } catch (error) {
    // Preserve a committed message's file if only its response was lost.
    try {
      const removed = await cleanupUnusedChatMedia(userId, conversationId, uploaded.path);
      if (!removed) return; // The owned message was saved successfully.
    } catch {
      throw new Error('Voice note status could not be confirmed. Its attachment was retained. Refresh the chat before retrying.');
    }
    throw error;
  }
}
