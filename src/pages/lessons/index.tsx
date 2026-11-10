/**
 * Lesson plans, by day. "All batches" (the default) lists every batch with a session that day as
 * a collapsible section; picking one batch shows just its plan, with "Edit plan" for the batch
 * plan (a modal: view, edit, copy). Swipe or use the arrows to move a day (a session day when one
 * batch is picked).
 */
import { Accordion } from 'radix-ui';
import { CalendarX2, ChevronDown, Layers, Repeat } from 'lucide-react';
import { useState } from 'react';
import { useBlocker, useSearchParams } from 'react-router';
import { useUser } from '@/app/auth';
import { ConfirmDialog, EmptyState, ListSkeleton, PageHeader } from '@/components/common';
import { Floating, FloatBadge } from '@/components/floating-badge';
import { BatchSelect } from '@/components/pickers';
import { SwipeDays } from '@/components/swipe-days';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/overlays';
import { timesOn } from '@/lib/batch-times';
import { addDays, formatShortDate, formatTimeRange, isoWeekday, plural, today } from '@/lib/format';
import { useBatches, usePlanOverview, useSessionPlan } from '@/lib/queries';
import type { Batch } from '@/lib/types';
import { cn } from '@/lib/utils';
import { snapToSession } from './meta';
import { LessonInsightsButton } from './insights';
import { PlanTab } from './plan-tab';
import { DayStepper, SessionPlan, SessionStatus } from './session-tab';

/** Does the batch run on this day (for a substitute: a day they cover)? */
const runsOn = (b: Batch, date: string, isCoach: boolean) =>
  b.weekdays.includes(isoWeekday(date)) &&
  (!isCoach ||
    !b.substitution ||
    (date >= b.substitution.fromDate && date <= b.substitution.toDate));

