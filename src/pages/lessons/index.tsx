import {
  BarChart3,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  Library,
  Lock,
  MapPin,
} from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router';
import { toast } from 'sonner';
import { useUser } from '@/app/auth';
import {
  ConfirmDialog,
  EmptyState,
  ErrorState,
  ListSkeleton,
  PageHeader,
} from '@/components/common';
import { BatchSelect, DateStepper, useBatchDateParams } from '@/components/pickers';
import { Button } from '@/components/ui/button';
import { Segmented } from '@/components/ui/controls';
import { Badge, Input } from '@/components/ui/primitives';
import {
  addDays,
  formatLongDate,
  formatShortDate,
  formatTimeRange,
  relativeDay,
  today,
} from '@/lib/format';
import { useLessonInsights, usePlanDay } from '@/lib/queries';
import { cn } from '@/lib/utils';
import { PlanEditor } from './editor';
import { LessonInsightsView } from './insights';
import { LibraryDialog } from './library';
import { snapToSession } from './meta';
import { UpNext, WeekStrip } from './week';

type View = 'plan' | 'insights';
const NEAR_DAYS = ['Today', 'Tomorrow', 'Yesterday'];

export function LessonPlansPage() {
  const user = useUser();
  const isCoach = user.role === 'coach';
  const { batches, batchId, date, batch } = useBatchDateParams();
  const [params, setParams] = useSearchParams();
  const view: View = params.get('view') === 'insights' ? 'insights' : 'plan';
  const day = usePlanDay(batchId || undefined, date);
  const now = today();
  const upNext = useLessonInsights({ from: now, to: addDays(now, 13) });

  // Unsaved edits survive nothing: ask before switching day, batch or view.
  const dirty = useRef(false);
  const onDirtyChange = useCallback((d: boolean) => {
    dirty.current = d;
  }, []);
  const [pending, setPending] = useState<Record<string, string> | null>(null);

  const apply = (changes: Record<string, string>) =>
    setParams(
      (prev) => {
        const p = new URLSearchParams(prev);
        for (const [k, v] of Object.entries(changes)) {
          if (v) p.set(k, v);
          else p.delete(k);
        }
        return p;
      },
      { replace: true },
    );
  const go = (changes: Record<string, string>) => {
    const leavesDay =
      (changes.batch !== undefined && changes.batch !== batchId) ||
      (changes.date !== undefined && changes.date !== date) ||
      changes.view === 'insights';
    if (dirty.current && leavesDay) setPending(changes);
    else apply(changes);
  };
  const openDay = (b: string, d: string) => go({ batch: b, date: d, view: '' });

  // Coaches only move between their batch's session days; any other date snaps to the next one.
  const daysOf = (id: string) =>
    isCoach ? (batches.data?.find((b) => b.id === id)?.weekdays ?? []) : [];
  const snap = (d: string, dir: 1 | -1 = 1, id = batchId) => snapToSession(d, daysOf(id), dir);
  const pickDate = (d: string, dir: 1 | -1 = 1) => {
    const s = snap(d, dir);
    if (s !== d && dir === 1 && isCoach)
      toast.info(`No session on ${formatShortDate(d)}`, {
        description: `Showing ${formatLongDate(s)} instead.`,
      });
    go({ date: s });
  };
  const snapped = snap(date);
  useEffect(() => {
    if (view === 'plan' && snapped !== date) apply({ date: snapped });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- apply is stable in effect
  }, [view, snapped, date]);

  return (
    <div>
      <PageHeader
        className="mb-2 sm:mb-4"
        title="Lesson plans"
        description={
          isCoach
            ? 'Plan each session as events × stages, then run it from your phone.'
            : 'See what coaches have planned and how well each batch is covered.'
        }
        actions={
          isCoach && (
            <LibraryDialog
              trigger={
                <Button variant="outline" size="sm">
                  <Library /> Library
                </Button>
              }
            />
          )
        }
      />

      <div className="mb-2 flex flex-col gap-1.5 sm:flex-row sm:items-center sm:gap-2">
        <Segmented
          ariaLabel="Lesson plan view"
          value={view}
          onChange={(v) => go({ view: v === 'insights' ? 'insights' : '' })}
          options={[
            {
              value: 'plan',
              label: (
                <span className="inline-flex items-center gap-1.5">
                  <CalendarDays className="size-4" /> Plan
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
          ]}
        />
        {view === 'plan' && (
          <div className="flex min-w-0 flex-1 flex-col gap-1.5 sm:flex-row sm:items-center sm:justify-end">
            <BatchSelect
              value={batchId}
              onChange={(id) => go({ batch: id, date: snap(date, 1, id) })}
              batches={batches.data}
              loading={batches.isPending}
              className="sm:w-64"
            />
            {isCoach ? (
              <SessionStepper
                date={date}
                disabled={!batch}
                onPrev={() => go({ date: snap(addDays(date, -1), -1) })}
                onNext={() => go({ date: snap(addDays(date, 1), 1) })}
                onPick={(d) => pickDate(d)}
                className={batchId ? 'hidden sm:flex' : undefined}
              />
            ) : (
              <DateStepper
                value={date}
                onChange={(d) => go({ date: d })}
                className={batchId ? 'hidden sm:flex' : undefined}
              />
            )}
          </div>
        )}
        {view === 'insights' && !isCoach && (
          <BatchSelect
            value={batchId}
            onChange={(id) => apply({ batch: id })}
            batches={batches.data}
            loading={batches.isPending}
            className="sm:ml-auto sm:w-64"
            allowAll
          />
        )}
      </div>

      {view === 'insights' ? (
        <LessonInsightsView batchId={isCoach ? undefined : batchId} onOpen={openDay} />
      ) : (
        <>
          {isCoach && (
            <UpNext
              data={upNext.data}
              loading={upNext.isPending}
              current={{ batchId, date }}
              onOpen={openDay}
            />
          )}
          {!batchId ? (
            <EmptyState
              icon={<ClipboardList />}
              title="Pick a batch"
              description="Choose a batch to see or build its plan."
            />
          ) : (
            <>
              <WeekStrip
                batchId={batchId}
                date={date}
                onPick={(d) => pickDate(d)}
                sessionsOnly={isCoach}
              />
              <div className="mb-1.5 flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                <h2 className="text-[15px] font-semibold sm:text-base">
                  {NEAR_DAYS.includes(relativeDay(date))
                    ? `${relativeDay(date)} · ${formatLongDate(date)}`
                    : formatLongDate(date)}
                </h2>
                {day.data?.cancelled ? (
                  <Badge variant="warning">Cancelled</Badge>
                ) : (
                  day.data && !day.data.isSessionDay && <Badge variant="muted">No session</Badge>
                )}
                {batch && (
                  <span className="inline-flex min-w-0 items-center gap-1 text-[12px] text-muted-foreground">
                    {formatTimeRange(batch.startTime, batch.endTime)}
                    <MapPin className="ml-1 size-3" />
                    <span className="truncate">{batch.location.name}</span>
                    {!isCoach && <span className="truncate"> · {batch.coach.name}</span>}
                  </span>
                )}
              </div>
              {isCoach && day.data?.lockedReason && (
                <div
                  role="status"
                  className="mb-2 flex items-start gap-2 rounded-lg border border-warning/40 bg-warning/12 px-2.5 py-1.5 text-[12px] leading-snug"
                >
                  <Lock
                    aria-hidden
                    className="mt-0.5 size-4 shrink-0 text-warning-foreground dark:text-warning"
                  />
                  <span>
                    <b className="font-semibold">Planning is closed for this day.</b>{' '}
                    {day.data.lockedReason} Pick a highlighted day above.
                  </span>
                </div>
              )}
              {day.isPending ? (
                <ListSkeleton rows={4} />
              ) : day.isError ? (
                <ErrorState error={day.error} onRetry={() => void day.refetch()} />
              ) : isCoach && day.data.lockedReason && !day.data.plan ? null : (
                <PlanEditor
                  key={`${batchId}:${date}`}
                  batchId={batchId}
                  date={date}
                  plan={day.data.plan}
                  readOnly={!isCoach || !!day.data.lockedReason}
                  libraryCoachId={batch?.coach.id ?? ''}
                  previousPlanDate={day.data.previousPlanDate}
                  onDirtyChange={onDirtyChange}
                />
              )}
            </>
          )}
        </>
      )}

      <ConfirmDialog
        open={Boolean(pending)}
        onOpenChange={(o) => !o && setPending(null)}
        title="Discard unsaved changes?"
        description="Your edits to this plan haven’t been saved. Leave without saving?"
        confirmLabel="Discard changes"
        destructive
        onConfirm={() => {
          dirty.current = false;
          if (pending) apply(pending);
          setPending(null);
        }}
      />
    </div>
  );
}

/** Previous / next session day and a date field; disabled until there's a batch to plan for. */
function SessionStepper({
  date,
  disabled,
  onPrev,
  onNext,
  onPick,
  className,
}: {
  date: string;
  disabled: boolean;
  onPrev: () => void;
  onNext: () => void;
  onPick: (d: string) => void;
  className?: string;
}) {
  return (
    <div className={cn('flex items-center gap-1', className)}>
      <Button
        variant="outline"
        size="icon"
        aria-label="Previous session"
        disabled={disabled}
        onClick={onPrev}
      >
        <ChevronLeft />
      </Button>
      <Input
        type="date"
        aria-label="Date"
        value={date}
        disabled={disabled}
        onChange={(e) => e.target.value && onPick(e.target.value)}
        className="w-40 text-center"
      />
      <Button
        variant="outline"
        size="icon"
        aria-label="Next session"
        disabled={disabled}
        onClick={onNext}
      >
        <ChevronRight />
      </Button>
    </div>
  );
}
