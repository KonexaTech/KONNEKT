// Review-only ranking foundation. Not imported by the active feed.
// Callers must obtain candidates through the signed-in client's existing RLS.
// This function is not an authorization boundary or a safety classifier.
const MAX_CANDIDATES = 60;
const DAY = 86400000;
const count = value => Number.isSafeInteger(value) && value >= 0 ? Math.min(value, 10000) : 0;
const tags = values => new Set((Array.isArray(values) ? values : []).slice(0, 30)
  .filter(v => typeof v === 'string').map(v => v.replace(/^#/, '').trim().toLowerCase()).filter(Boolean));

export function rankReels(candidates, {
  mode = 'discover', personalized = true, interests = [], followingIds = [],
  hiddenReelIds = [], hiddenCreatorIds = [], excludedTopics = [],
  limit = 30, now = Date.now()
} = {}) {
  if (!Array.isArray(candidates) || !['discover', 'following'].includes(mode) || !Number.isFinite(now)) {
    throw new Error('Valid candidates, mode and time required.');
  }
  const size = Number.isInteger(limit) ? Math.min(MAX_CANDIDATES, Math.max(0, limit)) : 30;
  const follows = new Set(followingIds);
  const hidden = new Set(hiddenReelIds);
  const hiddenCreators = new Set(hiddenCreatorIds);
  const wanted = tags(interests);
  const excluded = tags(excludedTopics);
  const ids = new Set();
  const paths = new Set();
  const eligible = [];
  for (const row of candidates.slice(0, MAX_CANDIDATES)) {
    if (!row || typeof row.id !== 'string' || !row.id || typeof row.user_id !== 'string' || !row.user_id || typeof row.media_path !== 'string' || !row.media_path) continue;
    if (row.deleted_at != null || hidden.has(row.id) || hiddenCreators.has(row.user_id)) continue;
    const followed = follows.has(row.user_id);
    if (mode === 'following' && !followed) continue;
    if (row.visibility !== 'public' && !(mode === 'following' && followed && row.visibility === 'followers')) continue;
    if (row.safety_status != null && row.safety_status !== 'approved') continue;
    const published = Date.parse(row.published_at);
    if (!Number.isFinite(published) || published > now) continue;
    const topics = tags((typeof row.caption === 'string' ? row.caption.slice(0, 500).match(/#[\p{L}\p{N}_]+/gu) : []) || []);
    if ([...topics].some(topic => excluded.has(topic))) continue;
    if (ids.has(row.id) || paths.has(row.media_path)) continue;
    ids.add(row.id); paths.add(row.media_path);
    const likes = count(row.likeCount), comments = count(row.commentCount);
    const recency = 5 / (1 + (now - published) / DAY);
    const reasons = ['recency'];
    let score = recency;
    if (personalized === true) {
      score += Math.min(3, Math.log1p(likes + 2 * comments) / 3);
      if (likes || comments) reasons.push('recorded engagement');
      if (followed) { score += 3; reasons.push('followed creator'); }
      if ([...topics].some(topic => wanted.has(topic))) { score += 4; reasons.push('selected interest'); }
    }
    eligible.push({ reelId: row.id, creatorId: row.user_id, published, score, reasons, lowEngagement: !likes && !comments });
  }
  eligible.sort((a, b) => (personalized === true ? b.score - a.score : b.published - a.published) || b.published - a.published || a.reelId.localeCompare(b.reelId));
  const result = [];
  while (eligible.length && result.length < size) {
    let index = 0;
    if (personalized === true) {
      // Reserve every fifth slot for low-engagement work from a creator not
      // shown yet when available. This is exposure, not a verified "new" badge.
      const seenCreators = new Set(result.map(row => row.creatorId));
      if ((result.length + 1) % 5 === 0) index = eligible.findIndex(row => row.lowEngagement && !seenCreators.has(row.creatorId));
      if (index < 0) index = 0;
      const previous = result[result.length - 1]?.creatorId;
      if (eligible[index].creatorId === previous) {
        const alternative = eligible.findIndex(row => row.creatorId !== previous);
        if (alternative >= 0) index = alternative;
      }
    }
    result.push(eligible.splice(index, 1)[0]);
  }
  return result.map(({ reelId, score, reasons }) => ({ reelId, score: Math.round(score * 1000) / 1000, reasons }));
}