export function LessonPlansPage() {
  const user = useUser();
  const isCoach = user.role === 'coach';
  const [params, setParams] = useSearchParams();
  const batches = useBatches({ active: 'true' });
  const raw = params.get('batch') ?? '';
  const batchId = raw === 'all' ? '' : raw;
  const batch = batches.data?.find((b) => b.id === batchId);
  // A substitute only sees the days they cover, not the batch plan.
  const subOnly = isCoach && !!batch?.substitution;
  // The batch plan opens in a modal (?plan=1, e.g. from the batch page or a to-do).
  const planOpen = !!batch && !subOnly && params.get('plan') === '1';
  const [direction, setDirection] = useState<1 | -1 | 0>(0);
  const status = usePlanOverview().data?.batches.find((b) => b.id === batchId)?.status;

  // Unsaved edits anywhere on the page (a day being filled in, the batch plan): ask first.
  const [editing, setEditing] = useState<Record<string, boolean>>({});
  const markEditing = (key: string, on: boolean) =>
    setEditing((e) => (Boolean(e[key]) === on ? e : { ...e, [key]: on }));
  const busy = Object.values(editing).some(Boolean);
  const planDirty = Boolean(editing.plan);
  const blocker = useBlocker(
    ({ currentLocation, nextLocation }) =>
      busy &&
      (currentLocation.pathname !== nextLocation.pathname ||
        currentLocation.search !== nextLocation.search),
  );
  const [confirmClose, setConfirmClose] = useState(false);

  const set = (changes: Record<string, string>) =>
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

  // One batch: its session days (a substitute stays within the days they cover). All: any day.
  const snap = (d: string, dir: 1 | -1 = 1) => {
    if (!batch) return d;
    const s = snapToSession(d, batch.weekdays, dir);
    const cover = isCoach ? batch.substitution : null;
    if (!cover) return s;
    if (s < cover.fromDate) return snapToSession(cover.fromDate, batch.weekdays, 1);
    if (s > cover.toDate) return snapToSession(cover.toDate, batch.weekdays, -1);
    return s;
  };
  const date = snap(params.get('date') ?? today());
  const step = (n: 1 | -1) => {
    if (busy) return;
    setDirection(n);
    set({ date: snap(addDays(date, n), n) });
  };
  const pick = (d: string) => {
    setDirection(d > date ? 1 : -1);
    set({ date: snap(d) });
  };

  const day = (batches.data ?? [])
    .filter((b) => runsOn(b, date, isCoach))
    .map((b) => ({ b, t: timesOn(b, date) }))
    .sort((x, y) => x.t.startTime.localeCompare(y.t.startTime));
  const t = batch ? timesOn(batch, date) : null;
  const sq = useSessionPlan(batch?.id, date);
  const single = sq.data?.date === date && sq.data.batch.id === batch?.id ? sq.data : undefined;

  return (
    <div>
      <PageHeader
        className="mb-2 sm:mb-3"
        title="Lesson plans"
        description={
          isCoach
            ? 'Each session follows its batch plan; fill in the day’s drills before it starts.'
            : 'What each batch is working on, day by day.'
        }
        actions={
          <LessonInsightsButton onOpenDay={(b, d) => set({ batch: b, date: d, plan: '' })} />
        }
      />

      <div className="space-y-1.5">
        <div className="flex items-center gap-1.5">
          <BatchSelect
            value={batchId}
            onChange={(id) => set({ batch: id, plan: '' })}
            batches={batches.data}
            loading={batches.isPending}
            allowAll
            className="min-w-0 flex-1 sm:w-80 sm:flex-none"
          />
          {batch && !subOnly && (
            <Button
              size="sm"
              variant={isCoach && status && status !== 'ready' ? 'default' : 'outline'}
              onClick={() => set({ plan: '1' })}
              className="h-8 shrink-0 gap-1 px-2 text-[12px] pointer-coarse:h-8 pointer-coarse:text-[12px] [&_svg:not([class*=size-])]:size-3.5"
            >
              <Layers />
              {!isCoach
                ? 'View plan'
                : status === 'none'
                  ? 'Set up plan'
                  : status === 'needs-update'
                    ? 'Update plan'
                    : 'Edit plan'}
            </Button>
          )}
        </div>

        {batch?.substitution && isCoach && (
          <div
            role="status"
            className="flex items-center gap-2 rounded-lg border border-primary/25 bg-primary/5 px-2 py-1 text-[12px]"
          >
            <Repeat aria-hidden className="size-3.5 shrink-0 text-primary" />
            You’re covering {batch.name} from {formatShortDate(batch.substitution.fromDate)} to{' '}
            {formatShortDate(batch.substitution.toDate)}.
          </div>
        )}

        <Floating badges={batch ? <SessionStatus d={single} /> : null}>
          <DayStepper
            date={date}
            unit={batch ? 'session' : 'day'}
            sub={
              batch && t
                ? formatTimeRange(t.startTime, t.endTime)
                : batches.data
                  ? day.length
                    ? plural(day.length, 'session')
                    : 'No sessions'
                  : undefined
            }
            disabled={busy}
            onStep={step}
            onPick={pick}
            onToday={date !== snap(today()) ? () => pick(today()) : undefined}
          />
        </Floating>

        {/* While a day is being filled in it stays put: no swiping. */}
        <SwipeDays
          dayKey={batchId + ':' + date}
          direction={direction}
          onStep={step}
          disabled={busy}
          prevLabel={batch ? 'Previous session' : 'Previous day'}
          nextLabel={batch ? 'Next session' : 'Next day'}
        >
          {renderDay()}
        </SwipeDays>
      </div>

      {batch && (
        <Dialog
          open={planOpen}
          onOpenChange={(o) => {
            if (o) return;
            if (planDirty) setConfirmClose(true);
            else set({ plan: '' });
          }}
        >
          <DialogContent className="sm:max-w-2xl">
            <DialogHeader>
              <DialogTitle>Batch plan</DialogTitle>
              <DialogDescription>
                {batch.name}: the blocks every session follows, and the drills to pick from.
              </DialogDescription>
            </DialogHeader>
            <PlanTab
              key={batch.id}
              batchId={batch.id}
              onDirtyChange={(d) => markEditing('plan', d)}
            />
          </DialogContent>
        </Dialog>
      )}
      <ConfirmDialog
        open={confirmClose}
        onOpenChange={setConfirmClose}
        title="Close without saving?"
        description="Your edits to the batch plan haven’t been saved."
        confirmLabel="Discard changes"
        destructive
        onConfirm={() => {
          markEditing('plan', false);
          setConfirmClose(false);
          set({ plan: '' });
        }}
      />
      <ConfirmDialog
        open={blocker.state === 'blocked'}
        onOpenChange={(o) => !o && blocker.state === 'blocked' && blocker.reset()}
        title="Leave without saving?"
        description="Your lesson plan edits haven’t been saved."
        confirmLabel="Discard changes"
        destructive
        onConfirm={() => {
          setEditing({});
          if (blocker.state === 'blocked') blocker.proceed();
        }}
      />
    </div>
  );

  function renderDay() {
    if (batches.isPending) return <ListSkeleton rows={4} />;
    if (batchId && !batch)
      return (
        <EmptyState
          icon={<CalendarX2 />}
          title="Batch not found"
          description="It may be inactive, or not one of yours."
        />
      );
    if (batch)
      return (
        <SessionPlan
          key={`${batch.id}:${date}`}
          batchId={batch.id}
          date={date}
          onEditingChange={(on) => markEditing(`${batch.id}:${date}`, on)}
          onOpenPlan={isCoach && !subOnly ? () => set({ plan: '1' }) : undefined}
        />
      );
    if (!day.length)
      return (
        <EmptyState
          icon={<CalendarX2 />}
          title="No sessions this day"
          description="Swipe or use the arrows to see another day."
        />
      );
    return (
      <Accordion.Root type="multiple" className="space-y-1.5">
        {day.map(({ b, t: bt }) => (
          <BatchDay
            key={`${b.id}:${date}`}
            b={b}
            date={date}
            time={formatTimeRange(bt.startTime, bt.endTime)}
            showCoach={!isCoach}
            onEditingChange={(on) => markEditing(`${b.id}:${date}`, on)}
            onOpenPlan={
              isCoach && !b.substitution ? () => set({ batch: b.id, plan: '1' }) : undefined
            }
          />
        ))}
      </Accordion.Root>
    );
  }
}

