import type { CapacitorConfig } from '@capacitor/cli';

/**
 * Android app shell. It loads the live web app from APP_URL, so every frontend deploy reaches
 * installed phones immediately — a new APK is only needed when native code or plugins change.
 * `offline.html` (bundled in the APK) is shown when the site can't be reached.
 *
 * Point a test build elsewhere with: CAP_SERVER_URL=http://192.168.1.10:5173 npx cap sync android
 */
const APP_URL = process.env.CAP_SERVER_URL ?? 'https://www.edupilots.in';

const config: CapacitorConfig = {
  appId: 'in.edupilots.athletiq',
  appName: 'AthletiQ',
  webDir: 'dist',
  server: {
    url: APP_URL,
    androidScheme: 'https',
    errorPath: 'offline.html',
    cleartext: APP_URL.startsWith('http://'),
  },
  android: {
    backgroundColor: '#f8fafc',
    allowMixedContent: false,
  },
  plugins: {
    // Edge-to-edge on Android 15+: the web app pads its header/tab bar with env(safe-area-inset-*).
    SystemBars: {
      insetsHandling: 'native',
      initialViewportFitValueHint: 'cover',
    },
    SplashScreen: {
      launchShowDuration: 1000,
      launchAutoHide: true,
      launchFadeOutDuration: 200,
      backgroundColor: '#4f46e5',
      showSpinner: false,
      androidScaleType: 'CENTER_CROP',
      splashFullScreen: false,
      splashImmersive: false,
    },
    PushNotifications: {
      presentationOptions: ['badge', 'sound', 'alert'],
    },
  },
};

export default config;
