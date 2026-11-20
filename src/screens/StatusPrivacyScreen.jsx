import { Alert } from '../components/Alert';

import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
} from 'react-native';

export default function StatusPrivacyScreen({ navigation, route }) {
  const [privacy, setPrivacy] = useState('everyone');

  const [excludedContacts, setExcludedContacts] = useState([]);

  const options = [
    {
      id: 'contacts',
      title: 'My Contacts',
      description: 'All your contacts can see your status.',
    },
    {
      id: 'except',
      title: 'My Contacts Except...',
      description: 'Choose contacts who cannot see your status.',
    },
    {
      id: 'only',
      title: 'Only Share With...',
      description: 'Choose specific contacts who can see your status.',
    },
  ];

  const sampleContacts = route?.params?.contacts || [];

  const toggleContact = (id) => {
    setExcludedContacts((previous) =>
      previous.includes(id)
        ? previous.filter((contactId) => contactId !== id)
        : [...previous, id]
    );
  };

  const savePrivacy = () => Alert.alert('Audience restrictions unavailable', 'Active statuses are visible to signed-in members. Contact-only audiences are not enforced yet.');

  return (
    <ScrollView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Text style={styles.backButton}>‹ Back</Text>
        </TouchableOpacity>

        <Text style={styles.headerTitle}>Status Privacy</Text>
      </View>

      <Text style={styles.heading}>Who can see my status?</Text>

      <Text style={styles.description}>
        Active statuses are visible to signed-in members. Restricted audiences are
        unavailable. Uploaded media uses public links; list expiry does not revoke them.
      </Text>

      {options.map((option) => (
        <TouchableOpacity
          key={option.id}
          style={styles.option}
          disabled
          onPress={() => setPrivacy(option.id)}
        >
          <View style={styles.optionText}>
            <Text style={styles.optionTitle}>{option.title}</Text>
            <Text style={styles.optionDescription}>
              {option.description}
            </Text>
          </View>

          <View style={styles.radioOuter}>
            {privacy === option.id && (
              <View style={styles.radioInner} />
            )}
          </View>
        </TouchableOpacity>
      ))}

      {['except', 'only'].includes(privacy) && (
        <View style={styles.contactsSection}>
          <Text style={styles.contactsHeading}>
            {privacy === 'except'
              ? 'Exclude contacts'
              : 'Share with selected contacts'}
          </Text>

          {sampleContacts.map((contact) => {
            const selected = excludedContacts.includes(contact.id);

            return (
              <TouchableOpacity
                key={contact.id}
                style={styles.contactRow}
                onPress={() => toggleContact(contact.id)}
              >
                <Text style={styles.contactName}>
                  {contact.name}
                </Text>

                <View
                  style={[
                    styles.checkbox,
                    selected && styles.checkboxSelected,
                  ]}
                >
                  {selected && (
                    <Text style={styles.checkmark}>✓</Text>
                  )}
                </View>
              </TouchableOpacity>
            );
          })}
        </View>
      )}

      <TouchableOpacity
        style={styles.saveButton}
        onPress={savePrivacy}
      >
        <Text style={styles.saveButtonText}>
          Audience restrictions unavailable
        </Text>
      </TouchableOpacity>

      <Text style={styles.footer}>
        Privacy changes will only take effect once account
        settings are connected to the KONNEKT backend.
      </Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F5F7F8',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 18,
    backgroundColor: '#181025',
  },
  backButton: {
    color: '#075E54',
    fontSize: 16,
    fontWeight: '800',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '800',
    marginLeft: 25,
    color: '#FAF8FF',
  },
  heading: {
    fontSize: 21,
    fontWeight: '800',
    color: '#FAF8FF',
    marginHorizontal: 18,
    marginTop: 25,
  },
  description: {
    color: '#CBBBD9',
    fontSize: 14,
    lineHeight: 21,
    margin: 18,
  },
  option: {
    backgroundColor: '#181025',
    marginHorizontal: 16,
    marginBottom: 10,
    padding: 16,
    borderRadius: 12,
    flexDirection: 'row',
    alignItems: 'center',
  },
  optionText: {
    flex: 1,
    paddingRight: 12,
  },
  optionTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: '#FAF8FF',
  },
  optionDescription: {
    fontSize: 12,
    color: '#CBBBD9',
    marginTop: 5,
    lineHeight: 17,
  },
  radioOuter: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    borderColor: '#075E54',
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioInner: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: '#6A0DAD',
  },
  contactsSection: {
    margin: 16,
    padding: 14,
    backgroundColor: '#181025',
    borderRadius: 12,
  },
  contactsHeading: {
    fontSize: 15,
    fontWeight: '800',
    marginBottom: 12,
    color: '#FAF8FF',
  },
  contactRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 13,
    borderBottomWidth: 1,
    borderBottomColor: '#EEEEEE',
  },
  contactName: {
    fontSize: 14,
    color: '#FAF8FF',
  },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 5,
    borderWidth: 1.5,
    borderColor: '#075E54',
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxSelected: {
    backgroundColor: '#6A0DAD',
  },
  checkmark: {
    color: '#FFFFFF',
    fontWeight: '800',
  },
  saveButton: {
    backgroundColor: '#6A0DAD',
    margin: 18,
    padding: 16,
    borderRadius: 12,
    alignItems: 'center',
  },
  saveButtonText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '800',
  },
  footer: {
    color: '#CBBBD9',
    fontSize: 11,
    textAlign: 'center',
    marginHorizontal: 20,
    marginBottom: 25,
    lineHeight: 17,
  },
});
