import { Capacitor } from '@capacitor/core';

let pushClient;
let requestedUserId;

export async function initialisePushNotifications(userId) {
  requestedUserId = userId;
  const appId = import.meta.env.VITE_ONESIGNAL_APP_ID;
  if (!appId || !Capacitor.isNativePlatform()) return;

  try {
    if (!userId) {
      pushClient?.logout();
      return;
    }

    if (!pushClient) {
      const sdk = await import('onesignal-cordova-plugin');
      if (requestedUserId !== userId) return;
      const client = sdk.default || sdk.OneSignal;
      client.initialize(appId);
      pushClient = client;
    }

    pushClient.login(userId);
    await pushClient.Notifications.requestPermission(false);
  } catch (error) {
    console.warn('KONNEKT push setup:', error?.message || error);
  }
}
