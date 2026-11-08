/**
 * Android shell behaviour with Capacitor plugins mocked as if running inside the app.
 */
import { App } from '@capacitor/app';
import { SystemBars } from '@capacitor/core';
import { PushNotifications } from '@capacitor/push-notifications';
import * as native from '@/app/native';
import { request as apiRequest } from '@/lib/api';

type Listener = (arg: never) => unknown;
const listeners: Record<string, Listener> = {};

jest.mock('@capacitor/core', () => ({
  Capacitor: { isNativePlatform: () => true },
  SystemBars: { setStyle: jest.fn(async () => undefined) },
  SystemBarsStyle: { Dark: 'DARK', Light: 'LIGHT' },
}));
jest.mock('@capacitor/app', () => ({
  App: {
    addListener: jest.fn(async (event: string, fn: Listener) => {
      listeners['app:' + event] = fn;
      return { remove: async () => undefined };
    }),
    minimizeApp: jest.fn(async () => undefined),
    getInfo: jest.fn(async () => ({ build: '3', version: '1.0.3' })),
  },
}));
jest.mock('@capacitor/splash-screen', () => ({
  SplashScreen: { hide: jest.fn(async () => undefined) },
}));
jest.mock('@capacitor/push-notifications', () => ({
  PushNotifications: {
    checkPermissions: jest.fn(async () => ({ receive: 'prompt' })),
    requestPermissions: jest.fn(async () => ({ receive: 'granted' })),
    createChannel: jest.fn(async () => undefined),
    removeAllListeners: jest.fn(async () => undefined),
    addListener: jest.fn(async (event: string, fn: Listener) => {
      listeners['push:' + event] = fn;
      return { remove: async () => undefined };
    }),
    register: jest.fn(async () => undefined),
  },
}));
jest.mock('@/lib/api', () => ({ request: jest.fn(async () => undefined) }));

const setStyle = SystemBars.setStyle as jest.Mock;
const request = apiRequest as unknown as jest.Mock;
const push = PushNotifications as unknown as Record<string, jest.Mock>;
const appListeners = new Proxy({} as Record<string, Listener>, {
  get: (_t, k: string) => listeners['app:' + k],
});
const pushListeners = new Proxy({} as Record<string, Listener>, {
  get: (_t, k: string) => listeners['push:' + k],
});
const navigate = jest.fn();
native.setNativeNavigator(navigate);

beforeEach(() => {
  jest.clearAllMocks();
  localStorage.clear();
  document.body.innerHTML = '';
  window.history.replaceState(null, '', '/');
});

describe('native shell', () => {
  it('detects the app and never suggests the APK inside it', () => {
    expect(native.isNativeApp()).toBe(true);
    expect(native.isAndroidBrowser()).toBe(false);
  });

  it('follows the theme in the system bars', async () => {
    await native.initNativeShell();
    expect(setStyle).toHaveBeenLastCalledWith({ style: 'LIGHT' });
    document.documentElement.classList.add('dark');
    await new Promise((r) => setTimeout(r, 0));
    expect(setStyle).toHaveBeenLastCalledWith({ style: 'DARK' });
    document.documentElement.classList.remove('dark');
  });

  it('handles the hardware back button like a native app', async () => {
    await native.initNativeShell();
    const back = appListeners.backButton as (e: { canGoBack: boolean }) => void;

    // 1. An open sheet closes first.
    const dialog = document.createElement('div');
    dialog.setAttribute('role', 'dialog');
    document.body.appendChild(dialog);
    const escape = jest.fn();
    document.addEventListener('keydown', (e) => e.key === 'Escape' && escape(), { once: true });
    back({ canGoBack: true });
    expect(escape).toHaveBeenCalled();
    dialog.remove();

    // 2. Inner screens go back, or to Today when there is no history.
    window.history.replaceState(null, '', '/students/abc');
    const historyBack = jest.spyOn(window.history, 'back').mockImplementation(() => undefined);
    back({ canGoBack: true });
    expect(historyBack).toHaveBeenCalled();
    back({ canGoBack: false });
    expect(navigate).toHaveBeenCalledWith('/', { replace: true });

    // 3. On Today the app goes to the background instead of closing.
    window.history.replaceState(null, '', '/');
    back({ canGoBack: false });
    expect(App.minimizeApp).toHaveBeenCalled();
  });
});

describe('push notifications', () => {
  it('asks permission, registers the device and opens tapped notifications', async () => {
    expect(await native.registerPush()).toBe('granted');
    expect(push.requestPermissions!).toHaveBeenCalled();
    expect(push.createChannel!).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'default', importance: 4 }),
    );
    expect(push.register!).toHaveBeenCalled();

    (pushListeners.registration as (t: { value: string }) => void)({ value: 'fcm-token-123' });
    expect(request).toHaveBeenCalledWith('/me/devices', {
      method: 'POST',
      body: { token: 'fcm-token-123', platform: 'android' },
    });

    (pushListeners.pushNotificationActionPerformed as (a: object) => void)({
      notification: { data: { link: '/registrations' } },
    });
    expect(navigate).toHaveBeenCalledWith('/registrations');
    // Links must stay inside the app.
    (pushListeners.pushNotificationActionPerformed as (a: object) => void)({
      notification: { data: { link: 'https://evil.example' } },
    });
    expect(navigate).toHaveBeenCalledTimes(1);

    // Signing out removes the device.
    await native.unregisterPush();
    expect(request).toHaveBeenLastCalledWith('/me/devices', {
      method: 'DELETE',
      body: { token: 'fcm-token-123' },
      noRetry: true,
    });
  });

  it('respects a refusal', async () => {
    push.checkPermissions!.mockResolvedValueOnce({ receive: 'denied' });
    expect(await native.registerPush()).toBe('denied');
    expect(push.register!).not.toHaveBeenCalled();
    await native.unregisterPush(); // no token stored → nothing to do
    expect(request).not.toHaveBeenCalled();
  });
});

describe('app updates', () => {
  const release = (tag: string) =>
    new Response(
      JSON.stringify({
        tag_name: tag,
        body: 'Faster check-in',
        assets: [{ name: 'athletiq.apk', browser_download_url: 'https://x/athletiq.apk' }],
      }),
      { status: 200 },
    );

  it('offers newer APKs, at most every few hours unless asked', async () => {
    const fetchMock = jest.fn(async () => release('android-v5'));
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    expect(await native.checkForAppUpdate()).toEqual({
      version: 5,
      url: 'https://x/athletiq.apk',
      notes: 'Faster check-in',
    });
    expect(await native.checkForAppUpdate()).toBeNull(); // throttled
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(await native.checkForAppUpdate(true)).not.toBeNull();
  });

  it('stays quiet when up to date or offline', async () => {
    globalThis.fetch = jest.fn(async () => release('android-v3')) as unknown as typeof fetch;
    expect(await native.checkForAppUpdate(true)).toBeNull();
    globalThis.fetch = jest.fn(async () => {
      throw new TypeError('offline');
    }) as unknown as typeof fetch;
    expect(await native.checkForAppUpdate(true)).toBeNull();
    globalThis.fetch = jest.fn(
      async () => new Response('', { status: 403 }),
    ) as unknown as typeof fetch;
    expect(await native.checkForAppUpdate(true)).toBeNull();
  });
});
