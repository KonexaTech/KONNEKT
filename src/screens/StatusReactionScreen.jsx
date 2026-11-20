import { Alert } from '../components/Alert';

import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  ScrollView,
} from 'react-native';

const reactions = ['❤️', '😂', '😍', '🔥', '👏', '😮', '😢', '👍'];

export default function StatusReactionScreen({ navigation, route }) {
  const status = route?.params?.status || {
    author: 'KONNEKT User',
    text: 'Enjoying my day!',
  };

  const [selectedReaction, setSelectedReaction] = useState(null);
  const [reply, setReply] = useState('');

  const sendReaction = (reaction) => {
    setSelectedReaction(reaction);

    if (route?.params?.onReact) {
      route.params.onReact(reaction, status);
    }

    Alert.alert(
      'KONNEKT',
      `You reacted ${reaction} to ${status.author}'s status.`
    );
  };

  const sendReply = () => {
    const message = reply.trim();

    if (!message) {
      Alert.alert('Empty reply', 'Please type a message first.');
      return;
    }

    if (route?.params?.onReply) {
      route.params.onReply(message, status);
    }

    Alert.alert(
      'Reply prepared',
      'Your status reply is ready. Messaging integration will be added later.'
    );

    setReply('');
  };

  return (
    <ScrollView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Text style={styles.backButton}>‹ Back</Text>
        </TouchableOpacity>

        <Text style={styles.title}>React to Status</Text>
      </View>

      <View style={styles.statusCard}>
        <Text style={styles.author}>
          {status.author || 'KONNEKT User'}
        </Text>

        <Text style={styles.statusText}>
          {status.text || 'Status update'}
        </Text>
      </View>

      <Text style={styles.sectionTitle}>
        Send a reaction
      </Text>

      <View style={styles.reactionGrid}>
        {reactions.map((reaction) => (
          <TouchableOpacity
            key={reaction}
            style={[
              styles.reactionButton,
              selectedReaction === reaction && styles.selectedReaction,
            ]}
            onPress={() => sendReaction(reaction)}
          >
            <Text style={styles.reactionEmoji}>
              {reaction}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <Text style={styles.sectionTitle}>
        Reply to status
      </Text>

      <View style={styles.replyContainer}>
        <TextInput
          style={styles.replyInput}
          placeholder="Write a reply..."
          placeholderTextColor="#888888"
          value={reply}
          onChangeText={setReply}
          multiline
          maxLength={500}
        />

        <TouchableOpacity
          style={styles.sendButton}
          onPress={sendReply}
        >
          <Text style={styles.sendButtonText}>Send</Text>
        </TouchableOpacity>
      </View>

      <Text style={styles.note}>
        Reactions and replies are currently demo interactions.
        Real delivery and storage will be connected to the backend.
      </Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F4F6F6',
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
  title: {
    fontSize: 18,
    fontWeight: '800',
    color: '#FAF8FF',
    marginLeft: 25,
  },
  statusCard: {
    margin: 18,
    minHeight: 180,
    borderRadius: 16,
    padding: 22,
    justifyContent: 'center',
    backgroundColor: '#6A0DAD',
  },
  author: {
    color: '#D5F5E3',
    fontSize: 14,
    marginBottom: 20,
    fontWeight: '800',
  },
  statusText: {
    color: '#FFFFFF',
    fontSize: 24,
    textAlign: 'center',
    fontWeight: '800',
  },
  sectionTitle: {
    fontSize: 17,
    fontWeight: '800',
    color: '#FAF8FF',
    marginHorizontal: 18,
    marginTop: 18,
    marginBottom: 12,
  },
  reactionGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    paddingHorizontal: 12,
  },
  reactionButton: {
    width: '21%',
    margin: '1%',
    paddingVertical: 15,
    backgroundColor: '#181025',
    borderRadius: 12,
    alignItems: 'center',
  },
  selectedReaction: {
    borderWidth: 2,
    borderColor: '#075E54',
    backgroundColor: '#D5F5E3',
  },
  reactionEmoji: {
    fontSize: 29,
  },
  replyContainer: {
    marginHorizontal: 18,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#181025',
    borderRadius: 12,
    padding: 8,
  },
  replyInput: {
    flex: 1,
    minHeight: 45,
    maxHeight: 100,
    paddingHorizontal: 10,
    color: '#FAF8FF',
  },
  sendButton: {
    backgroundColor: '#6A0DAD',
    paddingVertical: 12,
    paddingHorizontal: 18,
    borderRadius: 9,
  },
  sendButtonText: {
    color: '#FFFFFF',
    fontWeight: '800',
  },
  note: {
    color: '#CBBBD9',
    fontSize: 12,
    textAlign: 'center',
    margin: 20,
    lineHeight: 18,
  },
});
