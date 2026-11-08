import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { IosInstallBanner, NotificationsCard } from '@/components/notifications';
import * as webPush from '@/app/web-push';
import { request as apiRequest } from '@/lib/api';

jest.mock('@/lib/env', () => ({
  API_URL: '',
  IS_DEV: false,
  MAPBOX_TOKEN: '',
  FIREBASE: {
    apiKey: 'k',
    projectId: 'athletiq',
    messagingSenderId: '1',
    appId: 'app',
    vapidKey: 'vapid',
  },
}));
jest.mock('@/lib/api', () => ({
  request: jest.fn(async () => undefined),
  errorMessage: (e: Error) => e.message,
}));
jest.mock('firebase/app', () => ({ initializeApp: jest.fn(() => ({})), getApps: () => [] }));
jest.mock('firebase/messaging', () => ({
  getMessaging: jest.fn(() => ({})),
  getToken: jest.fn(async () => 'web-fcm-token'),
}));

const request = apiRequest as unknown as jest.Mock;
const IPHONE =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1';
const DESKTOP = navigator.userAgent;

function setUA(ua: string) {
  Object.defineProperty(window.navigator, 'userAgent', { value: ua, configurable: true });
}
function setStandalone(on: boolean) {
  Object.defineProperty(window.navigator, 'standalone', { value: on, configurable: true });
}
let permission: NotificationPermission = 'default';

beforeEach(() => {
  jest.clearAllMocks();
  localStorage.clear();
  setUA(DESKTOP);
  setStandalone(false);
  permission = 'default';
  Object.defineProperty(window, 'Notification', {
    configurable: true,
    value: {
      get permission() {
        return permission;
      },
      requestPermission: jest.fn(async () => {
        permission = 'granted';
        return permission;
      }),
    },
  });
  Object.defineProperty(window, 'PushManager', { configurable: true, value: function () {} });
  const reg = { scope: '/' };
  Object.defineProperty(window.navigator, 'serviceWorker', {
    configurable: true,
    value: {
      register: jest.fn(async () => reg),
      getRegistration: jest.fn(async () => reg),
      addEventListener: jest.fn(),
    },
  });
});

describe('web push state', () => {
  it('asks iPhone Safari users to add the app to the Home Screen first', () => {
    setUA(IPHONE);
    expect(webPush.webPushState()).toBe('needs-install');
    setStandalone(true);
    expect(webPush.webPushState()).toBe('off');
  });

  it('reports blocked and unsupported browsers', () => {
    permission = 'denied';
    expect(webPush.webPushState()).toBe('blocked');
    // @ts-expect-error simulate a browser without push
    delete window.PushManager;
    expect(webPush.webPushState()).toBe('unsupported');
  });
});

describe('NotificationsCard', () => {
  it('turns notifications on and off for this device', async () => {
    const user = userEvent.setup();
    render(<NotificationsCard />);
    await user.click(screen.getByRole('button', { name: /turn on notifications/i }));
    await screen.findByText('Notifications are on for this device.');
    expect(request).toHaveBeenCalledWith('/me/devices', {
      method: 'POST',
      body: { token: 'web-fcm-token', platform: 'web' },
    });
    expect(webPush.webPushState()).toBe('on');

    await user.click(screen.getByRole('button', { name: /turn off/i }));
    await waitFor(() =>
      expect(request).toHaveBeenLastCalledWith('/me/devices', {
        method: 'DELETE',
        body: { token: 'web-fcm-token' },
        noRetry: true,
      }),
    );
    expect(webPush.webPushState()).toBe('off');
  });

  it('registers iPhones as iOS and refreshes silently after sign-in', async () => {
    setUA(IPHONE);
    setStandalone(true);
    expect(await webPush.enableWebPush()).toBe('on');
    expect(request).toHaveBeenLastCalledWith('/me/devices', {
      method: 'POST',
      body: { token: 'web-fcm-token', platform: 'ios' },
    });
    request.mockClear();
    await webPush.refreshWebPush();
    expect(request).toHaveBeenCalledTimes(1);
  });

  it('explains what to do when notifications are blocked or need installing', () => {
    permission = 'denied';
    const { unmount } = render(<NotificationsCard />);
    expect(screen.getByText(/Notifications are blocked/)).toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
    unmount();
    permission = 'default';
    setUA(IPHONE);
    render(<NotificationsCard />);
    expect(screen.getByText(/Add to Home Screen/)).toBeInTheDocument();
  });

  it('handles a refused permission prompt', async () => {
    (window.Notification.requestPermission as jest.Mock).mockImplementationOnce(async () => {
      permission = 'denied';
      return 'denied';
    });
    expect(await webPush.enableWebPush()).toBe('blocked');
    expect(request).not.toHaveBeenCalled();
  });
});

describe('IosInstallBanner', () => {
  it('shows install steps in iPhone Safari until dismissed', async () => {
    const user = userEvent.setup();
    setUA(IPHONE);
    const { unmount } = render(<IosInstallBanner />);
    expect(screen.getByRole('dialog', { name: /install athletiq/i })).toBeInTheDocument();
    expect(screen.getByText('Add to Home Screen')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Not now' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    unmount();
    render(<IosInstallBanner />);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument(); // remembered
  });

  it('stays hidden on other devices and inside the installed app', () => {
    const { unmount } = render(<IosInstallBanner />);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    unmount();
    setUA(IPHONE);
    setStandalone(true);
    render(<IosInstallBanner />);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});

describe('service worker', () => {
  it('registers and forwards notification taps to the router', async () => {
    const reg = await webPush.registerServiceWorker();
    expect(reg).toEqual({ scope: '/' });
    const onMessage = (navigator.serviceWorker.addEventListener as jest.Mock).mock.calls[0]![1] as (
      e: MessageEvent,
    ) => void;
    const seen = jest.fn();
    window.addEventListener('atq:navigate', (e) => seen((e as CustomEvent).detail), { once: true });
    onMessage({ data: { type: 'atq:navigate', link: '/registrations' } } as MessageEvent);
    expect(seen).toHaveBeenCalledWith('/registrations');
  });
});
