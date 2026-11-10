import { logClientEvent } from './client-log';
/**
 * Android app integration (Capacitor). Everything here is a no-op in a normal browser, and the
 * plugin code is only downloaded inside the app.
 *
 * - System bars follow the app theme (edge-to-edge; the header/tab bar pad for the insets).
 * - Hardware back button / gesture: closes the open sheet/dialog first; detail screens go back;
 *   other screens return to Today; on Today the app goes to the background (like native apps).
 * - Push notifications: registers this device for the signed-in user; tapping a notification
 *   opens the screen it links to.
 * - Updates: the web app updates itself on every deploy; when a new APK (native shell) is
 *   published, the user is offered a one-tap download.
 */
import { Capacitor, SystemBars, SystemBarsStyle } from '@capacitor/core';
import { request } from '@/lib/api';
import { overlayOnStack } from './back-stack';
import { parentPath } from './go-back';

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

export const isNativeApp = () => Capacitor.isNativePlatform();

const PUSH_TOKEN_KEY = 'atq-push-token';
const UPDATE_CHECK_KEY = 'atq-update-checked';
const RELEASES_API =
  'https://api.github.com/repos/animeshmallick/AthletiQ_Frontend/releases/latest';
/** Stable link to the newest APK (GitHub serves the latest release's asset). */
export const APK_URL =
  'https://github.com/animeshmallick/AthletiQ_Frontend/releases/latest/download/athletiq.apk';

type Navigate = (path: string, opts?: { replace?: boolean }) => void;
let navigateTo: Navigate = (path) => window.location.assign(path);

/** Lets the router own navigation for back-button and notification taps. */
export function setNativeNavigator(fn: Navigate) {
  navigateTo = fn;
}

const ROOTS = new Set(['/', '/login']);

function overlayOpen() {
  return document.querySelector(
    '[role="dialog"], [role="alertdialog"], [role="menu"], [role="listbox"]',
  );
}

/** Radix overlays close on Escape; the back button should do the same. */
function closeTopOverlay() {
  const target = document.activeElement ?? document.body;
  target.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
}

function syncSystemBars() {
  const dark = document.documentElement.classList.contains('dark');
  void SystemBars.setStyle({ style: dark ? SystemBarsStyle.Dark : SystemBarsStyle.Light }).catch(
    () => {},
  );
}

/** Call once at startup. */
export async function initNativeShell() {
  if (!isNativeApp()) return;
  const [{ App }, { SplashScreen }] = await Promise.all([
    import('@capacitor/app'),
    import('@capacitor/splash-screen'),
  ]);

  syncSystemBars();
  new MutationObserver(syncSystemBars).observe(document.documentElement, {
    attributes: true,
    attributeFilter: ['class'],
  });

  await App.addListener('backButton', ({ canGoBack }) => {
    // 1. Close the top dialog / sheet / picker / menu.
    if (overlayOnStack()) return window.history.back();
    if (overlayOpen()) return closeTopOverlay();
    const path = window.location.pathname;
    // 2. On Today (or sign-in), leave the app running in the background, like native apps.
    if (ROOTS.has(path)) return void App.minimizeApp();
    // 3. Top-level screens (tabs, menu pages) return to Today, the start screen.
    if (path.split('/').filter(Boolean).length === 1) return navigateTo('/', { replace: true });
    // 4. Detail screens go back to where you came from (or up to their list).
    if (canGoBack) window.history.back();
    else navigateTo(parentPath(path), { replace: true });
  });

  // Data may be stale after the app sat in the background; let screens refetch.
  await App.addListener('resume', () => window.dispatchEvent(new Event('focus')));

  void SplashScreen.hide({ fadeOutDuration: 200 }).catch(() => {});
}

