/**
 * What parents open from a shared link (report or invoice). The document is shown only after
 * they type the student's registration number; wrong numbers are limited on the server.
 *  - /share/report/:token
 *  - /share/invoice/:id?e=…&s=…
 */
import { useQuery } from '@tanstack/react-query';
import { Download, Eye, FileText, KeyRound, Lock, ShieldCheck } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { useParams, useSearchParams } from 'react-router';
import { saveFile } from '@/app/share-file';
import { PdfViewer, type PdfFile } from '@/components/pdf-viewer';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/primitives';
import { api, ApiError, errorMessage, requestBlobPost } from '@/lib/api';
import { formatDate } from '@/lib/format';

interface ShareInfo {
  kind: 'report' | 'invoice';
  academy: string;
  title: string;
  student: string;
  expiresAt: string;
}

export function SharePage({ kind }: { kind: 'report' | 'invoice' }) {
  const { token = '', id = '' } = useParams();
  const [params] = useSearchParams();
  const e = params.get('e') ?? '';
  const s = params.get('s') ?? '';
  const infoPath = kind === 'report' ? `/public/reports/${token}` : `/public/invoices/${id}`;
  const info = useQuery({
    queryKey: ['share', kind, token || id],
    queryFn: () => api.get<ShareInfo>(infoPath, kind === 'invoice' ? { e, s } : undefined),
    retry: false,
  });

  const [regNo, setRegNo] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [file, setFile] = useState<PdfFile | null>(null);
  const [viewing, setViewing] = useState(false);

  async function open(ev: FormEvent) {
    ev.preventDefault();
    if (!/^\d{4,6}$/.test(regNo.trim())) {
      setError('Enter the registration number (4 digits).');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const blob =
        kind === 'report'
          ? await requestBlobPost(`/public/reports/${token}/pdf`, { registrationNo: regNo.trim() })
          : await requestBlobPost(`/public/invoices/${id}/pdf`, {
              e,
              s,
              registrationNo: regNo.trim(),
            });
      const name = `${(info.data?.title ?? 'document').replace(/[^\w-]+/g, '-')}.pdf`;
      setFile({ blob, name, title: info.data?.title ?? 'Document' });
      setViewing(true);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  const expired = info.isError && info.error instanceof ApiError && info.error.status !== 0;

  return (
    <div className="flex min-h-dvh flex-col items-center bg-gradient-to-b from-primary/10 via-background to-background px-4 pt-[max(2.5rem,env(safe-area-inset-top))] pb-10">
      <PdfViewer file={viewing ? file : null} onClose={() => setViewing(false)} />
      <div className="mb-5 flex items-center gap-2.5">
        <img src="/icon-192.png" alt="" className="size-10 rounded-xl shadow-e1" />
        <span className="text-lg font-bold tracking-tight">{info.data?.academy ?? 'AthletiQ'}</span>
      </div>

      <div className="w-full max-w-sm rounded-3xl border bg-card p-5 shadow-e2">
        {info.isPending ? (
          <div className="space-y-3 py-6 text-center text-sm text-muted-foreground">Loading…</div>
        ) : expired || !info.data ? (
          <div className="space-y-3 py-4 text-center">
            <span className="mx-auto flex size-12 items-center justify-center rounded-2xl bg-destructive/10 text-destructive">
              <Lock className="size-6" />
            </span>
            <h1 className="text-lg font-semibold">Link not available</h1>
            <p className="text-sm text-muted-foreground">
              {info.error ? errorMessage(info.error) : 'This link is invalid or has expired.'}
            </p>
          </div>
        ) : file ? (
          <div className="space-y-4 text-center">
            <span className="mx-auto flex size-12 items-center justify-center rounded-2xl bg-success/12 text-success">
              <ShieldCheck className="size-6" />
            </span>
            <div>
              <h1 className="text-lg font-semibold">{info.data.title}</h1>
              <p className="text-sm text-muted-foreground">For {info.data.student}</p>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <Button variant="outline" onClick={() => setViewing(true)}>
                <Eye /> View
              </Button>
              <Button onClick={() => void saveFile(file.blob, file.name, file.title)}>
                <Download /> Download
              </Button>
            </div>
          </div>
        ) : (
          <form onSubmit={(ev) => void open(ev)} className="space-y-4">
            <div className="flex items-start gap-3">
              <span className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                <FileText className="size-5" />
              </span>
              <div className="min-w-0">
                <h1 className="text-lg leading-tight font-semibold">{info.data.title}</h1>
                <p className="text-sm text-muted-foreground">For {info.data.student}</p>
              </div>
            </div>
            <label className="block space-y-1.5">
              <span className="flex items-center gap-1.5 text-sm font-medium">
                <KeyRound className="size-4 text-muted-foreground" /> Student’s registration number
              </span>
              <Input
                inputMode="numeric"
                autoComplete="off"
                autoFocus
                maxLength={6}
                placeholder="e.g. 1001"
                value={regNo}
                onChange={(ev) => setRegNo(ev.target.value.replace(/\D/g, ''))}
                aria-invalid={!!error}
                className="text-center text-lg tracking-[0.3em]"
              />
              <span className="block text-xs text-muted-foreground">
                The academy gave you this number when your child joined.
              </span>
            </label>
            {error && (
              <p
                role="alert"
                className="rounded-xl bg-destructive/8 px-3 py-2 text-sm text-destructive"
              >
                {error}
              </p>
            )}
            <Button type="submit" className="w-full" loading={busy}>
              Open
            </Button>
            <p className="text-center text-[11px] text-muted-foreground">
              Link valid until {formatDate(info.data.expiresAt.slice(0, 10))}
            </p>
          </form>
        )}
      </div>
      <p className="mt-6 flex items-center gap-1.5 text-[11px] text-muted-foreground">
        <ShieldCheck className="size-3.5" /> Private link · powered by AthletiQ
      </p>
    </div>
  );
}

export function ShareReportPage() {
  return <SharePage kind="report" />;
}
export function ShareInvoicePage() {
  return <SharePage kind="invoice" />;
}
