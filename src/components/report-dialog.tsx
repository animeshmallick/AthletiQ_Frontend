/**
 * Pick what a PDF report covers, then view it in the app, share it (WhatsApp etc.) or download it.
 */
import { Check, Download, Eye, FileText, Share2 } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { AppUpdateNeeded, saveFile, shareFile } from '@/app/share-file';
import { PdfViewer, type PdfFile } from '@/components/pdf-viewer';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/overlays';
import { errorMessage, requestBlob } from '@/lib/api';
import { cn } from '@/lib/utils';

export interface ReportOption {
  value: string;
  label: string;
  hint?: string;
}

export function ReportDialog({
  open,
  onOpenChange,
  title,
  description,
  options,
  path,
  filename,
  includes,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  options: ReportOption[];
  /** API path for the chosen option. */
  path: (value: string) => string;
  filename: (value: string) => string;
  /** What the report contains (shown as a short checklist). */
  includes: string[];
}) {
  const [choice, setChoice] = useState(options[0]?.value ?? 'all');
  const [busy, setBusy] = useState<'view' | 'share' | 'download' | null>(null);
  const [viewing, setViewing] = useState<PdfFile | null>(null);

  async function run(mode: 'view' | 'share' | 'download') {
    setBusy(mode);
    try {
      const blob = await requestBlob(path(choice));
      const name = filename(choice);
      if (mode === 'view') {
        setViewing({ blob, name, title });
        onOpenChange(false);
        return;
      }
      const outcome =
        mode === 'share' ? await shareFile(blob, name, title) : await saveFile(blob, name, title);
      if (outcome === 'downloaded') toast.success('Report downloaded', { description: name });
      if (outcome !== 'cancelled') onOpenChange(false);
    } catch (err) {
      toast.error(err instanceof AppUpdateNeeded ? err.message : 'Could not create the report', {
        description:
          err instanceof AppUpdateNeeded ? 'Menu → Check for app update.' : errorMessage(err),
      });
    } finally {
      setBusy(null);
    }
  }

  return (
    <>
      <PdfViewer file={viewing} onClose={() => setViewing(null)} />
      <Dialog open={open} onOpenChange={(o) => !busy && onOpenChange(o)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileText className="size-5 text-primary" /> {title}
            </DialogTitle>
            <DialogDescription>{description}</DialogDescription>
          </DialogHeader>

          {options.length > 1 && (
            <fieldset className="space-y-1.5">
              <legend className="mb-1.5 text-[11px] font-semibold tracking-wider text-muted-foreground uppercase">
                Covers
              </legend>
              {options.map((o) => (
                <label
                  key={o.value}
                  className={cn(
                    'flex cursor-pointer items-center gap-3 rounded-xl border bg-card px-3 py-2.5 transition-colors',
                    choice === o.value && 'border-primary bg-primary/5',
                  )}
                >
                  <input
                    type="radio"
                    name="report-scope"
                    value={o.value}
                    checked={choice === o.value}
                    onChange={() => setChoice(o.value)}
                    className="size-4 accent-primary"
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">{o.label}</span>
                    {o.hint && (
                      <span className="block truncate text-xs text-muted-foreground">{o.hint}</span>
                    )}
                  </span>
                </label>
              ))}
            </fieldset>
          )}

          <ul className="grid grid-cols-2 gap-x-3 gap-y-1 rounded-xl bg-muted/50 p-3 text-xs text-muted-foreground">
            {includes.map((i) => (
              <li key={i} className="flex items-center gap-1.5">
                <Check className="size-3.5 shrink-0 text-success" /> {i}
              </li>
            ))}
          </ul>

          <div className="grid grid-cols-3 gap-2">
            <Button
              variant="outline"
              loading={busy === 'view'}
              disabled={!!busy}
              onClick={() => void run('view')}
            >
              <Eye /> View
            </Button>
            <Button
              variant="outline"
              loading={busy === 'download'}
              disabled={!!busy}
              onClick={() => void run('download')}
            >
              <Download /> Download
            </Button>
            <Button loading={busy === 'share'} disabled={!!busy} onClick={() => void run('share')}>
              <Share2 /> Share
            </Button>
          </div>
          {busy && (
            <p className="text-center text-xs text-muted-foreground">
              Preparing the PDF… large batches can take a few seconds.
            </p>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}

export const STUDENT_REPORT_INCLUDES = [
  'Key insights',
  'Attendance by month',
  'Streaks & weekdays',
  'Skills progress',
  'Coach notes',
  'Batch history',
  'Fees & payments',
  'Full timeline',
];

export const BATCH_REPORT_INCLUDES = [
  'Summary & insights',
  'Every student',
  'Attendance rankings',
  'Fees & overdue',
  'Needs attention',
  'Per-student details',
];

/** "Riya Sharma" → "riya-sharma". */
export const slug = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 60) || 'report';
