
import { supabase } from '../lib_supabase';

// Create a one-to-one voice or video call.
export async function createCall({
  calleeId,
  conversationId = null,
  callType = 'voice'
}) {
  const {
    data: { user },
    error: authError
  } = await supabase.auth.getUser();

  if (authError) throw authError;

  if (!user) {
    throw new Error('Sign in before placing a call.');
  }

  if (!calleeId || calleeId === user.id) {
    throw new Error('Choose another KONNEKT member.');
  }

  if (!['voice', 'video'].includes(callType)) {
    throw new Error('Choose a valid call type.');
  }

  const { data, error } = await supabase
    .from('call_sessions')
    .insert({
      caller_id: user.id,
      callee_id: calleeId,
      conversation_id: conversationId,
      call_type: callType,
      status: 'ringing'
    })
    .select()
    .single();

  if (error) throw error;

  return data;
}


// Send a signal during a one-to-one call.
export async function sendCallSignal(
  callId,
  signalType,
  payload = {}
) {
  const {
    data: { user },
    error: authError
  } = await supabase.auth.getUser();

  if (authError) throw authError;

  if (!user) {
    throw new Error('You are not signed in.');
  }

  if (!callId || !signalType) {
    throw new Error('Call ID and signal type are required.');
  }

  const { error } = await supabase
    .from('call_signals')
    .insert({
      call_id: callId,
      sender_id: user.id,
      signal_type: signalType,
      payload
    });

  if (error) throw error;
}


// Subscribe to one-to-one call signals and session changes.
export function watchCall(callId, onSignal, onSession) {
  const channel = supabase
    .channel(`konnekt-call-${callId}`)
    .on(
      'postgres_changes',
      {
        event: 'INSERT',
        schema: 'public',
        table: 'call_signals',
        filter: `call_id=eq.${callId}`
      },
      (payload) => onSignal?.(payload.new)
    )
    .on(
      'postgres_changes',
      {
        event: 'UPDATE',
        schema: 'public',
        table: 'call_sessions',
        filter: `id=eq.${callId}`
      },
      (payload) => onSession?.(payload.new)
    )
    .subscribe();

  return () => {
    supabase.removeChannel(channel);
  };
}


// Retrieve existing signals for a one-to-one call.
export async function getCallSignals(callId) {
  const { data, error } = await supabase
    .from('call_signals')
    .select('*')
    .eq('call_id', callId)
    .order('created_at', { ascending: true });

  if (error) throw error;

  return data || [];
}


// Update a one-to-one call session.
export async function updateCall(callId, patch) {
  if (!callId) {
    throw new Error('A call ID is required.');
  }

  const { error } = await supabase
    .from('call_sessions')
    .update(patch)
    .eq('id', callId);

  if (error) throw error;
}


// Get STUN and, when configured, short-lived TURN credentials.
// Do not put permanent TURN credentials in frontend environment variables.
export async function getKonnektIceServers() {
  const stun = {
    urls:
      import.meta.env.VITE_STUN_URL ||
      'stun:stun.l.google.com:19302'
  };

  const endpoint = import.meta.env.VITE_TURN_CREDENTIALS_URL;

  if (!endpoint) {
    return [stun];
  }

  try {
    const {
      data: { session },
      error
    } = await supabase.auth.getSession();

    if (error) throw error;

    if (!session?.access_token) {
      return [stun];
    }

    const response = await fetch(endpoint, {
      headers: {
        Authorization: `Bearer ${session.access_token}`,
        Accept: 'application/json'
      }
    });

    if (!response.ok) {
      throw new Error(
        `TURN credential service returned ${response.status}.`
      );
    }

    const result = await response.json();

    const servers = Array.isArray(result.iceServers)
      ? result.iceServers.filter(server => server?.urls)
      : [];

    return servers.length
      ? [stun, ...servers]
      : [stun];

  } catch (error) {
    console.warn(
      'KONNEKT TURN configuration:',
      error?.message || error
    );

    return [stun];
  }
}


// Create a group voice or video call.
// Current peer-to-peer beta limit: four conversation members.
export async function createGroupCall({
  conversationId,
  callType = 'voice'
}) {
  const {
    data: { user },
    error: authError
  } = await supabase.auth.getUser();

  if (authError) throw authError;

  if (!user) {
    throw new Error('Sign in before starting a group call.');
  }

  if (!conversationId) {
    throw new Error('Choose a group conversation first.');
  }

  if (!['voice', 'video'].includes(callType)) {
    throw new Error('Choose a valid call type.');
  }

  // Confirm conversation membership.
  const { data: members, error: memberError } = await supabase
    .from('conversation_members')
    .select('user_id')
    .eq('conversation_id', conversationId);

  if (memberError) throw memberError;

  if (!members || members.length < 2) {
    throw new Error(
      'This group does not have enough members for a call.'
    );
  }

  if (members.length > 4) {
    throw new Error(
      'Group calls currently support up to four people in the peer-to-peer beta.'
    );
  }

  const isMember = members.some(
    member => member.user_id === user.id
  );

  if (!isMember) {
    throw new Error(
      'You are not a member of this conversation.'
    );
  }

  // Create the group call session.
  const { data: call, error } = await supabase
    .from('group_call_sessions')
    .insert({
      conversation_id: conversationId,
      created_by: user.id,
      call_type: callType,
      status: 'active'
    })
    .select()
    .single();

  if (error) throw error;

  // Initially invite every conversation member.
  // The Join button should change the participant status to joined.
  const participants = members.map(({ user_id }) => ({
    call_id: call.id,
    user_id,
    status: 'invited'
  }));

  const { error: participantsError } = await supabase
    .from('group_call_participants')
    .insert(participants);

  // If participant creation fails, attempt to close the session.
  if (participantsError) {
    const { error: cleanupError } = await supabase
      .from('group_call_sessions')
      .update({
        status: 'ended',
        ended_at: new Date().toISOString()
      })
      .eq('id', call.id);

    if (cleanupError) {
      console.warn(
        'Could not close incomplete group call:',
        cleanupError.message
      );
    }

    throw participantsError;
  }

  return call;
}
