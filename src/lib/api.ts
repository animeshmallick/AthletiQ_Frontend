import { API_URL } from '@/lib/env';
import { flush as flushClientLog, logClientEvent, routeOf } from '@/app/client-log';
import type { User } from './types';

/**
 * HTTP client for the AthletiQ API.
 *
 *  - The access token lives only in memory (never localStorage) to limit XSS blast radius.
 *  - The refresh token is an httpOnly cookie scoped to /api/v1/auth; on a 401 the client
 *    transparently refreshes once (single-flight, shared by concurrent requests) and retries.
 *  - Errors are normalised into `ApiError` with the server's code, message and field errors.
 */

export interface FieldError {
  path: string;
  message: string;
}

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly details?: unknown,
    readonly requestId?: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }

  /** Field-level validation errors (`{ fields: [{ path, message }] }`), if any. */
  get fieldErrors(): FieldError[] {
    const d = this.details as { fields?: FieldError[] } | undefined;
    return Array.isArray(d?.fields) ? d.fields : [];
  }

  get isNetwork() {
    return this.status === 0;
  }
}

export interface Envelope<T, M = Record<string, unknown>> {
  data: T;
  meta?: M;
}

export interface Session {
  accessToken: string;
  accessTokenExpiresIn: number;
  user: User;
}

type Listener = (session: Session | null) => void;

let accessToken: string | null = null;
/** When the access token stops working (ms since epoch); refreshed a little before that. */
let accessTokenExpiresAt = 0;
const listeners = new Set<Listener>();
let refreshInFlight: Promise<Session | null> | null = null;
/** Refresh this long before the access token expires, so requests never go out with a stale one. */
const REFRESH_EARLY_MS = 60_000;

export const tokenStore = {
  get: () => accessToken,
  set(session: Session | null) {
    accessToken = session?.accessToken ?? null;
    accessTokenExpiresAt = session ? Date.now() + session.accessTokenExpiresIn * 1000 : 0;
    listeners.forEach((l) => l(session));
  },
  subscribe(listener: Listener) {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  },
};

function url(path: string, query?: Record<string, unknown>): string {
  const base = `${API_URL}/api/v1${path}`;
  if (!query) return base;
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(query)) {
    if (v === undefined || v === null || v === '') continue;
    params.set(k, String(v));
  }
  const qs = params.toString();
  return qs ? `${base}?${qs}` : base;
}

async function toApiError(res: Response): Promise<ApiError> {
  try {
    const body = (await res.json()) as {
      error?: { code?: string; message?: string; details?: unknown; requestId?: string };
    };
    const e = body.error ?? {};
    return new ApiError(
      res.status,
      e.code ?? 'UNKNOWN',
      e.message ?? res.statusText ?? 'Request failed',
      e.details,
      e.requestId,
    );
  } catch {
    return new ApiError(res.status, 'UNKNOWN', res.statusText || 'Request failed');
  }
}

/**
 * Runs `fn` while holding a lock shared by every tab of the app, so two tabs never present the
 * same refresh cookie at once (the server would take that for a stolen token and sign out).
 */
function withRefreshLock<T>(fn: () => Promise<T>): Promise<T> {
  const locks = typeof navigator !== 'undefined' ? navigator.locks : undefined;
  return locks ? locks.request('atq-auth-refresh', fn) : fn();
}

/**
 * Exchanges the refresh cookie for a new access token. Resolves null when it can't; only a
 * definite "not signed in" (401/403) signs the user out — a dropped connection or a server
 * hiccup keeps the session so the next request can try again.
 */
export function refreshSession(): Promise<Session | null> {
  refreshInFlight ??= withRefreshLock(async () => {
    try {
      const res = await fetch(url('/auth/refresh'), {
        method: 'POST',
        credentials: 'include',
        headers: { 'X-Requested-With': 'XMLHttpRequest' },
      });
      if (!res.ok) {
        if (res.status === 401 || res.status === 403) {
          if (accessToken) {
            logClientEvent('reload', 'Signed out: the session ended', {
              details: { reason: 'session-ended', status: res.status },
            });
            void flushClientLog();
          }
          tokenStore.set(null);
        }
        return null;
      }
      const { data } = (await res.json()) as Envelope<Session>;
      tokenStore.set(data);
      return data;
    } catch {
      return null;
    }
  }).finally(() => {
    refreshInFlight = null;
  });
  return refreshInFlight;
}

/** Refreshes first when the access token has expired or is about to (e.g. after the phone slept). */
async function ensureFreshToken() {
  if (accessToken && Date.now() >= accessTokenExpiresAt - REFRESH_EARLY_MS) await refreshSession();
}

