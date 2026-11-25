/** One batch's monthly register (/attendance/register/:batchId): register, insights, sessions. */
import { BarChart3, CalendarRange, FileText, TableProperties } from 'lucide-react';
import { useState } from 'react';
import { useParams, useSearchParams } from 'react-router';
import { toast } from 'sonner';
import { EmptyState, ErrorState, ListSkeleton, PageHeader, StatCard } from '@/components/common';
import { PeriodStepper } from '@/components/date-nav';
import { PdfViewer, type PdfFile } from '@/components/pdf-viewer';
import { OriginBadge } from '@/components/session-change';
import { Button } from '@/components/ui/button';
import { Segmented } from '@/components/ui/controls';
import { Badge, Card } from '@/components/ui/primitives';
import { errorMessage, requestBlob } from '@/lib/api';
import { scheduleLabel } from '@/lib/batch-times';
import { formatLongDate, formatTimeRange, plural } from '@/lib/format';
import {
  monthLabel,
  monthParam,
  monthStep,
  rateTone,
  thisMonth,
  useMonthlyRegister,
  type MonthlyRegister,
  type RegisterSession,
} from '@/lib/registers';
import { cn } from '@/lib/utils';
import { SessionDialog } from '../session-dialog';
import { RegisterGrid } from './grid';
import { RegisterInsights } from './insights';
import { Change, RateRing } from './tiles';

type Tab = 'register' | 'insights' | 'sessions';

const STATE: Record<
  RegisterSession['state'],
  { label: string; variant: 'success' | 'muted' | 'warning' | 'default' }
> = {
  held: { label: 'Held', variant: 'success' },
  cancelled: { label: 'Cancelled', variant: 'muted' },
  unrecorded: { label: 'Not recorded', variant: 'warning' },
  upcoming: { label: 'Upcoming', variant: 'default' },
};

function Sessions({ r, onSession }: { r: MonthlyRegister; onSession: (date: string) => void }) {
  if (!r.sessions.length)
    return <EmptyState icon={<CalendarRange />} title="No sessions this month" />;
  return (
    <Card className="divide-y overflow-hidden">
      {[...r.sessions].reverse().map((s) => (
        <button
          key={s.date}
          type="button"
          onClick={() => onSession(s.date)}
          className="flex w-full cursor-pointer items-center gap-2.5 px-3 py-2 text-left hover:bg-muted/40"
        >
          <span className="min-w-0 flex-1">
            <span className="flex flex-wrap items-center gap-1.5 text-[13.5px] font-medium">
              {formatLongDate(s.date)}
              <OriginBadge origin={s.origin} date={s.date} />
            </span>
            <span className="block text-[12px] text-muted-foreground">
              {formatTimeRange(s.startTime, s.endTime)}
              {s.substitute ? ` · covered by ${s.substitute}` : ''}
              {s.checkedIn?.lateBy ? ` · coach ${s.checkedIn.lateBy} min late` : ''}
              {s.reason ? ` · ${s.reason}` : ''}
            </span>
            {s.state === 'held' && (
              <span className="tabular block text-[12px] text-muted-foreground">
                {s.marked
                  ? `${s.present} present · ${s.late} late · ${s.absent} absent${s.excused ? ` · ${s.excused} excused` : ''}`
                  : 'Checked in, no attendance'}
                {s.expected > s.marked && s.marked ? ` · ${s.expected - s.marked} not marked` : ''}
              </span>
            )}
          </span>
          {s.state === 'held' && s.rate !== null ? (
            <b className={cn('tabular shrink-0 text-[15px]', rateTone(s.rate))}>{s.rate}%</b>
          ) : (
            <Badge variant={STATE[s.state].variant} className="shrink-0">
              {STATE[s.state].label}
            </Badge>
          )}
        </button>
      ))}
    </Card>
  );
}

