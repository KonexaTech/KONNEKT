import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View, Text, TouchableOpacity, FlatList, StyleSheet,
  ActivityIndicator, TextInput, Image, Dimensions
} from 'react-native';
import { useAuth } from '../AuthContext';
import { supabase, SUPABASE_URL } from '../lib_supabase';
import { resolveSocialMedia } from '../services/socialMedia';
import { chooseMedia, uploadMedia, cleanupUnusedPublicMedia } from '../services/media';
import ReelPlayer from '../components/ReelPlayer';

const MAX_VIDEO_BYTES = 45 * 1024 * 1024;
const BUCKET = 'konnekt-public-media';
const PAGE_HEIGHT = Math.max(420, Dimensions.get('window').height - 245);


export default function WatchScreen({ navigation, route }) {
  const { user } = useAuth();
  const [reels, setReels] = useState([]);
  const [liked, setLiked] = useState(new Set());
  const [following, setFollowing] = useState(new Set());
  const [likeCounts, setLikeCounts] = useState({});
  const [comments, setComments] = useState({});
  const [drafts, setDrafts] = useState({});
  const [failedMedia, setFailedMedia] = useState({});
  const [activeId, setActiveId] = useState(null);
  const [busy, setBusy] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [commentBusy, setCommentBusy] = useState('');
  const [likeBusy, setLikeBusy] = useState('');
  const [followBusy, setFollowBusy] = useState('');
  const [caption, setCaption] = useState('');
  const [notice, setNotice] = useState('');
  const [feedHeight, setFeedHeight] = useState(0);
  const requestRef = useRef(0);
  const lastMediaLoad = useRef(0);
  const feedRef = useRef(null);
  const publishLock = useRef(false);
  const selectedReel = route?.params?.reelId;
  const pageHeight = feedHeight || PAGE_HEIGHT;
  useEffect(() => {
    if (!selectedReel) return;
    const index = reels.findIndex(reel => reel.id === selectedReel);
    if (index < 0) return;
    setActiveId(selectedReel);
    const timer = setTimeout(() => feedRef.current?.scrollToOffset({ offset: index * pageHeight, animated: false }), 0);
    return () => clearTimeout(timer);
  }, [selectedReel, reels, pageHeight]);

  const load = useCallback(async (refresh = false) => {
    if (!user?.id) {
      setReels([]);
      setBusy(false);
      setRefreshing(false);
      return;
    }
    const requestId = ++requestRef.current;
    if (refresh) setRefreshing(true);
    else setBusy(true);
    try {
      const { data, error } = await supabase
        .from('reels')
        .select('id,user_id,caption,media_path,visibility,published_at,created_at,deleted_at')
        .is('deleted_at', null)
        .order('published_at', { ascending: false, nullsFirst: false })
        .order('created_at', { ascending: false })
        .limit(60);
      if (error) throw error;

      const rows = (data || []).filter(row => !!row.media_path);
      const reelIds = rows.map(row => row.id);
      const creatorIds = [...new Set(rows.map(row => row.user_id).filter(Boolean))];

      const [profilesRes, myLikesRes, allLikesRes, commentsRes, followsRes] = await Promise.all([
        creatorIds.length
          ? supabase.from('profiles').select('id,username,full_name,avatar_url,bio').in('id', creatorIds)
          : Promise.resolve({ data: [], error: null }),
        supabase.from('reel_likes').select('reel_id').eq('user_id', user.id),
        reelIds.length
          ? supabase.from('reel_likes').select('reel_id').in('reel_id', reelIds)
          : Promise.resolve({ data: [], error: null }),
        reelIds.length
          ? supabase.from('reel_comments').select('id,reel_id,user_id,body,created_at,deleted_at').in('reel_id', reelIds).is('deleted_at', null).order('created_at', { ascending: true })
          : Promise.resolve({ data: [], error: null }),
        supabase.from('follows').select('followed_id').eq('follower_id', user.id)
      ]);
      if (requestId !== requestRef.current) return;

      const warnings = [];
      if (profilesRes.error) warnings.push('creator profiles');
      if (myLikesRes.error) warnings.push('your likes');
      if (allLikesRes.error) warnings.push('like counts');
      if (commentsRes.error) warnings.push('comments');
      if (followsRes.error) warnings.push('follow status');

      const profiles = profilesRes.data || [];
      const profileMap = Object.fromEntries(profiles.map(p => [p.id, p]));
      const commentRows = commentsRes.data || [];
      const commentUserIds = [...new Set(commentRows.map(c => c.user_id).filter(Boolean))];
      let commentProfiles = [];
      if (commentUserIds.length) {
        const result = await supabase.from('profiles').select('id,username,full_name,avatar_url').in('id', commentUserIds);
        if (result.error) warnings.push('comment authors');
        else commentProfiles = result.data || [];
      }
      const commentProfileMap = Object.fromEntries(commentProfiles.map(p => [p.id, p]));
      const grouped = {};
      commentRows.forEach(comment => {
        if (!grouped[comment.reel_id]) grouped[comment.reel_id] = [];
        grouped[comment.reel_id].push({ ...comment, profile: commentProfileMap[comment.user_id] || {} });
      });
      const counts = {};
      (allLikesRes.data || []).forEach(row => {
        counts[row.reel_id] = (counts[row.reel_id] || 0) + 1;
      });

      const nextReels = await Promise.all(rows.map(async row => {
        try {
          return { ...row, media_url: await resolveSocialMedia(supabase, SUPABASE_URL, row.media_path), profile: profileMap[row.user_id] || {} };
        } catch {
          warnings.push('video access');
          return { ...row, media_url: '', profile: profileMap[row.user_id] || {} };
        }
      }));
      if (requestId !== requestRef.current) return;
      lastMediaLoad.current = Date.now();
      setReels(nextReels);
      setComments(grouped);
      setLikeCounts(counts);
      setLiked(new Set((myLikesRes.data || []).map(row => row.reel_id)));
      setFollowing(new Set((followsRes.data || []).map(row => row.followed_id)));
      setFailedMedia({});
      setActiveId(previous => nextReels.some(r => r.id === previous) ? previous : (nextReels[0]?.id || null));
      setNotice(warnings.length ? `Reels loaded, but some details could not load: ${warnings.join(', ')}.` : '');
      if (!nextReels.length) setNotice('No published Reels are available yet.');
    } catch (error) {
      if (requestId === requestRef.current) setNotice(`Reels could not load: ${error?.message || 'Please try again.'}`);
    } finally {
      if (requestId === requestRef.current) {
        setBusy(false);
        setRefreshing(false);
      }
    }
  }, [user?.id]);

  useEffect(() => {
    load();
    if (!user?.id) return undefined;
    const renewal = setInterval(() => { if (document.visibilityState === 'visible') load(true); }, 240000);
    const renewOnVisible = () => { if (document.visibilityState === 'visible' && Date.now() - lastMediaLoad.current >= 240000) load(true); };
    document.addEventListener('visibilitychange', renewOnVisible);
    const channel = supabase.channel(`konnekt-reels-${user.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'reels' }, () => load())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'reel_likes' }, () => load())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'reel_comments' }, () => load())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'follows' }, () => load())
      .subscribe();
    return () => { clearInterval(renewal); document.removeEventListener('visibilitychange', renewOnVisible); requestRef.current += 1; supabase.removeChannel(channel); };
  }, [load, user?.id]);

  const publish = async () => {
    if (!user?.id || publishLock.current) {
      if (!user?.id) setNotice('Please sign in before publishing a Reel.');
      return;
    }
    const submittedCaption = caption.trim();
    let media = null;
    publishLock.current = true;
    setUploading(true);
    try {
      const file = await chooseMedia('video/mp4,video/webm,video/quicktime');
      if (!file) return;
      if (!file.type?.startsWith('video/')) throw new Error('Please select a video file.');
      if (file.size > MAX_VIDEO_BYTES) throw new Error('Choose a video smaller than 45 MB.');
      setUploading(true);
      setNotice('Uploading your video…');
      media = await uploadMedia(file, BUCKET, `reels/${user.id}`);
      if (!media?.path) throw new Error('The upload did not return a storage path.');
      const { error } = await supabase.from('reels').insert({
        user_id: user.id,
        caption: submittedCaption,
        media_path: media.path,
        visibility: 'public',
        published_at: new Date().toISOString()
      });
      if (error) throw error;
      media = null;
      setCaption(current => current.trim() === submittedCaption ? '' : current);
      setNotice('Your Reel has been published.');
      await load(true);
    } catch (error) {
      let cleanup = '';
      if (media) {
        try { if (!(await cleanupUnusedPublicMedia('reels', user.id, media))) cleanup = ' The post may have completed; refresh before retrying.'; }
        catch { cleanup = ' Unused media could not be removed.'; }
      }
      setNotice((error?.message || 'Video upload failed. Please try again.') + cleanup);
    } finally {
      publishLock.current = false;
      setUploading(false);
    }
  };

  const toggleLike = async reel => {
    if (!user?.id || likeBusy) return;
    const wasLiked = liked.has(reel.id);
    setLikeBusy(reel.id);
    setLiked(prev => {
      const next = new Set(prev);
      wasLiked ? next.delete(reel.id) : next.add(reel.id);
      return next;
    });
    setLikeCounts(prev => ({ ...prev, [reel.id]: Math.max(0, (prev[reel.id] || 0) + (wasLiked ? -1 : 1)) }));
    try {
      const result = wasLiked
        ? await supabase.from('reel_likes').delete().eq('reel_id', reel.id).eq('user_id', user.id)
        : await supabase.from('reel_likes').insert({ reel_id: reel.id, user_id: user.id });
      if (result.error) throw result.error;
    } catch (error) {
      await load();
      setNotice(`Like could not be saved: ${error?.message || 'Please try again.'}`);
    } finally {
      setLikeBusy('');
    }
  };

  const toggleFollow = async creatorId => {
    if (!user?.id || !creatorId || creatorId === user.id || followBusy) return;
    const wasFollowing = following.has(creatorId);
    setFollowBusy(creatorId);
    try {
      const result = wasFollowing
        ? await supabase.from('follows').delete().eq('follower_id', user.id).eq('followed_id', creatorId)
        : await supabase.from('follows').insert({ follower_id: user.id, followed_id: creatorId });
      if (result.error) throw result.error;
      setFollowing(prev => {
        const next = new Set(prev);
        wasFollowing ? next.delete(creatorId) : next.add(creatorId);
        return next;
      });
    } catch (error) {
      setNotice(`Follow update failed: ${error?.message || 'Please try again.'}`);
    } finally {
      setFollowBusy('');
    }
  };

  const openCreator = reel => {
    const p = reel.profile || {};
    navigation?.navigate?.('ContactProfile', { contact: {
      id: reel.user_id,
      name: p.full_name || p.username || 'KONNEKT member',
      username: p.username ? `@${p.username}` : '@member',
      avatar_url: p.avatar_url,
      initials: (p.full_name || p.username || 'K').slice(0, 2).toUpperCase(),
      bio: p.bio || 'KONNEKT creator',
      onKonnekt: true
    }});
  };

  const reportReel = reel => navigation?.navigate?.('ReportUser', {
    contact: { id: reel.user_id, name: reel.profile?.full_name || reel.profile?.username || 'KONNEKT member' },
    contentId: reel.id,
    contentType: 'post'
  });

  const addComment = async reel => {
    const body = (drafts[reel.id] || '').trim();
    if (!body || !user?.id || commentBusy) return;
    setCommentBusy(reel.id);
    try {
      const { error } = await supabase.from('reel_comments').insert({ reel_id: reel.id, user_id: user.id, body });
      if (error) throw error;
      setDrafts(prev => ({ ...prev, [reel.id]: '' }));
      await load();
    } catch (error) {
      setNotice(`Comment could not be sent: ${error?.message || 'Please try again.'}`);
    } finally {
      setCommentBusy('');
    }
  };

  const onViewableItemsChanged = useRef(({ viewableItems }) => {
    const visible = viewableItems?.find(v => v.isViewable && v.item?.id);
    if (visible) setActiveId(visible.item.id);
  });
  const viewabilityConfig = useRef({ itemVisiblePercentThreshold: 70 });

  const renderReel = ({ item }) => {
    const reelComments = comments[item.id] || [];
    const profile = item.profile || {};
    const own = item.user_id === user?.id;
    const active = activeId === item.id;
    const url = item.media_url;
    return (
      <View style={[s.reelCard, { height: pageHeight }]}>
        <View style={s.creatorRow}>
          <TouchableOpacity style={s.creatorIdentity} onPress={() => openCreator(item)} accessibilityRole="button">
            <View style={s.creatorAvatar}><Text style={s.creatorAvatarText}>{(profile.full_name || profile.username || 'K').slice(0, 1).toUpperCase()}</Text></View>
            <View style={{ flex: 1 }}>
              <Text style={s.creator}>{profile.username ? `@${profile.username}` : 'KONNEKT member'}</Text>
              <Text style={s.creatorName}>{profile.full_name || 'KONNEKT creator'}</Text>
            </View>
          </TouchableOpacity>
          {own
            ? <View style={s.ownBadge}><Text style={s.ownBadgeText}>Your Reel</Text></View>
            : <TouchableOpacity style={[s.followButton, following.has(item.user_id) && s.followingButton]} onPress={() => toggleFollow(item.user_id)} disabled={!!followBusy}>
                <Text style={[s.followText, following.has(item.user_id) && s.followingText]}>{followBusy === item.user_id ? 'Saving…' : following.has(item.user_id) ? '✓ Following' : '+ Follow'}</Text>
              </TouchableOpacity>}
        </View>
        <View style={s.mediaFrame}>
          {(failedMedia[item.id] || !url)
            ? <View style={s.mediaError}>
                <Text style={s.mediaErrorIcon}>⚠</Text>
                <Text style={s.mediaErrorTitle}>This media could not play</Text>
                <Text style={s.mediaErrorText}>The file may be unavailable or in an unsupported format.</Text>
                <TouchableOpacity style={s.retryButton} onPress={() => load(true)}><Text style={s.retryText}>Try again</Text></TouchableOpacity>
              </View>
            : <ReelPlayer
                key={`${item.id}-${url}`}
                src={url}
                controls
                playsInline
                loop
                muted
                active={active}
                preload={active ? 'auto' : 'metadata'}
                onError={() => setFailedMedia(prev => ({ ...prev, [item.id]: true }))}
                style={{ display: 'block', width: '100%', height: '100%', objectFit: 'contain', backgroundColor: '#000', borderRadius: 14 }}
              />}
        </View>
        {!!item.caption && <Text style={s.caption}>{item.caption}</Text>}
        {!own && <TouchableOpacity style={s.reportReel} onPress={() => reportReel(item)}><Text style={s.reportReelText}>⚑ Report this Reel</Text></TouchableOpacity>}
        <View style={s.actions}>
          <TouchableOpacity onPress={() => toggleLike(item)} disabled={!!likeBusy} style={s.actionButton}>
            <Text style={s.action}>{liked.has(item.id) ? '❤️ Liked' : '🤍 Like'} · {likeCounts[item.id] || 0}</Text>
          </TouchableOpacity>
          <Text style={s.action}>💬 {reelComments.length} comments</Text>
        </View>
        {reelComments.slice(-2).map(comment => (
          <Text key={comment.id} style={s.comment}>
            <Text style={s.commentUser}>@{comment.profile?.username || 'member'} </Text>{comment.body}
          </Text>
        ))}
        <View style={s.commentRow}>
          <TextInput
            value={drafts[item.id] || ''}
            onChangeText={value => setDrafts(prev => ({ ...prev, [item.id]: value }))}
            placeholder="Add a comment…"
            placeholderTextColor="#CBBBD9"
            style={s.commentInput}
            maxLength={2000}
          />
          <TouchableOpacity onPress={() => addComment(item)} style={s.commentSend} disabled={!(drafts[item.id] || '').trim() || !!commentBusy}>
            <Text style={s.sendText}>{commentBusy === item.id ? '…' : 'Send'}</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  const empty = useMemo(() => (
    <View style={s.emptyWrap}>
      <Text style={s.emptyIcon}>🎬</Text>
      <Text style={s.emptyTitle}>Your Reels feed starts here</Text>
      <Text style={s.empty}>No published videos are available yet. Create the first Reel and invite other members to share.</Text>
      <TouchableOpacity style={s.emptyRefresh} onPress={() => load(true)}><Text style={s.emptyRefreshText}>Refresh feed</Text></TouchableOpacity>
    </View>
  ), [load]);

  return (
    <View style={s.container}>
      <View style={s.header}>
        <View><Text style={s.title}>Reels</Text><Text style={s.sub}>Discover videos from the KONNEKT community</Text></View>
        <TouchableOpacity onPress={publish} style={[s.upload, uploading && s.uploadDisabled]} disabled={uploading}>
          {uploading ? <ActivityIndicator color="#FFF" /> : <Text style={s.uploadText}>＋ Create Reel</Text>}
        </TouchableOpacity>
      </View>
      <TextInput
        style={s.input}
        value={caption}
        onChangeText={setCaption}
        placeholder="Add a caption before uploading (optional)"
        placeholderTextColor="#CBBBD9"
        maxLength={500}
      />
      {!!notice && <Text accessibilityRole="alert" style={s.notice}>{notice}</Text>}
      <View style={s.feedViewport} onLayout={event => {
        const height = event.nativeEvent.layout.height;
        if (height > 0 && Math.abs(height - feedHeight) > 1) setFeedHeight(height);
      }}>
        {busy
          ? <ActivityIndicator color="#00E6FF" style={{ marginTop: 35 }} />
          : <FlatList
              ref={feedRef}
              style={{ flex: 1 }}
              data={reels}
              keyExtractor={item => String(item.id)}
              renderItem={renderReel}
              pagingEnabled
              snapToInterval={pageHeight}
              snapToAlignment="start"
              decelerationRate="fast"
              getItemLayout={(_, index) => ({ length: pageHeight, offset: pageHeight * index, index })}
              onViewableItemsChanged={onViewableItemsChanged.current}
              viewabilityConfig={viewabilityConfig.current}
              onRefresh={() => load(true)}
              refreshing={refreshing}
              contentContainerStyle={reels.length ? s.feedContent : s.emptyContent}
              ListEmptyComponent={empty}
              showsVerticalScrollIndicator={false}
              removeClippedSubviews={false}
            />}
      </View>
      <Text style={s.footer}>Keep videos short, respectful and safe to share.</Text>
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, minHeight: 0, backgroundColor: '#05030A', paddingHorizontal: 14, paddingTop: 8 },
  header: { marginTop: 12, marginBottom: 12, flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  title: { color: '#FFF', fontSize: 30, fontWeight: '900' },
  sub: { color: '#CBBBD9', marginTop: 3, fontSize: 11 },
  upload: { backgroundColor: '#6A0DAD', paddingHorizontal: 14, paddingVertical: 11, borderRadius: 16, borderWidth: 1, borderColor: '#FFC107' },
  uploadDisabled: { opacity: 0.65 },
  uploadText: { color: '#FFF', fontWeight: '800', fontSize: 13 },
  input: { backgroundColor: '#181025', borderWidth: 1, borderColor: '#352047', borderRadius: 11, padding: 12, color: '#FFF', marginBottom: 9 },
  notice: { color: '#9FD3FF', marginBottom: 8, fontSize: 12, lineHeight: 18 },
  feedViewport: { flex: 1, minHeight: 180 },
  feedContent: { paddingBottom: 0 },
  emptyContent: { flexGrow: 1, justifyContent: 'center' },
  emptyWrap: { alignItems: 'center', padding: 28 },
  emptyIcon: { fontSize: 44, marginBottom: 12 },
  emptyTitle: { color: '#FFF', fontWeight: 'bold', fontSize: 18, marginBottom: 8 },
  empty: { color: '#CBBBD9', textAlign: 'center', lineHeight: 22, maxWidth: 340 },
  emptyRefresh: { marginTop: 18, backgroundColor: '#3A0CA3', borderRadius: 10, paddingHorizontal: 18, paddingVertical: 11 },
  emptyRefreshText: { color: '#FFF', fontWeight: 'bold' },
  reelCard: { backgroundColor: '#090413', padding: 12, borderBottomWidth: 1, borderBottomColor: '#4B3063', justifyContent: 'flex-start' },
  creatorRow: { flexDirection: 'row', alignItems: 'center', gap: 9, marginBottom: 12, minHeight: 54, width: '100%' },
  creatorIdentity: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 9, minWidth: 0 },
  followButton: { backgroundColor: '#FFC107', paddingHorizontal: 16, paddingVertical: 11, borderRadius: 22, minWidth: 88, alignItems: 'center', justifyContent: 'center', flexShrink: 0, elevation: 3 },
  followingButton: { backgroundColor: '#181025', borderWidth: 1, borderColor: '#6A0DAD' },
  followText: { color: '#05030A', fontWeight: '800', fontSize: 13 },
  ownBadge: { backgroundColor: '#352047', paddingHorizontal: 12, paddingVertical: 9, borderRadius: 18 },
  ownBadgeText: { color: '#B9C9DB', fontSize: 11, fontWeight: 'bold' },
  creatorAvatar: { width: 42, height: 42, borderRadius: 21, borderWidth: 2, borderColor: '#FFC107', backgroundColor: '#3A0CA3', alignItems: 'center', justifyContent: 'center' },
  creatorAvatarText: { color: '#FFF', fontSize: 16, fontWeight: 'bold' },
  creator: { color: '#D8B8F5', fontWeight: '800', fontSize: 14 },
  creatorName: { color: '#CBBBD9', fontSize: 11, marginTop: 2 },
  mediaFrame: { width: '100%', flex: 1, minHeight: 180, backgroundColor: '#000', borderRadius: 20, borderWidth: 1, borderColor: '#74459A', overflow: 'hidden' },
  mediaError: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 22, backgroundColor: '#0C0714' },
  mediaErrorIcon: { color: '#FFC107', fontSize: 34, marginBottom: 10 },
  mediaErrorTitle: { color: '#FFF', fontWeight: 'bold', fontSize: 15, textAlign: 'center' },
  mediaErrorText: { color: '#CBBBD9', fontSize: 12, textAlign: 'center', marginTop: 8, lineHeight: 19 },
  retryButton: { backgroundColor: '#6A0DAD', paddingHorizontal: 18, paddingVertical: 10, borderRadius: 9, marginTop: 15 },
  retryText: { color: '#FFF', fontWeight: 'bold' },
  followingText: { color: '#FAF8FF' },
  caption: { color: '#FFF', marginTop: 10, lineHeight: 21, fontSize: 14, fontWeight: '600' },
  reportReel: { alignSelf: 'flex-end', paddingVertical: 7, paddingHorizontal: 10, marginTop: 5, marginBottom: 5, borderRadius: 8, backgroundColor: '#21132F' },
  reportReelText: { color: '#FFB6C0', fontSize: 11, fontWeight: '700' },
  actions: { flexDirection: 'row', gap: 18, alignItems: 'center', paddingVertical: 11 },
  actionButton: { paddingVertical: 8, paddingHorizontal: 10, borderRadius: 14, backgroundColor: '#181025' },
  action: { color: '#FAF8FF', fontWeight: '800', fontSize: 13 },
  comment: { color: '#CBD8E8', fontSize: 11, marginTop: 5, lineHeight: 17 },
  commentUser: { color: '#64B9FF', fontWeight: 'bold' },
  commentRow: { flexDirection: 'row', gap: 7, marginTop: 10 },
  commentInput: { flex: 1, backgroundColor: '#181025', color: '#FFF', borderWidth: 1, borderColor: '#4B3063', padding: 10, borderRadius: 13, minWidth: 0 },
  commentSend: { backgroundColor: '#6A0DAD', borderWidth: 1, borderColor: '#FFC107', paddingHorizontal: 16, justifyContent: 'center', borderRadius: 13 },
  sendText: { color: '#FFF', fontWeight: 'bold', fontSize: 12 },
  footer: { color: '#65788F', textAlign: 'center', fontSize: 9, paddingVertical: 5 }
});
