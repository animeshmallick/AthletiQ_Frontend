import { reloadIfOutdated } from '@/app/version-check';

const page = (entry: string) =>
  `<!doctype html><script type="module" crossorigin src="${entry}"></script>`;

describe('version check', () => {
  const realFetch = global.fetch;
  afterEach(() => {
    global.fetch = realFetch;
  });

  it('reloads when the site serves a newer build', async () => {
    global.fetch = jest.fn(async () => new Response(page('/assets/index-NEW123.js'))) as never;
    const reload = jest.fn();
    expect(await reloadIfOutdated('/assets/index-OLD456.js', reload)).toBe(true);
    expect(reload).toHaveBeenCalled();
  });

  it('stays put when up to date, offline, or in development', async () => {
    const reload = jest.fn();
    global.fetch = jest.fn(async () => new Response(page('/assets/index-SAME.js'))) as never;
    expect(await reloadIfOutdated('/assets/index-SAME.js', reload)).toBe(false);
    global.fetch = jest.fn(async () => {
      throw new TypeError('offline');
    }) as never;
    expect(await reloadIfOutdated('/assets/index-SAME.js', reload)).toBe(false);
    expect(await reloadIfOutdated(null, reload)).toBe(false);
    expect(reload).not.toHaveBeenCalled();
  });
});

describe('update button', () => {
  const realFetch = global.fetch;
  afterEach(() => {
    global.fetch = realFetch;
  });

  it('shows Update only when a newer version is live, and updates while keeping the sign-in', async () => {
    const { checkForWebUpdate, applyUpdate, useUpdateAvailable } =
      await import('@/app/version-check');
    const { renderHook, act } = await import('@testing-library/react');
    const { result } = renderHook(() => useUpdateAvailable());
    global.fetch = jest.fn(async () => new Response(page('/assets/index-SAME.js'))) as never;
    await act(async () => void (await checkForWebUpdate('/assets/index-SAME.js')));
    expect(result.current).toBe(false);
    global.fetch = jest.fn(async () => new Response(page('/assets/index-NEW.js'))) as never;
    await act(async () => void (await checkForWebUpdate('/assets/index-SAME.js')));
    expect(result.current).toBe(true);

    // Tapping Update: cached files cleared, why noted, then a reload. Storage (sign-in) untouched.
    const deleted: string[] = [];
    (window as unknown as { caches: unknown }).caches = {
      keys: async () => ['atq-shell-v1', 'other'],
      delete: async (k: string) => deleted.push(k),
    };
    localStorage.setItem('keep-me', '1');
    const reload = jest.fn();
    await applyUpdate('Updated to the new version (tapped Update)', reload);
    expect(deleted).toEqual(['atq-shell-v1', 'other']);
    expect(reload).toHaveBeenCalled();
    expect(localStorage.getItem('keep-me')).toBe('1');
    expect(JSON.parse(localStorage.getItem('atq-last-screen')!).why).toBe(
      'Updated to the new version (tapped Update)',
    );
  });
});
