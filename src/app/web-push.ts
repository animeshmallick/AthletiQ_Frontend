import { logClientEvent } from './client-log';
/**
 * Push notifications for the web app: iPhone Home Screen app (iOS 16.4+), Android and desktop
 * browsers. Uses Firebase Cloud Messaging so the API sends to phones and browsers the same way.
 * The Android app uses native push instead (see native.ts).
 */
import { request } from '@/lib/api';
import { FIREBASE } from '@/lib/env';
import { isStandalone } from './install';
import { isNativeApp } from './native';

/** Shows the in-app banner for a notification that arrived while the app is open. */
function showIncomingPush(detail: {
  title: string;
  body: string;
  link?: string;
  notificationId?: string;
}) {
  window.dispatchEvent(new CustomEvent('atq:push', { detail }));
}

/** Marks a notification read in the in-app inbox (it was opened from the phone). */
function markNotificationRead(id: string) {
  void request('/me/notifications/read', { method: 'POST', body: { ids: [id] } }).catch(() => {});
}

const TOKEN_KEY = 'atq-web-push-token';

export const isIOS = () =>
  /iPad|iPhone|iPod/.test(navigator.userAgent) ||
  (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

export type WebPushState =
  /** Firebase not configured, inside the Android app, or the browser can't do push. */
  | 'unsupported'
  /** iPhone in a Safari tab: push needs the Home Screen app first. */
  | 'needs-install'
  | 'off'
  | 'on'
  | 'blocked';

export function webPushState(): WebPushState {
  if (!FIREBASE || isNativeApp()) return 'unsupported';
  if (isIOS() && !isStandalone()) return 'needs-install';
  if (
    !('serviceWorker' in navigator) ||
    !('PushManager' in window) ||
    !('Notification' in window)
  ) {
    return 'unsupported';
  }
  if (Notification.permission === 'denied') return 'blocked';
  if (Notification.permission === 'granted' && localStorage.getItem(TOKEN_KEY)) return 'on';
  return 'off';
}

/** Registers the service worker (offline screen + push). Call once at startup. */
export async function registerServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  if (isNativeApp() || !('serviceWorker' in navigator)) return null;
  try {
    const reg = await navigator.serviceWorker.register('/sw.js', { scope: '/' });
    // Notification taps while the app is open: navigate in place.
    navigator.serviceWorker.addEventListener('message', (e: MessageEvent) => {
      const data = e.data as
        | { type?: string; link?: string; title?: string; body?: string; notificationId?: string }
        | undefined;
      if (data?.type === 'atq:navigate' && data.link?.startsWith('/')) {
        if (data.notificationId) markNotificationRead(data.notificationId);
        window.dispatchEvent(new CustomEvent('atq:navigate', { detail: data.link }));
      }
      // Safari showed the system notification: just refresh the inbox and badge.
      if (data?.type === 'atq:refresh') window.dispatchEvent(new Event('atq:refresh'));
      // Arrived while the app is on screen: the in-app banner instead of a system one.
      if (data?.type === 'atq:push')
        showIncomingPush({
          title: data.title ?? 'AthletiQ',
          body: data.body ?? '',
          link: data.link,
          notificationId: data.notificationId,
        });
    });
    return reg;
  } catch {
    return null;
  }
}

async function fcmToken(): Promise<string> {
  if (!FIREBASE) throw new Error('Push is not configured');
  const reg =
    (await navigator.serviceWorker.getRegistration('/')) ?? (await registerServiceWorker());
  if (!reg) throw new Error('Service worker unavailable');
  const [{ initializeApp, getApps }, { getMessaging, getToken }] = await Promise.all([
    import('@firebase/app'),
    import('@firebase/messaging'),
  ]);
  const app =
    getApps()[0] ??
    initializeApp({
      apiKey: FIREBASE.apiKey,
      projectId: FIREBASE.projectId,
      messagingSenderId: FIREBASE.messagingSenderId,
      appId: FIREBASE.appId,
    });
  return getToken(getMessaging(app), {
    vapidKey: FIREBASE.vapidKey,
    serviceWorkerRegistration: reg,
  });
}

const platform = () => (isIOS() ? 'ios' : 'web');

/**
 * Asks permission (must run from a tap — iOS requires it) and registers this browser for the
 * signed-in user. Returns the resulting state.
 */
export async function enableWebPush(): Promise<WebPushState> {
  const state = webPushState();
  if (state === 'unsupported' || state === 'needs-install' || state === 'blocked') return state;
  const permission = await Notification.requestPermission();
  if (permission !== 'granted') {
    logClientEvent('device', 'Notifications not allowed (browser)', {
      details: { state: permission },
    });
    return permission === 'denied' ? 'blocked' : 'off';
  }
  const token = await fcmToken();
  await request('/me/devices', { method: 'POST', body: { token, platform: platform() } });
  localStorage.setItem(TOKEN_KEY, token);
  return 'on';
}

/** After sign-in: refresh the registration silently if notifications were already allowed. */
export async function refreshWebPush() {
  if (webPushState() !== 'on') return;
  try {
    const token = await fcmToken();
    await request('/me/devices', { method: 'POST', body: { token, platform: platform() } });
    localStorage.setItem(TOKEN_KEY, token);
  } catch {
    // Not critical; the next app start retries.
  }
}

/** Stops this browser receiving the user's notifications (sign-out or "Turn off"). */
export async function disableWebPush() {
  const token = localStorage.getItem(TOKEN_KEY);
  localStorage.removeItem(TOKEN_KEY);
  if (!token) return;
  try {
    await request('/me/devices', { method: 'DELETE', body: { token }, noRetry: true });
  } catch {
    // Signing out must not fail because of this.
  }
}