/** One batch's day in the "All batches" list: collapsed to its name, time and status. */
function BatchDay({
  b,
  date,
  time,
  showCoach,
  onEditingChange,
  onOpenPlan,
}: {
  b: Batch;
  date: string;
  time: string;
  showCoach: boolean;
  onEditingChange: (on: boolean) => void;
  onOpenPlan?: () => void;
}) {
  const q = useSessionPlan(b.id, date);
  const d = q.data?.date === date && q.data.batch.id === b.id ? q.data : undefined;
  return (
    <Floating
      badges={
        b.coachFeedback === false ? (
          <FloatBadge tone="neutral">Attendance only</FloatBadge>
        ) : (
          <SessionStatus d={d} />
        )
      }
    >
      <Accordion.Item value={b.id} className="overflow-hidden rounded-xl border bg-card shadow-e1">
        <Accordion.Header>
          <Accordion.Trigger className="group flex w-full cursor-pointer items-center gap-2 px-2 py-1.5 text-left hover:bg-muted/40">
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[14px] font-semibold">{b.name}</span>
              <span className="block truncate text-[11px] text-muted-foreground">
                {time} · {b.location.name}
                {showCoach ? ` · ${b.coach.name}` : ''}
              </span>
            </span>
            <ChevronDown
              className={cn(
                'size-4 shrink-0 text-muted-foreground transition-transform group-data-[state=open]:rotate-180',
              )}
            />
          </Accordion.Trigger>
        </Accordion.Header>
        <Accordion.Content className="border-t bg-muted/15 p-1.5">
          <SessionPlan
            batchId={b.id}
            date={date}
            onEditingChange={onEditingChange}
            onOpenPlan={onOpenPlan}
          />
        </Accordion.Content>
      </Accordion.Item>
    </Floating>
  );
}
