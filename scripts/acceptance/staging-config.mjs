export const STAGING_REF = 'oiwtfkgrnpzirghbsvim';
export const STAGING_ORIGIN = `https://${STAGING_REF}.supabase.co`;
export const APP_ORIGIN = 'http://127.0.0.1:5280';

export function validateConfig(config) {
  if (config?.projectUrl !== STAGING_ORIGIN) throw new Error('Acceptance is restricted to the existing konnekt-staging project.');
  if (!/^sb_publishable_[A-Za-z0-9_-]+$/.test(config.publishableKey || '')) throw new Error('Use a staging publishable key, never a secret or service-role key.');
  if (config.confirmStagingWrites !== true) throw new Error('Set confirmStagingWrites to true for labelled staging test data.');
  if (!Array.isArray(config.accounts) || config.accounts.length !== 3) throw new Error('Supply exactly three dedicated staging accounts: A, B and outsider C.');
  const emails = new Set(), usernames = new Set();
  for (const account of config.accounts) {
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(account.email || '') || typeof account.password !== 'string' || !account.password) throw new Error('Each staging account needs an email and password in the private configuration.');
    if (!/^[A-Za-z0-9_.]{3,20}$/.test(account.username || '')) throw new Error('Each staging account needs its existing public username.');
    emails.add(account.email.toLowerCase()); usernames.add(account.username.toLowerCase());
  }
  if (emails.size !== 3 || usernames.size !== 3) throw new Error('The three staging accounts must be distinct.');
  return config;
}

// A quiet outsider channel alone is not evidence: require its own events on
// both sides of the protected exchange, and a member's positive delivery.
export function assertIsolation({ conversationId, memberEvents, outsiderEvents, protectedIds, beforeControlId, afterControlId, subscriptionHealthy }) {
  if (!subscriptionHealthy) throw new Error('Realtime subscriptions were not continuously healthy.');
  if (!protectedIds.length || new Set(protectedIds).size !== protectedIds.length) throw new Error('Protected message IDs are missing or duplicated.');
  if (!beforeControlId || !afterControlId || beforeControlId === afterControlId) throw new Error('Distinct outsider control messages are required.');
  const outsiderIds = new Set(outsiderEvents.map(event => event.id));
  if (!outsiderIds.has(beforeControlId) || !outsiderIds.has(afterControlId)) throw new Error('Outsider channel lacks positive controls before and after the exchange.');
  if (outsiderEvents.some(event => event.conversation_id === conversationId || protectedIds.includes(event.id))) throw new Error('Outsider received a protected Realtime message.');
  if (!protectedIds.every(id => memberEvents.some(event => event.id === id && event.conversation_id === conversationId))) throw new Error('Member channel did not receive every protected message.');
}
