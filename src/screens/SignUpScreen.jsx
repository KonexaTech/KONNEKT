
import React, { useState } from 'react';
import {
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
} from 'react-native';

import { supabase } from '../lib_supabase';

export default function SignUpScreen({ navigation }) {
  const [fullName, setFullName] = useState('');
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');

  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const register = async () => {
    setError('');
    setMessage('');

    const cleanName = fullName.trim();
    const cleanUsername = username.trim().toLowerCase();
    const cleanEmail = email.trim().toLowerCase();
    const cleanPhone = phone.trim();

    if (
      !cleanName ||
      !cleanUsername ||
      !cleanEmail ||
      !password ||
      !confirm
    ) {
      setError(
        'Complete your name, username, email and password fields.'
      );
      return;
    }

    if (!/^[a-zA-Z0-9_.]{3,20}$/.test(cleanUsername)) {
      setError(
        'Username must be 3–20 characters and use letters, numbers, dots or underscores.'
      );
      return;
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
      setError('Enter a valid email address.');
      return;
    }

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
      const redirectTo =
        typeof window !== 'undefined'
          ? window.location.origin + window.location.pathname
          : undefined;

      const { data, error: signupError } =
        await supabase.auth.signUp({
          email: cleanEmail,
          password,
          options: {
            ...(redirectTo
              ? { emailRedirectTo: redirectTo }
              : {}),
            data: {
              full_name: cleanName,
              username: cleanUsername,
              phone: cleanPhone,
            },
          },
        });

      if (signupError) {
        setError(signupError.message);
        return;
      }

      if (data?.session) {
        navigation.replace('Reels');
      } else {
        setMessage(
          'Account created. Check your email and confirm your address before logging in.'
        );
      }
    } catch (err) {
      setError(
        err?.message || 'Registration failed. Please try again.'
      );
    } finally {
      setBusy(false);
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
      <Text style={styles.title}>Create your account</Text>
      <Text style={styles.sub}>
        Join people, conversations and creativity worldwide.
      </Text>

      <TextInput
        style={styles.input}
        placeholder="Full name"
        placeholderTextColor="#BBA9CC"
        value={fullName}
        onChangeText={setFullName}
        autoCapitalize="words"
      />

      <TextInput
        style={styles.input}
        placeholder="Username (3–20 characters)"
        placeholderTextColor="#BBA9CC"
        value={username}
        onChangeText={setUsername}
        autoCapitalize="none"
        autoCorrect={false}
      />

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
        placeholder="Phone number (optional)"
        placeholderTextColor="#BBA9CC"
        value={phone}
        onChangeText={setPhone}
        keyboardType="phone-pad"
      />

      <TextInput
        style={styles.input}
        placeholder="Create password (at least 8 characters)"
        placeholderTextColor="#BBA9CC"
        value={password}
        onChangeText={setPassword}
        secureTextEntry
        autoComplete="new-password"
      />

      <TextInput
        style={styles.input}
        placeholder="Confirm password"
        placeholderTextColor="#BBA9CC"
        value={confirm}
        onChangeText={setConfirm}
        secureTextEntry
        autoComplete="new-password"
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
        onPress={register}
        disabled={busy}
        accessibilityRole="button"
      >
        {busy ? (
          <ActivityIndicator color="#FFFFFF" />
        ) : (
          <Text style={styles.buttonText}>
            CREATE ACCOUNT
          </Text>
        )}
      </TouchableOpacity>

      <Text style={styles.note}>
        Your email is used for account sign-in and recovery.
        Your phone number is saved as optional profile information.
      </Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  page: {
    flexGrow: 1,
    justifyContent: 'center',
    backgroundColor: '#05030A',
    padding: 25,
  },
  back: {
    color: '#00E6FF',
    fontSize: 16,
    marginBottom: 30,
  },
  logo: {
    color: '#6A0DAD',
    fontSize: 32,
    fontWeight: '900',
    letterSpacing: 3,
    textAlign: 'center',
    marginBottom: 35,
  },
  title: {
    color: '#FFFFFF',
    fontSize: 30,
    fontWeight: '900',
    marginBottom: 10,
  },
  sub: {
    color: '#CBBBD9',
    fontSize: 13,
    marginBottom: 25,
  },
  input: {
    backgroundColor: '#211232',
    borderColor: '#68408A',
    borderWidth: 1,
    borderRadius: 16,
    padding: 16,
    color: '#FFFFFF',
    marginBottom: 14,
    fontSize: 15,
  },
  button: {
    backgroundColor: '#6A0DAD',
    borderWidth: 1,
    borderColor: '#FFC107',
    padding: 17,
    borderRadius: 18,
    alignItems: 'center',
    marginTop: 8,
  },
  disabledButton: {
    opacity: 0.6,
  },
  buttonText: {
    color: '#FFFFFF',
    fontWeight: '900',
    fontSize: 15,
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
    marginTop: 24,
    lineHeight: 18,
  },
});
