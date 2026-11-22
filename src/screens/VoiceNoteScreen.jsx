import { Alert } from '../components/Alert';
import React, { useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, ScrollView } from 'react-native';
import { useAuth } from '../AuthContext';
import { isConversationId } from '../services/conversationId';
import { sendEncryptedVoiceMessage } from '../services/voiceMessages';
import { MAX_VOICE_BYTES, MAX_VOICE_MS, validateVoiceFile, voiceMetadata, voiceTime } from '../services/voiceNoteFormat';
import VoiceNotePlayer from '../components/VoiceNotePlayer';

export default function VoiceNoteScreen({ navigation, route }) {
  const { user } = useAuth();
  const conversationId = route?.params?.chatId;
  const [state, setState] = useState('idle'), [elapsed, setElapsed] = useState(0), [audioUrl, setAudioUrl] = useState('');
  const [saving, setSaving] = useState(false), [sent, setSent] = useState(false), [failed, setFailed] = useState(false), [notice, setNotice] = useState('');
  const [canPause, setCanPause] = useState(false);
  const mounted = useRef(true), version = useRef(0), starting = useRef(null), take = useRef(null);
  const timer = useRef(null), file = useRef(null), draft = useRef({}), duration = useRef(0), sendLock = useRef(false), player = useRef(null);
  const clock = useRef({ activeAt: null, accumulated: 0 });
  const activeMs = () => clock.current.accumulated + (clock.current.activeAt == null ? 0 : performance.now() - clock.current.activeAt);
  const releaseTracks = () => take.current?.stream.getTracks().forEach(track => track.stop());
  const stop = (discard = false) => {
    clearInterval(timer.current);
    const current = take.current;
    if (!current) return;
    current.discarded ||= discard;
    current.duration = Math.min(MAX_VOICE_MS, activeMs());
    clock.current = { activeAt: null, accumulated: current.duration };
    if (mounted.current) { setElapsed(current.duration); setState(discard ? 'idle' : 'stopping'); }
    try { if (['recording', 'paused'].includes(current.recorder.state)) current.recorder.stop(); } catch { /* Tracks still stop. */ }
    releaseTracks();
  };
  const cancel = () => {
    if (sendLock.current) return;
    version.current++; starting.current = null;
    stop(true); file.current = null; draft.current = {}; duration.current = 0;
    setAudioUrl(''); setElapsed(0); setState('idle'); setNotice(''); setFailed(false);
  };
  useEffect(() => {
    mounted.current = true;
    const background = () => {
      if (document.visibilityState !== 'hidden') return;
      player.current?.pause();
      if (['recording', 'paused'].includes(take.current?.recorder.state)) { stop(); setNotice('Recording stopped while the app was backgrounded. Preview before sending.'); }
      else if (starting.current != null) { version.current++; starting.current = null; setState('idle'); setNotice('Microphone request cancelled while the app was backgrounded.'); }
    };
    document.addEventListener('visibilitychange', background);
    return () => {
      document.removeEventListener('visibilitychange', background);
      mounted.current = false; version.current++; clearInterval(timer.current);
      if (take.current) { take.current.discarded = true; try { if (['recording', 'paused'].includes(take.current.recorder.state)) take.current.recorder.stop(); } catch {} }
      take.current?.stream.getTracks().forEach(track => track.stop()); player.current?.pause();
    };
  }, []);
  useEffect(() => () => { if (audioUrl) URL.revokeObjectURL(audioUrl); }, [audioUrl]);

  const start = async () => {
    if (starting.current != null || sendLock.current || ['recording', 'paused', 'stopping'].includes(state)) return;
    const token = ++version.current; starting.current = token;
    setNotice(''); setElapsed(0); setAudioUrl(''); setState('requesting'); setFailed(false); setSent(false);
    file.current = null; draft.current = {}; clock.current = { activeAt: null, accumulated: 0 };
    let stream;
    try {
      if (!isConversationId(conversationId)) throw new Error('Open voice notes from inside a conversation.');
      if (!navigator.mediaDevices?.getUserMedia || !globalThis.MediaRecorder) throw new Error('Voice recording is not supported in this browser or device.');
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      if (!mounted.current || token !== version.current) { stream.getTracks().forEach(track => track.stop()); return; }
      const recorder = new MediaRecorder(stream);
      const current = { recorder, stream, chunks: [], bytes: 0, discarded: false, duration: 0 };
      take.current = current;
      setCanPause(typeof recorder.pause === 'function' && typeof recorder.resume === 'function');
      recorder.ondataavailable = event => {
        if (take.current !== current || token !== version.current) return;
        if (!event.data?.size || current.discarded) return;
        current.chunks.push(event.data); current.bytes += event.data.size;
        if (current.bytes > MAX_VOICE_BYTES) { stop(true); if (mounted.current) setNotice('The recording exceeded 15 MB. Record a shorter note.'); }
      };
      recorder.onstop = () => {
        stream.getTracks().forEach(track => track.stop());
        if (take.current !== current) return;
        clearInterval(timer.current);
        if (!mounted.current || token !== version.current || current.discarded) return;
        if (clock.current.activeAt != null) current.duration = Math.min(MAX_VOICE_MS, activeMs());
        setElapsed(current.duration);
        try {
          const mime = (recorder.mimeType || 'audio/webm').split(';')[0];
          const extension = ({ 'audio/mp4': 'm4a', 'audio/ogg': 'ogg', 'audio/aac': 'aac', 'audio/wav': 'wav', 'audio/mpeg': 'mp3' })[mime] || 'webm';
          const recording = new File(current.chunks, `voice-note-${Date.now()}.${extension}`, { type: mime });
          validateVoiceFile(recording);
          if (current.duration < 200) throw new Error('Record a moment of audio before sending a voice note.');
          file.current = recording; duration.current = current.duration;
          setAudioUrl(URL.createObjectURL(recording)); setState('ready');
        } catch (error) { file.current = null; setState('idle'); setNotice(error.message || 'No audio was recorded. Try again.'); }
      };
      recorder.onerror = () => { if (take.current !== current || token !== version.current) return; current.discarded = true; stop(true); if (mounted.current) setNotice('Microphone recording failed. Check permission and try again.'); };
      recorder.start(250); clock.current.activeAt = performance.now(); setState('recording');
      timer.current = setInterval(() => {
        const ms = Math.min(MAX_VOICE_MS, activeMs());
        if (mounted.current) setElapsed(ms);
        if (ms >= MAX_VOICE_MS) { stop(); if (mounted.current) setNotice('The five-minute limit was reached. Preview or send this recording.'); }
      }, 200);
    } catch (error) {
      stream?.getTracks().forEach(track => track.stop());
      if (mounted.current && token === version.current) { setState('idle'); setNotice(error.message || 'Could not start recording. Check microphone permission.'); }
    } finally { if (starting.current === token) starting.current = null; }
  };
  const pause = () => {
    try {
      if (state === 'recording') { take.current.recorder.pause(); clock.current = { accumulated: activeMs(), activeAt: null }; setState('paused'); }
      else { take.current.recorder.resume(); clock.current.activeAt = performance.now(); setState('recording'); }
    } catch { setNotice('Pause or resume is unavailable. Stop the recording to preview it.'); }
  };
  const play = () => { player.current?.play().catch(() => { if (mounted.current) setNotice('Audio playback could not start. Use the audio controls to retry.'); }); };
  const send = async () => {
    if (sendLock.current || sent) return;
    if (!file.current || !isConversationId(conversationId) || !user?.id) return setNotice('Record a voice note from an active conversation first.');
    sendLock.current = true; setSaving(true); setNotice('');
    try {
      await sendEncryptedVoiceMessage(file.current, conversationId, user.id, { draft: draft.current, durationMs: duration.current, onStage: text => { if (mounted.current) setNotice(text); } });
      if (mounted.current) { setSent(true); setFailed(false); setNotice('Voice note sent.'); Alert.alert('Voice note sent', 'Your voice note has been sent.', [{ text: 'OK', onPress: () => navigation.goBack() }]); }
    } catch (error) { if (mounted.current) { setFailed(true); setNotice(error.message || 'The voice note could not be sent. Retry this recording.'); } }
    finally { sendLock.current = false; if (mounted.current) setSaving(false); }
  };
  const recording = ['recording', 'paused'].includes(state);
  return <ScrollView style={s.page} contentContainerStyle={{ flexGrow: 1 }}><TouchableOpacity accessibilityRole="button" onPress={() => navigation.goBack()}><Text style={s.back}>‹ Back</Text></TouchableOpacity><View style={s.center}>
    <Text style={s.icon}>🎙</Text><Text style={s.title}>{state === 'paused' ? 'Recording paused' : recording ? 'Recording voice note' : state === 'requesting' ? 'Allow microphone access' : audioUrl ? 'Voice note ready' : 'Record a voice note'}</Text>
    <Text style={s.sub}>{recording ? 'Tap stop to preview. You can cancel before sending.' : 'Use your device microphone to record an audio message.'}</Text><Text style={s.timer}>{voiceTime(elapsed)}</Text>
    <View style={s.actions}>
      {state === 'idle' && !audioUrl && <TouchableOpacity accessibilityRole="button" style={s.primary} onPress={start}><Text style={s.primaryText}>Start recording</Text></TouchableOpacity>}
      {state === 'requesting' && <ActivityIndicator color="#FFC107" />}
      {recording && <><TouchableOpacity accessibilityRole="button" style={[s.primary, s.stop]} onPress={() => stop()}><Text style={s.primaryText}>Stop recording</Text></TouchableOpacity>{canPause && <TouchableOpacity accessibilityRole="button" accessibilityLabel={state === 'paused' ? 'Resume recording' : 'Pause recording'} style={s.secondary} onPress={pause}><Text style={s.secondaryText}>{state === 'paused' ? 'Resume recording' : 'Pause recording'}</Text></TouchableOpacity>}</>}
      {(recording || state === 'requesting') && <TouchableOpacity accessibilityRole="button" accessibilityLabel="Cancel recording" style={s.secondary} onPress={cancel}><Text style={s.secondaryText}>Cancel recording</Text></TouchableOpacity>}
      {!!audioUrl && <><VoiceNotePlayer audioRef={player} url={audioUrl} metadata={voiceMetadata(file.current, duration.current)} label="Voice note preview" /><TouchableOpacity accessibilityRole="button" style={s.secondary} onPress={play}><Text style={s.secondaryText}>Play recording</Text></TouchableOpacity><TouchableOpacity accessibilityRole="button" style={s.secondary} disabled={saving || sent} onPress={cancel}><Text style={s.secondaryText}>Discard</Text></TouchableOpacity><TouchableOpacity accessibilityRole="button" style={s.primary} disabled={saving || sent} onPress={send}>{saving ? <ActivityIndicator color="#FFF" /> : <Text style={s.primaryText}>{sent ? 'Voice note sent' : failed ? 'Retry voice note' : 'Send voice note'}</Text>}</TouchableOpacity></>}
    </View>{!!notice && <Text accessibilityRole={saving ? 'status' : 'alert'} style={s.notice}>{notice}</Text>}
  </View></ScrollView>;
}

