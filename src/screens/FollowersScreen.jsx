import { Alert } from '../components/Alert';

import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TextInput,
  TouchableOpacity,
} from 'react-native';

const initialFollowers = [];

import { useAuth } from '../AuthContext';
import { getConnections, setFollowing } from '../services/connections';

export default function FollowersScreen({ navigation }) {
  const [followers, setFollowers] = useState(initialFollowers);
  const [search, setSearch] = useState('');
  const { user } = useAuth();
  const [notice, setNotice] = useState('Loading connections…');
  const [working, setWorking] = useState(false);
  useEffect(() => {
    let active = true;
    getConnections(user?.id, 'followers').then(rows => {
      if (active) { setFollowers(rows); setNotice(''); }
    }).catch(error => { if (active) setNotice(error.message); });
    return () => { active = false; };
  }, [user?.id]);


  const filteredFollowers = followers.filter((person) =>
    `${person.name} ${person.username}`
      .toLowerCase()
      .includes(search.toLowerCase())
  );

  const toggleFollowBack = async id => {
    if (working) return;
    const person = followers.find(row => row.id === id);
    if (!person) return;
    setWorking(true);
    try {
      await setFollowing(user?.id, id, !person.followingBack);
      setFollowers(previous => previous.map(row => row.id === id ? { ...row, followingBack: !row.followingBack } : row));
      setNotice('');
    } catch (error) { setNotice(error.message); }
    finally { setWorking(false); }
  };

  const openProfile = person => navigation.navigate('ContactProfile', { contact: person });

  const renderFollower = ({ item }) => (
    <View style={styles.personRow}>
      <TouchableOpacity
        style={styles.personDetails}
        onPress={() => openProfile(item)}
      >
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>{item.avatar}</Text>
        </View>

        <View style={styles.nameContainer}>
          <View style={styles.nameLine}>
            <Text style={styles.name}>{item.name}</Text>
            {item.verified && (
              <Text style={styles.verified}> ✓</Text>
            )}
          </View>

          <Text style={styles.username}>{item.username}</Text>
        </View>
      </TouchableOpacity>

      <TouchableOpacity
        style={[
          styles.followButton,
          item.followingBack && styles.followingButton,
        ]}
        onPress={() => toggleFollowBack(item.id)}
      >
        <Text
          style={[
            styles.followButtonText,
            item.followingBack && styles.followingButtonText,
          ]}
        >
          {item.followingBack ? 'Following' : 'Follow back'}
        </Text>
      </TouchableOpacity>
    </View>
  );

  return (
    <View style={styles.container}>
      {!!notice && <Text accessibilityRole="status" style={{ color: '#D8B8F5', padding: 12 }}>{notice}</Text>}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Text style={styles.back}>‹</Text>
        </TouchableOpacity>

        <Text style={styles.headerTitle}>Followers</Text>

        <Text style={styles.headerIcon}>👥</Text>
      </View>

      <View style={styles.summaryCard}>
        <Text style={styles.summaryNumber}>{followers.length}</Text>
        <Text style={styles.summaryLabel}>Followers</Text>
      </View>

      <View style={styles.searchBox}>
        <Text style={styles.searchIcon}>⌕</Text>
        <TextInput
          style={styles.searchInput}
          placeholder="Search followers..."
          placeholderTextColor="#98A2B3"
          value={search}
          onChangeText={setSearch}
        />
      </View>

      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>People following you</Text>
        <Text style={styles.count}>{filteredFollowers.length} people</Text>
      </View>

      {filteredFollowers.length === 0 ? (
        <View style={styles.emptyState}>
          <Text style={styles.emptyIcon}>👥</Text>
          <Text style={styles.emptyTitle}>No followers found</Text>
          <Text style={styles.emptyText}>
            Try another name or username.
          </Text>
        </View>
      ) : (
        <FlatList
          data={filteredFollowers}
          keyExtractor={(item) => item.id}
          renderItem={renderFollower}
          contentContainerStyle={styles.list}
        />
      )}
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
    marginRight: 14,
  },
  headerTitle: {
    color: '#FFFFFF',
    fontSize: 17,
    fontWeight: '800',
    flex: 1,
  },
  headerIcon: {
    fontSize: 22,
  },
  summaryCard: {
    backgroundColor: '#E8F4F1',
    margin: 15,
    padding: 18,
    borderRadius: 13,
    alignItems: 'center',
  },
  summaryNumber: {
    color: '#075E54',
    fontSize: 28,
    fontWeight: '800',
  },
  summaryLabel: {
    color: '#526B67',
    fontSize: 11,
    marginTop: 3,
  },
  searchBox: {
    backgroundColor: '#181025',
    marginHorizontal: 15,
    borderRadius: 11,
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#EAECF0',
  },
  searchIcon: {
    color: '#CBBBD9',
    fontSize: 22,
    marginRight: 8,
  },
  searchInput: {
    flex: 1,
    height: 43,
    color: '#FAF8FF',
    fontSize: 12,
  },
  sectionHeader: {
    paddingHorizontal: 16,
    paddingTop: 20,
    paddingBottom: 10,
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  sectionTitle: {
    color: '#FAF8FF',
    fontSize: 12,
    fontWeight: '800',
  },
  count: {
    color: '#98A2B3',
    fontSize: 10,
  },
  list: {
    paddingHorizontal: 15,
    paddingBottom: 25,
  },
  personRow: {
    backgroundColor: '#181025',
    borderRadius: 12,
    padding: 12,
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 9,
    borderWidth: 1,
    borderColor: '#EAECF0',
  },
  personDetails: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
  },
  avatar: {
    width: 45,
    height: 45,
    borderRadius: 23,
    backgroundColor: '#E8F4F1',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    fontSize: 22,
  },
  nameContainer: {
    marginLeft: 10,
    flex: 1,
  },
  nameLine: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  name: {
    color: '#FAF8FF',
    fontSize: 11,
    fontWeight: '800',
  },
  verified: {
    color: '#1877F2',
    fontSize: 12,
    fontWeight: '800',
  },
  username: {
    color: '#98A2B3',
    fontSize: 9,
    marginTop: 4,
  },
  followButton: {
    backgroundColor: '#6A0DAD',
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderRadius: 7,
    marginLeft: 5,
  },
  followButtonText: {
    color: '#FFFFFF',
    fontSize: 9,
    fontWeight: '800',
  },
  followingButton: {
    backgroundColor: '#E8ECEF',
  },
  followingButtonText: {
    color: '#475467',
  },
  emptyState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 25,
  },
  emptyIcon: {
    fontSize: 43,
    marginBottom: 12,
  },
  emptyTitle: {
    color: '#FAF8FF',
    fontSize: 14,
    fontWeight: '800',
  },
  emptyText: {
    color: '#98A2B3',
    fontSize: 11,
    marginTop: 7,
  },
});
