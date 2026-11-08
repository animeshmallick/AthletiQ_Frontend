/**
 * Share or save a generated file (e.g. a PDF report).
 *  - Android app: saved to the app cache and handed to Android's share sheet (WhatsApp etc.).
 *  - Phone browsers: the Web Share API with the file attached.
 *  - Elsewhere (or when sharing isn't possible): a normal download.
 */
import { isNativeApp } from './native';

export type ShareOutcome = 'shared' | 'downloaded' | 'cancelled';

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(',')[1] ?? '');
    reader.onerror = () => reject(reader.error ?? new Error('Could not read the file'));
    reader.readAsDataURL(blob);
  });
}

/** Saves the file to the device (browser download, or the app's share sheet with "Save"). */
export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

const isAbort = (err: unknown) =>
  err instanceof Error && (err.name === 'AbortError' || /cancel/i.test(err.message));

/** Thrown when the installed Android app is too old to share files. */
export class AppUpdateNeeded extends Error {
  constructor() {
    super('Update the AthletiQ app to share files.');
    this.name = 'AppUpdateNeeded';
  }
}

async function shareNative(blob: Blob, filename: string, title: string): Promise<ShareOutcome> {
  const { Capacitor } = await import('@capacitor/core');
  if (!Capacitor.isPluginAvailable('Share') || !Capacitor.isPluginAvailable('Filesystem')) {
    throw new AppUpdateNeeded();
  }
  const [{ Filesystem, Directory }, { Share }] = await Promise.all([
    import('@capacitor/filesystem'),
    import('@capacitor/share'),
  ]);
  const { uri } = await Filesystem.writeFile({
    path: `shared/${filename}`,
    data: await blobToBase64(blob),
    directory: Directory.Cache,
    recursive: true,
  });
  try {
    await Share.share({ title, files: [uri], dialogTitle: title });
    return 'shared';
  } catch (err) {
    if (isAbort(err)) return 'cancelled';
    throw err;
  }
}

/** Opens the share sheet with the file attached (WhatsApp, email, Drive…), else downloads it. */
export async function shareFile(
  blob: Blob,
  filename: string,
  title: string,
): Promise<ShareOutcome> {
  if (isNativeApp()) return shareNative(blob, filename, title);
  const file = new File([blob], filename, { type: blob.type || 'application/pdf' });
  if (typeof navigator.canShare === 'function' && navigator.canShare({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title });
      return 'shared';
    } catch (err) {
      if (isAbort(err)) return 'cancelled';
      // Some browsers refuse at the last moment: fall back to a download.
    }
  }
  downloadBlob(blob, filename);
  return 'downloaded';
}

/** Saves the file. In the Android app this goes through the share sheet ("Save to device"). */
export async function saveFile(blob: Blob, filename: string, title: string): Promise<ShareOutcome> {
  if (isNativeApp()) return shareNative(blob, filename, title);
  downloadBlob(blob, filename);
  return 'downloaded';
}
