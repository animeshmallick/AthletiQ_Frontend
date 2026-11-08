/**
 * One-tap Android app updates (sideloaded APK, no Play Store).
 *
 * Automatic: when the app finds a newer release at launch, it downloads it quietly and then shows
 * "Update ready · Install now". Manual: "Check for app update" shows download progress.
 * Installing opens Android's installer (Android always asks the user to confirm). The first time,
 * Android may ask the user to allow AthletiQ to install updates; we take them to that setting.
 *
 * Older app builds without the native updater fall back to downloading the APK in the browser.
 */
import { registerPlugin, type PluginListenerHandle } from '@capacitor/core';
import { toast } from 'sonner';
import { downloadUpdate, type AppUpdate } from './native';

interface AppUpdaterPlugin {
  canInstall(): Promise<{ allowed: boolean }>;
  openInstallSettings(): Promise<void>;
  download(opts: { url: string; version: string }): Promise<{ path: string }>;
  install(opts: { path: string }): Promise<void>;
  addListener(
    event: 'downloadProgress',
    cb: (p: { percent: number }) => void,
  ): Promise<PluginListenerHandle>;
}

const AppUpdater = registerPlugin<AppUpdaterPlugin>('AppUpdater');
const TOAST_ID = 'app-update';

/** True when this build of the app has the native updater (builds before it don't). */
async function nativeUpdaterAvailable(): Promise<boolean> {
  try {
    await AppUpdater.canInstall();
    return true;
  } catch {
    return false;
  }
}

/** Opens the installer, first asking for the one-time "allow installs" permission if needed. */
export async function installDownloaded(path: string, version: number) {
  const { allowed } = await AppUpdater.canInstall();
  if (!allowed) {
    toast('Allow AthletiQ to install its updates', {
      id: TOAST_ID,
      description: 'Turn on “Allow from this source”, come back, then tap Install now.',
      duration: Infinity,
      action: {
        label: 'Open settings',
        onClick: () => {
          void AppUpdater.openInstallSettings();
          // Back from settings: offer the install again.
          setTimeout(() => readyToast(path, version), 1500);
        },
      },
    });
    return;
  }
  await AppUpdater.install({ path });
}

function readyToast(path: string, version: number) {
  toast.success(`Update ready · version 1.0.${version}`, {
    id: TOAST_ID,
    description: 'Takes a few seconds. Your data stays as it is.',
    duration: Infinity,
    action: {
      label: 'Install now',
      onClick: () =>
        void installDownloaded(path, version).catch(() =>
          toast.error('Couldn’t open the installer. Try again.', { id: TOAST_ID }),
        ),
    },
  });
}

/**
 * Downloads and offers an update.
 * `interactive` (manual check) shows progress; otherwise the download happens silently.
 */
export async function startAppUpdate(update: AppUpdate, { interactive = false } = {}) {
  if (!(await nativeUpdaterAvailable())) {
    // Older app build: download through the browser instead.
    toast('A new version of the app is available', {
      id: TOAST_ID,
      description: 'Download it and tap Install. Your data stays as it is.',
      duration: 15_000,
      action: { label: 'Update', onClick: () => downloadUpdate(update.url) },
    });
    return;
  }

  let progress: PluginListenerHandle | undefined;
  if (interactive) {
    toast.loading('Downloading update…', { id: TOAST_ID, duration: Infinity });
    progress = await AppUpdater.addListener('downloadProgress', ({ percent }) =>
      toast.loading(`Downloading update… ${percent}%`, { id: TOAST_ID, duration: Infinity }),
    );
  }
  try {
    const { path } = await AppUpdater.download({
      url: update.url,
      version: String(update.version),
    });
    readyToast(path, update.version);
  } catch {
    if (interactive) {
      toast.error('Couldn’t download the update', {
        id: TOAST_ID,
        description: 'Check your connection and try again.',
        action: { label: 'Retry', onClick: () => void startAppUpdate(update, { interactive }) },
      });
    }
  } finally {
    void progress?.remove();
  }
}
