// Live broadcasting and financial services are deferred from the initial release.
// Guard routes centrally so secondary entry points cannot mount their workflows.
export const deferredFeatures = Object.freeze({
  LiveStreamSetup: 'Live rooms',
  LiveStream: 'Live rooms',
  LiveStreamChat: 'Live rooms',
  LiveStreamModeration: 'Live rooms',
  LiveStreamGifts: 'Gifts and payments',
  CreatorEarnings: 'Creator earnings',
  CreatorPayout: 'Creator payouts',
  CreatorMonetization: 'Creator monetisation',
  CreatorSubscriptions: 'Paid subscriptions',
  CreatorBrandPartnerships: 'Paid brand partnerships',
});
