import React, { useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { supabase } from '../lib_supabase';

const FEATURES = ['Chats', 'Calls', 'Reels', 'Status', 'Discover', 'Profile', 'Login', 'Notifications', 'Other'];
const FREQUENCIES = ['Once', 'Sometimes', 'Every time'];
const IMPACTS = ['Blocking', 'Major', 'Minor'];

export function buildBugReport({ feature, problem, expected, device, frequency, impact }) {
  const safe = value => String(value || '').trim();
  return [
    'KONNEKT TEST BUG REPORT',
    'Feature: ' + safe(feature),
    'Problem: ' + safe(problem),
    'Expected: ' + safe(expected),
    'Device: ' + safe(device),
    'Frequency: ' + safe(frequency),
    'Impact: ' + safe(impact)
  ].join('\n');
}

export default function ReportProblemScreen({ user, navigation }) {
  const [feature, setFeature] = useState('Chats');
  const [problem, setProblem] = useState('');
  const [expected, setExpected] = useState('');
  const [device, setDevice] = useState('');
  const [frequency, setFrequency] = useState('Once');
  const [impact, setImpact] = useState('Major');
  const [submitting, setSubmitting] = useState(false);
  const [notice, setNotice] = useState('');
  const [success, setSuccess] = useState(false);

  const submit = async () => {
    if (!user?.id || submitting) return;
    if (problem.trim().length < 10) {
      setNotice('Please describe the problem in at least 10 characters.');
      return;
    }
    const details = buildBugReport({ feature, problem, expected, device, frequency, impact });
    if (details.length > 2000) {
      setNotice('Your report is too long. Please shorten it to fit 2,000 characters.');
      return;
    }
    setSubmitting(true);
    setNotice('');
    setSuccess(false);
    try {
      const { error } = await supabase.from('user_reports').insert({
        reporter_id: user.id,
        content_type: 'other',
        reason: 'App bug: ' + feature,
        details
      });
      if (error) throw error;
      setSuccess(true);
      setProblem('');
      setExpected('');
      setNotice('Report submitted. Thank you for helping test KONNEKT.');
    } catch {
      setNotice('Report could not be submitted. Check your connection and try again.');
    } finally {
      setSubmitting(false);
    }
  };

  const choices = (items, value, setter) => (
    <View style={styles.choices}>
      {items.map(item => (
        <TouchableOpacity key={item} accessibilityRole="button"
          accessibilityState={{ selected: item === value }}
          onPress={() => setter(item)}
          style={[styles.choice, item === value && styles.selected]}>
          <Text style={styles.choiceText}>{item}</Text>
        </TouchableOpacity>
      ))}
    </View>
  );

  return <ScrollView style={styles.container} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
    <TouchableOpacity accessibilityRole="button" onPress={() => navigation.goBack()}>
      <Text style={styles.back}>‹ Back</Text>
    </TouchableOpacity>
    <Text style={styles.title}>Report a Problem</Text>
    <Text style={styles.help}>Tell us what happened during your KONNEKT test. Do not include passwords, private messages or recovery codes.</Text>
    <Text style={styles.label}>Feature</Text>
    {choices(FEATURES, feature, setFeature)}
    <Text style={styles.label}>What went wrong? *</Text>
    <TextInput accessibilityLabel="What went wrong" testID="bug-problem" multiline
      style={[styles.input, styles.multiline]} value={problem} onChangeText={setProblem}
      maxLength={1400} placeholder="Describe the steps and what happened" placeholderTextColor="#9B8EAB" />
    <Text style={styles.label}>What did you expect?</Text>
    <TextInput accessibilityLabel="Expected result" multiline style={styles.input}
      value={expected} onChangeText={setExpected} maxLength={300}
      placeholder="What should have happened?" placeholderTextColor="#9B8EAB" />
    <Text style={styles.label}>Phone and Android version (optional)</Text>
    <TextInput accessibilityLabel="Device details" style={styles.input} value={device}
      onChangeText={setDevice} maxLength={100} placeholder="e.g. Android 14, Samsung A14" placeholderTextColor="#9B8EAB" />
    <Text style={styles.label}>How often?</Text>
    {choices(FREQUENCIES, frequency, setFrequency)}
    <Text style={styles.label}>Impact</Text>
    {choices(IMPACTS, impact, setImpact)}
    {!!notice && <Text accessibilityRole="alert" style={[styles.notice, success && styles.success]}>{notice}</Text>}
    <TouchableOpacity accessibilityRole="button" testID="bug-submit"
      accessibilityState={{ disabled: submitting || !user?.id }}
      disabled={submitting || !user?.id} style={styles.submit} onPress={submit}>
      {submitting ? <ActivityIndicator color="#FFF" /> : <Text style={styles.submitText}>SUBMIT REPORT</Text>}
    </TouchableOpacity>
    <Text style={styles.help}>Reports are sent to the KONNEKT moderation queue for review. Submitting a report does not automatically create a GitHub issue.</Text>
  </ScrollView>;
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#05030A' },
  content: { padding: 22, paddingBottom: 44 },
  back: { color: '#D8B8F5', fontSize: 16, marginBottom: 18 },
  title: { color: '#FFF', fontSize: 26, fontWeight: 'bold', marginBottom: 12 },
  help: { color: '#CBBBD9', lineHeight: 21, marginBottom: 18 },
  label: { color: '#FFF', fontWeight: '600', marginBottom: 9, marginTop: 10 },
  choices: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 10 },
  choice: { borderWidth: 1, borderColor: '#514063', borderRadius: 10, paddingVertical: 10, paddingHorizontal: 12, backgroundColor: '#181025' },
  selected: { backgroundColor: '#6A0DAD', borderColor: '#B47AED' },
  choiceText: { color: '#FFF' },
  input: { backgroundColor: '#181025', borderColor: '#514063', borderWidth: 1, borderRadius: 10, padding: 13, color: '#FFF', minHeight: 48, marginBottom: 10 },
  multiline: { minHeight: 115, textAlignVertical: 'top' },
  submit: { backgroundColor: '#6A0DAD', borderRadius: 12, padding: 16, alignItems: 'center', marginTop: 14, marginBottom: 20 },
  submitText: { color: '#FFF', fontWeight: 'bold' },
  notice: { color: '#FFB4B4', marginTop: 12 },
  success: { color: '#54D6A2' }
});
