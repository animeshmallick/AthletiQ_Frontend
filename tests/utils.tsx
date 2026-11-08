import { QueryClient } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactElement } from 'react';
import { createMemoryRouter, RouterProvider, type RouteObject } from 'react-router';
import { useAuth } from '@/app/auth';
import { Providers } from '@/app/providers';
import type { User } from '@/lib/types';

// ─── Fetch-level API mock ────────────────────────────────────────────────────

export interface MockCall {
  method: string;
  path: string;
  query: URLSearchParams;
  body: unknown;
  headers: Record<string, string>;
}

type Handler = (call: MockCall) => { status?: number; body?: unknown } | unknown;

/**
 * Installs a fetch mock. Keys are "METHOD /path" (path after /api/v1, no query string).
 * Handlers return a response body (wrapped as `{ data }` automatically unless it already has
 * `data`/`error`) or `{ status, body }` for full control.
 */
export function mockApi(routes: Record<string, Handler>) {
  const calls: MockCall[] = [];
  const fetchMock = jest.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input), 'http://localhost');
    const path = url.pathname.replace(/^\/api\/v1/, '');
    const method = (init?.method ?? 'GET').toUpperCase();
    const body = typeof init?.body === 'string' ? JSON.parse(init.body) : undefined;
    const call: MockCall = {
      method,
      path,
      query: url.searchParams,
      body,
      headers: (init?.headers ?? {}) as Record<string, string>,
    };
    calls.push(call);

    const key = `${method} ${path}`;
    const handler = routes[key] ?? Object.entries(routes).find(([k]) => matchPattern(k, key))?.[1];
    if (!handler) {
      if (key === 'POST /auth/refresh')
        return json(401, { error: { code: 'UNAUTHENTICATED', message: 'No session' } });
      return json(404, { error: { code: 'NOT_FOUND', message: `Unmocked ${key}` } });
    }
    const out = handler(call) as { status?: number; body?: unknown } | undefined;
    if (out && typeof out === 'object' && 'status' in out && typeof out.status === 'number') {
      return out.status === 204 ? new Response(null, { status: 204 }) : json(out.status, out.body);
    }
    const payload =
      out && typeof out === 'object' && ('data' in out || 'error' in out) ? out : { data: out };
    return json(200, payload);
  });
  global.fetch = fetchMock as unknown as typeof fetch;
  return {
    calls,
    fetchMock,
    find: (key: string) => calls.filter((c) => `${c.method} ${c.path}` === key),
  };
}

/** "GET /students/:id" matches "GET /students/abc". */
function matchPattern(pattern: string, key: string) {
  if (!pattern.includes(':')) return false;
  const re = new RegExp(`^${pattern.replace(/:[^/]+/g, '[^/]+')}$`);
  return re.test(key);
}

export function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

// ─── Fixtures ────────────────────────────────────────────────────────────────

export const coachUser: User = {
  id: 'coach-1',
  email: 'coach@example.com',
  name: 'Ravi Kumar',
  phone: '+919876543210',
  role: 'coach',
  status: 'active',
  lastLoginAt: null,
  createdAt: '2026-01-01T00:00:00Z',
};

export const adminUser: User = {
  ...coachUser,
  id: 'admin-1',
  email: 'admin@example.com',
  name: 'Asha Admin',
  role: 'admin',
};

export function sessionFor(user: User) {
  return { accessToken: `token-${user.id}`, accessTokenExpiresIn: 900, user };
}

// ─── Rendering ───────────────────────────────────────────────────────────────

export function testQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: Infinity, staleTime: Infinity },
      mutations: { retry: false },
    },
  });
}

/**
 * Renders a page inside all providers and a memory router. When `user` is given, the refresh
 * endpoint returns that session so the app boots signed in.
 */
export async function renderPage(
  element: ReactElement,
  {
    path = '/',
    route = '/',
    user,
    extraRoutes = [],
  }: { path?: string; route?: string; user?: User; extraRoutes?: RouteObject[] } = {},
) {
  if (user) {
    // Boot signed in: answer the session-restore call with this user.
    const inner = global.fetch;
    global.fetch = jest.fn((input: RequestInfo | URL, init?: RequestInit) =>
      String(input).endsWith('/auth/refresh')
        ? Promise.resolve(json(200, { data: sessionFor(user) }))
        : inner(input, init),
    ) as unknown as typeof fetch;
  }
  const router = createMemoryRouter(
    [
      { path, element: user ? <SignedIn>{element}</SignedIn> : element },
      { path: '/login', element: <div>Login screen</div> },
      ...extraRoutes,
      { path: '*', element: <div>Other route</div> },
    ],
    { initialEntries: [route] },
  );
  const utils = render(
    <Providers queryClient={testQueryClient()}>
      <RouterProvider router={router} />
    </Providers>,
  );
  return { ...utils, router, user: userEvent.setup() };
}

/** Renders children once the session has been restored (mirrors RequireAuth). */
function SignedIn({ children }: { children: ReactElement }) {
  const { status } = useAuth();
  return status === 'authenticated' ? children : <div>Restoring session…</div>;
}

export { screen, waitFor };

/** Opens a Select (custom picker) and chooses the option with the given value. */
export async function chooseOption(
  user: ReturnType<typeof userEvent.setup>,
  trigger: HTMLElement,
  value: string,
) {
  // Required fields with a single choice are pre-selected and locked.
  const native = trigger.closest('[data-slot="select"]')?.querySelector('select');
  if ((trigger as HTMLButtonElement).disabled && native?.value === value) return;
  await user.click(trigger);
  const option = await waitFor(() => {
    const el = document.querySelector<HTMLElement>(`[role="option"][data-value="${value}"]`);
    if (!el) throw new Error(`option ${value} not found`);
    return el;
  });
  await user.click(option);
}

/** Current value of a Select, given its trigger (e.g. from getByLabelText). */
export const selectValue = (trigger: HTMLElement) =>
  trigger.closest('[data-slot="select"]')?.querySelector('select')?.value;
