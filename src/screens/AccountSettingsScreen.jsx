import { Alert } from '../components/Alert';

import React, { useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  Switch,
} from 'react-native';

export default function AccountSettingsScreen({ navigation }) {
  const [privateAccount, setPrivateAccount] = useState(false);
  const [showOnline, setShowOnline] = useState(true);
  const [readReceipts, setReadReceipts] = useState(true);

  const showComingSoon = feature => {
    Alert.alert(
      feature,
      'This setting will be connected to your KONNEKT account later.'
    );
  };

  const openScreen = (screen, fallbackTitle) => {
    try {
      navigation.navigate(screen);
    } catch (error) {
      showComingSoon(fallbackTitle);
    }
  };

  const renderSwitch = (
    title,
    description,
    value,
    onValueChange
  ) => (
    <View style={styles.settingItem}>
      <View style={styles.settingText}>
        <Text style={styles.settingTitle}>{title}</Text>
        <Text style={styles.description}>{description} This control is unavailable until backend enforcement is implemented.</Text>
      </View>

      <Switch
        disabled
        accessibilityLabel={title + ' (unavailable)'}
        value={value}
        onValueChange={onValueChange}
        trackColor={{
          false: '#39244B',
          true: '#00A77C'
        }}
        thumbColor={value ? '#00E5A8' : '#B8C4D4'}
      />
    </View>
  );

  const renderLink = (
    title,
    description,
    onPress = () => showComingSoon(title),
    destructive = false
  ) => (
    <TouchableOpacity
      accessibilityRole="button"
      style={styles.settingItem}
      onPress={onPress}
    >
      <View style={styles.settingText}>
        <Text
          style={[
            styles.settingTitle,
            destructive && styles.destructiveTitle
          ]}
        >
          {title}
        </Text>

        <Text style={styles.description}>
          {description}
        </Text>
      </View>

      <Text
        style={[
          styles.arrow,
          destructive && styles.destructiveTitle
        ]}
      >
        ›
      </Text>
    </TouchableOpacity>
  );

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
    >
      <View style={styles.header}>
        <TouchableOpacity
          accessibilityRole="button"
          onPress={() => navigation.goBack()}
        >
          <Text style={styles.back}>‹ Back</Text>
        </TouchableOpacity>

        <Text style={styles.headerTitle}>
          Account Settings
        </Text>

        <Text style={styles.subtitle}>
          Manage your KONNEKT account and preferences.
        </Text>
      </View>

      <Text style={styles.sectionTitle}>
        Account
      </Text>

      {renderLink(
        'Personal information',
        'Manage your name and username',
        () => openScreen('EditProfile', 'Personal information')
      )}

      {renderLink(
        'Phone number',
        'Manage your registered number',
        () => openScreen('PhoneVerification', 'Phone number')
      )}

      {renderLink(
        'Change password',
        'Keep your account secure',
        () => openScreen('ChangePassword', 'Change password')
      )}

      {renderLink(
        'Two-step verification',
        'Add another layer of account protection',
        () => openScreen(
          'TwoStepVerification',
          'Two-step verification'
        )
      )}

      <Text style={styles.sectionTitle}>
        Privacy
      </Text>

      {renderSwitch(
        'Private account',
        'Approve followers before they see private content',
        privateAccount,
        setPrivateAccount
      )}

      {renderSwitch(
        'Show online status',
        'Let friends see when you are online',
        showOnline,
        setShowOnline
      )}

      {renderSwitch(
        'Read receipts',
        'Let people know when you have read their messages',
        readReceipts,
        setReadReceipts
      )}

      {renderLink(
        'Privacy settings',
        'Manage your privacy preferences',
        () => openScreen('PrivacySettings', 'Privacy settings')
      )}

      <Text style={styles.sectionTitle}>
        Security
      </Text>

      {renderLink(
        'Active sessions',
        'Review devices and sessions connected to your account',
        () => openScreen('ActiveSessions', 'Active sessions')
      )}

      {renderLink(
        'Encryption and key recovery',
        'Manage your encryption key backup and recovery',
        () => openScreen('KeyRecovery', 'Encryption and key recovery')
      )}

      <Text style={styles.sectionTitle}>
        More
      </Text>

      {renderLink(
        'Blocked accounts',
        'Manage people you have blocked',
        () => openScreen('BlockedContacts', 'Blocked accounts')
      )}

      {renderLink(
        'Help and support',
        'Get assistance with KONNEKT',
        () => openScreen('HelpSupport', 'Help and support')
      )}

      {renderLink(
        'Terms and privacy policy',
        'Read our policies',
        () => openScreen('TermsPrivacy', 'Terms and privacy policy')
      )}

      <Text style={styles.sectionTitle}>
        Account management
      </Text>

      {renderLink(
        'Delete account',
        'Submit a request for permanent account deletion',
        () => navigation.navigate('AccountDeletion'),
        true
      )}

      <Text style={styles.deletionNote}>
        Account deletion requests are reviewed before permanent
        deletion. Submitting a request does not immediately
        deactivate or delete your account.
      </Text>

      <Text style={styles.footer}>
        KONNEKT Settings • Version 1.0
      </Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#05030A',
    paddingHorizontal: 20
  },

  content: {
    paddingBottom: 35
  },

  header: {
    marginTop: 25,
    marginBottom: 20
  },

  back: {
    color: '#FFC107',
    fontSize: 16,
    marginBottom: 18
  },

  headerTitle: {
    color: '#FFFFFF',
    fontSize: 30,
    fontWeight: '900'
  },

  subtitle: {
    color: '#BBA9CC',
    fontSize: 12,
    marginTop: 7
  },

  sectionTitle: {
    color: '#FFC107',
    fontSize: 17,
    fontWeight: '900',
    marginTop: 20,
    marginBottom: 12
  },

  settingItem: {
    backgroundColor: '#211232',
    borderWidth: 1,
    borderColor: '#4B3063',
    padding: 16,
    borderRadius: 16,
    marginBottom: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between'
  },

  settingText: {
    flex: 1,
    paddingRight: 12
  },

  settingTitle: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '800'
  },

  description: {
    color: '#BBA9CC',
    fontSize: 12,
    marginTop: 5
  },

  arrow: {
    color: '#FFC107',
    fontSize: 25
  },

  destructiveTitle: {
    color: '#FF8095'
  },

  deletionNote: {
    color: '#BBA9CC',
    fontSize: 11,
    lineHeight: 17,
    marginTop: 3,
    marginBottom: 12,
    paddingHorizontal: 5
  },

  footer: {
    color: '#BBA9CC',
    textAlign: 'center',
    marginVertical: 30,
    fontSize: 12
  }
});
