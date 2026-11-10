/**
 * Keeps long-lived app sessions on the latest code. Phones keep the app in memory for hours, so
 * a copy opened before a deploy can keep running old code. When the app comes back after a while,
 * we compare the script the page is running with the one the site serves now and reload if it
 * changed (only after a real break, so nobody loses their place mid-task).
 */

import { noteReload } from './client-log';

/** Only check after the app was away at least this long. */
const AWAY_MS = 20 * 60_000;
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

/** Reloads into the new version if one was deployed while the app was away. */
export async function reloadIfOutdated(
  running: string | null = runningEntry(),
  reload: () => void = () => {
    noteReload('Reloaded into the new version');
    window.location.reload();
  },
) {
  if (!running) return false;
  const latest = await latestEntry();
  if (latest && latest !== running) {
    reload();
    return true;
  }
  return false;
}

export function startVersionCheck() {
  const running = runningEntry();
  if (!running) return;
  let hiddenAt = 0;
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      hiddenAt = Date.now();
      return;
    }
    if (hiddenAt && Date.now() - hiddenAt >= AWAY_MS) void reloadIfOutdated(running);
  });
}
