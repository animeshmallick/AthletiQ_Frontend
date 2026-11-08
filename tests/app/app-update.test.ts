import * as core from '@capacitor/core';
import { toast } from 'sonner';
import { installDownloaded, startAppUpdate } from '@/app/app-update';
import { downloadUpdate } from '@/app/native';

type Fn = jest.Mock;
type Listener = (p: { percent: number }) => void;

jest.mock('@capacitor/core', () => {
  const plugin = {
    canInstall: jest.fn(async () => ({ allowed: true })),
    openInstallSettings: jest.fn(async () => undefined),
    download: jest.fn(async () => ({ path: '/cache/updates/athletiq-7.apk' })),
    install: jest.fn(async () => undefined),
    addListener: jest.fn(async (_e: string, cb: Listener) => {
      cb({ percent: 42 });
      return { remove: jest.fn(async () => undefined) };
    }),
  };
  return {
    registerPlugin: () => plugin,
    __plugin: plugin,
    Capacitor: { isNativePlatform: () => true },
    SystemBars: { setStyle: jest.fn(async () => undefined) },
    SystemBarsStyle: { Dark: 'DARK', Light: 'LIGHT' },
  };
});
jest.mock('sonner', () => {
  const toast = Object.assign(jest.fn(), {
    success: jest.fn(),
    error: jest.fn(),
    loading: jest.fn(),
  });
  return { toast };
});
jest.mock('@/app/native', () => ({ downloadUpdate: jest.fn() }));

const plugin = (core as unknown as { __plugin: Record<string, Fn> }).__plugin;
const t = toast as unknown as Fn & Record<'success' | 'error' | 'loading', Fn>;
const update = {
  version: 7,
  url: 'https://github.com/x/releases/download/android-v7/athletiq.apk',
  notes: '',
};
/** Runs the action button of the most recent toast call of a kind. */
const clickAction = (fn: Fn) =>
  (fn.mock.calls.at(-1)![1] as { action: { onClick: () => void } }).action.onClick();

beforeEach(() => jest.clearAllMocks());

describe('one-tap app update', () => {
  it('downloads quietly and offers "Install now"', async () => {
    await startAppUpdate(update);
    expect(plugin.download).toHaveBeenCalledWith({ url: update.url, version: '7' });
    expect(t.loading).not.toHaveBeenCalled();
    expect(t.success).toHaveBeenCalledWith('Update ready · version 1.0.7', expect.any(Object));
    clickAction(t.success);
    await new Promise((r) => setTimeout(r, 0));
    expect(plugin.install).toHaveBeenCalledWith({ path: '/cache/updates/athletiq-7.apk' });
  });

  it('shows progress when checking by hand, and a retry on failure', async () => {
    await startAppUpdate(update, { interactive: true });
    expect(t.loading).toHaveBeenCalledWith('Downloading update… 42%', expect.any(Object));

    plugin.download!.mockRejectedValueOnce(new Error('offline'));
    await startAppUpdate(update, { interactive: true });
    expect(t.error).toHaveBeenCalledWith('Couldn’t download the update', expect.any(Object));
  });

  it('asks once for permission to install updates', async () => {
    plugin.canInstall!.mockResolvedValueOnce({ allowed: false });
    await installDownloaded('/cache/updates/athletiq-7.apk', 7);
    expect(plugin.install).not.toHaveBeenCalled();
    expect(t).toHaveBeenCalledWith('Allow AthletiQ to install its updates', expect.any(Object));
    clickAction(t);
    expect(plugin.openInstallSettings).toHaveBeenCalled();
  });

  it('falls back to the browser download on older app builds', async () => {
    plugin.canInstall!.mockRejectedValueOnce(
      Object.assign(new Error('nope'), { code: 'UNIMPLEMENTED' }),
    );
    await startAppUpdate(update);
    expect(plugin.download).not.toHaveBeenCalled();
    clickAction(t);
    expect(downloadUpdate).toHaveBeenCalledWith(update.url);
  });
});