/** Registers this phone for push notifications for the signed-in user. Safe to call often. */
export async function registerPush(): Promise<'granted' | 'denied' | 'unavailable'> {
  if (!isNativeApp()) return 'unavailable';
  const { PushNotifications } = await import('@capacitor/push-notifications');
  let perm = await PushNotifications.checkPermissions();
  if (perm.receive === 'prompt' || perm.receive === 'prompt-with-rationale') {
    perm = await PushNotifications.requestPermissions();
  }
  if (perm.receive !== 'granted') {
    logClientEvent('device', 'Notifications not allowed (app)', {
      details: { state: perm.receive },
    });
    return 'denied';
  }

  // One channel per kind of notification, so people can mute one (e.g. money) in Android
  // settings and keep the rest. Importance: 4 = sound + banner, 2 = quiet.
  const channels = [
    {
      id: 'sessions',
      name: 'Sessions & check-in',
      description: 'Session starts, check-in reminders, cancellations and wrap-up',
      importance: 5,
    },
    {
      id: 'students',
      name: 'Students',
      description: 'New students, leavers, moves and makeups',
      importance: 4,
    },
    {
      id: 'money',
      name: 'Fees & money',
      description: 'Fees received, your share, cash you hold, overdue fees',
      importance: 4,
    },
    {
      id: 'approvals',
      name: 'Approvals',
      description: 'Sign-ups, substitute and makeup requests',
      importance: 4,
    },
    {
      id: 'summaries',
      name: 'Daily summaries',
      description: 'Morning schedule, daily digest and weekly numbers',
      importance: 2,
    },
  ] as const;
  for (const c of channels)
    await PushNotifications.createChannel({
      ...c,
      visibility: 1,
      vibration: c.importance >= 4,
      lights: c.importance >= 4,
      lightColor: '#4f46e5',
    }).catch(() => {});

  await PushNotifications.removeAllListeners();
  await PushNotifications.addListener('registration', ({ value }) => {
    localStorage.setItem(PUSH_TOKEN_KEY, value);
    void request('/me/devices', {
      method: 'POST',
      body: { token: value, platform: 'android' },
    }).catch(() => {});
  });
  await PushNotifications.addListener('pushNotificationActionPerformed', ({ notification }) => {
    const data = notification.data as { link?: string; notificationId?: string } | undefined;
    if (data?.notificationId) markNotificationRead(data.notificationId);
    if (data?.link?.startsWith('/')) navigateTo(data.link);
  });
  // While the app is open the phone shows no banner: show the in-app one.
  await PushNotifications.addListener('pushNotificationReceived', (n) => {
    const data = n.data as { link?: string; notificationId?: string } | undefined;
    showIncomingPush({
      title: n.title ?? 'AthletiQ',
      body: n.body ?? '',
      link: data?.link,
      notificationId: data?.notificationId,
    });
  });
  await PushNotifications.register();
  return 'granted';
}

/** Stops this phone receiving the current user's notifications (call before signing out). */
export async function unregisterPush() {
  const token = localStorage.getItem(PUSH_TOKEN_KEY);
  if (!isNativeApp() || !token) return;
  try {
    await request('/me/devices', { method: 'DELETE', body: { token }, noRetry: true });
  } catch {
    // Signing out must not fail because of this.
  }
}

export interface AppUpdate {
  version: number;
  url: string;
  notes: string;
}

/**
 * Checks GitHub Releases for a newer APK than the installed one (at most every 6 hours).
 * Releases are tagged `android-v<versionCode>`.
 */
export async function checkForAppUpdate(force = false): Promise<AppUpdate | null> {
  if (!isNativeApp()) return null;
  const last = Number(localStorage.getItem(UPDATE_CHECK_KEY) ?? 0);
  if (!force && Date.now() - last < 6 * 3600_000) return null;
  try {
    const { App } = await import('@capacitor/app');
    const installed = Number((await App.getInfo()).build);
    const res = await fetch(RELEASES_API, { headers: { Accept: 'application/vnd.github+json' } });
    if (!res.ok) return null;
    localStorage.setItem(UPDATE_CHECK_KEY, String(Date.now()));
    const release = (await res.json()) as {
      tag_name: string;
      body?: string;
      assets?: { name: string; browser_download_url: string }[];
    };
    const latest = Number(/^android-v(\d+)$/.exec(release.tag_name)?.[1]);
    if (!Number.isFinite(latest) || !(latest > installed)) return null;
    const asset = release.assets?.find((a) => a.name.endsWith('.apk'));
    return {
      version: latest,
      url: asset?.browser_download_url ?? APK_URL,
      notes: release.body ?? '',
    };
  } catch {
    return null;
  }
}

/** Opens the APK download in the system browser; Android then offers to install it. */
export function downloadUpdate(url = APK_URL) {
  window.location.href = url;
}

/** Android phone using the website (not the app): we can suggest installing the app. */
export function isAndroidBrowser() {
  return !isNativeApp() && /Android/i.test(navigator.userAgent);
}

/** A light tap of feedback for quick repeated actions (marking attendance, pull-to-refresh). */
export function haptic() {
  if (isNativeApp()) {
    void import('@capacitor/haptics')
      .then(({ Haptics, ImpactStyle }) => Haptics.impact({ style: ImpactStyle.Light }))
      .catch(() => {});
  } else {
    navigator.vibrate?.(8);
  }
}
