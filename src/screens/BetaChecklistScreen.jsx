import React, { useEffect, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { supabase } from '../lib_supabase';

// Fixed, versioned test checklist. Keep statuses small enough for the existing
// 2,000-character user_reports.details limit. No credentials/chat contents.
export const BETA_CHECKS = [
  ['A01', 'Install, open and update app'],
  ['A02', 'Sign in, sign out and sign back in'],
  ['A03', 'Reset password / recover account'],
  ['C01', 'Start a direct chat and receive a reply'],
  ['C02', 'Send a photo, video or voice message'],
  ['C03', 'Create a group and send a message'],
  ['C04', 'Open encrypted messages on another device'],
  ['N01', 'Receive a notification while app is closed'],
  ['V01', 'Make and answer a voice call'],
  ['V02', 'Make and answer a video call'],
  ['V03', 'Start or join a group call'],
  ['S01', 'Create and view a Status'],
  ['R01', 'View/upload a Reel; like, comment or follow'],
  ['D01', 'Find another user in Discover'],
  ['P01', 'Edit profile and save changes'],
  ['S02', 'Block a user and report unwanted content'],
  ['O01', 'Recover after losing internet connection'],
  ['O02', 'Reopen app and confirm no crash or lost drafts'],
];
const STATES = ['Pass', 'Fail', 'Not tested'];
export function buildBetaSummary({ code, device, results, notes }) {
  const clean = s => String(s || '').replace(/[\r\n]+/g, ' ').trim();
  const lines = [
    'KONNEKT BETA CHECKLIST v1',
    'Tester: ' + clean(code).slice(0, 3),
    'Device: ' + clean(device).slice(0, 70),
    'Submitted: ' + new Date().toISOString(),
    ...BETA_CHECKS.map(([id]) => {
      const status = STATES.includes(results[id]) ? results[id] : 'Not tested';
      const note = clean(notes[id]).slice(0, 55);
      return id + ': ' + status + (status === 'Fail' && note ? ' - ' + note : '');
    })
  ];
  return lines.join('\n');
}
const storageKey = id => 'konnekt-beta-checklist-v1-' + id;
function loadDraft(id) {
  try {
    if (typeof localStorage === 'undefined' || !id) return {};
    return JSON.parse(localStorage.getItem(storageKey(id)) || '{}');
  } catch { return {}; }
}
export default function BetaChecklistScreen({ user, navigation }) {
  const [code, setCode] = useState('');
  const [device, setDevice] = useState('');
  const [results, setResults] = useState({});
  const [notes, setNotes] = useState({});
  const [sending, setSending] = useState(false);
  const [notice, setNotice] = useState('');
  const [sent, setSent] = useState(false);
  useEffect(() => {
    const saved = loadDraft(user?.id);
    setCode(saved.code || ''); setDevice(saved.device || '');
    setResults(saved.results || {}); setNotes(saved.notes || {});
    setSent(false); setNotice('');
  }, [user?.id]);
  useEffect(() => {
    if (!user?.id || typeof localStorage === 'undefined') return;
    try { localStorage.setItem(storageKey(user.id), JSON.stringify({ code, device, results, notes })); } catch { /* storage may be unavailable */ }
  }, [user?.id, code, device, results, notes]);
  const marked = BETA_CHECKS.filter(([id]) => STATES.includes(results[id])).length;
  const failed = BETA_CHECKS.filter(([id]) => results[id] === 'Fail').length;
  const submit = async () => {
    if (sending || !user?.id) return;
    if (!/^T(0[1-9]|1[0-9]|20)$/.test(code.trim().toUpperCase())) {
      setNotice('Enter your private tester code from T01 to T20.'); return;
    }
    if (device.trim().length < 5) { setNotice('Enter your phone model and Android version.'); return; }
    if (marked !== BETA_CHECKS.length) { setNotice('Mark every check Pass, Fail or Not tested first.'); return; }
    if (BETA_CHECKS.some(([id]) => results[id] === 'Fail' && !String(notes[id] || '').trim())) {
      setNotice('Add a short explanation for every failed check.'); return;
    }
    const details = buildBetaSummary({ code: code.trim().toUpperCase(), device, results, notes });
    if (details.length > 2000) { setNotice('Report too long; shorten your device name or failure notes.'); return; }
    setSending(true); setNotice(''); setSent(false);
    try {
      const { error } = await supabase.from('user_reports').insert({
        reporter_id: user.id,
        content_type: 'other',
        reason: 'App bug: Beta checklist',
        details
      });
      if (error) throw error;
      setSent(true);
      setNotice('Checklist submitted to KONNEKT for review. Thank you!');
    } catch {
      setNotice('Could not submit. Your ticks remain saved on this device; retry while your beta access is active.');
    } finally { setSending(false); }
  };
  const select = (id, state) => { setResults(v => ({ ...v, [id]: state })); setSent(false); };
  return <ScrollView style={styles.container} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
    <TouchableOpacity accessibilityRole="button" onPress={() => navigation.goBack()}><Text style={styles.link}>‹ Back</Text></TouchableOpacity>
    <Text style={styles.title}>Beta Testing Checklist</Text>
    <Text style={styles.help}>Test each feature with another approved tester. Mark Pass, Fail or Not tested. Explain failures. Submit before your 14-day beta expires. Avoid passwords, OTPs and private chat content.</Text>
    <Text style={styles.label}>Your private tester code (T01–T20)</Text>
    <TextInput testID="beta-code" accessibilityLabel="Tester code" autoCapitalize="characters" maxLength={3} value={code} onChangeText={setCode} style={styles.input} placeholder="T01" placeholderTextColor="#CBBBD9" />
    <Text style={styles.label}>Phone model and Android version</Text>
    <TextInput testID="beta-device" accessibilityLabel="Phone model and Android version" maxLength={70} value={device} onChangeText={setDevice} style={styles.input} placeholder="e.g. Samsung A14, Android 14" placeholderTextColor="#CBBBD9"/>
    <Text style={styles.counter}>{marked}/{BETA_CHECKS.length} marked · {failed} failed</Text>
    {BETA_CHECKS.map(([id, label]) => <View style={styles.card} key={id}>
      <Text style={styles.label}>{id} · {label}</Text>
      <View style={styles.row}>{STATES.map(state => <TouchableOpacity
        testID={'beta-' + id + '-' + state.replace(' ','-')}
        accessibilityRole="button" accessibilityLabel={id + ' ' + state}
        accessibilityState={{ selected: results[id] === state }}
        onPress={() => select(id, state)} key={state}
        style={[styles.choice, results[id] === state && styles.selected]}>
        <Text style={styles.choiceText}>{state}</Text></TouchableOpacity>)}</View>
      {results[id] === 'Fail' && <TextInput
        testID={'beta-note-' + id} accessibilityLabel={id + ' failure details'}
        style={styles.input} placeholder="What failed? Steps to reproduce (no private data)"
        placeholderTextColor="#CBBBD9" value={notes[id] || ''}
        maxLength={55} onChangeText={v => { setNotes(p => ({ ...p, [id]: v })); setSent(false); }}/>}
    </View>)}
    {!!notice && <Text accessibilityRole="alert" style={[styles.notice, sent && styles.success]}>{notice}</Text>}
    <TouchableOpacity testID="beta-submit" accessibilityRole="button"
      accessibilityState={{disabled:sending||!user?.id}} disabled={sending||!user?.id}
      style={styles.submit} onPress={submit}>
      {sending?<ActivityIndicator color="#FFF"/>:<Text style={styles.submitText}>SUBMIT TEST CHECKLIST</Text>}
    </TouchableOpacity>
    <Text style={styles.help}>Your results go to the existing KONNEKT moderation queue. To report an urgent problem sooner, use Profile → Report a Problem. Results do not automatically create GitHub issues. This form does not approve accounts or activate beta access.</Text>
  </ScrollView>;
}
const styles = StyleSheet.create({
  container:{flex:1,backgroundColor:'#05030A'},content:{padding:20,paddingBottom:48},
  link:{color:'#D8B8F5',fontSize:16,marginBottom:16},title:{fontSize:25,color:'#FFF',fontWeight:'bold',marginBottom:12},
  help:{color:'#CBBBD9',lineHeight:21,marginBottom:16},label:{color:'#FFF',fontWeight:'600',marginBottom:8},
  input:{backgroundColor:'#181025',color:'#FFF',borderColor:'#514063',borderWidth:1,borderRadius:10,padding:12,marginBottom:12},
  card:{backgroundColor:'#181025',borderRadius:12,borderWidth:1,borderColor:'#352047',padding:12,marginBottom:10},
  row:{flexDirection:'row',flexWrap:'wrap',gap:7},choice:{borderRadius:9,borderWidth:1,borderColor:'#514063',paddingHorizontal:10,paddingVertical:10,marginBottom:6},
  selected:{backgroundColor:'#6A0DAD',borderColor:'#FFC107'},choiceText:{color:'#FFF',fontWeight:'600',fontSize:12},
  counter:{color:'#FFC107',fontWeight:'bold',marginBottom:15},notice:{color:'#FFB4B4',marginBottom:12},success:{color:'#54D6A2'},
  submit:{backgroundColor:'#6A0DAD',padding:16,borderRadius:12,alignItems:'center',marginTop:9,marginBottom:16},
  submitText:{color:'#FFF',fontWeight:'bold'}
});
