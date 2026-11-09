/**
 * Full-screen, in-app PDF viewer with download and share, so nobody has to save a file just to
 * look at it.
 */
import { Download, FileWarning, Minus, Plus, Share2, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { AppUpdateNeeded, saveFile, shareFile } from '@/app/share-file';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/overlays';
import { Skeleton } from '@/components/ui/primitives';
import { errorMessage } from '@/lib/api';

export interface PdfFile {
  blob: Blob;
  /** File name used when downloading or sharing. */
  name: string;
  title: string;
}

const ZOOMS = [1, 1.5, 2] as const;

export function PdfViewer({ file, onClose }: { file: PdfFile | null; onClose: () => void }) {
  return (
    <Dialog open={Boolean(file)} onOpenChange={(o) => !o && onClose()}>
      <DialogContent
        hideClose
        aria-describedby={undefined}
        className="inset-0 h-dvh max-h-none max-w-none gap-0 overflow-hidden rounded-none border-0 bg-muted p-0 pb-0 before:hidden sm:inset-0 sm:top-0 sm:left-0 sm:max-w-none sm:translate-x-0 sm:translate-y-0 sm:rounded-none sm:p-0"
      >
        {file && <Viewer file={file} onClose={onClose} />}
      </DialogContent>
    </Dialog>
  );
}

function Viewer({ file, onClose }: { file: PdfFile; onClose: () => void }) {
  const pagesRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [pages, setPages] = useState(0);
  const [zoom, setZoom] = useState<(typeof ZOOMS)[number]>(1);
  const [busy, setBusy] = useState<'share' | 'download' | null>(null);

  useEffect(() => {
    let cancelled = false;
    let destroy: (() => void) | undefined;
    const el = pagesRef.current;
    const box = scrollRef.current;
    if (!el || !box) return;
    setState('loading');
    void (async () => {
      try {
        const [{ renderPdf }, data] = await Promise.all([
          import('@/lib/pdf-render'),
          file.blob.arrayBuffer(),
        ]);
        const width = Math.min(box.clientWidth - 16, 900) * zoom;
        const out = await renderPdf(data, el, Math.max(240, width), () => cancelled);
        destroy = out.destroy;
        if (!cancelled) {
          setPages(out.pages);
          setState('ready');
        }
      } catch {
        if (!cancelled) setState('error');
      }
    })();
    return () => {
      cancelled = true;
      destroy?.();
    };
  }, [file, zoom]);

  async function act(mode: 'share' | 'download') {
    setBusy(mode);
    try {
      const outcome =
        mode === 'share'
          ? await shareFile(file.blob, file.name, file.title)
          : await saveFile(file.blob, file.name, file.title);
      if (outcome === 'downloaded') toast.success('Downloaded', { description: file.name });
    } catch (err) {
      toast.error(err instanceof AppUpdateNeeded ? err.message : 'Could not save the PDF', {
        description:
          err instanceof AppUpdateNeeded ? 'Menu → Check for app update.' : errorMessage(err),
      });
    } finally {
      setBusy(null);
    }
  }

  const step = (d: 1 | -1) => {
    const i = ZOOMS.indexOf(zoom) + d;
    if (i >= 0 && i < ZOOMS.length) setZoom(ZOOMS[i]!);
  };

  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="flex shrink-0 items-center gap-1 border-b bg-card px-2 pt-[calc(0.375rem+env(safe-area-inset-top))] pb-1.5">
        <Button variant="ghost" size="icon-sm" aria-label="Close" onClick={onClose}>
          <X />
        </Button>
        <div className="min-w-0 flex-1 px-1">
          <DialogTitle className="truncate text-[14px] leading-tight font-semibold">
            {file.title}
          </DialogTitle>
          <DialogDescription className="truncate text-[11px] text-muted-foreground">
            {state === 'ready'
              ? `${pages} page${pages === 1 ? '' : 's'} · ${file.name}`
              : file.name}
          </DialogDescription>
        </div>
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label="Zoom out"
          disabled={zoom === ZOOMS[0]}
          onClick={() => step(-1)}
        >
          <Minus />
        </Button>
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label="Zoom in"
          disabled={zoom === ZOOMS[ZOOMS.length - 1]}
          onClick={() => step(1)}
        >
          <Plus />
        </Button>
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label="Download"
          loading={busy === 'download'}
          disabled={!!busy}
          onClick={() => void act('download')}
        >
          <Download />
        </Button>
        <Button
          size="sm"
          className="h-8 gap-1 px-2.5"
          loading={busy === 'share'}
          disabled={!!busy}
          onClick={() => void act('share')}
        >
          <Share2 /> Share
        </Button>
      </header>
      <div
        ref={scrollRef}
        className="min-h-0 flex-1 overflow-auto overscroll-contain p-2 pb-[calc(0.5rem+env(safe-area-inset-bottom))]"
      >
        {state === 'loading' && (
          <div className="mx-auto max-w-[900px] space-y-2" aria-label="Loading PDF">
            <Skeleton className="aspect-[1/1.41] w-full rounded-md" />
          </div>
        )}
        {state === 'error' && (
          <div className="mx-auto flex max-w-sm flex-col items-center gap-2 py-12 text-center">
            <FileWarning className="size-8 text-muted-foreground" />
            <p className="text-sm font-medium">This PDF can’t be shown here</p>
            <p className="text-[13px] text-muted-foreground">
              Download it to open it on your device.
            </p>
            <Button size="sm" onClick={() => void act('download')}>
              <Download /> Download
            </Button>
          </div>
        )}
        <div
          ref={pagesRef}
          className="w-max min-w-full space-y-2"
          hidden={state === 'error'}
          aria-live="polite"
        />
      </div>
    </div>
  );
}
