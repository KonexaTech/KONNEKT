import { Capacitor } from '@capacitor/core';
import { createPushIdentity } from './services/pushIdentity';

const appId = import.meta.env.VITE_ONESIGNAL_APP_ID;
export const initialisePushNotifications = createPushIdentity({
  enabled: !!appId && Capacitor.isNativePlatform(),
  loadClient: async () => {
    const sdk = await import('onesignal-cordova-plugin');
    const client = sdk.default || sdk.OneSignal;
    client.initialize(appId);
    return client;
  },
  onError: () => console.warn('KONNEKT push identity update failed; retry sign-in before relying on notifications.'),
});
