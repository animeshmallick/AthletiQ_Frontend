/** Runtime configuration (replaced by a stub in Jest, where `import.meta` is unavailable). */
export const API_URL: string = (import.meta.env.VITE_API_URL ?? '').replace(/\/$/, '');
export const IS_DEV: boolean = import.meta.env.DEV;
/** Public Mapbox token (pk.*). Maps degrade gracefully to coordinate inputs when unset. */
export const MAPBOX_TOKEN: string = import.meta.env.VITE_MAPBOX_TOKEN ?? '';

/** Firebase web config for push notifications (all public values). Null = push not offered. */
export const FIREBASE = import.meta.env.VITE_FIREBASE_VAPID_KEY
  ? {
      apiKey: import.meta.env.VITE_FIREBASE_API_KEY ?? '',
      projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID ?? '',
      messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID ?? '',
      appId: import.meta.env.VITE_FIREBASE_APP_ID ?? '',
      vapidKey: import.meta.env.VITE_FIREBASE_VAPID_KEY,
    }
  : null;

/** Sentry DSN for crash reporting. Empty = off. */
export const SENTRY_DSN: string = import.meta.env.VITE_SENTRY_DSN ?? '';
export const MODE: string = import.meta.env.MODE;
