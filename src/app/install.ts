/**
 * "Install app" support. Chrome/Edge on Android and desktop fire `beforeinstallprompt` when the site
 * is installable; we keep the event so the user can install from the account menu at any time.
 * iOS Safari has no such event: users there use Share → Add to Home Screen.
 */
import { useSyncExternalStore } from 'react';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

let deferred: BeforeInstallPromptEvent | null = null;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault(); // we show our own entry instead of the mini-infobar
    deferred = e as BeforeInstallPromptEvent;
    emit();
  });
  window.addEventListener('appinstalled', () => {
    deferred = null;
    emit();
  });
}

/** True when running as an installed app (home-screen icon) rather than in a browser tab. */
export function isStandalone() {
  if (typeof window === 'undefined') return false;
  return (
    window.matchMedia?.('(display-mode: standalone)').matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

/** Returns an install function when the browser offers installation, otherwise null. */
export function useInstallPrompt(): (() => Promise<boolean>) | null {
  const available = useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => deferred !== null,
    () => false,
  );
  if (!available) return null;
  return async () => {
    const evt = deferred;
    if (!evt) return false;
    deferred = null;
    emit();
    await evt.prompt();
    const { outcome } = await evt.userChoice;
    return outcome === 'accepted';
  };
}

/** Test hook: simulate the browser offering installation. */
export function __setInstallEvent(e: BeforeInstallPromptEvent | null) {
  deferred = e;
  emit();
}
