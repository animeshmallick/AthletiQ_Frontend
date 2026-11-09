import { CheckCircle2, ChevronLeft, ChevronRight, ClipboardPen } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/primitives';
import {
  addDays,
  formatLongDate,
  formatShortDate,
  formatTime,
  isoWeekday,
  relativeDay,
  startOfWeek,
  today,
  WEEKDAYS,
} from '@/lib/format';
import type { LessonInsights, PlanStatus } from '@/lib/types';
import { cn } from '@/lib/utils';
import { planStatus, STATUS_META } from './meta';
import { useWeekPlans, type BatchDay } from './week-data';

/** A day across batches: is anything on, was it all cancelled, and how planned is it. */
function summarise(list: BatchDay[] | undefined) {
  if (!list?.length) return null;
  const on = list.filter((d) => d.isSessionDay);
  const live = on.filter((d) => !d.cancelled);
  const cancelled = on.length > 0 && live.length === 0 ? on[0]!.cancelled : null;
  let status: PlanStatus;
  if (list.length === 1) status = planStatus(list[0]);
  else {
    const states = live.map((d) => planStatus(d));
    status = states.every((x) => x === 'complete')
      ? 'complete'
      : states.every((x) => x === 'unplanned')
        ? 'unplanned'
        : 'partial';
  }
  return {
    isSessionDay: on.length > 0,
    cancelled,
    sessions: live.length,
    planned: live.filter((d) => d.planId).length,
    status,
  };
}

/** Seven tappable days with each day's plan state (one batch or several), plus week navigation. */
export function WeekStrip({
  batchIds,
  date,
  onPick,
  sessionsOnly = false,
}: {
  batchIds: string[];
  date: string;
  onPick: (d: string) => void;
  /** Coaches can only open days a batch actually trains (not cancelled). */
  sessionsOnly?: boolean;
}) {
  const { from, pending, byDate } = useWeekPlans(batchIds, date);
  const week = Array.from({ length: 7 }, (_, i) => summarise(byDate.get(addDays(from, i))));
  const sessions = week.reduce((n, d) => n + (d?.sessions ?? 0), 0);
  const planned = week.reduce((n, d) => n + (d?.planned ?? 0), 0);

  return (
    <section aria-label="Week" className="mb-2">
      <div className="mb-1 flex items-center gap-1">
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label="Previous week"
          onClick={() => onPick(addDays(date, -7))}
        >
          <ChevronLeft />
        </Button>
        {/* The label doubles as a date picker on phones, where the date stepper is hidden. */}
        <label className="relative min-w-0 flex-1 cursor-pointer truncate rounded-md px-1 py-0.5 text-center text-[12px] font-medium text-muted-foreground hover:bg-muted sm:flex-none sm:cursor-default sm:hover:bg-transparent">
          {formatShortDate(from)} – {formatShortDate(addDays(from, 6))}
          {sessions > 0 && (
            <span className="tabular">
              {' '}
              · {planned}/{sessions} planned
            </span>
          )}
          <input
            type="date"
            aria-label="Jump to date"
            value={date}
            onChange={(e) => e.target.value && onPick(e.target.value)}
            className="absolute inset-0 cursor-pointer opacity-0 sm:hidden"
          />
        </label>
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label="Next week"
          onClick={() => onPick(addDays(date, 7))}
        >
          <ChevronRight />
        </Button>
        {from !== startOfWeek(today()) && (
          <Button
            variant="ghost"
            size="sm"
            className="h-7 px-2 text-xs"
            onClick={() => onPick(today())}
          >
            Today
          </Button>
        )}
      </div>
      <div className="grid grid-cols-7 gap-1 sm:gap-1.5">
        {Array.from({ length: 7 }, (_, i) => {
          const d = addDays(from, i);
          const info = week[i];
          const selected = d === date;
          const off = info && (!info.isSessionDay || info.cancelled);
          const status = info?.status ?? 'unplanned';
          const blocked = sessionsOnly && Boolean(off);
          return (
            <button
              key={d}
              type="button"
              disabled={blocked}
              onClick={() => onPick(d)}
              className={cn(
                'flex cursor-pointer flex-col items-center gap-0.5 rounded-xl border bg-card py-1.5 transition-all hover:border-primary/50 sm:py-2',
                selected && 'border-primary ring-2 ring-primary/20',
                off && 'border-dashed bg-muted/50 shadow-none',
                blocked && 'cursor-not-allowed opacity-50 hover:border-border',
                info?.cancelled && 'line-through',
              )}
              aria-pressed={selected}
              aria-label={`${formatLongDate(d)}${
                info?.cancelled
                  ? ` (cancelled: ${info.cancelled})`
                  : info && !info.isSessionDay
                    ? ' (no session)'
                    : info
                      ? ` (${STATUS_META[status].label.toLowerCase()}${
                          batchIds.length > 1 ? `, ${info.planned}/${info.sessions} sessions` : ''
                        })`
                      : ''
              }`}
              title={info?.cancelled ? `Cancelled: ${info.cancelled}` : undefined}
            >
              <span className="text-[10px] font-medium text-muted-foreground uppercase sm:text-[11px]">
                {WEEKDAYS[i]?.short}
              </span>
              <span
                className={cn(
                  'tabular text-[15px] leading-none font-semibold sm:text-base',
                  d === today() && 'text-primary',
                )}
              >
                {Number(d.slice(8))}
              </span>
              {pending ? (
                <span className="size-1.5" />
              ) : (
                <span
                  className={cn(
                    'size-1.5 rounded-full',
                    off ? 'bg-transparent' : STATUS_META[status].dot,
                  )}
                />
              )}
            </button>
          );
        })}
      </div>
      <Legend />
    </section>
  );
}

