import { supabase } from '../lib_supabase';

export async function getConnections(userId, mode) {
  if (!userId) throw new Error('Sign in to view connections.');
  const followers = mode === 'followers';
  const target = followers ? 'follower_id' : 'followed_id';
  const { data: links, error } = await supabase.from('follows')
    .select('follower_id,followed_id').eq(followers ? 'followed_id' : 'follower_id', userId);
  if (error) throw error;
  const ids = [...new Set((links || []).map(link => link[target]))];
  if (!ids.length) return [];
  const { data: profiles, error: profileError } = await supabase.from('profiles')
    .select('id,username,full_name,avatar_url').in('id', ids);
  if (profileError) throw profileError;
  const { data: following, error: followingError } = await supabase.from('follows')
    .select('followed_id').eq('follower_id', userId);
  if (followingError) throw followingError;
  const followingIds = new Set((following || []).map(link => link.followed_id));
  return (profiles || []).map(profile => ({
    ...profile, name: profile.full_name || profile.username || 'KONNEKT member',
    avatar: (profile.full_name || profile.username || 'K').slice(0, 1).toUpperCase(),
    followingBack: followingIds.has(profile.id)
  }));
}

export async function setFollowing(userId, otherId, following) {
  if (!userId || !otherId || userId === otherId) throw new Error('Choose another member.');
  const { error } = following
    ? await supabase.from('follows').insert({ follower_id: userId, followed_id: otherId })
    : await supabase.from('follows').delete().eq('follower_id', userId).eq('followed_id', otherId);
  if (error) throw error;
}
