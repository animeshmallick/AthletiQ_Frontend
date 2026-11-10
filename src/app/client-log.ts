/**
 * Client-side logs: what goes wrong on people's devices, sent to the server so admins can see it
 * (Audit log → Errors → App errors).
 *
 * Captured: screen crashes, uncaught errors and rejections, old versions missing code after a
 * deploy, freezes (the main thread blocked for seconds), screens that never finish loading, our
 * API failing as the device saw it, other failed requests (scripts, images), console errors, and
 * every time the app reloads itself or starts over at Home (with why).
 *
 * Kept light: events wait in a small in-memory queue, repeats merge into one with a count, and
 * they go out in one request every few seconds (or when the app goes to the background), with a
 * hard cap per session. Nothing here may throw into the app; if sending fails it quietly retries.
 */
import { Capacitor } from '@capacitor/core';
import { API_URL } from '@/lib/env';

export type ClientEventKind =
  | 'crash'
  | 'error'
  | 'update'
  | 'freeze'
  | 'stuck'
  | 'api'
  | 'network'
  | 'console'
  | 'reload'
  | 'slow'
  | 'offline'
  | 'shown'
  | 'device';

interface ClientEvent {
  kind: ClientEventKind;
  message: string;
  stack?: string;
  screen: string;
  appVersion: string | null;
  platform: 'web' | 'pwa' | 'android' | 'ios';
  online: boolean;
  count: number;
  at: string;
  details?: Record<string, unknown>;
}

const FLUSH_AFTER_MS = 5_000;
const BATCH = 25;
/** Per page load: a runaway loop can't flood the server or the phone. */
const SESSION_CAP = 300;
const MERGE_WINDOW_MS = 60_000;

const queue: ClientEvent[] = [];
const recent = new Map<string, { event: ClientEvent; at: number }>();
let sent = 0;
let timer: ReturnType<typeof setTimeout> | null = null;
let getToken: () => string | null = () => null;
let enabled = false;

/** The last screens visited and buttons tapped (labels only, never typed text). */
const trail: string[] = [];
const TRAIL_KINDS = new Set<ClientEventKind>(['crash', 'error', 'console', 'update', 'shown']);

export function addCrumb(crumb: string) {
  const c = crumb.slice(0, 60);
  if (trail[trail.length - 1] === c) return;
  trail.push(c);
  if (trail.length > 10) trail.shift();
}

const appVersion = typeof __BUILD__ !== 'undefined' ? __BUILD__.commit : null;

function platform(): ClientEvent['platform'] {
  try {
    const p = Capacitor.getPlatform();
    if (p === 'android' || p === 'ios') return p;
    return window.matchMedia?.('(display-mode: standalone)').matches ? 'pwa' : 'web';
  } catch {
    return 'web';
  }
}

/** ids and numbers in a path → placeholders, so "/students/abc…" groups as "/students/:id". */
export function routeOf(path: string) {
  return path
    .split('?')[0]!
    .replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, ':id')
    .replace(/\/\d{4}-\d{2}-\d{2}(?=\/|$)/g, '/:date')
    .replace(/\/\d+(?=\/|$)/g, '/:n');
}

const text = (v: unknown, max = 500): string => {
  try {
    if (v instanceof Error) return `${v.name}: ${v.message}`.slice(0, max);
    if (typeof v === 'string') return v.slice(0, max);
    return JSON.stringify(v)?.slice(0, max) ?? String(v);
  } catch {
    return String(v).slice(0, max);
  }
};

/** Records one event (merged with the same one from the last minute). Never throws. */
export function logClientEvent(
  kind: ClientEventKind,
  message: unknown,
  extra: { stack?: string | null; details?: Record<string, unknown> } = {},
) {
  try {
    if (!enabled || sent + queue.length >= SESSION_CAP) return;
    const screen = routeOf(window.location.pathname);
    const msg = text(message) || 'Unknown error';
    const key = `${kind}|${msg}|${screen}`;
    const now = Date.now();
    const prior = recent.get(key);
    // Same problem again within a minute, not sent yet: count it instead of queueing another.
    if (prior && now - prior.at < MERGE_WINDOW_MS && queue.includes(prior.event)) {
      prior.event.count += 1;
      return;
    }
    const event: ClientEvent = {
      kind,
      message: msg,
      stack: extra.stack?.slice(0, 4000) ?? undefined,
      screen,
      appVersion,
      platform: platform(),
      online: navigator.onLine,
      count: 1,
      at: new Date(now).toISOString(),
      details:
        TRAIL_KINDS.has(kind) && trail.length
          ? { ...extra.details, trail: [...trail] }
          : extra.details,
    };
    queue.push(event);
    recent.set(key, { event, at: now });
    if (recent.size > 200) recent.clear();
    timer ??= setTimeout(() => void flush(), FLUSH_AFTER_MS);
  } catch {
    // Logging must never break the app.
  }
}

