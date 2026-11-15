
import { supabase } from '../lib_supabase';
import { isConversationId } from './conversationId';

export async function getMyProfile(userId) {
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', userId)
    .maybeSingle();

  if (error) throw error;
  return data;
}

export async function getConversationList(userId) {
  if (!userId) return [];

  const { data: memberships, error } = await supabase
    .from('conversation_members')
    .select('conversation_id')
    .eq('user_id', userId);

  if (error) throw error;

  const ids = (memberships || []).map(
    item => item.conversation_id
  );

  if (!ids.length) return [];

  const { data: conversations, error: convError } =
    await supabase
      .from('conversations')
      .select('id,title,is_group,created_at')
      .in('id', ids)
      .order('created_at', { ascending: false });

  if (convError) throw convError;

  const rows = await Promise.all(
    (conversations || []).map(async conversation => {
      const { data: members, error: membersError } =
        await supabase
          .from('conversation_members')
          .select('user_id')
          .eq('conversation_id', conversation.id);

      if (membersError) throw membersError;

      const otherIds = (members || [])
        .map(member => member.user_id)
        .filter(id => id !== userId);

      let profiles = [];

      if (otherIds.length) {
        const { data, error: profilesError } =
          await supabase
            .from('profiles')
            .select('id,username,full_name,avatar_url')
            .in('id', otherIds);

        if (profilesError) throw profilesError;

        profiles = data || [];
      }

      const { data: last, error: lastError } =
        await supabase
          .from('messages')
          .select('body,created_at,is_encrypted,media_path')
          .eq('conversation_id', conversation.id)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();

      if (lastError) throw lastError;

      let lastMessage = 'Start a conversation';

      if (last) {
        if (last.is_encrypted) {
          lastMessage = '🔒 Encrypted message';
        } else if (last.media_path) {
          lastMessage = '📎 Attachment';
        } else {
          lastMessage = last.body || 'New message';
        }
      }

      return {
        ...conversation,
        members: profiles,
        displayName:
          conversation.title ||
          profiles
            .map(profile =>
              profile.full_name ||
              profile.username ||
              'KONNEKT user'
            )
            .join(', ') ||
          'Conversation',
        lastMessage,
        lastAt: last?.created_at || conversation.created_at
      };
    })
  );

  return rows;
}

export async function createDirectConversation(myId, otherId) {
  if (!myId || !otherId || otherId === myId) {
    throw new Error('Choose another KONNEKT user.');
  }

  const {
    data: { user },
    error: authError
  } = await supabase.auth.getUser();

  if (authError) throw authError;

  if (!user) {
    throw new Error(
      'Please sign in before starting a conversation.'
    );
  }

  if (user.id !== myId) {
    throw new Error(
      'Your session has changed. Please sign in again.'
    );
  }

  // The staging migration creates direct chats by username,
  // not by user ID. Resolve the selected member's username first.
  const { data: targetProfile, error: profileError } =
    await supabase
      .from('profiles')
      .select('id,username')
      .eq('id', otherId)
      .maybeSingle();

  if (profileError) throw profileError;

  if (!targetProfile) {
    throw new Error('KONNEKT user not found.');
  }

  if (!targetProfile.username) {
    throw new Error(
      'This member needs to set a username before you can start a chat.'
    );
  }

  const { data, error } = await supabase.rpc(
    'konnekt_start_direct_conversation',
    {
      target_username: targetProfile.username
    }
  );

  if (error) throw error;

  if (!isConversationId(data)) {
    throw new Error(
      'Supabase did not return a valid conversation ID.'
    );
  }

  return data;
}

export async function getSignedChatMedia(path) {
  if (!path) {
    throw new Error('Attachment path is missing.');
  }

  const { data, error } = await supabase.storage
    .from('konnekt-chat-media')
    .createSignedUrl(path, 3600);

  if (error) throw error;

  return data.signedUrl;
}
