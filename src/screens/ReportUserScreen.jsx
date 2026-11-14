
import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Alert,
  ActivityIndicator
} from 'react-native';
import { submitKonnektReport } from '../services/safety';

const reasons = [
  'Spam or unwanted advertising',
  'Harassment or bullying',
  'Fake account or impersonation',
  'Scams or fraud',
  'Inappropriate content',
  'Violence or threats',
  'Hate speech',
  'Other'
];

export default function ReportUserScreen({ navigation, route }) {
  const params = route?.params || {};
  const contact = params.contact || {};
  const contentId = params.contentId || null;
  const contentType = params.contentType || 'user';
  const isContentReport = !!contentId;

  const [reason, setReason] = useState('');
  const [details, setDetails] = useState('');
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState('');

  const submit = async () => {
    if (!contact.id) {
      setNotice('The account could not be identified. Please reopen the report from its profile or content.');
      return;
    }

    if (!reason) {
      setNotice('Choose a reason for this report.');
      return;
    }

    if (reason === 'Other' && !details.trim()) {
      setNotice('Please explain the issue when selecting Other.');
      return;
    }

    if (contact.id === params.currentUserId) {
      setNotice('You cannot report your own account.');
      return;
    }

    setSaving(true);
    setNotice('');

    try {
      await submitKonnektReport({
        reportedUserId: contact.id,
        contentId,
        contentType: isContentReport ? contentType : 'user',
        reason,
        details
      });

      Alert.alert(
        'Report submitted',
        'Your report has been securely submitted for authorised moderation review.',
        [{ text: 'OK', onPress: () => navigation.goBack() }]
      );
    } catch (error) {
      setNotice(
        error.message || 'The report could not be submitted. Please try again.'
      );
    } finally {
      setSaving(false);
    }
  };

  const name =
    contact.name ||
    contact.full_name ||
    contact.username ||
    'KONNEKT member';

  return (
    <View style={s.page}>
      <View style={s.header}>
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          accessibilityRole="button"
        >
          <Text style={s.back}>‹</Text>
        </TouchableOpacity>

        <Text style={s.title}>
          {isContentReport ? 'Report content' : 'Report account'}
        </Text>
      </View>

      <ScrollView contentContainerStyle={s.content}>
        <Text style={s.member}>{name}</Text>

        <Text style={s.sub}>
          {isContentReport
            ? 'Tell us why this post or Reel should be reviewed.'
            : 'Choose the reason that best describes the issue with this account.'}
        </Text>

        {reasons.map(option => (
          <TouchableOpacity
            key={option}
            style={[
              s.reason,
              reason === option && s.selected
            ]}
            onPress={() => setReason(option)}
            accessibilityRole="button"
            accessibilityState={{ selected: reason === option }}
          >
            <Text style={s.reasonText}>{option}</Text>
            <Text style={s.radio}>
              {reason === option ? '●' : '○'}
            </Text>
          </TouchableOpacity>
        ))}

        <TextInput
          style={s.details}
          value={details}
          onChangeText={setDetails}
          multiline
          maxLength={2000}
          placeholder="Additional details (optional)"
          placeholderTextColor="#BBA9CC"
        />

        <TouchableOpacity
          style={[s.submit, saving && s.disabled]}
          disabled={saving}
          onPress={submit}
          accessibilityRole="button"
        >
          {saving
            ? <ActivityIndicator color="#FFF" />
            : <Text style={s.submitText}>Submit report</Text>}
        </TouchableOpacity>

        {!!notice && <Text style={s.notice}>{notice}</Text>}

        <Text style={s.privacy}>
          Reports are available to authorised moderators for review.
          Submitting a report does not automatically remove content
          or suspend an account.
        </Text>
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  page: {
    flex: 1,
    backgroundColor: '#10091B'
  },
  header: {
    padding: 18,
    paddingTop: 24,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 18,
    borderBottomWidth: 1,
    borderColor: '#39244B'
  },
  back: {
    color: '#D8B8F5',
    fontSize: 30
  },
  title: {
    color: '#FFF',
    fontSize: 21,
    fontWeight: '800'
  },
  content: {
    padding: 18,
    paddingBottom: 40
  },
  member: {
    color: '#FFF',
    fontSize: 17,
    fontWeight: '700',
    marginBottom: 7
  },
  sub: {
    color: '#C4B4D0',
    lineHeight: 20,
    marginBottom: 18
  },
  reason: {
    backgroundColor: '#241630',
    borderColor: '#39244B',
    borderWidth: 1,
    borderRadius: 11,
    padding: 14,
    marginBottom: 9,
    flexDirection: 'row',
    justifyContent: 'space-between'
  },
  selected: {
    borderColor: '#6A0DAD',
    backgroundColor: '#173456'
  },
  reasonText: {
    color: '#EAF5FF',
    flex: 1
  },
  radio: {
    color: '#65B7FF',
    marginLeft: 12
  },
  details: {
    minHeight: 110,
    backgroundColor: '#241630',
    color: '#FFF',
    borderRadius: 11,
    padding: 14,
    textAlignVertical: 'top',
    marginTop: 8
  },
  submit: {
    backgroundColor: '#6A0DAD',
    padding: 15,
    borderRadius: 11,
    alignItems: 'center',
    marginTop: 16
  },
  disabled: {
    opacity: 0.55
  },
  submitText: {
    color: '#FFF',
    fontWeight: '800'
  },
  notice: {
    color: '#FFB6C0',
    marginTop: 14,
    lineHeight: 19
  },
  privacy: {
    color: '#9F8EAF',
    fontSize: 11,
    lineHeight: 17,
    marginTop: 20
  }
});