export function MonthlyRegisterPage() {
  const { batchId = '' } = useParams();
  const [params, setParams] = useSearchParams();
  const month = monthParam(params.get('month'));
  const raw = params.get('view');
  const tab: Tab = raw === 'insights' || raw === 'sessions' ? raw : 'register';
  const q = useMonthlyRegister(batchId, month);
  const [session, setSession] = useState<string | null>(null);
  const [viewing, setViewing] = useState<PdfFile | null>(null);
  const [busy, setBusy] = useState(false);
  const r = q.data;

  const set = (patch: Record<string, string | null>) =>
    setParams(
      (p) => {
        const next = new URLSearchParams(p);
        for (const [k, v] of Object.entries(patch)) {
          if (v) next.set(k, v);
          else next.delete(k);
        }
        return next;
      },
      { replace: true },
    );
  const go = (m: string) => set({ month: m === thisMonth() ? null : m.slice(0, 7) });

  async function pdf() {
    if (!r) return;
    setBusy(true);
    try {
      const blob = await requestBlob(`/attendance/registers/${batchId}/pdf?month=${month}`);
      setViewing({
        blob,
        name: `${r.batch.name.replace(/[^a-z0-9]+/gi, '-')}-attendance-${month.slice(0, 7)}.pdf`,
        title: `Attendance · ${r.batch.name} · ${monthLabel(month)}`,
      });
    } catch (err) {
      toast.error('Could not make the PDF', { description: errorMessage(err) });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-2">
      <PageHeader
        className="mb-0"
        title={r?.batch.name ?? 'Monthly register'}
        description={
          r
            ? `${r.batch.sport} · ${r.batch.coach.name} · ${r.batch.location} · ${scheduleLabel(r.batch)}`
            : undefined
        }
        actions={
          <Button
            size="sm"
            variant="outline"
            disabled={!r || q.isPlaceholderData}
            loading={busy}
            onClick={() => void pdf()}
          >
            <FileText /> PDF
          </Button>
        }
      />
      <PeriodStepper
        label={monthLabel(month)}
        sublabel={
          r && !q.isPlaceholderData
            ? `${plural(r.summary.held, 'session')} held · ${plural(r.summary.students, 'student')}`
            : 'Loading…'
        }
        prevLabel="Previous month"
        nextLabel="Next month"
        onPrev={() => go(monthStep(month, -1))}
        onNext={() => go(monthStep(month, 1))}
        nextDisabled={month >= thisMonth()}
        onToday={month === thisMonth() ? undefined : () => go(thisMonth())}
        todayLabel="This month"
      />
      {q.isPending ? (
        <ListSkeleton rows={6} />
      ) : q.isError ? (
        <ErrorState error={q.error} onRetry={() => void q.refetch()} />
      ) : r ? (
        <div className={cn('space-y-2', q.isPlaceholderData && 'pointer-events-none opacity-60')}>
          <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
            <Card className="flex items-center gap-2.5 p-2.5">
              <RateRing rate={r.summary.rate} />
              <div className="min-w-0">
                <p className="text-[12px] text-muted-foreground">Attendance</p>
                <p className="text-[12px] font-medium">
                  {r.summary.change === null ? (
                    'No last month'
                  ) : r.summary.change === 0 ? (
                    'Same as last month'
                  ) : (
                    <>
                      <Change value={r.summary.change} /> vs {r.summary.previousRate}%
                    </>
                  )}
                </p>
              </div>
            </Card>
            <StatCard
              label="Sessions held"
              value={`${r.summary.held}/${r.summary.sessions - r.summary.upcoming}`}
              hint={
                r.summary.cancelled
                  ? `${r.summary.cancelled} cancelled`
                  : r.summary.upcoming
                    ? `${r.summary.upcoming} to come`
                    : 'All done'
              }
            />
            <StatCard
              label="Average present"
              value={r.summary.averagePresent ?? '—'}
              hint={`of ${plural(r.summary.students, 'student')}`}
            />
            <StatCard
              label="Need attention"
              value={
                new Set([...r.insights.absentRuns, ...r.insights.low].map((p) => p.studentId)).size
              }
              tone={r.insights.absentRuns.length || r.insights.low.length ? 'warning' : 'success'}
              hint="Below 60% or 3+ missed in a row"
            />
          </div>
          <Segmented
            ariaLabel="Register view"
            className="w-full sm:w-auto"
            value={tab}
            onChange={(v) => set({ view: v === 'register' ? null : v })}
            options={[
              {
                value: 'register',
                label: (
                  <span className="inline-flex items-center gap-1.5">
                    <TableProperties className="size-4" /> Register
                  </span>
                ),
              },
              {
                value: 'insights',
                label: (
                  <span className="inline-flex items-center gap-1.5">
                    <BarChart3 className="size-4" /> Insights
                  </span>
                ),
              },
              {
                value: 'sessions',
                label: (
                  <span className="inline-flex items-center gap-1.5">
                    <CalendarRange className="size-4" /> Sessions
                  </span>
                ),
              },
            ]}
          />
          {tab === 'register' ? (
            <RegisterGrid key={r.month} r={r} onSession={setSession} />
          ) : tab === 'insights' ? (
            <RegisterInsights r={r} onSession={setSession} />
          ) : (
            <Sessions r={r} onSession={setSession} />
          )}
        </div>
      ) : null}
      <SessionDialog
        batchId={session ? batchId : null}
        date={session ?? ''}
        onClose={() => setSession(null)}
      />
      <PdfViewer file={viewing} onClose={() => setViewing(null)} />
    </div>
  );
}
