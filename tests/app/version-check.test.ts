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
