import React, { useEffect, useRef, useState } from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { claimAudioPlayback, releaseAudioPlayback } from '../services/audioPlayback';
import { voiceTime } from '../services/voiceNoteFormat';

export default function VoiceNotePlayer({ url, metadata, audioRef, label = 'Audio attachment' }) {
  const ownRef = useRef(null), ref = audioRef || ownRef;
  const [rate, setRate] = useState(1), [error, setError] = useState('');
  useEffect(() => {
    const node = ref.current;
    setRate(1); setError('');
    const background = () => { if (document.visibilityState === 'hidden') node?.pause(); };
    document.addEventListener('visibilitychange', background);
    return () => { document.removeEventListener('visibilitychange', background); node?.pause(); releaseAudioPlayback(node); };
  }, [url, ref]);
  useEffect(() => {
    try { if (ref.current) ref.current.playbackRate = rate; }
    catch { setRate(1); setError('Playback speed is unavailable on this device. Normal playback remains available.'); }
  }, [rate, ref]);
  return <View style={{ maxWidth: '100%', width: 260, marginBottom: 8 }}>
    <audio ref={ref} src={url} controls preload="metadata" aria-label={label}
      onPlay={event => claimAudioPlayback(event.currentTarget)}
      onError={() => setError('This audio could not play. Refresh the conversation or try another supported device.')}
      style={{ width: '100%', maxWidth: '100%' }} />
    {!!metadata && <Text style={{ color: '#CBBBD9', fontSize: 11 }}>{voiceTime(metadata.duration_ms)} · {Math.max(1, Math.round(metadata.size_bytes / 1024))} KB</Text>}
    <TouchableOpacity accessibilityRole="button" accessibilityLabel={`Playback speed: ${rate}×`}
      onPress={() => setRate(value => value === 1 ? 1.5 : value === 1.5 ? 2 : 1)}
      style={{ alignSelf: 'flex-start', padding: 9, borderRadius: 10, backgroundColor: '#352047', marginTop: 4 }}>
      <Text style={{ color: '#FFC107', fontWeight: '700' }}>{rate}×</Text>
    </TouchableOpacity>
    {!!error && <Text accessibilityRole="alert" style={{ color: '#FFB6C0', fontSize: 11 }}>{error}</Text>}
  </View>;
}
