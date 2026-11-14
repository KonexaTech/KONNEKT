
import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState
} from 'react';

import {
  View,
  Text,
  TouchableOpacity,
  FlatList,
  StyleSheet,
  ActivityIndicator,
  TextInput,
  Image,
  Dimensions
} from 'react-native';

import { useAuth } from '../AuthContext';
import { supabase } from '../lib_supabase';
import { chooseMedia, uploadMedia } from '../services/media';

const MAX_VIDEO_BYTES = 45 * 1024 * 1024;
const REEL_PAGE_HEIGHT = Math.max(
  420,
  Dimensions.get('window').height - 245
);

export default function WatchScreen({ navigation }) {
  const { user } = useAuth();

  const [posts, setPosts] = useState([]);
  const [liked, setLiked] = useState(new Set());
  const [following, setFollowing] = useState(new Set());
  const [followBusy, setFollowBusy] = useState('');
  const [likeCounts, setLikeCounts] = useState({});
  const [comments, setComments] = useState({});
  const [commentDrafts, setCommentDrafts] = useState({});
  const [failedMedia, setFailedMedia] = useState({});
  const [activePostId, setActivePostId] = useState(null);

  const [busy, setBusy] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [uploading, setUploading] = useState(false);

  const [caption, setCaption] = useState('');
  const [notice, setNotice] = useState('');
  const [feedHeight, setFeedHeight] = useState(0);

  const pageHeight = feedHeight || REEL_PAGE_HEIGHT;

  // Only the currently visible Reel should autoplay.
  const viewabilityConfig = useRef({
    itemVisiblePercentThreshold: 70
  });

  const onViewableItemsChanged = useRef(({ viewableItems }) => {
    const visible = viewableItems?.find(
      entry => entry.isViewable && entry.item?.id
    );

    if (visible) {
      setActivePostId(visible.item.id);
    }
  });

  const load = useCallback(async (showRefresh = false) => {
    if (!user?.id) {
      setPosts([]);
      setBusy(false);
      setRefreshing(false);
      return;
    }

    if (showRefresh) setRefreshing(true);

    try {
      // Load the actual feed first.
      // Supporting likes/comments/follows must not hide posts.
      const { data, error } = await supabase
        .from('posts')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(60);

      if (error) throw error;

      const rows = (data || []).filter(post =>
        !!post.media_url &&
        ['video', 'image'].includes(post.media_type || 'video')
      );

      const postIds = rows.map(post => post.id);

      const profileIds = [
        ...new Set(rows.map(post => post.user_id).filter(Boolean))
      ];

      // Supporting information is loaded separately.
      const [
        profileResult,
        myLikesResult,
        allLikesResult,
        commentsResult,
        followsResult
      ] = await Promise.all([
        profileIds.length
          ? supabase
              .from('profiles')
              .select('id,username,full_name,avatar_url')
              .in('id', profileIds)
          : Promise.resolve({ data: [], error: null }),

        supabase
          .from('post_likes')
          .select('post_id')
          .eq('user_id', user.id),

        postIds.length
          ? supabase
              .from('post_likes')
              .select('post_id')
              .in('post_id', postIds)
          : Promise.resolve({ data: [], error: null }),

        postIds.length
          ? supabase
              .from('post_comments')
              .select('id,post_id,user_id,body,created_at')
              .in('post_id', postIds)
              .order('created_at', { ascending: true })
          : Promise.resolve({ data: [], error: null }),

        supabase
          .from('follows')
          .select('followed_id')
          .eq('follower_id', user.id)
      ]);

      const warnings = [];

      if (profileResult.error) warnings.push('creator profiles');
      if (myLikesResult.error) warnings.push('your likes');
      if (allLikesResult.error) warnings.push('like counts');
      if (commentsResult.error) warnings.push('comments');
      if (followsResult.error) warnings.push('follow status');

      const profiles = profileResult.data || [];

      const profileMap = Object.fromEntries(
        profiles.map(profile => [profile.id, profile])
      );

      const commentRows = commentsResult.data || [];

      const commentUserIds = [
        ...new Set(
          commentRows.map(comment => comment.user_id).filter(Boolean)
        )
      ];

      let commentProfiles = [];

      if (commentUserIds.length) {
        const result = await supabase
          .from('profiles')
          .select('id,username,full_name')
          .in('id', commentUserIds);

        if (result.error) {
          warnings.push('comment profiles');
        } else {
          commentProfiles = result.data || [];
        }
      }

      const commentProfileMap = Object.fromEntries(
        commentProfiles.map(profile => [profile.id, profile])
      );

      const groupedComments = {};

      commentRows.forEach(comment => {
        if (!groupedComments[comment.post_id]) {
          groupedComments[comment.post_id] = [];
        }

        groupedComments[comment.post_id].push({
          ...comment,
          profile: commentProfileMap[comment.user_id]
        });
      });

      const counts = {};

      (allLikesResult.data || []).forEach(row => {
        counts[row.post_id] = (counts[row.post_id] || 0) + 1;
      });

      setComments(groupedComments);
      setLikeCounts(counts);

      setLiked(
        new Set(
          (myLikesResult.data || []).map(row => row.post_id)
        )
      );

      setFollowing(
        new Set(
          (followsResult.data || []).map(row => row.followed_id)
        )
      );

      const feedPosts = rows.map(post => ({
        ...post,
        profile: profileMap[post.user_id] || {}
      }));

      setPosts(feedPosts);

      setFailedMedia({});

      setActivePostId(previous => {
        if (feedPosts.some(post => post.id === previous)) {
          return previous;
        }

        return feedPosts[0]?.id || null;
      });

      if (warnings.length) {
        setNotice(
          `Your feed loaded, but some extra information could not load: ${warnings.join(', ')}.`
        );
      } else {
        setNotice('');
      }

      if (!feedPosts.length) {
        setNotice(
          'No published videos or images were found in the feed yet.'
        );
      }
    } catch (error) {
      setNotice(
        `Feed could not load: ${error?.message || 'Please try again.'}`
      );
    } finally {
      setBusy(false);
      setRefreshing(false);
    }
  }, [user?.id]);

  useEffect(() => {
    load();

    if (!user?.id) return undefined;

    const channel = supabase
      .channel(`konnekt-reels-${user.id}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'posts'
        },
        () => load()
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'post_likes'
        },
        () => load()
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'follows'
        },
        () => load()
      )
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'post_comments'
        },
        () => load()
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [load, user?.id]);

  const publish = async () => {
    if (!user?.id) {
      setNotice('Please sign in before publishing a Reel.');
      return;
    }

    try {
      const file = await chooseMedia(
        'video/mp4,video/webm,video/quicktime'
      );

      if (!file) return;

      if (!file.type?.startsWith('video/')) {
        throw new Error('Please select a video file.');
      }

      if (file.size > MAX_VIDEO_BYTES) {
        throw new Error(
          'Choose a video smaller than 45 MB.'
        );
      }

      setUploading(true);
      setNotice('Uploading your video…');

      const media = await uploadMedia(
        file,
        'konnekt-public-media',
        `posts/${user.id}`
      );

      if (!media?.url) {
        throw new Error('The uploaded video URL was not returned.');
      }

      const { error } = await supabase
        .from('posts')
        .insert({
          user_id: user.id,
          caption: caption.trim(),
          media_url: media.url,
          media_type: 'video'
        });

      if (error) throw error;

      setCaption('');
      setNotice('Your Reel has been published.');

      await load();
    } catch (error) {
      setNotice(
        error?.message || 'Video upload failed. Please try again.'
      );
    } finally {
      setUploading(false);
    }
  };

  const toggleLike = async post => {
    if (!user?.id) return;

    const wasLiked = liked.has(post.id);

    setLiked(previous => {
      const next = new Set(previous);

      if (wasLiked) next.delete(post.id);
      else next.add(post.id);

      return next;
    });

    setLikeCounts(previous => ({
      ...previous,
      [post.id]: Math.max(
        0,
        (previous[post.id] || 0) + (wasLiked ? -1 : 1)
      )
    }));

    try {
      const result = wasLiked
        ? await supabase
            .from('post_likes')
            .delete()
            .eq('post_id', post.id)
            .eq('user_id', user.id)
        : await supabase
            .from('post_likes')
            .insert({
              post_id: post.id,
              user_id: user.id
            });

      if (result.error) throw result.error;
    } catch (error) {
      setNotice(`Like could not be saved: ${error.message}`);
      await load();
    }
  };

  const toggleFollow = async creatorId => {
    if (
      !creatorId ||
      creatorId === user?.id ||
      followBusy
    ) {
      return;
    }

    const alreadyFollowing = following.has(creatorId);

    setFollowBusy(creatorId);

    try {
      const result = alreadyFollowing
        ? await supabase
            .from('follows')
            .delete()
            .eq('follower_id', user.id)
            .eq('followed_id', creatorId)
        : await supabase
            .from('follows')
            .insert({
              follower_id: user.id,
              followed_id: creatorId
            });

      if (result.error) throw result.error;

      setFollowing(previous => {
        const next = new Set(previous);

        if (alreadyFollowing) next.delete(creatorId);
        else next.add(creatorId);

        return next;
      });

      setNotice('');
    } catch (error) {
      setNotice(`Follow update failed: ${error.message}`);
    } finally {
      setFollowBusy('');
    }
  };

  const openCreator = item => {
    const profile = item.profile || {};

    navigation?.navigate?.('ContactProfile', {
      contact: {
        id: item.user_id,
        name:
          profile.full_name ||
          profile.username ||
          'KONNEKT member',
        username: profile.username
          ? `@${profile.username}`
          : '@member',
        avatar_url: profile.avatar_url,
        initials: (
          profile.full_name ||
          profile.username ||
          'K'
        ).slice(0, 2).toUpperCase(),
        bio: 'KONNEKT creator',
        onKonnekt: true
      }
    });
  };

  const reportReel = item => {
    navigation?.navigate?.('ReportUser', {
      contact: {
        id: item.user_id,
        name:
          item.profile?.full_name ||
          item.profile?.username ||
          'KONNEKT member'
      },
      contentId: item.id,
      contentType: 'post'
    });
  };

  const addComment = async post => {
    const body = (commentDrafts[post.id] || '').trim();

    if (!body || !user?.id) return;

    try {
      const { error } = await supabase
        .from('post_comments')
        .insert({
          post_id: post.id,
          user_id: user.id,
          body
        });

      if (error) throw error;

      setCommentDrafts(previous => ({
        ...previous,
        [post.id]: ''
      }));

      await load();
    } catch (error) {
      setNotice(`Comment could not be sent: ${error.message}`);
    }
  };

  const renderReel = ({ item }) => {
    const postComments = comments[item.id] || [];

    const creator = item.profile?.username
      ? `@${item.profile.username}`
      : 'KONNEKT member';

    const isOwnReel =
      String(item.user_id) === String(user?.id);

    const isActive = activePostId === item.id;

    const isVideo =
      (item.media_type || 'video') === 'video';

    return (
      <View style={[s.reelCard, { height: pageHeight }]}>

        <View style={s.creatorRow}>
          <TouchableOpacity
            style={s.creatorIdentity}
            onPress={() => openCreator(item)}
            accessibilityRole="button"
            accessibilityLabel="Open creator profile"
          >
            <View style={s.creatorAvatar}>
              <Text style={s.creatorAvatarText}>
                {(
                  item.profile?.full_name ||
                  item.profile?.username ||
                  'K'
                ).slice(0, 1).toUpperCase()}
              </Text>
            </View>

            <View style={{ flex: 1 }}>
              <Text style={s.creator}>{creator}</Text>

              <Text style={s.creatorName}>
                {item.profile?.full_name || 'KONNEKT creator'}
              </Text>
            </View>
          </TouchableOpacity>

          {isOwnReel ? (
            <View style={s.ownBadge}>
              <Text style={s.ownBadgeText}>Your Reel</Text>
            </View>
          ) : (
            <TouchableOpacity
              accessibilityRole="button"
              accessibilityLabel={
                following.has(item.user_id)
                  ? 'Unfollow creator'
                  : 'Follow creator'
              }
              onPress={() => toggleFollow(item.user_id)}
              disabled={
                followBusy === item.user_id ||
                !!followBusy
              }
              style={[
                s.followButton,
                following.has(item.user_id) &&
                  s.followingButton
              ]}
            >
              <Text style={s.followText}>
                {followBusy === item.user_id
                  ? 'Saving…'
                  : following.has(item.user_id)
                    ? '✓ Following'
                    : '+ Follow'}
              </Text>
            </TouchableOpacity>
          )}
        </View>

        <View style={s.mediaFrame}>
          {failedMedia[item.id] ? (
            <View style={s.mediaError}>
              <Text style={s.mediaErrorIcon}>⚠</Text>
              <Text style={s.mediaErrorTitle}>
                This media could not play
              </Text>
              <Text style={s.mediaErrorText}>
                The file may be unavailable or in an unsupported format.
              </Text>
              <TouchableOpacity
                style={s.retryButton}
                onPress={() => {
                  setFailedMedia(previous => ({
                    ...previous,
                    [item.id]: false
                  }));
                }}
              >
                <Text style={s.retryText}>Try again</Text>
              </TouchableOpacity>
            </View>
          ) : isVideo ? (
            <video
              key={`${item.id}-${item.media_url}`}
              src={item.media_url}
              controls
              playsInline
              loop
              muted
              autoPlay={isActive}
              preload={isActive ? 'auto' : 'metadata'}
              onError={() => {
                setFailedMedia(previous => ({
                  ...previous,
                  [item.id]: true
                }));
              }}
              style={{
                display: 'block',
                width: '100%',
                height: '100%',
                objectFit: 'contain',
                backgroundColor: '#000',
                borderRadius: 14
              }}
            />
          ) : (
            <Image
              source={{ uri: item.media_url }}
              style={s.media}
              resizeMode="contain"
              onError={() => {
                setFailedMedia(previous => ({
                  ...previous,
                  [item.id]: true
                }));
              }}
            />
          )}
        </View>

        {!!item.caption && (
          <Text style={s.caption}>{item.caption}</Text>
        )}

        {!isOwnReel && (
          <TouchableOpacity
            accessibilityRole="button"
            accessibilityLabel="Report this Reel"
            style={s.reportReel}
            onPress={() => reportReel(item)}
          >
            <Text style={s.reportReelText}>
              ⚑ Report this Reel
            </Text>
          </TouchableOpacity>
        )}

        <View style={s.actions}>
          <TouchableOpacity
            accessibilityRole="button"
            onPress={() => toggleLike(item)}
            style={s.actionButton}
          >
            <Text style={s.action}>
              {liked.has(item.id) ? '❤️ Liked' : '🤍 Like'}
              {' · '}
              {likeCounts[item.id] || 0}
            </Text>
          </TouchableOpacity>

          <Text style={s.action}>
            💬 {postComments.length} comments
          </Text>
        </View>

        {postComments.slice(-2).map(comment => (
          <Text key={comment.id} style={s.comment}>
            <Text style={s.commentUser}>
              @{comment.profile?.username || 'member'}{' '}
            </Text>
            {comment.body}
          </Text>
        ))}

        <View style={s.commentRow}>
          <TextInput
            value={commentDrafts[item.id] || ''}
            onChangeText={value =>
              setCommentDrafts(previous => ({
                ...previous,
                [item.id]: value
              }))
            }
            placeholder="Add a comment…"
            placeholderTextColor="#BBA9CC"
            style={s.commentInput}
            maxLength={2000}
          />

          <TouchableOpacity
            onPress={() => addComment(item)}
            style={s.commentSend}
            disabled={!(commentDrafts[item.id] || '').trim()}
          >
            <Text style={s.sendText}>Send</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  const empty = useMemo(
    () => (
      <View style={s.emptyWrap}>
        <Text style={s.emptyIcon}>🎬</Text>

        <Text style={s.emptyTitle}>
          Your Reels feed starts here
        </Text>

        <Text style={s.empty}>
          No published videos or images are available yet.
          Create the first Reel and invite other members to share.
        </Text>

        <TouchableOpacity
          style={s.emptyRefresh}
          onPress={() => load(true)}
        >
          <Text style={s.emptyRefreshText}>Refresh feed</Text>
        </TouchableOpacity>
      </View>
    ),
    [load]
  );

  return (
    <View style={s.container}>

      <View style={s.header}>
        <View>
          <Text style={s.title}>Reels</Text>
          <Text style={s.sub}>
            Discover videos from the KONNEKT community
          </Text>
        </View>

        <TouchableOpacity
          onPress={publish}
          style={[
            s.upload,
            uploading && s.uploadDisabled
          ]}
          disabled={uploading}
        >
          {uploading ? (
            <ActivityIndicator color="#FFF" />
          ) : (
            <Text style={s.uploadText}>
              ＋ Create Reel
            </Text>
          )}
        </TouchableOpacity>
      </View>

      <TextInput
        style={s.input}
        value={caption}
        onChangeText={setCaption}
        placeholder="Add a caption before uploading (optional)"
        placeholderTextColor="#BBA9CC"
        maxLength={500}
      />

      {!!notice && (
        <Text style={s.notice}>{notice}</Text>
      )}

      <View
        style={s.feedViewport}
        onLayout={event => {
          const height = event.nativeEvent.layout.height;

          if (
            height > 0 &&
            Math.abs(height - feedHeight) > 1
          ) {
            setFeedHeight(height);
          }
        }}
      >
        {busy ? (
          <ActivityIndicator
            color="#00E6FF"
            style={{ marginTop: 35 }}
          />
        ) : (
          <FlatList
            style={{ flex: 1 }}
            data={posts}
            keyExtractor={item => String(item.id)}
            renderItem={renderReel}
            pagingEnabled
            snapToInterval={pageHeight}
            snapToAlignment="start"
            decelerationRate="fast"
            getItemLayout={(_, index) => ({
              length: pageHeight,
              offset: pageHeight * index,
              index
            })}
            onViewableItemsChanged={
              onViewableItemsChanged.current
            }
            viewabilityConfig={viewabilityConfig.current}
            onRefresh={() => load(true)}
            refreshing={refreshing}
            contentContainerStyle={
              posts.length
                ? s.feedContent
                : s.emptyContent
            }
            ListEmptyComponent={empty}
            showsVerticalScrollIndicator={false}
            removeClippedSubviews={false}
          />
        )}
      </View>

      <Text style={s.footer}>
        Keep videos short, respectful and safe to share.
      </Text>
    </View>
  );
}

const s = StyleSheet.create({
  container: {
    flex: 1,
    minHeight: 0,
    backgroundColor: '#10091B',
    paddingHorizontal: 14,
    paddingTop: 8
  },

  header: {
    marginTop: 12,
    marginBottom: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10
  },

  title: {
    color: '#FFF',
    fontSize: 27,
    fontWeight: 'bold'
  },

  sub: {
    color: '#BBA9CC',
    marginTop: 3,
    fontSize: 11
  },

  upload: {
    backgroundColor: '#6A0DAD',
    paddingHorizontal: 13,
    paddingVertical: 11,
    borderRadius: 11
  },

  uploadDisabled: {
    opacity: 0.65
  },

  uploadText: {
    color: '#FFF',
    fontWeight: 'bold',
    fontSize: 12
  },

  input: {
    backgroundColor: '#241630',
    borderWidth: 1,
    borderColor: '#39244B',
    borderRadius: 11,
    padding: 12,
    color: '#FFF',
    marginBottom: 9
  },

  notice: {
    color: '#9FD3FF',
    marginBottom: 8,
    fontSize: 12,
    lineHeight: 18
  },

  feedViewport: {
    flex: 1,
    minHeight: 180
  },

  feedContent: {
    paddingBottom: 0
  },

  emptyContent: {
    flexGrow: 1,
    justifyContent: 'center'
  },

  emptyWrap: {
    alignItems: 'center',
    padding: 28
  },

  emptyIcon: {
    fontSize: 44,
    marginBottom: 12
  },

  emptyTitle: {
    color: '#FFF',
    fontWeight: 'bold',
    fontSize: 18,
    marginBottom: 8
  },

  empty: {
    color: '#C4B4D0',
    textAlign: 'center',
    lineHeight: 22,
    maxWidth: 340
  },

  emptyRefresh: {
    marginTop: 18,
    backgroundColor: '#3A0CA3',
    borderRadius: 10,
    paddingHorizontal: 18,
    paddingVertical: 11
  },

  emptyRefreshText: {
    color: '#FFF',
    fontWeight: 'bold'
  },

  reelCard: {
    backgroundColor: '#10091B',
    padding: 12,
    marginBottom: 0,
    borderBottomWidth: 1,
    borderBottomColor: '#39244B',
    justifyContent: 'flex-start'
  },

  creatorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
    marginBottom: 12,
    minHeight: 54,
    width: '100%'
  },

  creatorIdentity: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
    minWidth: 0
  },

  followButton: {
    backgroundColor: '#6A0DAD',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 20,
    minWidth: 88,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
    elevation: 3
  },

  followingButton: {
    backgroundColor: '#39244B',
    borderWidth: 1,
    borderColor: '#4B6683'
  },

  followText: {
    color: '#FFF',
    fontWeight: 'bold',
    fontSize: 12
  },

  ownBadge: {
    backgroundColor: '#39244B',
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderRadius: 18
  },

  ownBadgeText: {
    color: '#B9C9DB',
    fontSize: 11,
    fontWeight: 'bold'
  },

  creatorAvatar: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: '#3A0CA3',
    alignItems: 'center',
    justifyContent: 'center'
  },

  creatorAvatarText: {
    color: '#FFF',
    fontSize: 16,
    fontWeight: 'bold'
  },

  creator: {
    color: '#D8B8F5',
    fontWeight: 'bold',
    fontSize: 13
  },

  creatorName: {
    color: '#BBA9CC',
    fontSize: 10,
    marginTop: 2
  },

  mediaFrame: {
    width: '100%',
    flex: 1,
    minHeight: 180,
    backgroundColor: '#000',
    borderRadius: 14,
    overflow: 'hidden'
  },

  media: {
    width: '100%',
    height: '100%',
    backgroundColor: '#000'
  },

  mediaError: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 22,
    backgroundColor: '#170D26'
  },

  mediaErrorIcon: {
    color: '#FFC107',
    fontSize: 34,
    marginBottom: 10
  },

  mediaErrorTitle: {
    color: '#FFF',
    fontWeight: 'bold',
    fontSize: 15,
    textAlign: 'center'
  },

  mediaErrorText: {
    color: '#BBA9CC',
    fontSize: 12,
    textAlign: 'center',
    marginTop: 8,
    lineHeight: 19
  },

  retryButton: {
    backgroundColor: '#6A0DAD',
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 9,
    marginTop: 15
  },

  retryText: {
    color: '#FFF',
    fontWeight: 'bold'
  },

  caption: {
    color: '#FFF',
    marginTop: 10,
    lineHeight: 19,
    fontSize: 13
  },

  reportReel: {
    alignSelf: 'flex-end',
    paddingVertical: 7,
    paddingHorizontal: 10,
    marginTop: 5,
    marginBottom: 5,
    borderRadius: 8,
    backgroundColor: '#30203F'
  },

  reportReelText: {
    color: '#FFB6C0',
    fontSize: 11,
    fontWeight: '700'
  },

  actions: {
    flexDirection: 'row',
    gap: 18,
    alignItems: 'center',
    paddingVertical: 11
  },

  actionButton: {
    paddingVertical: 2
  },

  action: {
    color: '#DCEBFA',
    fontWeight: '600',
    fontSize: 12
  },

  comment: {
    color: '#CBD8E8',
    fontSize: 11,
    marginTop: 5,
    lineHeight: 17
  },

  commentUser: {
    color: '#64B9FF',
    fontWeight: 'bold'
  },

  commentRow: {
    flexDirection: 'row',
    gap: 7,
    marginTop: 10
  },

  commentInput: {
    flex: 1,
    backgroundColor: '#1B3048',
    color: '#FFF',
    padding: 10,
    borderRadius: 9,
    minWidth: 0
  },

  commentSend: {
    backgroundColor: '#6A0DAD',
    paddingHorizontal: 12,
    justifyContent: 'center',
    borderRadius: 9
  },

  sendText: {
    color: '#FFF',
    fontWeight: 'bold',
    fontSize: 12
  },

  footer: {
    color: '#65788F',
    textAlign: 'center',
    fontSize: 9,
    paddingVertical: 5
  }
});
