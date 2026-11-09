import { BarChart3, CalendarDays, ClipboardList, Library, Lock, MapPin } from 'lucide-react';
import { useCallback, useRef, useState } from 'react';
import { useSearchParams } from 'react-router';
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
import { Badge } from '@/components/ui/primitives';
import { addDays, formatLongDate, formatTimeRange, relativeDay, today } from '@/lib/format';
import { useLessonInsights, usePlanDay } from '@/lib/queries';
import { PlanEditor } from './editor';
import { LessonInsightsView } from './insights';
import { LibraryDialog } from './library';
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

  return (
    <div>
      <PageHeader
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

      <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center">
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
          <div className="flex min-w-0 flex-1 flex-col gap-2 sm:flex-row sm:items-center sm:justify-end">
            <BatchSelect
              value={batchId}
              onChange={(id) => go({ batch: id })}
              batches={batches.data}
              loading={batches.isPending}
              className="sm:w-64"
            />
            <DateStepper
              value={date}
              onChange={(d) => go({ date: d })}
              className={batchId ? 'hidden sm:flex' : undefined}
            />
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
              <WeekStrip batchId={batchId} date={date} onPick={(d) => go({ date: d })} />
              <div className="mb-2.5 flex flex-wrap items-baseline gap-x-2 gap-y-1">
                <h2 className="text-[17px] font-semibold sm:text-lg">
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
                  className="mb-3 flex items-start gap-2.5 rounded-xl border border-warning/40 bg-warning/12 px-3 py-2.5 text-[13px] leading-snug"
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
