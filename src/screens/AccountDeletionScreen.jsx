import { Alert } from '../components/Alert';
import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  ActivityIndicator
} from 'react-native';

import { supabase } from '../lib_supabase';

export default function AccountDeletionScreen({ navigation }) {
  const [reason, setReason] = useState('');
  const [request, setRequest] = useState(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  const loadRequest = async () => {
    try {
      const {
        data: { user },
        error: authError
      } = await supabase.auth.getUser();

      if (authError) throw authError;
      if (!user) throw new Error('Sign in to manage your account.');

      const { data, error } = await supabase
        .from('account_deletion_requests')
        .select('id,status,created_at')
        .eq('user_id', user.id)
        .in('status', ['requested', 'processing'])
        .maybeSingle();

      if (error) throw error;
      setRequest(data || null);
    } catch (error) {
      Alert.alert('Account status', error.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadRequest();
  }, []);

  const submitRequest = async () => {
    if (submitting || request) return;

    Alert.alert(
      'Request account deletion',
      'This submits a permanent account-deletion request. Your account will not be deleted immediately. An authorised administrator must process the request.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Submit request',
          style: 'destructive',
          onPress: async () => {
            setSubmitting(true);

            try {
              const {
                data: { user },
                error: authError
              } = await supabase.auth.getUser();

              if (authError) throw authError;
              if (!user) {
                throw new Error('Please sign in again.');
              }

              const { data, error } = await supabase
                .from('account_deletion_requests')
                .insert({
                  user_id: user.id,
                  reason: reason.trim().slice(0, 1000)
                })
                .select('id,status,created_at')
                .single();

              if (error) {
                if (error.code === '23505') {
                  throw new Error(
                    'You already have an open deletion request.'
                  );
                }
                throw error;
              }

              setRequest(data);
              Alert.alert(
                'Request submitted',
                'Your request has been recorded. Your account remains active until an authorised administrator completes the deletion.'
              );
            } catch (error) {
              Alert.alert('Could not submit request', error.message);
            } finally {
              setSubmitting(false);
            }
          }
        }
      ]
    );
  };

  const statusLabel = status => {
    if (status === 'requested') return 'Request submitted';
    if (status === 'processing') return 'Deletion being processed';
    if (status === 'completed') return 'Completed';
    if (status === 'rejected') return 'Not approved';
    return 'Unknown';
  };

  return (
    <ScrollView
      style={styles.page}
      contentContainerStyle={styles.content}
    >
      <TouchableOpacity onPress={() => navigation.goBack()}>
        <Text style={styles.back}>‹ Back</Text>
      </TouchableOpacity>

      <Text style={styles.title}>Delete your account</Text>

      <View style={styles.warning}>
        <Text style={styles.warningTitle}>Please read before continuing</Text>
        <Text style={styles.warningText}>
          Account deletion is permanent once completed. It may remove
          your profile and account-linked information. Some records may
          need to be retained where legally required.
        </Text>
      </View>

      {loading ? (
        <ActivityIndicator color="#72BEFF" />
      ) : request ? (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Your deletion request</Text>
          <Text style={styles.status}>
            {statusLabel(request.status)}
          </Text>
          <Text style={styles.body}>
            Your account has not yet been deleted. You can continue
            using KONNEKT until an authorised administrator completes
            the request.
          </Text>
        </View>
      ) : (
        <>
          <Text style={styles.label}>Reason (optional)</Text>

          <TextInput
            value={reason}
            onChangeText={setReason}
            placeholder="Tell us why you want to leave"
            placeholderTextColor="#9A8AA8"
            multiline
            maxLength={1000}
            style={styles.input}
          />

          <TouchableOpacity
            disabled={submitting}
            style={[
              styles.deleteButton,
              submitting && styles.disabled
            ]}
            onPress={submitRequest}
          >
            {submitting ? (
              <ActivityIndicator color="#FFFFFF" />
            ) : (
              <Text style={styles.deleteText}>
                Submit deletion request
              </Text>
            )}
          </TouchableOpacity>
        </>
      )}

      <Text style={styles.note}>
        This screen submits a request only. Automatic deletion,
        removal of stored media and final account erasure still require
        a trusted backend process and administrator review.
      </Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  page: {
    flex: 1,
    backgroundColor: '#10091B'
  },
  content: {
    padding: 20,
    paddingBottom: 45
  },
  back: {
    color: '#72BEFF',
    fontSize: 16,
    marginTop: 12
  },
  title: {
    color: '#FFFFFF',
    fontSize: 27,
    fontWeight: '800',
    marginTop: 25,
    marginBottom: 20
  },
  warning: {
    backgroundColor: '#38202A',
    borderColor: '#8F4055',
    borderWidth: 1,
    borderRadius: 13,
    padding: 16,
    marginBottom: 22
  },
  warningTitle: {
    color: '#FFB6C0',
    fontWeight: '800',
    fontSize: 15,
    marginBottom: 8
  },
  warningText: {
    color: '#F0DCE2',
    lineHeight: 21
  },
  label: {
    color: '#FFFFFF',
    fontWeight: '700',
    marginBottom: 9
  },
  input: {
    minHeight: 105,
    backgroundColor: '#241630',
    borderColor: '#503567',
    borderWidth: 1,
    borderRadius: 11,
    padding: 13,
    color: '#FFFFFF',
    textAlignVertical: 'top'
  },
  deleteButton: {
    backgroundColor: '#A92E49',
    padding: 15,
    borderRadius: 11,
    alignItems: 'center',
    marginTop: 20
  },
  disabled: {
    opacity: 0.6
  },
  deleteText: {
    color: '#FFFFFF',
    fontWeight: '800'
  },
  card: {
    backgroundColor: '#241630',
    borderRadius: 13,
    padding: 17,
    borderWidth: 1,
    borderColor: '#503567'
  },
  cardTitle: {
    color: '#FFFFFF',
    fontWeight: '800',
    fontSize: 17
  },
  status: {
    color: '#72BEFF',
    fontWeight: '800',
    marginTop: 12
  },
  body: {
    color: '#C7D6E7',
    lineHeight: 21,
    marginTop: 10
  },
  note: {
    color: '#BBA9CC',
    fontSize: 11,
    lineHeight: 18,
    marginTop: 24
  }
});
