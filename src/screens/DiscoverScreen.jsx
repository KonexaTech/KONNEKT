import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, FlatList,
  StyleSheet, ActivityIndicator, Image
} from 'react-native';
import { useAuth } from '../AuthContext';
import { supabase } from '../lib_supabase';
import { createDirectConversation } from '../services/social';

const PROFILE_COLUMNS = 'id,username,full_name,avatar_url,bio';
const RESULT_KINDS = [
  { key: 'people', label: 'People' },
  { key: 'videos', label: 'Videos' },
  { key: 'hashtags', label: 'Hashtags' }
];

export default function DiscoverScreen({ navigation }) {
  const { user } = useAuth();
  const [people, setPeople] = useState([]);
  const [reels, setReels] = useState([]);
  const [following, setFollowing] = useState(new Set());
  const [query, setQuery] = useState('');
  const [kind, setKind] = useState('people');
  const [busy, setBusy] = useState(true);
  const [actionId, setActionId] = useState('');
  const [notice, setNotice] = useState('');

  const load = useCallback(async () => {
    if (!user?.id) {
      setPeople([]);
      setReels([]);
      setFollowing(new Set());
      setBusy(false);
      return;
    }
    setBusy(true);
    setNotice('');
    try {
      const [profilesRes, followsRes, reelsRes] = await Promise.all([
        supabase.from('profiles').select(PROFILE_COLUMNS).neq('id', user.id).order('full_name', { ascending: true }).limit(200),
        supabase.from('follows').select('followed_id').eq('follower_id', user.id),
        supabase.from('reels').select('id,user_id,caption,media_path,visibility,published_at,created_at').is('deleted_at', null).order('published_at', { ascending: false, nullsFirst: false }).order('created_at', { ascending: false }).limit(100)
      ]);
      if (profilesRes.error) throw profilesRes.error;
      if (followsRes.error) throw followsRes.error;
      if (reelsRes.error) throw reelsRes.error;

      const reelRows = (reelsRes.data || []).filter(r => !!r.media_path);
      const creatorIds = [...new Set(reelRows.map(r => r.user_id).filter(Boolean))];
      const creatorRes = creatorIds.length
        ? await supabase.from('profiles').select('id,username,full_name,avatar_url').in('id', creatorIds)
        : { data: [], error: null };
      if (creatorRes.error) throw creatorRes.error;
      const creatorMap = Object.fromEntries((creatorRes.data || []).map(p => [p.id, p]));
      setPeople(profilesRes.data || []);
      setReels(reelRows.map(r => ({ ...r, creator: creatorMap[r.user_id] || {} })));
      setFollowing(new Set((followsRes.data || []).map(row => row.followed_id)));
    } catch (error) {
      setNotice(`Could not load Discover: ${error?.message || 'Please try again.'}`);
    } finally {
      setBusy(false);
    }
  }, [user?.id]);

  useEffect(() => {
    load();
    const channel = supabase.channel(`discover-${user?.id || 'guest'}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'profiles' }, () => load())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'follows' }, () => load())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'reels' }, () => load())
      .subscribe();
    return () => supabase.removeChannel(channel);
  }, [load, user?.id]);

  const term = query.trim().toLowerCase();
  const filteredPeople = useMemo(() => {
    const needle = term.replace(/^@/, '');
    return people.filter(person =>
      !needle || `${person.username || ''} ${person.full_name || ''} ${person.bio || ''}`.toLowerCase().includes(needle)
    );
  }, [people, term]);

  const filteredReels = useMemo(() => {
    const needle = term.startsWith('#') ? term.slice(1) : term.replace(/^@/, '');
    return reels.filter(reel =>
      !needle || `${reel.caption || ''} ${reel.creator?.username || ''} ${reel.creator?.full_name || ''}`.toLowerCase().includes(needle)
    );
  }, [reels, term]);

  const hashtags = useMemo(() => {
    const counts = new Map();
    reels.forEach(reel => {
      (reel.caption?.match(/#[\p{L}\p{N}_]+/gu) || []).forEach(tag => {
        const normalized = tag.toLowerCase();
        const needle = term.startsWith('#') ? term.slice(1) : term;
        if (!term || normalized.includes(needle)) counts.set(normalized, (counts.get(normalized) || 0) + 1);
      });
    });
    return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, 40);
  }, [reels, term]);

  const toggleFollow = async person => {
    if (!user?.id || !person?.id || actionId || person.id === user.id) return;
    setActionId(person.id);
    setNotice('');
    const wasFollowing = following.has(person.id);
    try {
      const result = wasFollowing
        ? await supabase.from('follows').delete().eq('follower_id', user.id).eq('followed_id', person.id)
        : await supabase.from('follows').insert({ follower_id: user.id, followed_id: person.id });
      if (result.error) throw result.error;
      setFollowing(prev => {
        const next = new Set(prev);
        wasFollowing ? next.delete(person.id) : next.add(person.id);
        return next;
      });
    } catch (error) {
      setNotice(`Follow update failed: ${error?.message || 'Please try again.'}`);
    } finally {
      setActionId('');
    }
  };

  const openProfile = person => navigation?.navigate?.('ContactProfile', {
    contact: {
      id: person.id,
      name: person.full_name || person.username || 'KONNEKT member',
      username: person.username ? `@${person.username}` : '@member',
      avatar_url: person.avatar_url,
      bio: person.bio || '',
      initials: (person.full_name || person.username || 'K').slice(0, 1).toUpperCase(),
      onKonnekt: true
    }
  });

  const message = async person => {
    if (!user?.id || actionId) return;
    setActionId(person.id);
    setNotice('');
    try {
      const chatId = await createDirectConversation(user.id, person.id);
      navigation?.navigate?.('ChatConversation', {
        chatId,
        chatName: person.full_name || (person.username ? `@${person.username}` : 'KONNEKT member')
      });
    } catch (error) {
      setNotice(`Could not open chat: ${error?.message || 'Please try again.'}`);
    } finally {
      setActionId('');
    }
  };

  const renderPerson = ({ item }) => {
    const isFollowing = following.has(item.id);
    const name = item.full_name || item.username || 'KONNEKT member';
    return (
      <View style={s.person}>
        <TouchableOpacity style={s.identity} onPress={() => openProfile(item)} accessibilityRole="button" accessibilityLabel={`Open ${name}'s profile`}>
          {item.avatar_url
            ? <Image source={{ uri: item.avatar_url }} style={s.avatarImage} />
            : <View style={s.avatar}><Text style={s.avatarText}>{name.slice(0, 1).toUpperCase()}</Text></View>}
          <View style={s.personCopy}>
            <Text style={s.name} numberOfLines={1}>{name}</Text>
            <Text style={s.username}>{item.username ? `@${item.username}` : 'KONNEKT member'}</Text>
            {!!item.bio && <Text style={s.bio} numberOfLines={1}>{item.bio}</Text>}
          </View>
        </TouchableOpacity>
        <View style={s.actions}>
          <TouchableOpacity style={[s.follow, isFollowing && s.following]} disabled={!!actionId} onPress={() => toggleFollow(item)}>
            <Text style={[s.followText, isFollowing && s.followingText]}>{actionId === item.id ? '…' : isFollowing ? 'Following' : 'Follow'}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={s.message} disabled={!!actionId} onPress={() => message(item)}>
            <Text style={s.messageText}>{actionId === item.id ? '…' : 'Message'}</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  const renderReel = ({ item }) => {
    const creator = item.creator?.username ? `@${item.creator.username}` : item.creator?.full_name || 'KONNEKT creator';
    return (
      <TouchableOpacity style={s.videoCard} accessibilityRole="button" onPress={() => navigation?.navigate?.('Reels', { reelId: item.id })}>
        <View style={s.videoThumb}><Text style={s.play}>▶</Text><Text style={s.videoTag}>REEL</Text></View>
        <View style={s.videoCopy}>
          <Text style={s.videoCaption} numberOfLines={2}>{item.caption || 'Watch this Reel'}</Text>
          <Text style={s.username}>{creator}</Text>
        </View>
        <Text style={s.arrow}>›</Text>
      </TouchableOpacity>
    );
  };

  const renderHashtag = ({ item }) => (
    <TouchableOpacity style={s.hashtagRow} onPress={() => { setQuery(item[0]); setKind('videos'); }}>
      <View style={s.hashIcon}><Text style={s.hashGlyph}>#</Text></View>
      <View style={s.personCopy}>
        <Text style={s.hashName}>{item[0]}</Text>
        <Text style={s.username}>{item[1]} {item[1] === 1 ? 'Reel' : 'Reels'}</Text>
      </View>
      <Text style={s.arrow}>›</Text>
    </TouchableOpacity>
  );

  const data = kind === 'people' ? filteredPeople : kind === 'videos' ? filteredReels : hashtags;
  const emptyLabel = kind === 'people'
    ? 'No matching accounts found.'
    : kind === 'videos'
      ? 'No Reels match that search yet.'
      : 'Hashtags appear here when creators add them to Reel captions.';

  return (
    <View style={s.container}>
      <View style={s.header}>
        <View><Text style={s.title}>Discover</Text><Text style={s.subtitle}>Find people, creators and Reels on KONNEKT</Text></View>
        <TouchableOpacity accessibilityRole="button" accessibilityLabel="Refresh Discover" onPress={load} style={s.refresh}><Text style={s.refreshText}>↻</Text></TouchableOpacity>
      </View>
      <TextInput
        style={s.search}
        value={query}
        onChangeText={setQuery}
        placeholder="Search names, creators, Reels or #hashtags"
        placeholderTextColor="#CBBBD9"
        autoCapitalize="none"
        returnKeyType="search"
        accessibilityLabel="Search Discover"
      />
      <View style={s.filters} accessibilityRole="tablist">
        {RESULT_KINDS.map(option => (
          <TouchableOpacity key={option.key} accessibilityRole="tab" accessibilityState={{ selected: kind === option.key }} style={[s.filter, kind === option.key && s.filterActive]} onPress={() => setKind(option.key)}>
            <Text style={[s.filterText, kind === option.key && s.filterTextActive]}>{option.label}</Text>
          </TouchableOpacity>
        ))}
      </View>
      <Text style={s.section}>{term ? `${data.length} search results` : kind === 'people' ? 'Suggested accounts' : kind === 'videos' ? 'Recent Reels' : 'Popular hashtags'}</Text>
      {busy && !people.length && !reels.length
        ? <ActivityIndicator color="#FFC107" style={{ marginTop: 35 }} />
        : <FlatList
            data={data}
            keyExtractor={item => kind === 'people' ? item.id : kind === 'videos' ? item.id : item[0]}
            renderItem={kind === 'people' ? renderPerson : kind === 'videos' ? renderReel : renderHashtag}
            onRefresh={load}
            refreshing={busy}
            keyboardShouldPersistTaps="handled"
            ListEmptyComponent={<Text style={s.empty}>{emptyLabel}</Text>}
          />}
      {!!notice && <Text accessibilityRole="alert" style={s.notice}>{notice}</Text>}
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, minHeight: 0, backgroundColor: '#05030A', padding: 18 },
  header: { marginTop: 14, marginBottom: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  title: { color: '#FAF8FF', fontSize: 27, fontWeight: '800' },
  subtitle: { color: '#CBBBD9', marginTop: 4, fontSize: 11 },
  refresh: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#181025', alignItems: 'center', justifyContent: 'center' },
  refreshText: { color: '#00E6FF', fontSize: 23 },
  search: { backgroundColor: '#181025', borderWidth: 1, borderColor: '#352047', color: '#FAF8FF', padding: 13, borderRadius: 12, marginBottom: 12 },
  filters: { flexDirection: 'row', backgroundColor: '#0C0714', borderRadius: 12, padding: 4, gap: 4 },
  filter: { flex: 1, paddingVertical: 10, borderRadius: 9, alignItems: 'center' },
  filterActive: { backgroundColor: '#6A0DAD' },
  filterText: { color: '#CBBBD9', fontWeight: '700', fontSize: 12 },
  filterTextActive: { color: '#FFF' },
  section: { color: '#FFC107', fontWeight: '800', fontSize: 12, letterSpacing: 1, marginTop: 17, marginBottom: 5, textTransform: 'uppercase' },
  person: { paddingVertical: 12, borderBottomWidth: 1, borderColor: '#352047', gap: 9 },
  identity: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  avatar: { width: 46, height: 46, borderRadius: 23, backgroundColor: '#3A0CA3', alignItems: 'center', justifyContent: 'center' },
  avatarImage: { width: 46, height: 46, borderRadius: 23, backgroundColor: '#181025' },
  avatarText: { color: '#FFF', fontSize: 16, fontWeight: '800' },
  personCopy: { flex: 1, minWidth: 0 },
  name: { color: '#FAF8FF', fontSize: 14, fontWeight: '800' },
  username: { color: '#CBBBD9', fontSize: 11, marginTop: 3 },
  bio: { color: '#A998B8', fontSize: 10, marginTop: 4 },
  actions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 8 },
  follow: { backgroundColor: '#FFC107', paddingVertical: 8, paddingHorizontal: 14, borderRadius: 18, minWidth: 76, alignItems: 'center' },
  following: { backgroundColor: '#181025', borderWidth: 1, borderColor: '#FFC107' },
  followText: { color: '#05030A', fontWeight: '800', fontSize: 11 },
  followingText: { color: '#FAF8FF' },
  message: { backgroundColor: '#3A0CA3', paddingVertical: 8, paddingHorizontal: 14, borderRadius: 18 },
  messageText: { color: '#FFF', fontWeight: '800', fontSize: 11 },
  videoCard: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 10, marginVertical: 5, backgroundColor: '#0C0714', borderWidth: 1, borderColor: '#352047', borderRadius: 13 },
  videoThumb: { width: 58, height: 70, borderRadius: 9, backgroundColor: '#3A0CA3', alignItems: 'center', justifyContent: 'center' },
  play: { color: '#FFC107', fontSize: 20 },
  videoTag: { color: '#FFF', fontSize: 8, fontWeight: '900', marginTop: 5 },
  videoCopy: { flex: 1, minWidth: 0 },
  videoCaption: { color: '#FAF8FF', fontSize: 13, fontWeight: '700' },
  arrow: { color: '#00E6FF', fontSize: 25 },
  hashtagRow: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, borderBottomWidth: 1, borderColor: '#352047' },
  hashIcon: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#3A0CA3', alignItems: 'center', justifyContent: 'center' },
  hashGlyph: { color: '#00E6FF', fontSize: 21, fontWeight: '900' },
  hashName: { color: '#FAF8FF', fontSize: 14, fontWeight: '800' },
  empty: { color: '#CBBBD9', textAlign: 'center', padding: 22, lineHeight: 20, fontSize: 12 },
  notice: { color: '#FFD0B5', padding: 10, backgroundColor: 'rgba(255,107,0,.12)', borderRadius: 9, marginTop: 8, fontSize: 12 }
});
