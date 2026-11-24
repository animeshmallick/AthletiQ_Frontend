/**
 * Cycles on the batch page (who is where) and on the student page (every batch, cycle, session,
 * invoice and certificate).
 */
import { Award, ChevronDown, Download, RefreshCw, Share2 } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router';
import { toast } from 'sonner';
import { saveFile } from '@/app/share-file';
import {
  AttendanceBadge,
  EmptyState,
  ErrorState,
  InvoiceStatusBadge,
  ListSkeleton,
  Progress,
} from '@/components/common';
import { ShareLinkDialog } from '@/components/share-link-dialog';
import { Button } from '@/components/ui/button';
import { Badge, Card, Skeleton } from '@/components/ui/primitives';
import { errorMessage, requestBlob } from '@/lib/api';
import {
  certificatePath,
  shareCertificate,
  useBatchCycles,
  useStudentCycles,
  type CycleCounts,
  type CycleInvoice,
  type CycleSession,
  type MembershipHistory,
} from '@/lib/cycles';
import { formatDate, formatShortDate, formatTimeRange, money, plural } from '@/lib/format';
import type { Batch } from '@/lib/types';
import { cn } from '@/lib/utils';

function Counts({ c }: { c: CycleCounts }) {
  return (
    <div className="space-y-1">
      <Progress
        value={c.target ? (c.conducted / c.target) * 100 : 0}
        label={`${c.conducted} of ${c.target} sessions conducted`}
      />
      <p className="text-[12px] text-muted-foreground">
        {c.conducted} of {c.target} conducted · attended {c.attended}
        {c.rate === null ? '' : ` (${c.rate}%)`}
        {c.missed ? ` · ${plural(c.missed, 'missed session')}` : ''}
        {c.unconfirmed ? ` · ${c.unconfirmed} unconfirmed` : ''}
      </p>
    </div>
  );
}

export function BatchCyclesSection({ batch }: { batch: Batch }) {
  const q = useBatchCycles(batch.id, !!batch.courseMonths);
  if (!batch.courseMonths)
    return (
      <Card className="flex items-start gap-2.5 p-3 text-[13px]">
        <RefreshCw className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
        <p>
          <b className="font-semibold">No course set up yet.</b>{' '}
          <span className="text-muted-foreground">
            Edit the batch to choose its course length in months.
          </span>
        </p>
      </Card>
    );
  if (q.isPending) return <Skeleton className="h-32 w-full rounded-xl" />;
  if (q.isError) return <ErrorState error={q.error} onRetry={() => void q.refetch()} />;
  return (
    <section className="space-y-2" aria-label="Cycles">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3">
        <h2 className="flex items-center gap-1.5 text-[15px] font-semibold">
          <RefreshCw className="size-4" /> Cycles
        </h2>
        <p className="text-[12px] text-muted-foreground">
          {plural(q.data.courseMonths ?? 0, 'month')} · {q.data.perMonth} sessions a month
        </p>
      </div>
      {!q.data.cycles.length ? (
        <p className="py-3 text-center text-[13px] text-muted-foreground">No running cycles.</p>
      ) : (
        <Card className="divide-y overflow-hidden">
          {q.data.cycles.map((c) => (
            <div key={c.id} className="grid gap-1 px-3 py-2 sm:grid-cols-[12rem_1fr] sm:gap-3">
              <div className="min-w-0 text-[13px]">
                <Link
                  to={`/students/${c.student.id}?tab=batches`}
                  className="block truncate font-medium hover:underline"
                >
                  {c.student.fullName}
                </Link>
                <span className="text-[11px] text-muted-foreground">
                  Round {c.roundNo} · until {formatShortDate(c.endsOn)}
                  {c.plannedEndOn ? ' · not renewing' : ''}
                </span>
              </div>
              <Counts c={c} />
            </div>
          ))}
        </Card>
      )}
    </section>
  );
}

function CertificateActions({
  cycleId,
  studentName,
  roundNo,
  phone,
}: {
  cycleId: string;
  studentName: string;
  roundNo: number;
  phone?: string | null;
}) {
  const [busy, setBusy] = useState<'get' | 'share' | null>(null);
  const [url, setUrl] = useState<string | null>(null);
  const run = async (kind: 'get' | 'share') => {
    setBusy(kind);
    try {
      if (kind === 'share') setUrl((await shareCertificate(cycleId)).url);
      else
        await saveFile(
          await requestBlob(certificatePath(cycleId)),
          `${studentName.replace(/\W+/g, '-')}-certificate-round-${roundNo}.pdf`,
          'Certificate',
        );
    } catch (err) {
      toast.error('Could not get the certificate', { description: errorMessage(err) });
    } finally {
      setBusy(null);
    }
  };
  return (
    <div className="flex items-center gap-1.5">
      <Award className="size-4 text-warning" />
      <Button size="sm" variant="outline" loading={busy === 'get'} onClick={() => void run('get')}>
        <Download /> Certificate
      </Button>
      <Button
        size="sm"
        variant="outline"
        loading={busy === 'share'}
        onClick={() => void run('share')}
      >
        <Share2 /> Share
      </Button>
      <ShareLinkDialog
        link={
          url
            ? {
                title: 'Share the certificate',
                description: 'It opens after the student’s registration number is entered.',
                url,
                phone,
                message: `Congratulations! ${studentName} has completed round ${roundNo}. Certificate:`,
              }
            : null
        }
        onClose={() => setUrl(null)}
      />
    </div>
  );
}

