
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, FlatList,
  StyleSheet, KeyboardAvoidingView, Platform,
  ActivityIndicator, Image
} from 'react-native';

import { useAuth } from '../AuthContext';
import { supabase } from '../lib_supabase';
import { chooseMedia, uploadMedia } from '../services/media';
import { isConversationId } from '../services/conversationId';
import {
  ensureKonnektIdentity,
  encryptKonnektText,
  decryptKonnektText,
  createGroupKeyEnvelopes,
  getGroupKonnektCryptoKey,
  encryptWithKonnektCryptoKey,
  decryptWithKonnektCryptoKey,
  getKonnektConversationCryptoKey,
  encryptKonnektBinary,
  decryptKonnektBinary
} from '../services/konnektEncryption';
import { createCall, createGroupCall } from '../services/calls';

export default function ChatConversationScreen({ navigation, route }) {
  const { user } = useAuth();
  const conversationId = route?.params?.chatId;
  const chatName = route?.params?.chatName || 'KONNEKT Friend';

  const [message, setMessage] = useState('');
  const [messages, setMessages] = useState([]);
  const [receiptMap, setReceiptMap] = useState({});
  const [otherMember, setOtherMember] = useState(null);
  const [isGroup, setIsGroup] = useState(false);
  const [groupMemberIds, setGroupMemberIds] = useState([]);
  const [loadedConversationId, setLoadedConversationId] = useState(null);
  const [busy, setBusy] = useState(true);
  const [sending, setSending] = useState(false);
  const [notice, setNotice] = useState('');
  const [encryptionReady, setEncryptionReady] = useState(false);
  const sendLock = useRef(false);

  const load = useCallback(async () => {
    setLoadedConversationId(null);
    setEncryptionReady(false);
    if (!isConversationId(conversationId) || !user?.id) {
      setNotice('Open a conversation before sending messages.');
      setBusy(false);
      return;
    }

    setBusy(true);

    try {
      const [
        { data: memberRows, error: memberError },
        { data: newestRows, error },
        { data: conversation, error: conversationError }
      ] = await Promise.all([
        supabase.from('conversation_members')
          .select('user_id')
          .eq('conversation_id', conversationId),

        supabase.from('messages')
          .select('*')
          .eq('conversation_id', conversationId)
          .order('created_at', { ascending: false })
          .limit(300),

        supabase.from('conversations')
          .select('is_group,created_by')
          .eq('id', conversationId)
          .maybeSingle()
      ]);

      if (memberError) throw memberError;
      if (error) throw error;
      if (conversationError) throw conversationError;
      // Fetch the latest window, then display it chronologically.
      const rows = [...(newestRows || [])].reverse();

      const members = memberRows || [];
      const memberIds = members.map(row => row.user_id);
      if (!conversation || !memberIds.includes(user.id)) {
        throw new Error('This conversation is unavailable.');
      }

      setGroupMemberIds(memberIds);

      const isGroupChat = !!conversation?.is_group;
      setIsGroup(isGroupChat);

      let otherId = memberIds.find(id => id !== user.id);
      let retiredPeer = null;
      if (!otherId && !isGroupChat) {
        const { data } = await supabase.rpc('konnekt_retired_peer', { target_conversation: conversationId });
        if (!data?.retired || !data.id) throw new Error('The other conversation member could not be found.');
        retiredPeer = data;
        otherId = data.id;
      }

      await ensureKonnektIdentity(user.id);

      let decoded = rows || [];
      let activeGroupKey = null;
      let otherProfile = null;

      if (isGroupChat) {
        const { data: profiles, error: profilesError } =
          await supabase.from('profiles')
            .select('id,username,full_name,encryption_public_key')
            .in('id', memberIds);

        if (profilesError) throw profilesError;

        const keyProfiles = profiles || [];

        activeGroupKey = await getGroupKonnektCryptoKey(
          conversationId,
          user.id
        );

        if (!activeGroupKey && conversation?.created_by === user.id) {
          if (
            keyProfiles.length === memberIds.length &&
            keyProfiles.every(x => !!x.encryption_public_key)
          ) {
            await createGroupKeyEnvelopes(
              conversationId,
              keyProfiles,
              1
            );

            activeGroupKey = await getGroupKonnektCryptoKey(
              conversationId,
              user.id
            );
          }
        }

        if (activeGroupKey) {
          decoded = await Promise.all(
            (rows || []).map(async row => {
              if (!row.is_encrypted) return row;

              try {
                return {
                  ...row,
                  display_body: await decryptWithKonnektCryptoKey(
                    activeGroupKey,
                    row.body,
                    row.encryption_iv
                  )
                };
              } catch {
                return {
                  ...row,
                  display_body: '🔒 Unable to decrypt this group message on this device.'
                };
              }
            })
          );

          setNotice('');
        } else {
          decoded = (rows || []).map(row => row.is_encrypted
            ? { ...row, display_body: '🔒 Group encryption key unavailable on this device.' }
            : row);
          setNotice(
            'Secure group messaging is waiting for every member to open KONNEKT once.'
          );
        }

        setOtherMember(null);
      } else {
        const { data: profile, error: profileError } =
          await supabase.from('profiles')
            .select('id,username,full_name,encryption_public_key')
            .eq('id', otherId)
            .maybeSingle();

        if (profileError) throw profileError;

        otherProfile = retiredPeer || profile || { id: otherId };
        setOtherMember(otherProfile);

        const keyOwnerIds = [
          ...new Set(
            (rows || [])
              .filter(row => row.is_encrypted)
              .map(row =>
                row.sender_id === user.id ? otherId : row.sender_id
              )
          )
        ];

        const { data: keyRows, error: keyRowsError } = keyOwnerIds.length
          ? await supabase.from('profiles')
              .select('id,encryption_public_key')
              .in('id', keyOwnerIds)
          : { data: [], error: null };

        if (keyRowsError) throw keyRowsError;

        const publicKeys = new Map(
          (keyRows || []).map(row => [
            row.id,
            row.encryption_public_key
          ])
        );
        if (retiredPeer?.encryption_public_key) publicKeys.set(otherId, retiredPeer.encryption_public_key);

        decoded = await Promise.all(
          (rows || []).map(async row => {
            if (!row.is_encrypted) return row;

            const keyOwnerId =
              row.sender_id === user.id ? otherId : row.sender_id;

            const publicKey = publicKeys.get(keyOwnerId);

            if (!publicKey) {
              return {
                ...row,
                display_body: '🔒 Encrypted message — secure key unavailable.'
              };
            }

            try {
              return {
                ...row,
                display_body: await decryptKonnektText({
                  userId: user.id,
                  otherUserId: keyOwnerId,
                  otherPublicKey: publicKey,
                  body: row.body,
                  encryption_iv: row.encryption_iv
                })
              };
            } catch {
              return {
                ...row,
                display_body: '🔒 Unable to decrypt this message on this device.'
              };
            }
          })
        );

        setNotice(
          retiredPeer ? 'This account was deleted. Your remaining messages are read-only.' : otherProfile.encryption_public_key
            ? ''
            : 'The other member must open KONNEKT once to register their secure key.'
        );
      }

      setMessages(decoded);
      setLoadedConversationId(conversationId);

      setEncryptionReady(
        isGroupChat
          ? !!activeGroupKey
          : !!otherProfile?.encryption_public_key && !retiredPeer
      );

      const incomingIds = (rows || [])
        .filter(row => row.sender_id !== user.id)
        .map(row => row.id);

      const myMessageIds = (rows || [])
        .filter(row => row.sender_id === user.id)
        .map(row => row.id);

      if (myMessageIds.length) {
        let receiptQuery = supabase.from('message_receipts')
          .select('message_id,user_id,delivered_at,read_at')
          .in('message_id', myMessageIds)
          .neq('user_id', user.id);

        if (!isGroupChat && otherId) {
          receiptQuery = receiptQuery.eq('user_id', otherId);
        }

        const { data: receiptRows, error: receiptError } =
          await receiptQuery;

        if (receiptError) throw receiptError;

        setReceiptMap(
          Object.fromEntries(
            (receiptRows || []).map(receipt => [
              receipt.message_id,
              receipt
            ])
          )
        );
      } else {
        setReceiptMap({});
      }

      if (incomingIds.length) {
        const { data: existingReceipts, error: receiptReadError } =
          await supabase.from('message_receipts')
            .select('message_id,read_at')
            .eq('user_id', user.id)
            .in('message_id', incomingIds);

        if (receiptReadError) throw receiptReadError;

        const alreadyRead = new Set(
          (existingReceipts || [])
            .filter(receipt => receipt.read_at)
            .map(receipt => receipt.message_id)
        );

        const unreadIds = incomingIds.filter(
          id => !alreadyRead.has(id)
        );

        if (unreadIds.length) {
          const now = new Date().toISOString();

          const { error: receiptWriteError } =
            await supabase.from('message_receipts').upsert(
              unreadIds.map(message_id => ({
                message_id,
                user_id: user.id,
                delivered_at: now,
                read_at: now
              })),
              { onConflict: 'message_id,user_id' }
            );

          if (receiptWriteError) throw receiptWriteError;
        }
      }
    } catch (e) {
      setNotice(e?.message || 'Could not load this conversation.');
    } finally {
      setBusy(false);
    }
  }, [conversationId, user?.id]);

  useEffect(() => {
    load();
    if (!isConversationId(conversationId) || !user?.id) return;

    const channel = supabase.channel(`messages-${conversationId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'messages',
          filter: `conversation_id=eq.${conversationId}`
        },
        async () => {
          await load();
        }
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'message_receipts'
        },
        () => {
          load();
        }
      );

    channel.subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [load, conversationId, user?.id]);

  // =======================================================
  // SEND MESSAGE
  // =======================================================

  const send = async (extra = {}, lockHeld = false) => {
    const body = message.trim();

    if ((!body && !extra.media_path) || !user?.id ||
        loadedConversationId !== conversationId || busy || !isConversationId(conversationId)) return false;
    if (sendLock.current && !lockHeld) return false;

    sendLock.current = true;
    setSending(true);
    setNotice('');

    try {
      let recipient = otherMember;

      // Refresh the recipient's encryption key before sending.
      if (!isGroup) {
        const { data: freshProfile, error: profileError } =
          await supabase.from('profiles')
            .select('id,username,encryption_public_key')
            .eq('id', otherMember?.id)
            .maybeSingle();

        if (profileError) throw profileError;

        recipient = freshProfile;
        setOtherMember(freshProfile);

        if (!recipient?.encryption_public_key) {
          throw new Error(
            'Your Send button is ready, but this user has not registered an encryption key yet. Ask them to sign in and open KONNEKT, then reopen this chat.'
          );
        }
      }

      const contentToEncrypt =
        body || (extra.media_path ? 'Attachment' : '');

      let payload = {
        conversation_id: conversationId,
        sender_id: user.id,
        body: contentToEncrypt,
        ...extra
      };

      if (isGroup) {
        const groupKey = await getGroupKonnektCryptoKey(
          conversationId,
          user.id
        );

        if (!groupKey) {
          throw new Error(
            'Secure group encryption is not ready. All group members must open KONNEKT first.'
          );
        }

        payload = {
          ...payload,
          ...(await encryptWithKonnektCryptoKey(
            groupKey,
            contentToEncrypt
          )),
        };
      } else {
        const encrypted = await encryptKonnektText({
          userId: user.id,
          otherUserId: recipient.id,
          otherPublicKey: recipient.encryption_public_key,
          text: contentToEncrypt
        });

        payload = {
          ...payload,
          ...encrypted
        };
      }

      const { error } = await supabase
        .from('messages')
        .insert(payload);

      if (error) throw error;

      // Keep a newer draft typed while this message or attachment was sending.
      setMessage(current => current.trim() === body ? '' : current);
      await load();
      return true;
    } catch (e) {
      setNotice(e?.message || 'Message could not be sent.');
      return false;
    } finally {
      if (!lockHeld) {
        sendLock.current = false;
        setSending(false);
      }
    }
  };

  // =======================================================
  // ATTACHMENTS
  // =======================================================

  const attach = async () => {
    if (sendLock.current || loadedConversationId !== conversationId || busy ||
        !isConversationId(conversationId)) return;
    sendLock.current = true;
    setSending(true);
    try {
      const file = await chooseMedia('image/*,video/*,audio/*');
      if (!file) return;

      if (!encryptionReady) {
        throw new Error(
          'Secure encryption is not ready. Open KONNEKT on both accounts first.'
        );
      }

      const cryptoKey = isGroup
        ? await getGroupKonnektCryptoKey(conversationId, user.id)
        : await getKonnektConversationCryptoKey(
            user.id,
            otherMember?.encryption_public_key
          );

      if (!cryptoKey) {
        throw new Error('Could not load the conversation encryption key.');
      }

      const encryptedFile = await encryptKonnektBinary(
        cryptoKey,
        file
      );

      const encryptedUpload = new File(
        [encryptedFile.blob],
        `${file.name}.enc`,
        { type: file.type }
      );

      const uploaded = await uploadMedia(
        encryptedUpload,
        'konnekt-chat-media',
        `${conversationId}/${user.id}`
      );

      const sent = await send({
        media_path: uploaded.path,
        media_type: uploaded.type,
        media_encrypted: true,
        media_encryption_iv: encryptedFile.iv,
        media_mime_type: file.type
      }, true);

      if (!sent) {
        // The upload succeeded but no message references it. Best-effort cleanup.
        const { error: cleanupError } = await supabase.storage
          .from('konnekt-chat-media').remove([uploaded.path]);
        if (cleanupError) {
          setNotice('Message failed and its unused attachment could not be removed.');
        }
      }
    } catch (e) {
      setNotice(e.message || 'Attachment could not be sent.');
    } finally {
      sendLock.current = false;
      setSending(false);
    }
  };

  // =======================================================
  // VOICE AND VIDEO CALLS
  // =======================================================

  const startCall = async callType => {
    if (otherMember?.retired) {
      setNotice('This account was deleted. Calls are unavailable.');
      return;
    }
    if (loadedConversationId !== conversationId || busy || !isConversationId(conversationId)) {
      setNotice('Wait for the conversation to load before starting a call.');
      return;
    }
    try {
      if (isGroup) {
        const session = await createGroupCall({
          conversationId,
          callType
        });

        navigation.navigate('GroupCall', {
          callId: session.id,
          conversationId,
          callType,
          groupName: chatName
        });

        return;
      }

      if (!otherMember?.id) {
        throw new Error('The other conversation member could not be found.');
      }

      const session = await createCall({
        calleeId: otherMember.id,
        conversationId,
        callType
      });

      navigation.navigate('Call', {
        callId: session.id,
        isCaller: true,
        callType,
        contact: {
          name: chatName,
          username: otherMember.username
            ? `@${otherMember.username}`
            : ''
        }
      });
    } catch (e) {
      setNotice(`Could not start call: ${e.message || 'Please try again.'}`);
    }
  };

  // =======================================================
  // MESSAGE DISPLAY
  // =======================================================

  const render = ({ item }) => {
    const mine = item.sender_id === user?.id;

    return (
      <View style={[s.row, mine ? s.mine : s.theirs]}>
        <View style={[s.bubble, mine ? s.myBubble : s.otherBubble]}>
          {item.media_path ? (
            <ChatAttachment
              path={item.media_path}
              type={item.media_type}
              mediaEncrypted={item.media_encrypted}
              mediaIv={item.media_encryption_iv}
              mediaMimeType={item.media_mime_type}
              userId={user?.id}
              otherPublicKey={otherMember?.encryption_public_key}
              conversationId={conversationId}
              isGroup={isGroup}
            />
          ) : null}

          <Text style={s.message}>
            {item.display_body ?? item.body}
          </Text>

          <Text style={s.time}>
            {new Date(item.created_at).toLocaleTimeString([], {
              hour: '2-digit',
              minute: '2-digit'
            })}
            {mine
              ? receiptMap[item.id]?.read_at
                ? '  ✓✓'
                : receiptMap[item.id]?.delivered_at
                  ? '  ✓✓'
                  : '  ✓'
              : ''}
          </Text>
        </View>
      </View>
    );
  };

  return (
    <KeyboardAvoidingView
      style={s.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <View style={s.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Text style={s.back}>‹</Text>
        </TouchableOpacity>

        <View style={{ flex: 1 }}>
          <Text style={s.name}>{chatName}</Text>
          <Text style={s.sub}>
            {otherMember?.retired ? 'Deleted account · read-only' : encryptionReady
              ? '🔒 End-to-end encrypted'
              : 'Secure messaging setup required'}
          </Text>
        </View>

        <TouchableOpacity
          accessibilityRole="button"
          accessibilityLabel="Start voice call"
          disabled={!!otherMember?.retired}
          onPress={() => startCall('voice')}
          style={s.call}
        >
          <Text style={s.callText}>☎</Text>
        </TouchableOpacity>

        <TouchableOpacity
          accessibilityRole="button"
          accessibilityLabel="Start video call"
          disabled={!!otherMember?.retired}
          onPress={() => startCall('video')}
          style={s.call}
        >
          <Text style={s.callText}>▣</Text>
        </TouchableOpacity>
      </View>

      {busy ? (
        <ActivityIndicator color="#168BFF" style={{ marginTop: 30 }} />
      ) : (
        <FlatList
          style={{ flex: 1 }}
          data={messages}
          keyExtractor={x => x.id}
          renderItem={render}
          contentContainerStyle={{ padding: 14 }}
        />
      )}

      <View style={s.composer}>
        <TouchableOpacity onPress={attach} style={s.clip} accessibilityRole="button" accessibilityLabel="Attach media" disabled={sending || busy || otherMember?.retired || loadedConversationId !== conversationId}>
          <Text style={{ fontSize: 21 }}>📎</Text>
        </TouchableOpacity>

        <TouchableOpacity style={s.clip} accessibilityRole="button" accessibilityLabel="Record voice note"
          disabled={sending || busy || !encryptionReady || loadedConversationId !== conversationId}
          onPress={() => navigation.navigate('VoiceNote', { chatId: conversationId })}>
          <Text style={{ fontSize: 21 }}>🎙</Text>
        </TouchableOpacity>

        <TextInput
          style={s.input}
          editable={!otherMember?.retired}
          value={message}
          onChangeText={setMessage}
          placeholder="Message securely…"
          placeholderTextColor="#8293A8"
          maxLength={7000}
          multiline
        />

        {/* Send remains clickable when encryption is being set up.
            Actual sending still requires successful encryption. */}
        <TouchableOpacity
          disabled={sending || busy || otherMember?.retired || loadedConversationId !== conversationId || !message.trim()}
          accessibilityRole="button"
          accessibilityLabel="Send message"
          style={[
            s.send,
            !message.trim() && s.disabled
          ]}
          onPress={() => send()}
        >
          {sending ? (
            <ActivityIndicator color="#FFF" />
          ) : (
            <Text style={s.sendText}>➤</Text>
          )}
        </TouchableOpacity>
      </View>

      {!!notice && <Text style={s.error}>{notice}</Text>}
    </KeyboardAvoidingView>
  );
}

function ChatAttachment({
  path,
  type,
  mediaEncrypted,
  mediaIv,
  mediaMimeType,
  userId,
  otherPublicKey,
  conversationId,
  isGroup
}) {
  const [url, setUrl] = useState('');
  const [loadError, setLoadError] = useState('');

  useEffect(() => {
    let live = true;
    let objectUrl = '';
    setUrl('');
    setLoadError('');

    (async () => {
      try {
        const { data, error } = await supabase.storage
          .from('konnekt-chat-media')
          .download(path);

        if (error) throw error;

        let attachment = data;
        if (mediaEncrypted) {
          const key = isGroup
            ? await getGroupKonnektCryptoKey(conversationId, userId)
            : await getKonnektConversationCryptoKey(
                userId,
                otherPublicKey
              );

          if (!key) {
            throw new Error('Encryption key is unavailable on this device.');
          }

          attachment = await decryptKonnektBinary(
            key,
            data,
            mediaIv,
            mediaMimeType || 'application/octet-stream'
          );

        }

        if (live) {
          objectUrl = URL.createObjectURL(attachment);
          setUrl(objectUrl);
        }
      } catch (e) {
        if (live) setLoadError(e.message || 'Attachment unavailable.');
      }
    })();

    return () => {
      live = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [
    path, mediaEncrypted, mediaIv, mediaMimeType,
    userId, otherPublicKey, conversationId, isGroup
  ]);

  if (!url) {
    return (
      <Text style={{ color: '#DCE8F7' }}>
        {loadError || 'Loading encrypted attachment…'}
      </Text>
    );
  }

  if (type === 'audio') {
    return (
      <audio
        src={url}
        controls
        style={{ width: '220px', marginBottom: 8 }}
      />
    );
  }

  if (type === 'image') {
    return (
      <Image
        source={{ uri: url }}
        style={{
          width: 220,
          height: 180,
          borderRadius: 10,
          marginBottom: 5
        }}
        resizeMode="cover"
      />
    );
  }

  return (
    <TouchableOpacity
      onPress={() => {
        if (typeof window !== 'undefined') {
          window.open(url, '_blank', 'noopener,noreferrer');
        }
      }}
    >
      <Text style={{ color: '#8BD0FF', padding: 10 }}>
        ▶ Open video attachment
      </Text>
    </TouchableOpacity>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#07111F' },
  header: {
    backgroundColor: '#14243A',
    padding: 14,
    paddingTop: 25,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10
  },
  back: { color: '#168BFF', fontSize: 32 },
  name: { color: '#FFF', fontSize: 16, fontWeight: 'bold' },
  sub: { color: '#91A4BA', fontSize: 10, marginTop: 3 },
  call: {
    backgroundColor: '#203753',
    borderRadius: 20,
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center'
  },
  callText: { color: '#8CCBFF', fontSize: 18 },
  row: { flexDirection: 'row', marginBottom: 10 },
  mine: { justifyContent: 'flex-end' },
  theirs: { justifyContent: 'flex-start' },
  bubble: { maxWidth: '84%', padding: 11, borderRadius: 14 },
  myBubble: {
    backgroundColor: '#124D79',
    borderBottomRightRadius: 3
  },
  otherBubble: {
    backgroundColor: '#182D46',
    borderBottomLeftRadius: 3
  },
  message: { color: '#FFF', fontSize: 14, lineHeight: 20 },
  time: {
    color: '#B4C4D6',
    fontSize: 9,
    textAlign: 'right',
    marginTop: 5
  },
  composer: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 10,
    backgroundColor: '#14243A',
    gap: 8
  },
  clip: { padding: 6 },
  input: {
    flex: 1,
    backgroundColor: '#203753',
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 10,
    color: '#FFF',
    maxHeight: 100
  },
  send: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: '#168BFF',
    alignItems: 'center',
    justifyContent: 'center'
  },
  disabled: { opacity: 0.4 },
  sendText: { color: '#FFF', fontSize: 20 },
  error: { color: '#FF9CA8', padding: 8 }
});
