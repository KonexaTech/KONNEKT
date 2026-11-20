import React, { useState } from 'react';
import { ScrollView, Text, TextInput, TouchableOpacity, ActivityIndicator, StyleSheet } from 'react-native';
import { useAuth } from '../AuthContext';
import { supabase } from '../lib_supabase';

export default function VerifyAuthenticatorScreen() {
  const { mfaError, mfaFactors, refreshSecurity } = useAuth();
  const [selected, setSelected] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const factor = mfaFactors.find(item => item.id === selected) || mfaFactors[0];
  const verify = async () => {
    if (busy) return;
    if (!factor || !/^\d{6}$/.test(code)) { setNotice('Enter the current six-digit authenticator code.'); return; }
    setBusy(true); setNotice('');
    try {
      const { data: challenge, error } = await supabase.auth.mfa.challenge({ factorId: factor.id });
      if (error) throw error;
      const result = await supabase.auth.mfa.verify({ factorId: factor.id, challengeId: challenge.id, code });
      if (result.error) throw result.error;
      setCode('');
    } catch (error) { setNotice(error.message || 'The code could not be verified. Please try again.'); }
    finally { setBusy(false); }
  };
  const signOut = async () => {
    if (busy) return;
    setBusy(true); setNotice('');
    try { const { error } = await supabase.auth.signOut({ scope: 'local' }); if (error) throw error; }
    catch (error) { setNotice(error.message || 'Could not sign out. Please try again.'); }
    finally { setBusy(false); }
  };
  return <ScrollView style={{ flex: 1, backgroundColor: "#10091B" }} contentContainerStyle={s.page} keyboardShouldPersistTaps="handled">
    <Text style={s.brand}>KONNEKT</Text>
    <Text style={s.title}>{mfaError ? 'Security check unavailable' : 'Verify your sign-in'}</Text>
    {mfaError ? <><Text accessibilityRole="alert" style={s.notice}>{mfaError}</Text><TouchableOpacity accessibilityRole="button" style={s.button} onPress={refreshSecurity}><Text style={s.white}>Retry security check</Text></TouchableOpacity></> : <>
      <Text style={s.help}>Enter the code from your authenticator app to finish signing in.</Text>
      {mfaFactors.length > 1 && mfaFactors.map((item, index) => <TouchableOpacity key={item.id} accessibilityRole="button" accessibilityState={{ selected: item.id === factor?.id }} onPress={() => setSelected(item.id)} style={s.choice}><Text style={s.white}>{item.friendly_name || `Authenticator ${index + 1}`}</Text></TouchableOpacity>)}
      <TextInput accessibilityLabel="Sign-in authenticator code" placeholder="Six-digit authenticator code" placeholderTextColor="#BBA9CC" autoComplete="one-time-code" keyboardType="number-pad" autoCorrect={false} maxLength={6} value={code} onChangeText={setCode} style={s.input} onSubmitEditing={verify} />
      <TouchableOpacity accessibilityRole="button" disabled={busy} style={s.button} onPress={verify}><Text style={s.white}>Verify sign-in</Text></TouchableOpacity>
    </>}
    <TouchableOpacity accessibilityRole="button" disabled={busy} style={s.choice} onPress={signOut}><Text style={s.white}>Sign out</Text></TouchableOpacity>
    {busy && <ActivityIndicator color="#D8B8F5" />}
    {!!notice && <Text accessibilityRole="alert" style={s.notice}>{notice}</Text>}
  </ScrollView>;
}
const s = StyleSheet.create({ page: { flexGrow: 1, justifyContent: 'center', backgroundColor: '#05030A', padding: 25 }, brand: { color: '#D8B8F5', fontSize: 19, fontWeight: '800', marginBottom: 20 }, title: { color: '#FFF', fontSize: 27, fontWeight: '800' }, help: { color: '#BBA9CC', lineHeight: 21, marginVertical: 18 }, input: { backgroundColor: '#181025', color: '#FFF', padding: 15, borderRadius: 10, marginTop: 20 }, button: { backgroundColor: '#6A0DAD', padding: 15, borderRadius: 10, alignItems: 'center', marginTop: 16 }, choice: { backgroundColor: '#39244B', padding: 13, borderRadius: 10, marginVertical: 10, alignItems: 'center' }, white: { color: '#FFF', fontWeight: '700' }, notice: { color: '#FFB6C0', lineHeight: 21, marginTop: 16 } });