const STATE: Record<
  CycleSession['state'],
  { label: string; variant: 'success' | 'destructive' | 'muted' | 'warning' }
> = {
  held: { label: 'Held', variant: 'success' },
  missed: { label: 'Missed', variant: 'destructive' },
  closed: { label: 'Not held', variant: 'muted' },
  unconfirmed: { label: 'Unconfirmed', variant: 'warning' },
  upcoming: { label: 'Upcoming', variant: 'muted' },
};

function SessionList({ sessions }: { sessions: CycleSession[] }) {
  return (
    <ul className="divide-y rounded-xl border">
      {sessions.map((s) => (
        <li key={s.date} className="flex flex-wrap items-center gap-2 px-2.5 py-1.5 text-[12.5px]">
          <span className="min-w-0 flex-1">
            <b className="font-medium">{formatShortDate(s.date)}</b>{' '}
            <span className="text-muted-foreground">
              {formatTimeRange(s.startTime, s.endTime)}
              {s.originalDate && s.originalDate !== s.date
                ? ` · from ${formatShortDate(s.originalDate)}`
                : s.kind === 'extra'
                  ? ' · extra'
                  : ''}
              {s.reason ? ` · ${s.reason}` : ''}
            </span>
          </span>
          {s.state === 'held' && s.mark ? (
            <AttendanceBadge status={s.mark} />
          ) : (
            <Badge variant={STATE[s.state].variant}>{STATE[s.state].label}</Badge>
          )}
        </li>
      ))}
    </ul>
  );
}

function Invoices({ list }: { list: CycleInvoice[] }) {
  return (
    <ul className="space-y-1">
      {list.map((i) => (
        <li key={i.id}>
          <Link
            to={`/invoices/${i.id}`}
            className="flex items-center gap-2 text-[12.5px] hover:underline"
          >
            <span className="min-w-0 flex-1 truncate">
              {i.number} · {formatShortDate(i.periodStart)}
            </span>
            <span className="tabular">{money(i.totalAmount)}</span>
            <InvoiceStatusBadge status={i.status} />
          </Link>
        </li>
      ))}
    </ul>
  );
}

function CycleCard({
  c,
  studentName,
  phone,
}: {
  c: MembershipHistory['cycles'][number];
  studentName: string;
  phone?: string | null;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="space-y-2 px-3 py-2.5">
      <div className="flex flex-wrap items-center gap-2 text-[13px]">
        <b className="font-semibold">Round {c.roundNo}</b>
        <span className="text-muted-foreground">
          {formatDate(c.startsOn)} – {formatDate(c.endedOn ?? c.endsOn)}
        </span>
        <Badge
          variant={
            c.status === 'active' ? 'default' : c.status === 'completed' ? 'success' : 'muted'
          }
        >
          {c.status === 'active' ? 'Running' : c.status === 'completed' ? 'Completed' : 'Exited'}
        </Badge>
      </div>
      <Counts c={c} />
      <div className="flex flex-wrap items-center gap-2">
        {c.status === 'completed' && (
          <CertificateActions
            cycleId={c.id}
            studentName={studentName}
            roundNo={c.roundNo}
            phone={phone}
          />
        )}
        <Button size="sm" variant="ghost" aria-expanded={open} onClick={() => setOpen(!open)}>
          <ChevronDown className={cn('transition-transform', open && 'rotate-180')} />{' '}
          {plural(c.sessions.length, 'session')}
        </Button>
      </div>
      {open && <SessionList sessions={c.sessions} />}
      {c.invoices.length > 0 && <Invoices list={c.invoices} />}
    </div>
  );
}

/** Every batch the student has been in, newest first. */
export function StudentBatchesTab({
  studentId,
  studentName,
  phone,
}: {
  studentId: string;
  studentName: string;
  phone?: string | null;
}) {
  const q = useStudentCycles(studentId);
  if (q.isPending) return <ListSkeleton rows={3} />;
  if (q.isError) return <ErrorState error={q.error} onRetry={() => void q.refetch()} />;
  if (!q.data.length) return <EmptyState icon={<RefreshCw />} title="No batches yet" />;
  return (
    <div className="space-y-3">
      {q.data.map((m) => (
        <Card key={m.enrollmentId} className="overflow-hidden">
          <div className="border-b bg-muted/30 px-3 py-2">
            <Link
              to={`/batches/${m.batch.id}`}
              className="text-[14px] font-semibold hover:underline"
            >
              {m.batch.name}
            </Link>
            <p className="text-[12px] text-muted-foreground">
              {m.coach.name} · {formatDate(m.from)} –{' '}
              {m.to
                ? formatDate(m.to)
                : m.plannedEndOn
                  ? `${formatDate(m.plannedEndOn)} (planned)`
                  : 'now'}
            </p>
          </div>
          <div className="divide-y">
            {m.cycles.map((c) => (
              <CycleCard key={c.id} c={c} studentName={studentName} phone={phone} />
            ))}
            {m.earlier.length > 0 && (
              <div className="space-y-1.5 px-3 py-2.5">
                <p className="text-[12px] font-medium text-muted-foreground">Before cycles</p>
                <Invoices list={m.earlier} />
              </div>
            )}
            {!m.cycles.length && !m.earlier.length && (
              <p className="px-3 py-2.5 text-[12.5px] text-muted-foreground">No records yet.</p>
            )}
          </div>
        </Card>
      ))}
    </div>
  );
}
