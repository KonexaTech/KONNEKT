
import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  ScrollView
} from 'react-native';

import { useAuth } from '../AuthContext';
import { supabase } from '../lib_supabase';

import {
  getStoredKonnektIdentity,
  createKonnektKeyBackup,
  restoreKonnektKeyBackup,
  getKonnektIdentityFingerprint
} from '../services/konnektEncryption';

export default function KeyRecoveryScreen({ navigation }) {
  const { user } = useAuth();

  const [passphrase, setPassphrase] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [fingerprint, setFingerprint] = useState('');
  const [backupStatus, setBackupStatus] = useState('Checking backup…');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [noticeType, setNoticeType] = useState('info');

  const refreshStatus = useCallback(async () => {
    if (!user?.id) return;

    try {
      const identity = await getStoredKonnektIdentity(user.id);

      if (identity?.publicJwk) {
        const value = await getKonnektIdentityFingerprint(
          identity.publicJwk
        );
        setFingerprint(value);
      } else {
        setFingerprint('');
      }

      const { data, error } = await supabase
        .from('user_key_backups')
        .select('updated_at')
        .eq('user_id', user.id)
        .maybeSingle();

      if (error) throw error;

      if (data?.updated_at) {
        setBackupStatus(
          `Backup saved: ${new Date(data.updated_at).toLocaleString()}`
        );
      } else {
        setBackupStatus('No recovery backup found for this account.');
      }
    } catch (error) {
      setBackupStatus(
        error.message || 'Could not check recovery status.'
      );
    }
  }, [user?.id]);

  useEffect(() => {
    refreshStatus();
  }, [refreshStatus]);

  const showError = message => {
    setNoticeType('error');
    setNotice(message);
  };

  const showSuccess = message => {
    setNoticeType('success');
    setNotice(message);
  };

  const run = async action => {
    if (!user?.id) {
      showError('Please sign in before using key recovery.');
      return;
    }

    if (passphrase.length < 12) {
      showError(
        'Use a recovery passphrase with at least 12 characters.'
      );
      return;
    }

    if (action === 'backup' && passphrase !== confirmation) {
      showError('The two recovery passphrases do not match.');
      return;
    }

    setBusy(true);
    setNotice('');

    try {
      if (action === 'backup') {
        await createKonnektKeyBackup(passphrase);

        showSuccess(
          'Your encrypted recovery backup has been saved. Keep your passphrase somewhere safe. KONNEKT cannot recover a forgotten passphrase.'
        );
      } else {
        await restoreKonnektKeyBackup(passphrase);

        showSuccess(
          'Your encryption identity has been restored on this device. Reopen your chats to check access to older encrypted messages.'
        );
      }

      await refreshStatus();

      setPassphrase('');
      setConfirmation('');
    } catch (error) {
      showError(
        error.message || 'Key recovery could not be completed.'
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <ScrollView
      style={s.page}
      contentContainerStyle={s.content}
    >
      <TouchableOpacity
        onPress={() => navigation.goBack()}
        accessibilityRole="button"
      >
        <Text style={s.back}>‹ Back</Text>
      </TouchableOpacity>

      <Text style={s.brand}>KONNEKT SECURITY</Text>
      <Text style={s.title}>Encryption key recovery</Text>

      <Text style={s.body}>
        Your private encryption key stays on your device.
        This feature encrypts a backup with your recovery
        passphrase before saving it to your KONNEKT account.
      </Text>

      <View style={s.card}>
        <Text style={s.label}>RECOVERY BACKUP STATUS</Text>
        <Text style={s.status}>{backupStatus}</Text>

        <Text style={[s.label, { marginTop: 18 }]}>
          YOUR IDENTITY FINGERPRINT
        </Text>

        <Text selectable style={s.fingerprint}>
          {fingerprint || 'No local identity found'}
        </Text>

        <Text style={s.note}>
          Compare this fingerprint with your contact through
          a trusted separate channel to help verify their
          encryption identity.
        </Text>
      </View>

      <Text style={s.label}>RECOVERY PASSPHRASE</Text>

      <TextInput
        value={passphrase}
        onChangeText={setPassphrase}
        secureTextEntry
        autoCapitalize="none"
        autoCorrect={false}
        style={s.input}
        placeholder="At least 12 characters"
        placeholderTextColor="#71839A"
      />

      <Text style={s.label}>
        CONFIRM PASSPHRASE FOR A NEW BACKUP
      </Text>

      <TextInput
        value={confirmation}
        onChangeText={setConfirmation}
        secureTextEntry
        autoCapitalize="none"
        autoCorrect={false}
        style={s.input}
        placeholder="Enter the same passphrase again"
        placeholderTextColor="#71839A"
      />

      <TouchableOpacity
        disabled={busy}
        style={[s.primary, busy && s.disabled]}
        onPress={() => run('backup')}
        accessibilityRole="button"
      >
        {busy ? (
          <ActivityIndicator color="#FFFFFF" />
        ) : (
          <Text style={s.buttonText}>
            CREATE / UPDATE BACKUP
          </Text>
        )}
      </TouchableOpacity>

      <TouchableOpacity
        disabled={busy}
        style={[s.secondary, busy && s.disabled]}
        onPress={() => run('restore')}
        accessibilityRole="button"
      >
        <Text style={s.buttonText}>
          RESTORE ON THIS DEVICE
        </Text>
      </TouchableOpacity>

      {!!notice && (
        <Text
          style={[
            s.notice,
            noticeType === 'error' ? s.error : s.success
          ]}
        >
          {notice}
        </Text>
      )}

      <View style={s.warningCard}>
        <Text style={s.warningTitle}>Important security information</Text>

        <Text style={s.warning}>
          • Never share your recovery passphrase with anyone.
        </Text>

        <Text style={s.warning}>
          • If you lose the passphrase, the encrypted backup
          cannot be decrypted.
        </Text>

        <Text style={s.warning}>
          • Do not clear browser data or uninstall the app
          until you have confirmed that your backup works.
        </Text>

        <Text style={s.warning}>
          • Older non-exportable encryption keys cannot be
          backed up by this recovery feature.
        </Text>
      </View>

      <Text style={s.footer}>
        KONNEKT • Connecting people everywhere.
      </Text>
    </ScrollView>
  );
}

const s = StyleSheet.create({
  page: {
    flex: 1,
    backgroundColor: '#10091B'
  },
  content: {
    padding: 20,
    paddingBottom: 45
  },
  back: {
    color: '#55B5FF',
    fontSize: 17,
    marginTop: 18,
    marginBottom: 20
  },
  brand: {
    color: '#55B5FF',
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 3
  },
  title: {
    color: '#FFFFFF',
    fontSize: 25,
    fontWeight: 'bold',
    marginTop: 7,
    marginBottom: 12
  },
  body: {
    color: '#D4C7DF',
    lineHeight: 21,
    marginBottom: 20
  },
  card: {
    backgroundColor: '#241630',
    padding: 16,
    borderRadius: 14,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: '#39244B'
  },
  label: {
    color: '#D8B8F5',
    fontWeight: 'bold',
    fontSize: 11,
    marginBottom: 9
  },
  status: {
    color: '#FFFFFF',
    fontSize: 13,
    lineHeight: 20
  },
  fingerprint: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: 'bold',
    letterSpacing: 1,
    lineHeight: 25
  },
  note: {
    color: '#BBA9CC',
    fontSize: 11,
    lineHeight: 18,
    marginTop: 10
  },
  input: {
    backgroundColor: '#241630',
    borderColor: '#39244B',
    borderWidth: 1,
    borderRadius: 10,
    padding: 14,
    color: '#FFFFFF',
    marginBottom: 17
  },
  primary: {
    backgroundColor: '#167BFF',
    padding: 15,
    borderRadius: 10,
    alignItems: 'center',
    marginTop: 5
  },
  secondary: {
    backgroundColor: '#493B88',
    padding: 15,
    borderRadius: 10,
    alignItems: 'center',
    marginTop: 10
  },
  disabled: {
    opacity: 0.55
  },
  buttonText: {
    color: '#FFFFFF',
    fontWeight: 'bold'
  },
  notice: {
    lineHeight: 20,
    marginTop: 15,
    fontSize: 12
  },
  success: {
    color: '#8CE0B4'
  },
  error: {
    color: '#FF8795'
  },
  warningCard: {
    backgroundColor: '#30251B',
    borderColor: '#76552C',
    borderWidth: 1,
    borderRadius: 12,
    padding: 14,
    marginTop: 20
  },
  warningTitle: {
    color: '#FFCF85',
    fontWeight: 'bold',
    marginBottom: 8
  },
  warning: {
    color: '#E6D2B5',
    fontSize: 11,
    lineHeight: 19,
    marginTop: 3
  },
  footer: {
    color: '#71849B',
    textAlign: 'center',
    marginTop: 25,
    fontSize: 11
  }
});
