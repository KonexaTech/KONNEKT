import type { CapacitorConfig } from '@capacitor/cli';
const staging = process.env.KONNEKT_BUILD_TARGET === 'staging';
const config: CapacitorConfig = {
  appId: staging ? 'com.konnekt.staging' : 'com.konnekt.app',
  appName: staging ? 'KONNEKT Staging' : 'KONNEKT',
  webDir: 'dist',
  android: { allowMixedContent: false }
};
export default config;
