// Read recorded rows only. Exact HEAD counts avoid silently truncating totals
// at the Data API row limit or downloading other users' engagement records.
export async function getCreatorAnalytics(client, creatorId, days, now = Date.now()) {
  if (!creatorId || ![7, 30, 90].includes(days) || !Number.isFinite(now)) {
    throw new Error('Valid creator and analytics period required.');
  }
  const since = new Date(now - days * 86400000).toISOString();
  const until = new Date(now).toISOString();
  const engagement = table => client.from(table)
    .select('reel_id,reels!inner(user_id)', { count: 'exact', head: true })
    .eq('reels.user_id', creatorId)
    .is('reels.deleted_at', null)
    .not('reels.published_at', 'is', null)
    .gte('created_at', since).lt('created_at', until);
  const queries = [
    engagement('reel_likes'),
    engagement('reel_comments').is('deleted_at', null),
    client.from('follows').select('follower_id', { count: 'exact', head: true })
      .eq('followed_id', creatorId).gte('created_at', since).lt('created_at', until)
  ];
  const results = await Promise.allSettled(queries);
  const data = { views: null, shares: null, engagement: null };
  const unavailable = [];
  ['likes', 'comments', 'followers'].forEach((metric, index) => {
    const result = results[index];
    const response = result.status === 'fulfilled' ? result.value : null;
    const valid = response && !response.error && Number.isSafeInteger(response.count) && response.count >= 0;
    data[metric] = valid ? response.count : null;
    if (!valid) unavailable.push(metric);
  });
  return { data, unavailable, since, until };
}
