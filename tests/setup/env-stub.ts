// Replaces src/lib/env.ts in Jest (import.meta.env is a Vite-only feature).
export const API_URL = '';
export const IS_DEV = false;
export const MAPBOX_TOKEN = '';
export const FIREBASE: {
  apiKey: string;
  projectId: string;
  messagingSenderId: string;
  appId: string;
  vapidKey: string;
} | null = null;
