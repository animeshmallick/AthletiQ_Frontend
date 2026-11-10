import { api, ApiError, errorMessage, refreshSession, requestBlob, tokenStore } from '@/lib/api';
import { coachUser, json, mockApi, sessionFor } from '../utils';

describe('api client', () => {
  it('sends JSON with auth and CSRF headers and unwraps the envelope', async () => {
    tokenStore.set(sessionFor(coachUser));
    const m = mockApi({ 'POST /students': (c) => ({ id: 's1', echo: c.body }) });
    const res = await api.post<{ id: string; echo: unknown }>('/students', { name: 'A' });
    expect(res).toEqual({ id: 's1', echo: { name: 'A' } });
    const [call] = m.calls;
    expect(call!.headers).toMatchObject({
      Authorization: 'Bearer token-coach-1',
      'Content-Type': 'application/json',
      'X-Requested-With': 'XMLHttpRequest',
    });
  });

  it('serialises query params and skips empty values', async () => {
    const m = mockApi({ 'GET /invoices': () => [] });
    await api.get('/invoices', { status: 'due', search: '', page: 2, x: undefined, y: null });
    expect(m.calls[0]!.query.toString()).toBe('status=due&page=2');
  });

  it('returns envelope meta for paginated endpoints', async () => {
    mockApi({ 'GET /students': () => ({ data: [1, 2], meta: { page: 1, total: 2 } }) });
    await expect(api.page('/students')).resolves.toEqual({
      data: [1, 2],
      meta: { page: 1, total: 2 },
    });
  });

  it('maps error responses to ApiError with field errors', async () => {
    mockApi({
      'POST /students': () => ({
        status: 400,
        body: {
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Some fields are invalid',
            details: { fields: [{ path: 'phone', message: 'Bad' }] },
            requestId: 'r1',
          },
        },
      }),
    });
    const err = await api.post('/students', {}).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect(err).toMatchObject({ status: 400, code: 'VALIDATION_ERROR', requestId: 'r1' });
    expect((err as ApiError).fieldErrors).toEqual([{ path: 'phone', message: 'Bad' }]);
    expect(errorMessage(err)).toBe('Some fields are invalid');
  });

  it('handles non-JSON errors and network failures', async () => {
    global.fetch = jest.fn(
      async () => new Response('oops', { status: 502, statusText: 'Bad Gateway' }),
    ) as unknown as typeof fetch;
    await expect(api.get('/x')).rejects.toMatchObject({
      status: 502,
      code: 'UNKNOWN',
      message: 'Bad Gateway',
    });

    global.fetch = jest.fn(async () => {
      throw new TypeError('Failed to fetch');
    }) as unknown as typeof fetch;
    const err = (await api.get('/x').catch((e: unknown) => e)) as ApiError;
    expect(err.isNetwork).toBe(true);
    expect(err.message).toMatch(/Could not reach the server/);
    expect(new ApiError(400, 'X', 'y').fieldErrors).toEqual([]);
  });

  it('refreshes once on 401 and retries the request', async () => {
    tokenStore.set(sessionFor(coachUser));
    let attempts = 0;
    const m = mockApi({
      'GET /auth/me': (c) =>
        ++attempts === 1
          ? { status: 401, body: { error: { code: 'UNAUTHENTICATED', message: 'expired' } } }
          : { authHeader: c.headers.Authorization },
      'POST /auth/refresh': () => ({ ...sessionFor(coachUser), accessToken: 'fresh-token' }),
    });
    await expect(api.get('/auth/me')).resolves.toEqual({ authHeader: 'Bearer fresh-token' });
    expect(m.find('POST /auth/refresh')).toHaveLength(1);
  });

  it('shares one refresh between concurrent 401s', async () => {
    let calls = 0;
    global.fetch = jest.fn(async (input: RequestInfo | URL) => {
      if (String(input).endsWith('/auth/refresh')) {
        calls++;
        await new Promise((r) => setTimeout(r, 10));
        return json(200, { data: sessionFor(coachUser) });
      }
      return json(401, { error: { code: 'UNAUTHENTICATED', message: 'x' } });
    }) as unknown as typeof fetch;
    const [a, b] = await Promise.all([refreshSession(), refreshSession()]);
    expect(a).toEqual(b);
    expect(calls).toBe(1);
  });

  it('signs out when refresh fails and notifies listeners', async () => {
    tokenStore.set(sessionFor(coachUser));
    const listener = jest.fn();
    const unsubscribe = tokenStore.subscribe(listener);
    mockApi({
      'POST /auth/refresh': () => ({
        status: 401,
        body: { error: { code: 'UNAUTHENTICATED', message: 'Session expired' } },
      }),
    });
    await expect(refreshSession()).resolves.toBeNull();
    expect(tokenStore.get()).toBeNull();
    expect(listener).toHaveBeenCalledWith(null);
    unsubscribe();

    global.fetch = jest.fn(async () => {
      throw new Error('offline');
    }) as unknown as typeof fetch;
    await expect(refreshSession()).resolves.toBeNull();
  });

  it('keeps the session when a refresh fails for another reason', async () => {
    tokenStore.set(sessionFor(coachUser));
    mockApi({
      'POST /auth/refresh': () => ({
        status: 503,
        body: { error: { code: 'UNAVAILABLE', message: 'Try again' } },
      }),
    });
    await expect(refreshSession()).resolves.toBeNull();
    expect(tokenStore.get()).toBe('token-coach-1');
  });

  it('refreshes before a request when the access token has expired', async () => {
    const realNow = Date.now;
    const start = realNow();
    Date.now = () => start;
    tokenStore.set(sessionFor(coachUser)); // valid for 15 minutes
    const m = mockApi({
      'POST /auth/refresh': () => ({ ...sessionFor(coachUser), accessToken: 'fresh-token' }),
      'GET /auth/me': (c) => ({ authHeader: c.headers.Authorization }),
    });
    try {
      // Still fresh: no refresh.
      await api.get('/auth/me');
      expect(m.find('POST /auth/refresh')).toHaveLength(0);
      // The phone slept past expiry: refresh first, so the request never fails with a 401.
      Date.now = () => start + 15 * 60_000;
      const res = await api.get<{ authHeader: string }>('/auth/me');
      expect(res.authHeader).toBe('Bearer fresh-token');
      expect(m.calls.map((c) => `${c.method} ${c.path}`)).toEqual([
        'GET /auth/me',
        'POST /auth/refresh',
        'GET /auth/me',
      ]);
    } finally {
      Date.now = realNow;
    }
  });

  it('supports DELETE (204) and binary downloads', async () => {
    mockApi({
      'DELETE /lessons/plans/day': () => ({ status: 204 }),
      'GET /invoices/i1/pdf': () => ({ status: 200, body: { pdf: true } }),
    });
    await expect(api.delete('/lessons/plans/day', { batchId: 'b' })).resolves.toBeUndefined();
    const blob = await requestBlob('/invoices/i1/pdf');
    expect(blob.size).toBeGreaterThan(0);
    mockApi({
      'GET /invoices/i2/pdf': () => ({
        status: 403,
        body: { error: { code: 'FORBIDDEN', message: 'No' } },
      }),
    });
    await expect(requestBlob('/invoices/i2/pdf')).rejects.toMatchObject({ status: 403 });
  });

  it('does not retry auth endpoints marked noRetry', async () => {
    const m = mockApi({
      'POST /auth/login': () => ({
        status: 401,
        body: { error: { code: 'UNAUTHENTICATED', message: 'Incorrect email or password' } },
      }),
    });
    const { request } = await import('@/lib/api');
    await expect(
      request('/auth/login', { method: 'POST', body: {}, noRetry: true }),
    ).rejects.toMatchObject({ message: 'Incorrect email or password' });
    expect(m.find('POST /auth/refresh')).toHaveLength(0);
  });

  it('describes unknown errors', () => {
    expect(errorMessage(new Error('boom'))).toBe('boom');
    expect(errorMessage('x')).toBe('Something went wrong. Please try again.');
    expect(errorMessage(null, 'Fallback')).toBe('Fallback');
  });
});
