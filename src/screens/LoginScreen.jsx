
import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
} from 'react-native';

import { supabase } from '../lib_supabase';

export default function LoginScreen({ navigation }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [resetBusy, setResetBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  const login = async () => {
    setError('');
    setMessage('');

    const cleanEmail = email.trim().toLowerCase();

    if (!cleanEmail || !password) {
      setError('Enter your email address and password.');
      return;
    }

    setBusy(true);

    try {
      const { error: authError } =
        await supabase.auth.signInWithPassword({
          email: cleanEmail,
          password,
        });

      if (authError) {
        setError(authError.message);
        return;
      }

      navigation.replace('Reels');
    } catch (err) {
      setError(
        err?.message || 'Login failed. Please try again.'
      );
    } finally {
      setBusy(false);
    }
  };

  const resetPassword = async () => {
    setError('');
    setMessage('');

    const cleanEmail = email.trim().toLowerCase();

    if (!cleanEmail) {
      setError('Enter your email address first.');
      return;
    }

    setResetBusy(true);

    try {
      const redirectTo =
        typeof window !== 'undefined'
          ? window.location.origin + window.location.pathname
          : undefined;

      const { error: resetError } =
        await supabase.auth.resetPasswordForEmail(
          cleanEmail,
          redirectTo ? { redirectTo } : undefined
        );

      if (resetError) {
        setError(resetError.message);
      } else {
        setMessage(
          'Password reset instructions have been sent. Check your email.'
        );
      }
    } catch (err) {
      setError(
        err?.message || 'Could not send the reset email.'
      );
    } finally {
      setResetBusy(false);
    }
  };

  return (
    <ScrollView
      contentContainerStyle={styles.page}
      keyboardShouldPersistTaps="handled"
    >
      <TouchableOpacity
        onPress={() => navigation.goBack()}
        accessibilityRole="button"
      >
        <Text style={styles.back}>‹ Back</Text>
      </TouchableOpacity>

      <Text style={styles.logo}>KONNEKT</Text>
      <Text style={styles.title}>Welcome back</Text>
      <Text style={styles.sub}>
        Log in and reconnect with your people.
      </Text>

      <TextInput
        style={styles.input}
        placeholder="Email address"
        placeholderTextColor="#BBA9CC"
        value={email}
        onChangeText={setEmail}
        autoCapitalize="none"
        autoCorrect={false}
        keyboardType="email-address"
        autoComplete="email"
      />

      <TextInput
        style={styles.input}
        placeholder="Password"
        placeholderTextColor="#BBA9CC"
        value={password}
        onChangeText={setPassword}
        secureTextEntry
        autoComplete="current-password"
      />

      {!!error && (
        <Text style={styles.error}>{error}</Text>
      )}

      {!!message && (
        <Text style={styles.success}>{message}</Text>
      )}

      <TouchableOpacity
        style={[
          styles.button,
          busy && styles.disabledButton,
        ]}
        onPress={login}
        disabled={busy || resetBusy}
        accessibilityRole="button"
      >
        {busy ? (
          <ActivityIndicator color="#FFFFFF" />
        ) : (
          <Text style={styles.buttonText}>LOG IN</Text>
        )}
      </TouchableOpacity>

      <TouchableOpacity
        onPress={resetPassword}
        disabled={resetBusy || busy}
        accessibilityRole="button"
      >
        {resetBusy ? (
          <ActivityIndicator
            color="#00E6FF"
            style={styles.link}
          />
        ) : (
          <Text style={styles.link}>Forgot password?</Text>
        )}
      </TouchableOpacity>

      <TouchableOpacity
        onPress={() => navigation.navigate('SignUp')}
        accessibilityRole="button"
      >
        <Text style={styles.link}>Create a new account</Text>
      </TouchableOpacity>

      <Text style={styles.note}>
        Your account is protected by Supabase authentication.
        Password recovery is sent to your registered email address.
      </Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  page: {
    flexGrow: 1,
    justifyContent: 'center',
    backgroundColor: '#10091B',
    padding: 25,
  },
  back: {
    color: '#00E6FF',
    fontSize: 16,
    marginBottom: 30,
  },
  logo: {
    color: '#6A0DAD',
    fontSize: 30,
    fontWeight: 'bold',
    letterSpacing: 3,
    textAlign: 'center',
    marginBottom: 35,
  },
  title: {
    color: '#FFFFFF',
    fontSize: 28,
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
    fontSize: 15,
  },
  button: {
    backgroundColor: '#6A0DAD',
    padding: 17,
    borderRadius: 12,
    alignItems: 'center',
    marginTop: 8,
  },
  disabledButton: {
    opacity: 0.6,
  },
  buttonText: {
    color: '#FFFFFF',
    fontWeight: 'bold',
  },
  link: {
    color: '#00E6FF',
    textAlign: 'center',
    marginTop: 22,
    fontWeight: '600',
  },
  error: {
    color: '#FF8795',
    marginBottom: 12,
  },
  success: {
    color: '#54D6A2',
    marginBottom: 12,
  },
  note: {
    color: '#A5A0B4',
    fontSize: 12,
    textAlign: 'center',
    marginTop: 28,
    lineHeight: 18,
  },
});
