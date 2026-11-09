import { API_URL } from '@/lib/env';
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
const listeners = new Set<Listener>();
let refreshInFlight: Promise<Session | null> | null = null;

export const tokenStore = {
  get: () => accessToken,
  set(session: Session | null) {
    accessToken = session?.accessToken ?? null;
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

/** Exchanges the refresh cookie for a new access token. Resolves null when signed out. */
export function refreshSession(): Promise<Session | null> {
  refreshInFlight ??= (async () => {
    try {
      const res = await fetch(url('/auth/refresh'), {
        method: 'POST',
        credentials: 'include',
        headers: { 'X-Requested-With': 'XMLHttpRequest' },
      });
      if (!res.ok) {
        tokenStore.set(null);
        return null;
      }
      const { data } = (await res.json()) as Envelope<Session>;
      tokenStore.set(data);
      return data;
    } catch {
      return null;
    } finally {
      refreshInFlight = null;
    }
  })();
  return refreshInFlight;
}

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
  let res = await rawRequest(path, opts);

  if (res.status === 401 && !opts.noRetry) {
    const session = await refreshSession();
    if (session) res = await rawRequest(path, opts);
  }

  if (!res.ok) throw await toApiError(res);
  if (res.status === 204) return { data: undefined as T };
  return (await res.json()) as Envelope<T, M>;
}

export async function request<T>(path: string, opts: RequestOptions = {}): Promise<T> {
  return (await requestEnvelope<T>(path, opts)).data;
}

/** Fetches a binary resource (e.g. invoice PDF) with auth, returning a Blob. */
export async function requestBlob(path: string): Promise<Blob> {
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
