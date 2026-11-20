import { Alert } from '../components/Alert';

import React, { useState, useEffect } from 'react';
import { useAuth } from '../AuthContext';
import { syncPushPreferences } from '../pushNotifications';
import { notificationPreferenceKey,readPushPreferences } from '../services/pushRegistration';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Switch,
  TouchableOpacity,
} from 'react-native';

const initialSettings = [
  { id: 'messages', title: 'Messages', description: 'New messages and group activity.', value: true },
  { id: 'calls', title: 'Calls', description: 'Incoming voice and video calls.', value: true },
  { id: 'social', title: 'Social activity', description: 'Follows, likes and comments.', value: true },
  { id: 'security', title: 'Security alerts', description: 'Important account and sign-in alerts.', value: true },
];

function settingsFor(userId) {
  let flags;
  try{flags=readPushPreferences(globalThis.localStorage,userId);}catch{flags=readPushPreferences(null,userId);}
  return initialSettings.map(item=>({...item,value:flags[item.id]}));
}

export default function NotificationSettingsScreen({ navigation }) {
  const {user}=useAuth();
  const [settings, setSettings] = useState(()=>settingsFor(user?.id));
  const [saving,setSaving]=useState(false);

  useEffect(() => {
    setSettings(settingsFor(user?.id));
  }, [user?.id]);

  const updateSetting = (id, value) => {
    setSettings((previous) =>
      previous.map((item) =>
        item.id === id ? { ...item, value } : item
      )
    );
  };

  const enableAll = () => {
    setSettings((previous) =>
      previous.map((item) => ({ ...item, value: true }))
    );
  };

  const disableNonEssential = () => {
    setSettings((previous) =>
      previous.map((item) => ({
        ...item,
        value: item.id === 'security',
      }))
    );
  };

  const saveSettings = async () => {
    if(!user?.id||saving)return;
    setSaving(true);
    try {
      globalThis.localStorage.setItem(notificationPreferenceKey(user.id),JSON.stringify({settings}));
      await syncPushPreferences(user.id);
      Alert.alert('Settings saved','Your background notification choices have been saved for this account on this device. Android permission and service availability still control delivery.');
    } catch {Alert.alert('Settings need syncing','Your choices may be saved on this device, but background delivery has not been updated. Reconnect and save again.');}
    finally{setSaving(false);}
  };

  const renderToggle = (title, description, value, onChange) => (
    <View style={styles.settingRow}>
      <View style={styles.settingInfo}>
        <Text style={styles.settingTitle}>{title}</Text>
        <Text style={styles.settingDescription}>
          {description}
        </Text>
      </View>

      <Switch
        accessibilityLabel={title}
        value={value}
        onValueChange={onChange}
        trackColor={{ false: '#D0D5DD', true: '#8CCFC0' }}
        thumbColor={value ? '#075E54' : '#FFFFFF'}
      />
    </View>
  );

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Text style={styles.back}>‹</Text>
        </TouchableOpacity>

        <Text style={styles.headerTitle}>
          Notification settings
        </Text>

        <Text style={styles.headerIcon}>🔔</Text>
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.introCard}>
          <Text style={styles.introIcon}>🔔</Text>
          <Text style={styles.introTitle}>
            Your notifications, your choice
          </Text>
          <Text style={styles.introDescription}>
            Choose which background notifications this account can receive on this device.
          </Text>
        </View>

        <View style={styles.quickActions}>
          <TouchableOpacity
            style={styles.quickButton}
            onPress={enableAll}
          >
            <Text style={styles.quickButtonText}>
              Enable all
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.quickButton}
            onPress={disableNonEssential}
          >
            <Text style={styles.quickButtonText}>
              Essential only
            </Text>
          </TouchableOpacity>
        </View>

        <Text style={styles.sectionTitle}>
          NOTIFICATION TYPES
        </Text>

        <View style={styles.card}>
          {settings.map((item, index) => (
            <View key={item.id}>
              {renderToggle(
                item.title,
                item.description,
                item.value,
                (value) => updateSetting(item.id, value)
              )}

              {index !== settings.length - 1 && (
                <View style={styles.divider} />
              )}
            </View>
          ))}
        </View>

        <Text style={styles.sectionTitle}>
          NOTIFICATION BEHAVIOUR
        </Text>

        <View style={styles.card}>
          <Text style={[styles.settingDescription,{paddingVertical:16}]}>
            Android notification settings control sound and vibration. Push notifications never contain your private message text.
          </Text>
        </View>

        <View style={styles.infoCard}>
          <Text style={styles.infoTitle}>
            Important security notifications
          </Text>
          <Text style={styles.infoText}>
            Account security alerts should remain enabled to help
            you notice suspicious login activity.
          </Text>
        </View>

        <TouchableOpacity
          style={styles.saveButton}
          onPress={saveSettings}
          disabled={saving||!user?.id}
        >
          <Text style={styles.saveButtonText}>
            {saving?'Saving…':'Save notification settings'}
          </Text>
        </TouchableOpacity>

        <Text style={styles.demoNote}>
          Preferences are separate for each account. Background push requires the Android app, notification-service setup and device permission.
        </Text>
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
    fontSize: 16,
    fontWeight: '800',
    flex: 1,
  },
  headerIcon: {
    fontSize: 22,
  },
  content: {
    padding: 16,
    paddingBottom: 35,
  },
  introCard: {
    backgroundColor: '#E8F4F1',
    borderRadius: 14,
    padding: 20,
    alignItems: 'center',
    marginBottom: 17,
  },
  introIcon: {
    fontSize: 38,
    marginBottom: 9,
  },
  introTitle: {
    color: '#075E54',
    fontSize: 15,
    fontWeight: '800',
  },
  introDescription: {
    color: '#526B67',
    fontSize: 11,
    marginTop: 7,
    textAlign: 'center',
  },
  quickActions: {
    flexDirection: 'row',
    marginBottom: 20,
  },
  quickButton: {
    flex: 1,
    backgroundColor: '#181025',
    borderWidth: 1,
    borderColor: '#D0E5DF',
    borderRadius: 9,
    padding: 12,
    alignItems: 'center',
    marginHorizontal: 4,
  },
  quickButtonText: {
    color: '#075E54',
    fontSize: 11,
    fontWeight: '800',
  },
  sectionTitle: {
    color: '#CBBBD9',
    fontSize: 10,
    fontWeight: '800',
    marginBottom: 10,
    marginTop: 8,
  },
  card: {
    backgroundColor: '#181025',
    borderRadius: 12,
    paddingHorizontal: 14,
    marginBottom: 18,
    borderWidth: 1,
    borderColor: '#E8ECEF',
  },
  settingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 13,
  },
  settingInfo: {
    flex: 1,
    paddingRight: 12,
  },
  settingTitle: {
    color: '#FAF8FF',
    fontSize: 12,
    fontWeight: '800',
  },
  settingDescription: {
    color: '#98A2B3',
    fontSize: 10,
    marginTop: 4,
    lineHeight: 15,
  },
  divider: {
    height: 1,
    backgroundColor: '#F0F2F4',
  },
  infoCard: {
    backgroundColor: '#FFF4E5',
    borderRadius: 11,
    padding: 14,
  },
  infoTitle: {
    color: '#9A5B00',
    fontSize: 12,
    fontWeight: '800',
    marginBottom: 6,
  },
  infoText: {
    color: '#805000',
    fontSize: 11,
    lineHeight: 18,
  },
  saveButton: {
    backgroundColor: '#6A0DAD',
    padding: 16,
    borderRadius: 11,
    alignItems: 'center',
    marginTop: 20,
  },
  saveButtonText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '800',
  },
  demoNote: {
    color: '#98A2B3',
    fontSize: 10,
    lineHeight: 16,
    textAlign: 'center',
    marginTop: 15,
  },
});
