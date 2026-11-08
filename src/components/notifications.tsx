/** Notification settings and the iPhone "Add to Home Screen" guide. */
import { Bell, BellOff, BellRing, Plus, Share, X } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { isStandalone } from '@/app/install';
import { isNativeApp, registerPush } from '@/app/native';
import {
  disableWebPush,
  enableWebPush,
  isIOS,
  webPushState,
  type WebPushState,
} from '@/app/web-push';
import { errorMessage } from '@/lib/api';
import { Button } from './ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/primitives';

const MESSAGES: Record<WebPushState, string> = {
  unsupported: "This browser can't show notifications.",
  'needs-install':
    'On iPhone, notifications work in the Home Screen app: tap Share → Add to Home Screen, then open AthletiQ from its icon.',
  off: 'Get alerts for new registrations, flagged check-ins and your sessions for the day.',
  on: 'Notifications are on for this device.',
  blocked: 'Notifications are blocked. Allow them for AthletiQ in your phone or browser settings.',
};

export function NotificationsCard() {
  const [state, setState] = useState<WebPushState>(() => webPushState());
  const [busy, setBusy] = useState(false);

  if (isNativeApp()) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Notifications</CardTitle>
          <CardDescription>
            Alerts for registrations, flagged check-ins and today's sessions. Manage them in Android
            Settings → Apps → AthletiQ → Notifications.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button
            variant="tonal"
            onClick={() =>
              void registerPush().then((r) =>
                r === 'granted'
                  ? toast.success('Notifications are on')
                  : toast.error('Allow notifications for AthletiQ in Android settings'),
              )
            }
          >
            <BellRing /> Check notifications
          </Button>
        </CardContent>
      </Card>
    );
  }
  if (state === 'unsupported') return null;

  async function turnOn() {
    setBusy(true);
    try {
      const next = await enableWebPush();
      setState(next);
      if (next === 'on') toast.success("Notifications are on. You'll get alerts on this device.");
      else if (next === 'blocked') toast.error('Notifications are blocked in settings');
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function turnOff() {
    setBusy(true);
    await disableWebPush();
    setState(webPushState());
    setBusy(false);
    toast.success('Notifications turned off for this device');
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Notifications</CardTitle>
        <CardDescription>{MESSAGES[state]}</CardDescription>
      </CardHeader>
      {(state === 'off' || state === 'on') && (
        <CardContent>
          {state === 'off' ? (
            <Button loading={busy} onClick={() => void turnOn()}>
              {!busy && <Bell />} Turn on notifications
            </Button>
          ) : (
            <Button variant="outline" loading={busy} onClick={() => void turnOff()}>
              {!busy && <BellOff />} Turn off
            </Button>
          )}
        </CardContent>
      )}
    </Card>
  );
}

const DISMISS_KEY = 'atq-ios-install-dismissed';

/** iPhone Safari has no install button: show how to add AthletiQ to the Home Screen. */
export function IosInstallBanner() {
  const [hidden, setHidden] = useState(() => {
    if (!isIOS() || isStandalone() || isNativeApp()) return true;
    const at = Number(localStorage.getItem(DISMISS_KEY) ?? 0);
    return Date.now() - at < 14 * 86_400_000;
  });
  if (hidden) return null;
  return (
    <div
      role="dialog"
      aria-label="Install AthletiQ on your iPhone"
      className="fixed inset-x-3 bottom-[calc(4.25rem+env(safe-area-inset-bottom))] z-40 animate-rise rounded-2xl border bg-card p-4 shadow-e3 lg:hidden"
    >
      <button
        type="button"
        aria-label="Not now"
        onClick={() => {
          localStorage.setItem(DISMISS_KEY, String(Date.now()));
          setHidden(true);
        }}
        className="absolute top-3 right-3 cursor-pointer rounded-md p-1 text-muted-foreground hover:bg-muted"
      >
        <X className="size-4" />
      </button>
      <div className="flex items-start gap-3 pr-6">
        <img src="/icon-192.png" alt="" className="size-11 shrink-0 rounded-xl shadow-e1" />
        <div className="min-w-0">
          <p className="text-[15px] font-semibold">Install AthletiQ on your iPhone</p>
          <p className="mt-0.5 text-[13px] leading-snug text-muted-foreground">
            Full-screen app with notifications. Updates itself.
          </p>
        </div>
      </div>
      <ol className="mt-3 space-y-2 text-[13px]">
        <li className="flex items-center gap-2">
          <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-bold text-primary">
            1
          </span>
          Tap <Share aria-label="Share" className="size-4 text-primary" /> <b>Share</b> in Safari
        </li>
        <li className="flex items-center gap-2">
          <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-bold text-primary">
            2
          </span>
          Choose <Plus aria-hidden className="size-4" /> <b>Add to Home Screen</b>
        </li>
      </ol>
    </div>
  );
}
