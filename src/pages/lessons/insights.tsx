/**
 * Lesson-plan insights: how many held sessions had their drills filled in (per batch and week by
 * week), the drills used most, how time splits across blocks, and recent sessions still open.
 */
import { useQuery } from '@tanstack/react-query';
import { BarChart3, ChevronRight, ClipboardCheck, Dumbbell } from 'lucide-react';
import { useState } from 'react';
import { EmptyState, ErrorState, SectionDivider } from '@/components/common';
import { Button } from '@/components/ui/button';
import { Segmented } from '@/components/ui/controls';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/overlays';
import { Skeleton } from '@/components/ui/primitives';
import { api } from '@/lib/api';
import { addDays, formatShortDate, startOfMonth, today } from '@/lib/format';
import { cn } from '@/lib/utils';

interface LessonInsights {
  from: string;
  to: string;
  totals: { sessions: number; filled: number; rate: number | null; drills: number };
  batches: { id: string; name: string; sessions: number; filled: number; rate: number | null }[];
  weeks: { start: string; sessions: number; filled: number }[];
  drills: { name: string; block: string; sessions: number; batches: number }[];
  blocks: { name: string; color: string | null; minutes: number }[];
  unfilled: { batchId: string; batchName: string; date: string }[];
}

type Period = '4w' | 'month' | '3m';
const rangeOf = (p: Period) => {
  const t = today();
  if (p === 'month') return { from: startOfMonth(t), to: t };
  return { from: addDays(t, p === '4w' ? -27 : -90), to: t };
};

const pct = (r: number | null) => (r === null ? '—' : `${Math.round(r * 100)}%`);
const tone = (r: number | null) =>
  r === null ? 'bg-muted' : r >= 0.8 ? 'bg-success' : r >= 0.5 ? 'bg-warning' : 'bg-destructive';

