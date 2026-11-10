import {
  __queued,
  __resetClientLog,
  addCrumb,
  flush,
  logClientEvent,
  noteReload,
  routeOf,
  startClientLog,
} from '@/app/client-log';

describe('client logs', () => {
  const realFetch = global.fetch;
  let posts: { url: string; body: { events: Record<string, unknown>[] }; auth?: string }[];

  beforeEach(() => {
    jest.useFakeTimers();
    posts = [];
    global.fetch = jest.fn(async (url: string, init: RequestInit) => {
      posts.push({
        url: String(url),
        body: JSON.parse(String(init.body)),
        auth: (init.headers as Record<string, string>).Authorization,
      });
      return new Response(null, { status: 202 });
    }) as never;
    localStorage.clear();
    sessionStorage.clear();
    __resetClientLog();
  });
  afterEach(() => {
    jest.useRealTimers();
    global.fetch = realFetch;
  });

  it('groups paths by shape', () => {
    expect(routeOf('/students/6f1c2f7a-9b9e-4d0c-9a58-1d2f3e4a5b6c/batches?x=1')).toBe(
      '/students/:id/batches',
    );
    expect(routeOf('/feedback/abc/2026-03-09')).toBe('/feedback/abc/:date');
    expect(routeOf('/invoices/42')).toBe('/invoices/:n');
  });

  it('does nothing until started, then queues, merges repeats and sends with the session', async () => {
    logClientEvent('error', 'ignored before start');
    expect(__queued()).toHaveLength(0);

    startClientLog(() => 'token-1');
    __queued().length = 0; // whatever start-up noted
    logClientEvent('error', new Error('Boom'), { stack: 'Error: Boom\n at x' });
    logClientEvent('error', new Error('Boom'));
    logClientEvent('freeze', 'App froze for 6.0s', { details: { ms: 6000 } });
    expect(__queued()).toHaveLength(2);
    expect(__queued()[0]).toMatchObject({ kind: 'error', message: 'Error: Boom', count: 2 });

    await flush();
    expect(posts).toHaveLength(1);
    expect(posts[0]!.url).toMatch(/\/api\/v1\/client-events$/);
    expect(posts[0]!.auth).toBe('Bearer token-1');
    expect(posts[0]!.body.events.map((e) => e.kind)).toEqual(['error', 'freeze']);
    expect(__queued()).toHaveLength(0);
  });

  it('attaches the trail of screens and taps to errors, not to other events', () => {
    startClientLog(() => null);
    __queued().length = 0;
    addCrumb('screen /students');
    addCrumb('tap: Save');
    logClientEvent('crash', 'Screen crashed');
    logClientEvent('slow', 'Slow call: GET /students');
    const [crash, slow] = __queued();
    expect((crash!.details as { trail: string[] }).trail.slice(-2)).toEqual([
      'screen /students',
      'tap: Save',
    ]);
    expect(slow!.details).toBeUndefined();
  });

  it('keeps events when the server can’t be reached and retries later', async () => {
    startClientLog(() => null);
    __queued().length = 0;
    global.fetch = jest.fn(async () => {
      throw new TypeError('offline');
    }) as never;
    logClientEvent('api', 'Could not reach the server');
    await flush();
    expect(__queued()).toHaveLength(1);
  });

  it('caps a session so a loop can’t flood the server', () => {
    startClientLog(() => null);
    __queued().length = 0;
    for (let i = 0; i < 400; i++) logClientEvent('error', `Error ${i}`);
    expect(__queued().length).toBeLessThanOrEqual(300);
  });

  it('notes why the app reloaded and reports it after the reload', () => {
    noteReload('Reloaded into the new version');
    expect(JSON.parse(localStorage.getItem('atq-last-screen')!)).toMatchObject({
      why: 'Reloaded into the new version',
    });
    startClientLog(() => null);
    expect(__queued().find((e) => e.kind === 'reload')).toMatchObject({
      message: 'Reloaded into the new version',
      details: { reason: 'Reloaded into the new version' },
    });
  });
});
