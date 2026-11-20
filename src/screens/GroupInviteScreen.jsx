import { Alert } from '../components/Alert';

import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Share,
  Clipboard,
} from 'react-native';

export default function GroupInviteScreen({ navigation, route }) {
  const group = route?.params?.group || {
    name: route?.params?.groupName || 'Group',
  };

  const [inviteCode] = useState('');

  // Demo link only. A real invitation link must be generated
  // and validated by the KONNEKT backend.
  const inviteLink = '';

  const copyCode = async () => {
    try {
      await Clipboard.setString(inviteCode);
      Alert.alert('Copied', 'Invitation code copied.');
    } catch (error) {
      Alert.alert('Unable to copy', 'Please try again.');
    }
  };

  const copyLink = async () => {
    try {
      await Clipboard.setString(inviteLink);
      Alert.alert('Copied', 'Invitation link copied.');
    } catch (error) {
      Alert.alert('Unable to copy', 'Please try again.');
    }
  };

  const shareInvite = async () => {
    try {
      await Share.share({
        message:
          `Join my KONNEKT group "${group.name}"!\n\n` +
          `Invitation link: ${inviteLink}\n` +
          `Invitation code: ${inviteCode}`,
      });
    } catch (error) {
      Alert.alert('Sharing failed', 'Please try again.');
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Text style={styles.backButton}>‹</Text>
        </TouchableOpacity>

        <Text style={styles.headerTitle}>Invite to group</Text>
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.iconContainer}>
          <Text style={styles.groupIcon}>👥</Text>
        </View>

        <Text style={styles.title}>Invite people to join</Text>

        <Text style={styles.subtitle}>
          Invite friends to become part of your KONNEKT group.
        </Text>

        <View style={styles.groupCard}>
          <Text style={styles.groupLabel}>GROUP NAME</Text>
          <Text style={styles.groupName}>{group.name}</Text>
        </View>

        <Text style={styles.sectionTitle}>INVITATION CODE</Text>

        <View style={styles.codeCard}>
          <Text style={styles.inviteCode}>{inviteCode}</Text>

          <TouchableOpacity
            style={styles.copyButton}
            onPress={copyCode}
          >
            <Text style={styles.copyButtonText}>Copy code</Text>
          </TouchableOpacity>
        </View>

        <Text style={styles.sectionTitle}>INVITATION LINK</Text>

        <View style={styles.linkCard}>
          <Text style={styles.linkText} numberOfLines={2}>
            {inviteLink}
          </Text>

          <TouchableOpacity
            style={styles.copyLinkButton}
            onPress={copyLink}
          >
            <Text style={styles.copyLinkText}>Copy link</Text>
          </TouchableOpacity>
        </View>

        <TouchableOpacity
          style={styles.shareButton}
          onPress={shareInvite}
        >
          <Text style={styles.shareButtonText}>
            Share invitation
          </Text>
        </TouchableOpacity>

        <View style={styles.notice}>
          <Text style={styles.noticeTitle}>
            Keep your group safe
          </Text>

          <Text style={styles.noticeText}>
            Only share invitations with people you want in your
            group. A real invitation system should support expiry,
            revocation and administrator approval.
          </Text>
        </View>
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
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#6A0DAD',
    paddingHorizontal: 15,
    paddingVertical: 17,
  },
  backButton: {
    color: '#FFFFFF',
    fontSize: 32,
    marginRight: 15,
  },
  headerTitle: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '800',
  },
  content: {
    padding: 20,
    alignItems: 'stretch',
    paddingBottom: 40,
  },
  iconContainer: {
    width: 85,
    height: 85,
    borderRadius: 43,
    backgroundColor: '#D5F5E3',
    alignSelf: 'center',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 15,
  },
  groupIcon: {
    fontSize: 42,
  },
  title: {
    color: '#FAF8FF',
    fontSize: 21,
    fontWeight: '800',
    textAlign: 'center',
    marginTop: 20,
  },
  subtitle: {
    color: '#CBBBD9',
    fontSize: 13,
    lineHeight: 20,
    textAlign: 'center',
    marginTop: 9,
    marginBottom: 25,
  },
  groupCard: {
    backgroundColor: '#181025',
    borderRadius: 13,
    padding: 17,
    borderWidth: 1,
    borderColor: '#E8ECEF',
  },
  groupLabel: {
    color: '#CBBBD9',
    fontSize: 10,
    fontWeight: '800',
  },
  groupName: {
    color: '#075E54',
    fontSize: 17,
    fontWeight: '800',
    marginTop: 8,
  },
  sectionTitle: {
    color: '#CBBBD9',
    fontSize: 11,
    fontWeight: '800',
    marginTop: 25,
    marginBottom: 9,
  },
  codeCard: {
    backgroundColor: '#181025',
    borderRadius: 13,
    padding: 16,
    borderWidth: 1,
    borderColor: '#E8ECEF',
    alignItems: 'center',
  },
  inviteCode: {
    color: '#075E54',
    fontSize: 23,
    fontWeight: '800',
    letterSpacing: 2,
    marginBottom: 15,
  },
  copyButton: {
    backgroundColor: '#E5F4EC',
    paddingHorizontal: 22,
    paddingVertical: 10,
    borderRadius: 20,
  },
  copyButtonText: {
    color: '#075E54',
    fontWeight: '800',
    fontSize: 12,
  },
  linkCard: {
    backgroundColor: '#181025',
    borderRadius: 13,
    padding: 15,
    borderWidth: 1,
    borderColor: '#E8ECEF',
  },
  linkText: {
    color: '#475467',
    fontSize: 12,
    lineHeight: 19,
  },
  copyLinkButton: {
    backgroundColor: '#E5F4EC',
    padding: 11,
    borderRadius: 9,
    alignItems: 'center',
    marginTop: 13,
  },
  copyLinkText: {
    color: '#075E54',
    fontWeight: '800',
    fontSize: 12,
  },
  shareButton: {
    backgroundColor: '#6A0DAD',
    padding: 16,
    borderRadius: 12,
    alignItems: 'center',
    marginTop: 25,
  },
  shareButtonText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '800',
  },
  notice: {
    backgroundColor: '#FFF7E6',
    borderRadius: 12,
    padding: 15,
    marginTop: 22,
  },
  noticeTitle: {
    color: '#8A5A00',
    fontWeight: '800',
    fontSize: 13,
  },
  noticeText: {
    color: '#765B2A',
    fontSize: 11,
    lineHeight: 18,
    marginTop: 6,
  },
});
