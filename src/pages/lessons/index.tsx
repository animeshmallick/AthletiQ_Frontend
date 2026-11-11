/**
 * Lesson plans, by day: every batch with a session that day as a collapsible card (swipe or use
 * the arrows to change the day). Each card has the day's plan and a button for the batch's plan
 * template (a modal: view, edit, copy). ?batch= opens that card; with &plan=1, its template.
 */
import { Accordion } from 'radix-ui';
import { CalendarX2, ChevronDown, Layers, MapPin } from 'lucide-react';
import { useState } from 'react';
import { useBlocker, useSearchParams } from 'react-router';
import { useUser } from '@/app/auth';
import { ConfirmDialog, EmptyState, ListSkeleton, PageHeader } from '@/components/common';
import { Floating, FloatBadge } from '@/components/floating-badge';
import { SwipeDays } from '@/components/swipe-days';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/overlays';
import { timesOn } from '@/lib/batch-times';
import { addDays, formatTime, isoWeekday, plural, today } from '@/lib/format';
import { batchTone } from '../calendar-meta';
import { useBatches, useSessionPlan } from '@/lib/queries';
import type { Batch } from '@/lib/types';
import { cn } from '@/lib/utils';
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

  const date = params.get('date') ?? today();
  const step = (n: 1 | -1) => {
    if (busy) return;
    setDirection(n);
    set({ date: addDays(date, n), batch: '' });
  };
  const pick = (d: string) => {
    setDirection(d > date ? 1 : -1);
    set({ date: d, batch: '' });
  };

  const day = (batches.data ?? [])
    .filter((b) => runsOn(b, date, isCoach))
    .map((b) => ({ b, t: timesOn(b, date) }))
    .sort((x, y) => x.t.startTime.localeCompare(y.t.startTime));

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
        <DayStepper
          date={date}
          unit="day"
          sub={
            batches.data ? (day.length ? plural(day.length, 'session') : 'No sessions') : undefined
          }
          disabled={busy}
          onStep={step}
          onPick={pick}
          onToday={date !== today() ? () => pick(today()) : undefined}
        />

        {/* While a day is being filled in it stays put: no swiping. */}
        <SwipeDays
          dayKey={date}
          direction={direction}
          onStep={step}
          disabled={busy}
          prevLabel="Previous day"
          nextLabel="Next day"
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
    if (!day.length)
      return (
        <EmptyState
          icon={<CalendarX2 />}
          title="No sessions this day"
          description="Swipe or use the arrows to see another day."
        />
      );
    return (
      <Accordion.Root
        type="multiple"
        defaultValue={batchId ? [batchId] : []}
        className="space-y-1.5"
      >
        {day.map(({ b, t: bt }) => (
          <BatchDay
            key={`${b.id}:${date}`}
            b={b}
            date={date}
            start={bt.startTime}
            end={bt.endTime}
            showCoach={!isCoach}
            onEditingChange={(on) => markEditing(`${b.id}:${date}`, on)}
            onOpenPlan={
              isCoach && !b.substitution ? () => set({ batch: b.id, plan: '1' }) : undefined
            }
            onViewPlan={
              !isCoach || !b.substitution ? () => set({ batch: b.id, plan: '1' }) : undefined
            }
            canEdit={isCoach}
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
  start,
  end,
  showCoach,
  onEditingChange,
  onOpenPlan,
  onViewPlan,
  canEdit,
}: {
  b: Batch;
  date: string;
  start: string;
  end: string;
  showCoach: boolean;
  onEditingChange: (on: boolean) => void;
  onOpenPlan?: () => void;
  /** Opens the batch's plan template (coaches edit it, admins view it). */
  onViewPlan?: () => void;
  canEdit: boolean;
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
      <Accordion.Item
        value={b.id}
        className={cn(
          'overflow-hidden rounded-xl border border-l-4 bg-card shadow-e1',
          batchTone(b.id),
        )}
      >
        <Accordion.Header>
          {/* Same shape as the attendance cards: when | what | open. */}
          <Accordion.Trigger className="group grid w-full cursor-pointer grid-cols-[3.75rem_minmax(0,1fr)_auto] items-center gap-x-2 px-2 py-1.5 text-left hover:bg-muted/40">
            <span className="tabular leading-tight">
              <span className="block text-[12.5px] font-bold">{formatTime(start)}</span>
              <span className="block text-[10px] text-muted-foreground">to {formatTime(end)}</span>
            </span>
            <span className="min-w-0 leading-tight">
              <span className="block truncate text-[13.5px] font-semibold">{b.name}</span>
              <span className="flex min-w-0 items-center gap-1 text-[11px] text-muted-foreground">
                <MapPin className="size-3 shrink-0" />
                <span className="truncate">
                  {b.location.name}
                  {showCoach ? ` · ${b.coach.name}` : ''}
                </span>
              </span>
            </span>
            <ChevronDown
              className={cn(
                'size-4 shrink-0 text-muted-foreground transition-transform group-data-[state=open]:rotate-180',
              )}
            />
          </Accordion.Trigger>
        </Accordion.Header>
        <Accordion.Content className="space-y-1 border-t bg-muted/15 p-1">
          <SessionPlan
            batchId={b.id}
            date={date}
            onEditingChange={onEditingChange}
            onOpenPlan={onOpenPlan}
          />
          {onViewPlan && (
            <button
              type="button"
              onClick={onViewPlan}
              className="flex w-full cursor-pointer items-center justify-center gap-1 rounded-lg py-1 text-[11.5px] font-medium text-primary hover:bg-primary/5"
            >
              <Layers className="size-3.5" />
              {canEdit ? 'Manage plan template' : 'View plan template'}
            </button>
          )}
        </Accordion.Content>
      </Accordion.Item>
    </Floating>
  );
}