/** Sends what's queued. `keepalive` lets it finish while the page is going away. */
export async function flush(keepalive = false) {
  if (timer) clearTimeout(timer);
  timer = null;
  if (!queue.length) return;
  const batch = queue.splice(0, BATCH);
  try {
    const token = getToken();
    const res = await fetch(`${API_URL}/api/v1/client-events`, {
      method: 'POST',
      keepalive,
      credentials: 'omit',
      headers: {
        'Content-Type': 'application/json',
        'X-Requested-With': 'XMLHttpRequest',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({ events: batch }),
    });
    if (!res.ok && res.status !== 400) throw new Error(String(res.status));
    sent += batch.length;
  } catch {
    // Offline or the server is busy: keep them for the next try (oldest first, capped).
    queue.unshift(...batch.slice(0, BATCH));
    if (!keepalive) timer = setTimeout(() => void flush(), FLUSH_AFTER_MS * 6);
    return;
  }
  if (queue.length) timer = setTimeout(() => void flush(), 1_000);
}

// ─── Capture ────────────────────────────────────────────────────────────────

/** Where the person was and when, to tell "the phone restarted the app" from a fresh open. */
const LAST_KEY = 'atq-last-screen';

function trackRestarts() {
  try {
    const nav = performance.getEntriesByType?.('navigation')[0] as
      PerformanceNavigationTiming | undefined;
    const last = JSON.parse(
      sessionStorage.getItem(LAST_KEY) ?? localStorage.getItem(LAST_KEY) ?? 'null',
    ) as {
      screen: string;
      at: number;
      why?: string;
    } | null;
    localStorage.removeItem(LAST_KEY);
    sessionStorage.removeItem(LAST_KEY);
    const away = last ? Date.now() - last.at : null;
    if (last?.why)
      // The app reloaded itself on purpose (new version, role switch…): say why.
      logClientEvent('reload', last.why, {
        details: { reason: last.why, from: last.screen, afterMs: away },
      });
    else if (nav?.type === 'reload')
      logClientEvent('reload', 'Page reloaded', {
        details: { reason: 'reload', from: last?.screen },
      });
    else if (last && away !== null && away < 30 * 60_000 && last.screen !== '/')
      // Opened again shortly after being on another screen, but starting over: the phone (or the
      // browser) closed the app in the background to free memory.
      logClientEvent('reload', 'App restarted from the start', {
        details: { reason: 'restarted', from: last.screen, afterMs: away },
      });
  } catch {
    // Storage may be unavailable (private mode).
  }
  const remember = () => {
    try {
      localStorage.setItem(
        LAST_KEY,
        JSON.stringify({ screen: routeOf(window.location.pathname), at: Date.now() }),
      );
    } catch {
      // ignore
    }
  };
  document.addEventListener('visibilitychange', () => document.hidden && remember());
  window.addEventListener('pagehide', remember);
}

/** Call right before the app reloads itself or sends the person home, with why. */
export function noteReload(why: string) {
  try {
    const entry = JSON.stringify({
      screen: routeOf(window.location.pathname),
      at: Date.now(),
      why,
    });
    sessionStorage.setItem(LAST_KEY, entry);
    localStorage.setItem(LAST_KEY, entry);
  } catch {
    logClientEvent('reload', why, { details: { reason: why } });
    void flush(true);
  }
}

/** The main thread blocked for seconds while the app was on screen. */
function watchFreezes() {
  let last = performance.now();
  let visible = !document.hidden;
  setInterval(() => {
    const now = performance.now();
    const gap = now - last;
    last = now;
    // Timers pause in the background; only count gaps while the app was showing throughout.
    if (visible && !document.hidden && gap > 5_000)
      logClientEvent('freeze', `App froze for ${(gap / 1000).toFixed(1)}s`, {
        details: { ms: Math.round(gap) },
      });
    visible = !document.hidden;
  }, 1_000);
  document.addEventListener('visibilitychange', () => {
    visible = false;
    last = performance.now();
  });
}

function wrapConsole() {
  const original = console.error.bind(console);
  console.error = (...args: unknown[]) => {
    original(...args);
    const err = args.find((a): a is Error => a instanceof Error);
    logClientEvent('console', args.map((a) => text(a, 300)).join(' '), { stack: err?.stack });
  };
}

/** Taps on buttons and links, by their label (inputs and typed text are never recorded). */
function trackTaps() {
  document.addEventListener(
    'click',
    (e) => {
      const el = (e.target as HTMLElement | null)?.closest?.(
        'button, a, [role="button"], [role="tab"], [role="menuitem"], [role="radio"]',
      );
      if (!el) return;
      const label = (el.getAttribute('aria-label') ?? el.textContent ?? '')
        .replace(/\s+/g, ' ')
        .trim();
      if (label) addCrumb(`tap: ${label.slice(0, 40)}`);
    },
    { capture: true, passive: true },
  );
}

/** Lost the connection, and for how long (logged when it comes back). */
function trackConnectivity() {
  let since = navigator.onLine ? 0 : Date.now();
  window.addEventListener('offline', () => {
    since = Date.now();
    addCrumb('went offline');
  });
  window.addEventListener('online', () => {
    if (!since) return;
    const ms = Date.now() - since;
    since = 0;
    addCrumb('back online');
    if (ms >= 3_000)
      logClientEvent('offline', `Offline for ${Math.round(ms / 1000)}s`, { details: { ms } });
    void flush();
  });
}

/** Starts capturing (once, in production builds). */
export function startClientLog(tokenGetter: () => string | null) {
  if (enabled) return;
  enabled = true;
  getToken = tokenGetter;

  window.addEventListener(
    'error',
    (e) => {
      const target = e.target as HTMLElement | null;
      // A script, stylesheet or image that failed to load.
      if (target && target !== (window as unknown) && 'tagName' in target) {
        const src = (target as HTMLImageElement).src || (target as HTMLLinkElement).href;
        logClientEvent('network', `Failed to load ${target.tagName.toLowerCase()}`, {
          details: { url: src ? routeOf(src.replace(/^https?:\/\/[^/]+/, '')) : null },
        });
        return;
      }
      logClientEvent('error', e.error ?? e.message, {
        stack: (e.error as Error | undefined)?.stack,
        details: {
          source: e.filename ? routeOf(e.filename.replace(/^https?:\/\/[^/]+/, '')) : null,
        },
      });
    },
    true,
  );
  window.addEventListener('unhandledrejection', (e) => {
    const r = e.reason as { name?: string; status?: number; stack?: string } | undefined;
    // Aborted requests and API errors (logged when they happen) aren't new problems.
    if (r?.name === 'AbortError' || r?.name === 'ApiError') return;
    logClientEvent('error', e.reason, { stack: r?.stack });
  });
  // A screen's code is gone after a deploy (an old copy of the app): reload once into the new one.
  window.addEventListener('vite:preloadError', (e) => {
    logClientEvent('update', 'Screen code missing after an update', {
      details: { payload: text((e as Event & { payload?: unknown }).payload, 200) },
    });
    try {
      if (!sessionStorage.getItem('atq-preload-reloaded')) {
        sessionStorage.setItem('atq-preload-reloaded', '1');
        e.preventDefault();
        noteReload('Reloaded into the new version (screen code was missing)');
        window.location.reload();
      }
    } catch {
      // ignore
    }
  });
  document.addEventListener('visibilitychange', () => document.hidden && void flush(true));
  window.addEventListener('pagehide', () => void flush(true));
  wrapConsole();
  watchFreezes();
  trackRestarts();
  trackTaps();
  trackConnectivity();
  addCrumb(`open ${routeOf(window.location.pathname)}`);
}

/** Test hook: clears queued state. */
export function __resetClientLog() {
  queue.length = 0;
  recent.clear();
  trail.length = 0;
  sent = 0;
  enabled = false;
  if (timer) clearTimeout(timer);
  timer = null;
}
/** Test hook: what's waiting to be sent. */
export const __queued = () => queue;
