
import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  TextInput,
} from 'react-native';

const sampleViewers = [];

export default function StatusViewersScreen({ navigation, route }) {
  const [search, setSearch] = useState('');

  // Viewer data must be supplied by the status backend.
  const viewers = route?.params?.viewers || [];

  const filteredViewers = viewers.filter((viewer) =>
    viewer.name.toLowerCase().includes(search.toLowerCase()) ||
    (viewer.username || '').toLowerCase().includes(search.toLowerCase())
  );

  const renderViewer = ({ item }) => (
    <View style={styles.viewerRow}>
      <View style={styles.avatar}>
        <Text style={styles.avatarText}>{item.initials}</Text>
      </View>

      <View style={styles.viewerInfo}>
        <Text style={styles.viewerName}>{item.name}</Text>
        <Text style={styles.username}>{item.username}</Text>
      </View>

      <Text style={styles.viewTime}>{item.time}</Text>
    </View>
  );

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Text style={styles.backButton}>‹ Back</Text>
        </TouchableOpacity>

        <Text style={styles.title}>Status Views</Text>
      </View>

      <View style={styles.summaryCard}>
        <Text style={styles.viewCount}>{viewers.length}</Text>
        <Text style={styles.summaryLabel}>People viewed your status</Text>
      </View>

      <TextInput
        style={styles.searchInput}
        placeholder="Search viewers..."
        placeholderTextColor="#888888"
        value={search}
        onChangeText={setSearch}
      />

      <Text style={styles.sectionTitle}>Viewed by</Text>

      <FlatList
        data={filteredViewers}
        keyExtractor={(item) => item.id}
        renderItem={renderViewer}
        ListEmptyComponent={
          <Text style={styles.emptyText}>
            No viewers found.
          </Text>
        }
      />

      <Text style={styles.footerNote}>
        Viewer information is private and only available according
        to the user's status privacy settings.
      </Text>
    </View>
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
  title: {
    fontSize: 18,
    fontWeight: '800',
    marginLeft: 25,
    color: '#FAF8FF',
  },
  summaryCard: {
    backgroundColor: '#6A0DAD',
    margin: 16,
    borderRadius: 14,
    padding: 22,
    alignItems: 'center',
  },
  viewCount: {
    fontSize: 36,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  summaryLabel: {
    color: '#E0F2F1',
    marginTop: 5,
    fontSize: 14,
  },
  searchInput: {
    backgroundColor: '#181025',
    marginHorizontal: 16,
    padding: 13,
    borderRadius: 10,
    fontSize: 14,
    color: '#FAF8FF',
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '800',
    margin: 18,
    color: '#FAF8FF',
  },
  viewerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#181025',
    padding: 14,
    marginHorizontal: 16,
    marginBottom: 8,
    borderRadius: 12,
  },
  avatar: {
    width: 45,
    height: 45,
    borderRadius: 23,
    backgroundColor: '#D5F5E3',
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarText: {
    color: '#075E54',
    fontWeight: '800',
  },
  viewerInfo: {
    flex: 1,
    marginLeft: 12,
  },
  viewerName: {
    fontSize: 14,
    fontWeight: '800',
    color: '#FAF8FF',
  },
  username: {
    color: '#CBBBD9',
    fontSize: 12,
    marginTop: 3,
  },
  viewTime: {
    color: '#CBBBD9',
    fontSize: 11,
  },
  emptyText: {
    textAlign: 'center',
    color: '#CBBBD9',
    padding: 25,
  },
  footerNote: {
    textAlign: 'center',
    color: '#CBBBD9',
    fontSize: 11,
    padding: 15,
    lineHeight: 17,
  },
});
