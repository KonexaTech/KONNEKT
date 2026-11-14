
import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
} from 'react-native';

import { supabase } from '../lib_supabase';
import { useAuth } from '../AuthContext';

export default function PasswordResetScreen({ navigation }) {
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const { setRecovery } = useAuth();

  const update = async () => {
    setError('');
    setSuccess('');

    if (password.length < 8) {
      setError('Use a password with at least 8 characters.');
      return;
    }

    if (password !== confirm) {
      setError('The passwords do not match.');
      return;
    }

    setBusy(true);

    try {
      const { error: updateError } =
        await supabase.auth.updateUser({ password });

      if (updateError) {
        setError(updateError.message);
        return;
      }

      setSuccess(
        'Your password has been updated successfully.'
      );

      setRecovery(false);
      navigation.replace('Chats');
    } catch (err) {
      setError(
        err?.message || 'Could not update your password.'
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={styles.page}>
      <Text style={styles.logo}>KONNEKT</Text>

      <Text style={styles.title}>
        Choose a new password
      </Text>

      <Text style={styles.sub}>
        Enter and confirm your new account password.
      </Text>

      <TextInput
        style={styles.input}
        placeholder="New password"
        placeholderTextColor="#BBA9CC"
        secureTextEntry
        value={password}
        onChangeText={setPassword}
        autoComplete="new-password"
      />

      <TextInput
        style={styles.input}
        placeholder="Confirm new password"
        placeholderTextColor="#BBA9CC"
        secureTextEntry
        value={confirm}
        onChangeText={setConfirm}
        autoComplete="new-password"
      />

      {!!error && (
        <Text style={styles.error}>{error}</Text>
      )}

      {!!success && (
        <Text style={styles.success}>{success}</Text>
      )}

      <TouchableOpacity
        style={[
          styles.button,
          busy && styles.disabledButton,
        ]}
        onPress={update}
        disabled={busy}
        accessibilityRole="button"
      >
        {busy ? (
          <ActivityIndicator color="#FFFFFF" />
        ) : (
          <Text style={styles.buttonText}>
            UPDATE PASSWORD
          </Text>
        )}
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  page: {
    flex: 1,
    justifyContent: 'center',
    backgroundColor: '#10091B',
    padding: 24,
  },
  logo: {
    color: '#6A0DAD',
    fontSize: 29,
    fontWeight: 'bold',
    letterSpacing: 3,
    textAlign: 'center',
    marginBottom: 35,
  },
  title: {
    color: '#FFFFFF',
    fontSize: 25,
    fontWeight: 'bold',
    marginBottom: 10,
  },
  sub: {
    color: '#B8C4D4',
    marginBottom: 25,
  },
  input: {
    backgroundColor: '#241630',
    borderColor: '#39244B',
    borderWidth: 1,
    borderRadius: 12,
    padding: 16,
    color: '#FFFFFF',
    marginBottom: 14,
  },
  button: {
    backgroundColor: '#6A0DAD',
    padding: 17,
    borderRadius: 12,
    alignItems: 'center',
    marginTop: 10,
  },
  disabledButton: {
    opacity: 0.6,
  },
  buttonText: {
    color: '#FFFFFF',
    fontWeight: 'bold',
  },
  error: {
    color: '#FF8795',
    marginBottom: 10,
  },
  success: {
    color: '#54D6A2',
    marginBottom: 10,
  },
});