function Legend() {
  return (
    <ul className="mt-1 flex flex-wrap justify-center gap-x-3 gap-y-0.5 text-[11px] text-muted-foreground">
      {(['complete', 'partial', 'unplanned'] as const).map((s) => (
        <li key={s} className="inline-flex items-center gap-1">
          <span className={cn('size-1.5 rounded-full', STATUS_META[s].dot)} />
          {STATUS_META[s].label}
        </li>
      ))}
    </ul>
  );
}

/**
 * Sessions in the next two weeks (across all the coach's batches) that still need planning.
 * Tapping one opens that batch and day.
 */
export function UpNext({
  data,
  loading,
  current,
  onOpen,
}: {
  data?: LessonInsights;
  loading: boolean;
  current: { batchId: string; date: string };
  onOpen: (batchId: string, date: string) => void;
}) {
  if (loading) return <Skeleton className="mb-2 h-[46px] rounded-xl" />;
  if (!data || data.batches.length === 0) return null;
  const items = data.needsPlan;
  const multi = data.batches.length > 1;

  if (items.length === 0) {
    return (
      <p
        role="status"
        className="mb-2 flex items-center gap-2 rounded-lg border border-success/30 bg-success/8 px-2.5 py-1.5 text-[12px]"
      >
        <CheckCircle2 aria-hidden className="size-4 shrink-0 text-success" />
        Every session in the next two weeks is fully planned.
      </p>
    );
  }

  const unplanned = items.filter((i) => i.status === 'unplanned').length;
  return (
    <section
      aria-label="Needs a plan"
      className="mb-2 rounded-xl border bg-card px-1.5 py-1.5 shadow-e1"
    >
      <p className="mb-1 flex items-center gap-1.5 px-1 text-[12px] font-medium">
        <ClipboardPen aria-hidden className="size-3.5 text-warning-foreground dark:text-warning" />
        {unplanned > 0
          ? `${unplanned} session${unplanned === 1 ? '' : 's'} not planned`
          : 'Plans to finish'}
        <span className="font-normal text-muted-foreground">· next 2 weeks</span>
      </p>
      <ul className="-mx-0.5 flex [scrollbar-width:none] gap-1.5 overflow-x-auto px-0.5 pb-0.5">
        {items.slice(0, 24).map((n) => {
          const on = n.batchId === current.batchId && n.date === current.date;
          return (
            <li key={`${n.batchId}:${n.date}`} className="shrink-0">
              <button
                type="button"
                onClick={() => onOpen(n.batchId, n.date)}
                aria-current={on || undefined}
                className={cn(
                  'flex cursor-pointer items-center gap-2 rounded-lg border px-2 py-1 text-left transition-colors hover:border-primary/50',
                  STATUS_META[n.status].chip,
                  on && 'border-primary ring-2 ring-primary/20',
                )}
              >
                <span className={cn('size-1.5 shrink-0 rounded-full', STATUS_META[n.status].dot)} />
                <span className="leading-tight">
                  <span className="block text-[12px] font-semibold whitespace-nowrap">
                    {n.date === data.today || n.date === addDays(data.today, 1)
                      ? relativeDay(n.date, data.today)
                      : `${WEEKDAYS[isoWeekday(n.date) - 1]?.short} ${Number(n.date.slice(8))}`}
                    <span className="font-normal text-muted-foreground">
                      {' '}
                      · {formatTime(n.startTime)}
                    </span>
                  </span>
                  <span className="block max-w-36 truncate text-[11px] text-muted-foreground">
                    {multi ? n.batchName : STATUS_META[n.status].label}
                  </span>
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