/** A call slower than this is logged (venues with poor signal). */
const SLOW_MS = 8_000;

export interface RequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  body?: unknown;
  query?: Record<string, unknown>;
  signal?: AbortSignal;
  /** Skip the automatic refresh-and-retry on 401 (used by auth endpoints). */
  noRetry?: boolean;
}

async function rawRequest(path: string, opts: RequestOptions): Promise<Response> {
  // X-Requested-With forces a CORS preflight, which the API requires on cookie-auth endpoints.
  const headers: Record<string, string> = {
    Accept: 'application/json',
    'X-Requested-With': 'XMLHttpRequest',
  };
  if (opts.body !== undefined) headers['Content-Type'] = 'application/json';
  if (accessToken) headers.Authorization = `Bearer ${accessToken}`;
  try {
    return await fetch(url(path, opts.query), {
      method: opts.method ?? 'GET',
      headers,
      body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
      credentials: 'include',
      signal: opts.signal,
    });
  } catch (err) {
    if ((err as Error).name === 'AbortError') throw err;
    logClientEvent('api', 'Could not reach the server', {
      details: { method: opts.method ?? 'GET', route: routeOf(path), status: 0 },
    });
    throw new ApiError(
      0,
      'NETWORK',
      'Could not reach the server. Check your connection and try again.',
    );
  }
}

/** Full envelope (`data` + `meta`). */
export async function requestEnvelope<T, M = Record<string, unknown>>(
  path: string,
  opts: RequestOptions = {},
): Promise<Envelope<T, M>> {
  if (!opts.noRetry) await ensureFreshToken();
  const started = Date.now();
  let res = await rawRequest(path, opts);

  if (res.status === 401 && !opts.noRetry) {
    const session = await refreshSession();
    if (session) res = await rawRequest(path, opts);
  }

  const took = Date.now() - started;
  if (took > SLOW_MS)
    logClientEvent('slow', `Slow call: ${opts.method ?? 'GET'} ${routeOf(path)}`, {
      details: { method: opts.method ?? 'GET', route: routeOf(path), ms: took, status: res.status },
    });
  if (!res.ok) {
    const error = await toApiError(res);
    if (res.status >= 500)
      logClientEvent('api', error.message, {
        details: {
          method: opts.method ?? 'GET',
          route: routeOf(path),
          status: res.status,
          code: error.code,
          requestId: error.requestId ?? null,
        },
      });
    throw error;
  }
  if (res.status === 204) return { data: undefined as T };
  return (await res.json()) as Envelope<T, M>;
}

export async function request<T>(path: string, opts: RequestOptions = {}): Promise<T> {
  return (await requestEnvelope<T>(path, opts)).data;
}

/** Fetches a binary resource (e.g. invoice PDF) with auth, returning a Blob. */
export async function requestBlob(path: string): Promise<Blob> {
  await ensureFreshToken();
  let res = await rawRequest(path, {});
  if (res.status === 401 && (await refreshSession())) res = await rawRequest(path, {});
  if (!res.ok) throw await toApiError(res);
  return res.blob();
}

/** POSTs JSON and returns the binary response (e.g. a shared report after a PIN check). */
export async function requestBlobPost(path: string, body: unknown): Promise<Blob> {
  const res = await rawRequest(path, { method: 'POST', body });
  if (!res.ok) throw await toApiError(res);
  return res.blob();
}

export const api = {
  get: <T>(path: string, query?: Record<string, unknown>, signal?: AbortSignal) =>
    request<T>(path, { query, signal }),
  page: <T, M = PageMeta>(path: string, query?: Record<string, unknown>, signal?: AbortSignal) =>
    requestEnvelope<T, M>(path, { query, signal }),
  post: <T>(path: string, body?: unknown) => request<T>(path, { method: 'POST', body }),
  put: <T>(path: string, body?: unknown) => request<T>(path, { method: 'PUT', body }),
  patch: <T>(path: string, body?: unknown) => request<T>(path, { method: 'PATCH', body }),
  delete: <T = void>(path: string, query?: Record<string, unknown>) =>
    request<T>(path, { method: 'DELETE', query }),
};

export interface PageMeta {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

/** Human-friendly message for any thrown value. */
export function errorMessage(
  err: unknown,
  fallback = 'Something went wrong. Please try again.',
): string {
  if (err instanceof ApiError) return err.message;
  if (err instanceof Error && err.message) return err.message;
  return fallback;
}
