/**
 * Crash reporting with Sentry, only when VITE_SENTRY_DSN is set at build time. The SDK is
 * loaded lazily so it never weighs on the first paint. Errors only (no tracing, no replays);
 * nothing personal is sent: no cookies, request bodies, query strings, emails or IPs.
 */
import { MODE, SENTRY_DSN } from '@/lib/env';

type Capture = (err: unknown, context?: Record<string, unknown>) => void;

let capture: Capture | null = null;
const pending: [unknown, Record<string, unknown> | undefined][] = [];

/** Reports an error (queued until the SDK has loaded; dropped when reporting is off). */
export function reportError(err: unknown, context?: Record<string, unknown>) {
  if (capture) capture(err, context);
  else if (SENTRY_DSN && pending.length < 20) pending.push([err, context]);
}

/** Drops anything that could identify a person or carry a secret. */
export function scrubUrl(url: string | undefined) {
  return url?.split(/[?#]/)[0];
}

export async function initMonitoring() {
  const dsn = SENTRY_DSN;
  if (!dsn) return false;
  try {
    const Sentry = await import('@sentry/react');
    Sentry.init({
      dsn,
      environment: MODE,
      release: typeof __BUILD__ !== 'undefined' ? (__BUILD__.commit ?? undefined) : undefined,
      tracesSampleRate: 0,
      dataCollection: {
        userInfo: false,
        cookies: false,
        httpBodies: [],
        urlQueryParams: false,
        httpHeaders: false,
      },
      // Noise from browser extensions, flaky networks and stale tabs after a deploy.
      ignoreErrors: [
        'ResizeObserver loop',
        'Failed to fetch',
        'NetworkError',
        'Load failed',
        'Failed to fetch dynamically imported module',
        'Importing a module script failed',
      ],
      beforeSend(event) {
        if (event.request) {
          event.request.url = scrubUrl(event.request.url);
          delete event.request.cookies;
          delete event.request.data;
          delete event.request.query_string;
        }
        delete event.user;
        return event;
      },
      beforeBreadcrumb(crumb) {
        if (crumb.data && typeof crumb.data.url === 'string')
          crumb.data.url = scrubUrl(crumb.data.url);
        if (crumb.category === 'navigation' && crumb.data) {
          crumb.data.from = scrubUrl(crumb.data.from as string | undefined);
          crumb.data.to = scrubUrl(crumb.data.to as string | undefined);
        }
        return crumb;
      },
    });
    capture = (err, context) =>
      Sentry.captureException(err, context ? { extra: context } : undefined);
    for (const [err, context] of pending.splice(0)) capture(err, context);
    return true;
  } catch {
    return false; // reporting is best-effort
  }
}
