import { Alert } from '../components/Alert';

import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TextInput,
  TouchableOpacity,
} from 'react-native';

import { verifyCurrentPassword } from '../services/verifyCurrentPassword';
import { supabase } from '../lib_supabase';
import { useAuth } from '../AuthContext';

export default function ChangePasswordScreen({ navigation }) {
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  const { user } = useAuth();
  const [busy, setBusy] = useState(false);

  const changePassword = async () => {
    if (busy) return;
    if (!currentPassword || !newPassword || !confirmPassword) {
      Alert.alert(
        'Missing information',
        'Please complete all three password fields.'
      );
      return;
    }

    if (newPassword.length < 8) {
      Alert.alert(
        'Weak password',
        'Your new password must contain at least 8 characters.'
      );
      return;
    }

    if (newPassword === currentPassword) {
      Alert.alert(
        'Choose another password',
        'Your new password must be different from your current password.'
      );
      return;
    }

    if (newPassword !== confirmPassword) {
      Alert.alert(
        'Passwords do not match',
        'Please make sure your new passwords match.'
      );
      return;
    }

    setBusy(true);
    try {
      if (!user?.email) throw new Error('Sign in again before changing your password.');
      const { error: authError } = await verifyCurrentPassword({ email: user.email, password: currentPassword });
      if (authError) throw authError;
      const { error } = await supabase.auth.updateUser({ password: newPassword });
      if (error) throw error;
      setCurrentPassword(''); setNewPassword(''); setConfirmPassword('');
      Alert.alert('Password changed', 'Your account password has been updated.');
    } catch (error) {
      Alert.alert('Password not changed', error.message || 'Please try again.');
    } finally { setBusy(false); }
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Text style={styles.back}>‹</Text>
        </TouchableOpacity>

        <Text style={styles.headerTitle}>Change password</Text>
        <Text style={styles.lock}>🔐</Text>
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.iconContainer}>
          <Text style={styles.bigLock}>🔒</Text>
        </View>

        <Text style={styles.heading}>
          Update your password
        </Text>

        <Text style={styles.description}>
          Choose a strong password to help protect your KONNEKT account.
        </Text>

        <Text style={styles.label}>CURRENT PASSWORD</Text>

        <View style={styles.passwordBox}>
          <TextInput
            style={styles.input}
            placeholder="Enter current password"
            placeholderTextColor="#98A2B3"
            secureTextEntry={!showCurrent}
            value={currentPassword}
            onChangeText={setCurrentPassword}
            autoCapitalize="none"
          />

          <TouchableOpacity
            onPress={() => setShowCurrent(!showCurrent)}
          >
            <Text style={styles.showText}>
              {showCurrent ? 'Hide' : 'Show'}
            </Text>
          </TouchableOpacity>
        </View>

        <Text style={styles.label}>NEW PASSWORD</Text>

        <View style={styles.passwordBox}>
          <TextInput
            style={styles.input}
            placeholder="Enter new password"
            placeholderTextColor="#98A2B3"
            secureTextEntry={!showNew}
            value={newPassword}
            onChangeText={setNewPassword}
            autoCapitalize="none"
          />

          <TouchableOpacity
            onPress={() => setShowNew(!showNew)}
          >
            <Text style={styles.showText}>
              {showNew ? 'Hide' : 'Show'}
            </Text>
          </TouchableOpacity>
        </View>

        <Text style={styles.label}>CONFIRM NEW PASSWORD</Text>

        <View style={styles.passwordBox}>
          <TextInput
            style={styles.input}
            placeholder="Confirm new password"
            placeholderTextColor="#98A2B3"
            secureTextEntry={!showConfirm}
            value={confirmPassword}
            onChangeText={setConfirmPassword}
            autoCapitalize="none"
          />

          <TouchableOpacity
            onPress={() => setShowConfirm(!showConfirm)}
          >
            <Text style={styles.showText}>
              {showConfirm ? 'Hide' : 'Show'}
            </Text>
          </TouchableOpacity>
        </View>

        <View style={styles.tipsCard}>
          <Text style={styles.tipsTitle}>
            Password safety tips
          </Text>

          <Text style={styles.tip}>
            ✓ Use at least 8 characters.
          </Text>

          <Text style={styles.tip}>
            ✓ Combine letters, numbers and symbols.
          </Text>

          <Text style={styles.tip}>
            ✓ Avoid using your name or phone number.
          </Text>

          <Text style={styles.tip}>
            ✓ Never share your password with anyone.
          </Text>
        </View>

        <TouchableOpacity
          style={styles.saveButton}
          onPress={changePassword}
          disabled={busy}
        >
          <Text style={styles.saveButtonText}>
            Update password
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.forgotButton}
          onPress={() => {
            Alert.alert(
              'Password recovery',
              'Password recovery will be available once KONNEKT phone verification and backend authentication are connected.'
            );
          }}
        >
          <Text style={styles.forgotText}>
            Forgot your current password?
          </Text>
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#05030A',
  },
  header: {
    backgroundColor: '#6A0DAD',
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
  },
  back: {
    color: '#FFFFFF',
    fontSize: 32,
    marginRight: 15,
  },
  headerTitle: {
    color: '#FFFFFF',
    fontSize: 17,
    fontWeight: '800',
    flex: 1,
  },
  lock: {
    fontSize: 22,
  },
  content: {
    padding: 18,
    paddingBottom: 35,
  },
  iconContainer: {
    alignItems: 'center',
    marginTop: 15,
  },
  bigLock: {
    fontSize: 58,
  },
  heading: {
    color: '#FAF8FF',
    fontSize: 20,
    fontWeight: '800',
    textAlign: 'center',
    marginTop: 12,
  },
  description: {
    color: '#CBBBD9',
    fontSize: 12,
    lineHeight: 19,
    textAlign: 'center',
    marginTop: 8,
    marginBottom: 25,
  },
  label: {
    color: '#CBBBD9',
    fontSize: 10,
    fontWeight: '800',
    marginBottom: 8,
    marginTop: 12,
  },
  passwordBox: {
    backgroundColor: '#181025',
    borderWidth: 1,
    borderColor: '#E4E7EC',
    borderRadius: 11,
    paddingHorizontal: 13,
    flexDirection: 'row',
    alignItems: 'center',
  },
  input: {
    flex: 1,
    paddingVertical: 15,
    color: '#FAF8FF',
    fontSize: 13,
  },
  showText: {
    color: '#075E54',
    fontSize: 11,
    fontWeight: '800',
    padding: 8,
  },
  tipsCard: {
    backgroundColor: '#EAF2F1',
    padding: 15,
    borderRadius: 12,
    marginTop: 22,
  },
  tipsTitle: {
    color: '#075E54',
    fontSize: 12,
    fontWeight: '800',
    marginBottom: 10,
  },
  tip: {
    color: '#526B67',
    fontSize: 11,
    lineHeight: 20,
  },
  saveButton: {
    backgroundColor: '#6A0DAD',
    padding: 16,
    borderRadius: 12,
    alignItems: 'center',
    marginTop: 25,
  },
  saveButtonText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '800',
  },
  forgotButton: {
    alignItems: 'center',
    padding: 16,
  },
  forgotText: {
    color: '#075E54',
    fontSize: 11,
    fontWeight: '800',
  },
});