const s = StyleSheet.create({ page: { flex: 1, backgroundColor: '#05030A', padding: 18 }, back: { color: '#D8B8F5', fontSize: 17, marginTop: 12 }, center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 18 }, icon: { fontSize: 60, marginBottom: 18 }, title: { color: '#FFF', fontSize: 23, fontWeight: '800', textAlign: 'center' }, sub: { color: '#CBBBD9', textAlign: 'center', lineHeight: 20, marginTop: 10, maxWidth: 320 }, timer: { color: '#FFF', fontSize: 34, fontWeight: '700', marginTop: 25, fontVariant: ['tabular-nums'] }, actions: { width: '100%', maxWidth: 340, gap: 10, marginTop: 28 }, primary: { backgroundColor: '#6A0DAD', padding: 15, borderRadius: 12, alignItems: 'center' }, stop: { backgroundColor: '#D6455D' }, primaryText: { color: '#FFF', fontWeight: '800' }, secondary: { backgroundColor: '#181025', padding: 14, borderRadius: 12, alignItems: 'center', borderWidth: 1, borderColor: '#503567' }, secondaryText: { color: '#D9E8F8', fontWeight: '700' }, notice: { color: '#FFB6C0', marginTop: 18, textAlign: 'center', lineHeight: 19 } });