export function LessonInsightsButton({
  onOpenDay,
}: {
  onOpenDay: (batchId: string, date: string) => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button
        variant="outline"
        size="sm"
        onClick={() => setOpen(true)}
        className="h-8 gap-1 px-2.5 text-[12px] pointer-coarse:h-8 pointer-coarse:text-[12px]"
      >
        <BarChart3 className="size-3.5" /> Insights
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>Lesson plan insights</DialogTitle>
            <DialogDescription>
              How often sessions are filled in, and what’s being taught.
            </DialogDescription>
          </DialogHeader>
          {open && (
            <InsightsBody
              onOpenDay={(b, d) => {
                setOpen(false);
                onOpenDay(b, d);
              }}
            />
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}

function InsightsBody({ onOpenDay }: { onOpenDay: (batchId: string, date: string) => void }) {
  const [period, setPeriod] = useState<Period>('4w');
  const range = rangeOf(period);
  const q = useQuery({
    queryKey: ['lessons', 'insights', range],
    queryFn: ({ signal }) => api.get<LessonInsights>('/lessons/insights', range, signal),
  });

  return (
    <div className="space-y-2.5">
      <Segmented
        ariaLabel="Period"
        size="sm"
        value={period}
        onChange={setPeriod}
        className="w-full"
        options={[
          { value: '4w', label: 'Last 4 weeks', className: 'flex-1' },
          { value: 'month', label: 'This month', className: 'flex-1' },
          { value: '3m', label: 'Last 3 months', className: 'flex-1' },
        ]}
      />
      {q.isError ? (
        <ErrorState error={q.error} onRetry={() => void q.refetch()} />
      ) : !q.data ? (
        <div className="space-y-2">
          <Skeleton className="h-16 rounded-xl" />
          <Skeleton className="h-32 rounded-xl" />
        </div>
      ) : q.data.totals.sessions === 0 ? (
        <EmptyState
          icon={<ClipboardCheck />}
          title="No sessions yet"
          description="Insights appear once sessions have been held in this period."
        />
      ) : (
        <Body d={q.data} onOpenDay={onOpenDay} />
      )}
    </div>
  );
}

function Body({
  d,
  onOpenDay,
}: {
  d: LessonInsights;
  onOpenDay: (b: string, date: string) => void;
}) {
  const maxWeek = Math.max(...d.weeks.map((w) => w.sessions), 1);
  const blockTotal = d.blocks.reduce((n, b) => n + b.minutes, 0) || 1;
  return (
    <div className="space-y-2.5">
      <div className="grid grid-cols-3 gap-1.5">
        {[
          {
            label: 'Filled in',
            value: pct(d.totals.rate),
            hint: `${d.totals.filled} of ${d.totals.sessions} sessions`,
          },
          {
            label: 'Sessions held',
            value: d.totals.sessions,
            hint: `${formatShortDate(d.from)} – ${formatShortDate(d.to)}`,
          },
          { label: 'Drills used', value: d.totals.drills, hint: 'Different drills' },
        ].map((k) => (
          <div key={k.label} className="rounded-xl border bg-card px-2 py-1.5 shadow-e1">
            <p className="text-[10px] font-medium text-muted-foreground">{k.label}</p>
            <p className="tabular text-[18px] leading-tight font-bold">{k.value}</p>
            <p className="truncate text-[10px] text-muted-foreground">{k.hint}</p>
          </div>
        ))}
      </div>

      <SectionDivider>By batch</SectionDivider>
      <ul className="space-y-1.5">
        {d.batches.map((b) => (
          <li key={b.id} className="text-[12.5px]">
            <div className="flex items-baseline gap-2">
              <span className="min-w-0 flex-1 truncate font-medium">{b.name}</span>
              <span className="tabular shrink-0 text-muted-foreground">
                {b.filled}/{b.sessions} · <b className="text-foreground">{pct(b.rate)}</b>
              </span>
            </div>
            <div className="mt-0.5 h-1.5 overflow-hidden rounded-full bg-muted">
              <div
                className={cn('h-full rounded-full', tone(b.rate))}
                style={{ width: `${Math.round((b.rate ?? 0) * 100)}%` }}
              />
            </div>
          </li>
        ))}
      </ul>

      {d.weeks.length > 1 && (
        <>
          <SectionDivider>Week by week</SectionDivider>
          <div
            className="flex h-24 items-end gap-1"
            role="img"
            aria-label="Sessions filled in each week"
          >
            {d.weeks.map((w) => (
              <div key={w.start} className="flex min-w-0 flex-1 flex-col items-center gap-0.5">
                <div className="relative flex w-full flex-1 items-end">
                  <div
                    className="w-full rounded-t-md bg-muted"
                    style={{ height: `${(w.sessions / maxWeek) * 100}%` }}
                    title={`${w.filled} of ${w.sessions} filled`}
                  >
                    <div
                      className="w-full rounded-t-md bg-primary"
                      style={{
                        height: `${w.sessions ? (w.filled / w.sessions) * 100 : 0}%`,
                        marginTop: 'auto',
                      }}
                    />
                  </div>
                </div>
                <span className="tabular text-[9px] text-muted-foreground">
                  {formatShortDate(w.start)}
                </span>
              </div>
            ))}
          </div>
        </>
      )}

      {d.drills.length > 0 && (
        <>
          <SectionDivider>Most used drills</SectionDivider>
          <ol className="space-y-0.5">
            {d.drills.slice(0, 8).map((x, i) => (
              <li key={x.name} className="flex items-center gap-2 text-[12.5px]">
                <span className="tabular w-4 text-right text-[11px] text-muted-foreground">
                  {i + 1}
                </span>
                <Dumbbell className="size-3.5 shrink-0 text-muted-foreground" />
                <span className="min-w-0 flex-1 truncate">{x.name}</span>
                <span className="shrink-0 truncate text-[11px] text-muted-foreground">
                  {x.block}
                </span>
                <span className="tabular shrink-0 font-semibold">{x.sessions}×</span>
              </li>
            ))}
          </ol>
        </>
      )}

      {d.blocks.length > 0 && (
        <>
          <SectionDivider>Where the time goes</SectionDivider>
          <div
            className="flex h-2.5 overflow-hidden rounded-full"
            role="img"
            aria-label="Time per block"
          >
            {d.blocks.map((b) => (
              <span
                key={b.name}
                title={`${b.name} · ${Math.round((b.minutes / blockTotal) * 100)}%`}
                style={{
                  width: `${(b.minutes / blockTotal) * 100}%`,
                  background: b.color ?? 'var(--color-primary)',
                }}
              />
            ))}
          </div>
          <p className="flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] text-muted-foreground">
            {d.blocks.map((b) => (
              <span key={b.name} className="inline-flex items-center gap-1">
                <span
                  className="size-2 rounded-full"
                  style={{ background: b.color ?? 'var(--color-primary)' }}
                />
                {b.name} {Math.round((b.minutes / blockTotal) * 100)}%
              </span>
            ))}
          </p>
        </>
      )}

      {d.unfilled.length > 0 && (
        <>
          <SectionDivider>Not filled in</SectionDivider>
          <ul className="divide-y rounded-xl border">
            {d.unfilled.map((u) => (
              <li key={`${u.batchId}:${u.date}`}>
                <button
                  type="button"
                  onClick={() => onOpenDay(u.batchId, u.date)}
                  className="flex w-full cursor-pointer items-center gap-2 px-2 py-1.5 text-left text-[12.5px] hover:bg-muted/50"
                >
                  <span className="min-w-0 flex-1 truncate">{u.batchName}</span>
                  <span className="tabular shrink-0 text-muted-foreground">
                    {formatShortDate(u.date)}
                  </span>
                  <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
