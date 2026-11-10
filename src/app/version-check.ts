/**
 * Keeps the app on the latest code. The Android/iPhone apps and installed web apps load the live
 * site, and phones keep the app in memory for hours, so a copy opened before a deploy can keep
 * running old code.
 *
 * - When a newer version is live, an "Update" button appears (header and menu). Tapping it clears
 *   the app's cached files and reloads into the new version; the sign-in is kept (it lives in a
 *   secure cookie, which is left alone).
 * - Coming back after a long break (20+ min) with a newer version live, the app updates on its own
 *   (nobody is mid-task then).
 *
 * Checks: at start, when the app comes back to the screen, and every 10 minutes while it's open.
 */
import { useSyncExternalStore } from 'react';
import { noteReload } from './client-log';

/** Away at least this long: update without asking. */
const AWAY_MS = 20 * 60_000;
const POLL_MS = 10 * 60_000;
const ENTRY = /\/assets\/index-[\w-]+\.js/;

/** The entry script this page was loaded with (null in development). */
function runningEntry(): string | null {
  const src = document
    .querySelector<HTMLScriptElement>('script[type="module"][src*="/assets/index-"]')
    ?.getAttribute('src');
  return src?.match(ENTRY)?.[0] ?? null;
}

/** The entry script the site serves right now. */
async function latestEntry(): Promise<string | null> {
  try {
    const res = await fetch('/', { cache: 'no-store', credentials: 'same-origin' });
    if (!res.ok) return null;
    return (await res.text()).match(ENTRY)?.[0] ?? null;
  } catch {
    return null; // offline: try again next time
  }
}

// ─── "Update available" state ───────────────────────────────────────────────

let available = false;
const listeners = new Set<() => void>();
function setAvailable(v: boolean) {
  if (available === v) return;
  available = v;
  listeners.forEach((l) => l());
}

/** True when a newer version of the app is live (shows the Update button). */
export function useUpdateAvailable() {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => available,
    () => false,
  );
}

/** Is a newer version live than the one this page runs? */
export async function checkForWebUpdate(running: string | null = runningEntry()) {
  if (!running) return false;
  const latest = await latestEntry();
  const newer = !!latest && latest !== running;
  setAvailable(newer);
  return newer;
}

/**
 * Moves to the latest version: clears the app's cached files (not the sign-in or settings) and
 * reloads. Safe to call more than once.
 */
export async function applyUpdate(
  why = 'Updated to the new version',
  reload: () => void = () => window.location.reload(),
) {
  noteReload(why);
  try {
    if ('caches' in window) {
      const keys = await caches.keys();
      await Promise.all(keys.map((k) => caches.delete(k)));
    }
  } catch {
    // Cache Storage unavailable: the reload still fetches the new version.
  }
  try {
    const reg = await navigator.serviceWorker?.getRegistration();
    await reg?.update();
  } catch {
    // No service worker (Android app) or offline.
  }
  reload();
}

/** Reloads into the new version if one was deployed while the app was away. */
export async function reloadIfOutdated(
  running: string | null = runningEntry(),
  reload: () => void = () => void applyUpdate('Reloaded into the new version after a break'),
) {
  if (!(await checkForWebUpdate(running))) return false;
  reload();
  return true;
}

export function startVersionCheck() {
  const running = runningEntry();
  if (!running) return;
  let hiddenAt = 0;
  void checkForWebUpdate(running);
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      hiddenAt = Date.now();
      return;
    }
    if (hiddenAt && Date.now() - hiddenAt >= AWAY_MS) void reloadIfOutdated(running);
    else void checkForWebUpdate(running);
  });
  setInterval(() => {
    if (!document.hidden) void checkForWebUpdate(running);
  }, POLL_MS);
}
