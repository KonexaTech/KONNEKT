
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet,
  ScrollView, ActivityIndicator
} from 'react-native';
import { useAuth } from '../AuthContext';
import { supabase } from '../lib_supabase';
import { getKonnektIceServers } from '../services/calls';

/**
 * Peer-to-peer group-call beta.
 * Maximum four participants. Production group calling requires an SFU.
 */
export default function GroupCallScreen({ navigation, route }) {
  const { user } = useAuth();

  const {
    callId,
    callType = 'voice',
    groupName = 'KONNEKT group'
  } = route?.params || {};

  const [participants, setParticipants] = useState([]);
  const [joined, setJoined] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState(
    'Join the call to enable your microphone and camera.'
  );
  const [muted, setMuted] = useState(false);
  const [cameraOff, setCameraOff] = useState(callType !== 'video');

  const joinedRef = useRef(false);
  const localStream = useRef(null);
  const peers = useRef(new Map());
  const pendingPeers = useRef(new Map());
  const handled = useRef(new Set());
  const queuedIce = useRef(new Map());
  const remoteStreams = useRef(new Map());
  const videoRefs = useRef(new Map());
  const activeRef = useRef(true);

  const cleanup = useCallback(() => {
    peers.current.forEach(pc => {
      try {
        pc.close();
      } catch {}
    });

    peers.current.clear();
    pendingPeers.current.clear();
    queuedIce.current.clear();
    remoteStreams.current.clear();

    localStream.current?.getTracks?.().forEach(track => track.stop());
    localStream.current = null;
  }, []);

  const sendSignal = useCallback(async (
    recipientId,
    signalType,
    payload = {}
  ) => {
    if (!user?.id || !callId || !recipientId) {
      throw new Error('Missing group-call signal details.');
    }

    const { error } = await supabase
      .from('group_call_signals')
      .insert({
        call_id: callId,
        sender_id: user.id,
        recipient_id: recipientId,
        signal_type: signalType,
        payload
      });

    if (error) throw error;
  }, [callId, user?.id]);

  const flushIce = useCallback(async peerId => {
    const pc = peers.current.get(peerId);
    const candidates = queuedIce.current.get(peerId) || [];

    if (!pc?.remoteDescription || !candidates.length) return;

    queuedIce.current.delete(peerId);

    for (const candidate of candidates) {
      await pc.addIceCandidate(
        new RTCIceCandidate(candidate)
      );
    }
  }, []);

  const makePeer = useCallback(async peerId => {
    if (peers.current.has(peerId)) {
      return peers.current.get(peerId);
    }

    if (pendingPeers.current.has(peerId)) {
      return pendingPeers.current.get(peerId);
    }

    if (!localStream.current) {
      throw new Error('Join the group call before connecting to participants.');
    }

    const creation = (async () => {
      const iceServers = await getKonnektIceServers();

      const pc = new RTCPeerConnection({ iceServers });

      peers.current.set(peerId, pc);

      localStream.current.getTracks().forEach(track => {
        pc.addTrack(track, localStream.current);
      });

      pc.onicecandidate = event => {
        if (event.candidate) {
          sendSignal(
            peerId,
            'ice-candidate',
            event.candidate.toJSON()
          ).catch(error => {
            if (activeRef.current) {
              setNotice(error.message || 'Could not send connection data.');
            }
          });
        }
      };

      pc.ontrack = event => {
        const stream = event.streams?.[0];

        if (!stream) return;

        remoteStreams.current.set(peerId, stream);

        setParticipants(previous =>
          previous.map(person =>
            person.id === peerId
              ? { ...person, stream }
              : person
          )
        );

        const video = videoRefs.current.get(peerId);

        if (video) video.srcObject = stream;
      };

      pc.onconnectionstatechange = () => {
        if (!activeRef.current) return;

        if (pc.connectionState === 'connected') {
          setNotice('Group call connected.');
        } else if (pc.connectionState === 'failed') {
          setNotice(
            'A participant connection failed. TURN relay configuration may be required.'
          );
        } else if (pc.connectionState === 'disconnected') {
          setNotice('A participant disconnected. Reconnecting may take a moment.');
        }
      };

      return pc;
    })();

    pendingPeers.current.set(peerId, creation);

    try {
      return await creation;
    } finally {
      pendingPeers.current.delete(peerId);
    }
  }, [sendSignal]);

  const processSignal = useCallback(async signal => {
    if (
      !signal ||
      signal.call_id !== callId ||
      signal.sender_id === user?.id ||
      signal.recipient_id !== user?.id ||
      handled.current.has(signal.id) ||
      !localStream.current
    ) {
      return;
    }

    handled.current.add(signal.id);

    try {
      if (signal.signal_type === 'ice-candidate') {
        const pc = await makePeer(signal.sender_id);

        if (pc.remoteDescription) {
          await pc.addIceCandidate(
            new RTCIceCandidate(signal.payload)
          );
        } else {
          const existing = queuedIce.current.get(signal.sender_id) || [];
          existing.push(signal.payload);
          queuedIce.current.set(signal.sender_id, existing);
        }

        return;
      }

      const pc = await makePeer(signal.sender_id);

      if (signal.signal_type === 'offer') {
        await pc.setRemoteDescription(
          new RTCSessionDescription(signal.payload)
        );

        await flushIce(signal.sender_id);

        const answer = await pc.createAnswer();

        await pc.setLocalDescription(answer);

        await sendSignal(
          signal.sender_id,
          'answer',
          pc.localDescription.toJSON()
        );
      } else if (signal.signal_type === 'answer') {
        await pc.setRemoteDescription(
          new RTCSessionDescription(signal.payload)
        );

        await flushIce(signal.sender_id);
      } else if (signal.signal_type === 'hangup') {
        pc.close();
        peers.current.delete(signal.sender_id);
        remoteStreams.current.delete(signal.sender_id);

        setParticipants(previous =>
          previous.map(person =>
            person.id === signal.sender_id
              ? { ...person, status: 'left', stream: null }
              : person
          )
        );
      }
    } catch (error) {
      handled.current.delete(signal.id);

      if (activeRef.current) {
        setNotice(
          error.message || 'Could not process group-call signal.'
        );
      }
    }
  }, [
    callId,
    flushIce,
    makePeer,
    sendSignal,
    user?.id
  ]);

  const loadParticipants = useCallback(async () => {
    const { data, error } = await supabase
      .from('group_call_participants')
      .select('user_id,status')
      .eq('call_id', callId);

    if (error) throw error;

    const ids = (data || []).map(row => row.user_id);

    const { data: profiles, error: profileError } = ids.length
      ? await supabase
          .from('profiles')
          .select('id,username,full_name,avatar_url')
          .in('id', ids)
      : { data: [], error: null };

    if (profileError) throw profileError;

    const nextParticipants = (data || []).map(row => ({
      id: row.user_id,
      status: row.status,
      ...(profiles || []).find(profile => profile.id === row.user_id),
      stream: remoteStreams.current.get(row.user_id) || null
    }));

    if (activeRef.current) {
      setParticipants(nextParticipants);
    }

    return data || [];
  }, [callId]);

  const join = async () => {
    if (joinedRef.current || busy) return;

    setBusy(true);
    setNotice('Checking group call and requesting media access…');

    try {
      if (!callId || !user?.id) {
        throw new Error('Group-call details are missing.');
      }

      if (
        !globalThis.navigator?.mediaDevices?.getUserMedia ||
        !globalThis.RTCPeerConnection
      ) {
        throw new Error(
          'WebRTC is unavailable. Open KONNEKT over HTTPS in a supported browser.'
        );
      }

      const { data: call, error: callError } = await supabase
        .from('group_call_sessions')
        .select('id,status')
        .eq('id', callId)
        .single();

      if (callError) throw callError;

      if (call.status === 'ended') {
        throw new Error('This group call has already ended.');
      }

      const { data: membership, error: membershipError } =
        await supabase
          .from('group_call_participants')
          .select('user_id,status')
          .eq('call_id', callId)
          .eq('user_id', user.id)
          .maybeSingle();

      if (membershipError) throw membershipError;

      if (!membership) {
        throw new Error('You are not invited to this group call.');
      }

      const stream =
        await globalThis.navigator.mediaDevices.getUserMedia({
          audio: true,
          video: callType === 'video'
        });

      localStream.current = stream;

      const { error: joinError } = await supabase
        .from('group_call_participants')
        .update({
          status: 'joined',
          joined_at: new Date().toISOString()
        })
        .eq('call_id', callId)
        .eq('user_id', user.id);

      if (joinError) throw joinError;

      joinedRef.current = true;
      setJoined(true);

      const rows = await loadParticipants();

      // The lower user ID creates the offer to avoid duplicate offers.
      for (const row of rows) {
        if (
          row.user_id !== user.id &&
          user.id.localeCompare(row.user_id) < 0 &&
          row.status === 'joined'
        ) {
          const pc = await makePeer(row.user_id);
          const offer = await pc.createOffer();

          await pc.setLocalDescription(offer);

          await sendSignal(
            row.user_id,
            'offer',
            pc.localDescription.toJSON()
          );
        }
      }

      // Retrieve signals that arrived before this device joined.
      const { data: queued, error: queuedError } = await supabase
        .from('group_call_signals')
        .select('*')
        .eq('call_id', callId)
        .eq('recipient_id', user.id)
        .order('created_at', { ascending: true });

      if (queuedError) throw queuedError;

      for (const signal of queued || []) {
        await processSignal(signal);
      }

      setNotice(
        'You joined the group call. Waiting for participants to connect.'
      );
    } catch (error) {
      cleanup();
      joinedRef.current = false;
      setJoined(false);

      setNotice(error.message || 'Could not join the group call.');
    } finally {
      setBusy(false);
    }
  };

  const leave = async () => {
    if (busy) return;

    setBusy(true);
    joinedRef.current = false;
    setJoined(false);

    try {
      await supabase
        .from('group_call_participants')
        .update({ status: 'left' })
        .eq('call_id', callId)
        .eq('user_id', user.id);

      for (const peerId of peers.current.keys()) {
        await sendSignal(peerId, 'hangup', {});
      }

      const { data: call, error } = await supabase
        .from('group_call_sessions')
        .select('created_by')
        .eq('id', callId)
        .maybeSingle();

      if (error) throw error;

      if (call?.created_by === user.id) {
        await supabase
          .from('group_call_sessions')
          .update({
            status: 'ended',
            ended_at: new Date().toISOString()
          })
          .eq('id', callId);
      }
    } catch (error) {
      setNotice(error.message || 'Could not leave cleanly.');
    } finally {
      cleanup();
      setBusy(false);
      navigation.goBack();
    }
  };

  useEffect(() => {
    activeRef.current = true;

    if (!callId || !user?.id) {
      setNotice('Group-call details are missing.');
      return undefined;
    }

    loadParticipants().catch(error => {
      if (activeRef.current) setNotice(error.message);
    });

    const channel = supabase
      .channel(`group-call-${callId}-${user.id}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'group_call_participants',
          filter: `call_id=eq.${callId}`
        },
        async () => {
          if (!activeRef.current) return;

          const rows = await loadParticipants().catch(() => []);

          if (!joinedRef.current) return;

          for (const row of rows) {
            if (
              row.user_id !== user.id &&
              row.status === 'joined' &&
              user.id.localeCompare(row.user_id) < 0 &&
              !peers.current.has(row.user_id)
            ) {
              try {
                const pc = await makePeer(row.user_id);
                const offer = await pc.createOffer();

                await pc.setLocalDescription(offer);

                await sendSignal(
                  row.user_id,
                  'offer',
                  pc.localDescription.toJSON()
                );
              } catch (error) {
                setNotice(error.message || 'Could not connect a participant.');
              }
            }
          }
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'group_call_signals',
          filter: `call_id=eq.${callId}`
        },
        payload => {
          if (payload.new?.recipient_id === user.id) {
            processSignal(payload.new);
          }
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'group_call_sessions',
          filter: `id=eq.${callId}`
        },
        payload => {
          if (payload.new.status === 'ended') {
            setNotice('The group call has ended.');
            cleanup();
            navigation.goBack();
          }
        }
      )
      .subscribe();

    return () => {
      activeRef.current = false;
      joinedRef.current = false;
      supabase.removeChannel(channel);
      cleanup();
    };
  }, [
    callId,
    cleanup,
    loadParticipants,
    makePeer,
    navigation,
    processSignal,
    sendSignal,
    user?.id
  ]);

  const toggleMute = () => {
    const next = !muted;
    setMuted(next);

    localStream.current?.getAudioTracks().forEach(track => {
      track.enabled = !next;
    });
  };

  const toggleCamera = () => {
    const next = !cameraOff;
    setCameraOff(next);

    localStream.current?.getVideoTracks().forEach(track => {
      track.enabled = !next;
    });
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>{groupName}</Text>

      <Text style={styles.subtitle}>
        {callType === 'video' ? 'Group video call' : 'Group voice call'}
        {' · Peer-to-peer beta · Maximum 4 participants'}
      </Text>

      {callType === 'video' && (
        <View style={styles.localVideo}>
          <video
            autoPlay
            muted
            playsInline
            ref={node => {
              if (node && localStream.current) {
                node.srcObject = localStream.current;
              }
            }}
            style={{
              width: '100%',
              height: 180,
              objectFit: 'cover',
              background: '#02050B',
              borderRadius: 12
            }}
          />
        </View>
      )}

      <ScrollView
        style={{ flex: 1, width: '100%' }}
        contentContainerStyle={{ gap: 10, paddingVertical: 12 }}
      >
        {participants.map(person => (
          <View key={person.id} style={styles.person}>
            {callType === 'video' && (
              <video
                autoPlay
                playsInline
                ref={node => {
                  if (node) {
                    videoRefs.current.set(person.id, node);

                    if (person.stream) {
                      node.srcObject = person.stream;
                    }
                  }
                }}
                style={{
                  width: 112,
                  height: 76,
                  background: '#02050B',
                  borderRadius: 8,
                  objectFit: 'cover'
                }}
              />
            )}

            <View style={{ flex: 1 }}>
              <Text style={styles.personName}>
                {person.full_name || person.username || 'KONNEKT member'}
                {person.id === user?.id ? ' (You)' : ''}
              </Text>

              <Text style={styles.personStatus}>
                {person.status}
              </Text>
            </View>
          </View>
        ))}
      </ScrollView>

      {!!notice && (
        <Text style={styles.notice}>{notice}</Text>
      )}

      <View style={styles.controls}>
        {!joined ? (
          <TouchableOpacity
            style={styles.join}
            onPress={join}
            disabled={busy}
          >
            {busy
              ? <ActivityIndicator color="#FFF" />
              : <Text style={styles.buttonText}>Join call</Text>}
          </TouchableOpacity>
        ) : (
          <>
            <TouchableOpacity
              style={styles.control}
              onPress={toggleMute}
            >
              <Text style={styles.buttonText}>
                {muted ? 'Unmute' : 'Mute'}
              </Text>
            </TouchableOpacity>

            {callType === 'video' && (
              <TouchableOpacity
                style={styles.control}
                onPress={toggleCamera}
              >
                <Text style={styles.buttonText}>
                  {cameraOff ? 'Camera on' : 'Camera off'}
                </Text>
              </TouchableOpacity>
            )}

            <TouchableOpacity
              style={styles.leave}
              onPress={leave}
              disabled={busy}
            >
              <Text style={styles.buttonText}>Leave call</Text>
            </TouchableOpacity>
          </>
        )}
      </View>

      <Text style={styles.foot}>
        Group calls currently use peer-to-peer connections.
        Reliable connections may require TURN. Larger group calls
        require a dedicated media server.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#10091B',
    padding: 20,
    alignItems: 'center'
  },
  title: {
    color: '#FFF',
    fontSize: 24,
    fontWeight: 'bold',
    marginTop: 25
  },
  subtitle: {
    color: '#D8B8F5',
    fontSize: 11,
    textAlign: 'center',
    marginTop: 7
  },
  localVideo: {
    width: '100%',
    marginTop: 16
  },
  person: {
    width: '100%',
    backgroundColor: '#241630',
    padding: 12,
    borderRadius: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12
  },
  personName: {
    color: '#FFF',
    fontWeight: 'bold'
  },
  personStatus: {
    color: '#9AB0C8',
    fontSize: 11,
    marginTop: 4
  },
  notice: {
    color: '#FFB6C0',
    textAlign: 'center',
    marginVertical: 10
  },
  controls: {
    flexDirection: 'row',
    gap: 10,
    flexWrap: 'wrap',
    justifyContent: 'center',
    marginVertical: 12
  },
  join: {
    backgroundColor: '#6A0DAD',
    paddingVertical: 14,
    paddingHorizontal: 28,
    borderRadius: 24,
    minWidth: 140,
    alignItems: 'center'
  },
  control: {
    backgroundColor: '#30203F',
    padding: 14,
    borderRadius: 20
  },
  leave: {
    backgroundColor: '#D93450',
    padding: 14,
    borderRadius: 20
  },
  buttonText: {
    color: '#FFF',
    fontWeight: 'bold'
  },
  foot: {
    color: '#778BA4',
    fontSize: 10,
    lineHeight: 15,
    textAlign: 'center',
    marginBottom: 10
  }
});
