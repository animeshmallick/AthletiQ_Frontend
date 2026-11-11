import {
  ArrowRight,
  CalendarCheck2,
  CheckCircle2,
  ChevronRight,
  ClipboardList,
  CloudRain,
  LogIn,
  MapPin,
  Repeat,
} from 'lucide-react';
import { Suspense, useState } from 'react';
import { Link } from 'react-router';
import { toast } from 'sonner';
import { useUser } from '@/app/auth';
import { EmptyState, ErrorState, ListSkeleton, SectionDivider } from '@/components/common';
import { Floating, FloatBadge } from '@/components/floating-badge';
import { Button } from '@/components/ui/button';
import { Badge, Card, Skeleton } from '@/components/ui/primitives';
import { errorMessage } from '@/lib/api';
import {
  addDays,
  formatClock,
  formatLongDate,
  formatTime,
  money,
  plural,
  startOfWeek,
  today,
} from '@/lib/format';
import { getCurrentPosition } from '@/lib/geolocation';
import {
  useAttendanceOverview,
  useCheck,
  useCoachToday,
  useFeedbackWeek,
  useFinance,
  usePlanOverview,
  useTasks,
} from '@/lib/queries';
import type { DayOverviewSession, TodaySession } from '@/lib/types';
import {
  lateLabel,
  lateMinutes,
  sessionStatus,
  statusLabel,
  STATUS_META,
} from '@/lib/session-status';
import { cn } from '@/lib/utils';
import { CollectedByCard, MoneySnapshot } from './today-insights';
import {
  AdminFollowUps,
  CoachFollowUps,
  CoachMoney,
  DayPlan,
  PeriodOverview,
  TodoList,
} from './home/sections';

function greeting() {
  const h = Number(
    new Intl.DateTimeFormat('en-IN', {
      hour: 'numeric',
      hour12: false,
      timeZone: 'Asia/Kolkata',
    }).format(new Date()),
  );
  return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
}

// ─── Coach: check-in card ────────────────────────────────────────────────────

/** Check in at the venue (GPS). Once checked in, the session's status shows Live instead. */
export function CheckInButton({
  item,
  compact = false,
}: {
  item: TodaySession;
  overview?: DayOverviewSession;
  /** Small button for dense lists (calendar cards). */
  compact?: boolean;
}) {
  const checkIn = useCheck();
  const [locating, setLocating] = useState(false);

  async function run() {
    setLocating(true);
    try {
      const pos = await getCurrentPosition();
      const res = await checkIn.mutateAsync({
        batchId: item.batch.id,
        latitude: pos.latitude,
        longitude: pos.longitude,
        accuracy: pos.accuracy,
      });
      (res.session.flagged ? toast.warning : toast.success)(res.message);
    } catch (err) {
      toast.error('Check-in failed', { description: errorMessage(err) });
    } finally {
      setLocating(false);
    }
  }

  if (item.session) return null;
  return (
    <Button
      size="sm"
      variant="success"
      className={cn(
        'shrink-0',
        compact
          ? 'h-6 gap-1 rounded-md px-2 text-[11px] pointer-coarse:h-6 pointer-coarse:text-[11px] [&_svg:not([class*=size-])]:size-3'
          : 'h-8 gap-1.5 rounded-lg px-3 text-[12px] pointer-coarse:h-8 [&_svg:not([class*=size-])]:size-3.5',
      )}
      loading={locating || checkIn.isPending}
      onClick={() => void run()}
    >
      <LogIn />
      {locating ? 'Locating…' : 'Check in'}
    </Button>
  );
}

function CoachSessionCard({
  item,
  overview,
}: {
  item: TodaySession;
  overview?: DayOverviewSession;
}) {
  const statusIn = {
    startTime: item.batch.startTime,
    endTime: item.batch.endTime,
    cancelled: item.cancelled,
    checkInAt: item.session?.checkInAt,
    expectedStudents: overview?.expectedStudents ?? 0,
    attendanceComplete: overview?.attendanceComplete ?? false,
    lessonPlanFilled: overview?.lessonPlanFilled,
    coachFeedback: overview?.batch.coachFeedback,
  };
  const status = sessionStatus(statusIn, today());
  const meta = STATUS_META[status];
  // Checked in over 10 minutes after the start: amber, with how late.
  const late = item.session
    ? lateMinutes({ startTime: item.batch.startTime, checkInAt: item.session.checkInAt })
    : null;
  return (
    <Floating
      badges={[
        <FloatBadge
          key="st"
          tone={meta.tone}
          title={meta.hint}
          icon={item.cancelled ? <CloudRain /> : undefined}
        >
          {statusLabel(status, statusIn)}
        </FloatBadge>,
        item.asSubstitute ? (
          <FloatBadge key="s" tone="primary" icon={<Repeat />}>
            Substitute
          </FloatBadge>
        ) : item.substitute ? (
          <FloatBadge key="s" tone="muted" icon={<Repeat />}>
            Covered by {item.substitute.name.split(' ')[0]}
          </FloatBadge>
        ) : null,
      ]}
    >
      <Card className={cn('px-2 pt-1.5 pb-1.5', item.cancelled && 'opacity-75')}>
        {/* Two columns like the calendar: when (scheduled, checked in, how late) | what. */}
        <div className="grid grid-cols-[4.5rem_minmax(0,1fr)] gap-x-2">
          <div className="tabular leading-tight">
            <p className="text-[12.5px] font-bold">{formatTime(item.batch.startTime)}</p>
            <p className="text-[10px] text-muted-foreground">to {formatTime(item.batch.endTime)}</p>
            {item.session && !item.cancelled && (
              <>
                <hr aria-hidden className="my-1 mr-2 border-current opacity-15" />
                <p
                  className={cn(
                    'text-[10px] font-medium',
                    item.session.flagged ? 'text-destructive' : 'text-foreground/70',
                  )}
                  title={item.session.flagged ? 'Checked in away from the venue' : 'Checked in'}
                >
                  In {formatClock(item.session.checkInAt)}
                </p>
                {late && (
                  <p className="text-[10px] font-semibold text-warning-foreground dark:text-warning">
                    {lateLabel(late)}
                  </p>
                )}
              </>
            )}
          </div>
          <div className="min-w-0">
            <Link
              to={`/batches/${item.batch.id}`}
              className={cn(
                'group flex min-w-0 items-center gap-0.5 text-[13.5px] leading-snug font-semibold hover:text-primary',
                item.cancelled && 'line-through',
              )}
            >
              <span className="truncate">{item.batch.name}</span>
              <ChevronRight className="size-3.5 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
            </Link>
            <p className="flex min-w-0 items-center gap-1 text-[11px] text-muted-foreground">
              <MapPin className="size-3 shrink-0" />
              <span className="truncate">{item.location.name}</span>
            </p>
            {item.cancelled ? (
              <Badge variant="muted" className="mt-1">
                <CloudRain /> {item.cancelled}
              </Badge>
            ) : (
              // One row of actions: attendance progress, the lesson plan, and check-in.
              <div className="mt-1 flex min-w-0 flex-wrap items-center gap-1 [&_[data-slot=badge]]:h-6 [&_[data-slot=badge]]:px-2 [&_[data-slot=badge]]:text-[11px]">
                <Link to={`/attendance?batch=${item.batch.id}`} aria-label="Attendance">
                  <Badge
                    variant={
                      overview?.attendanceComplete
                        ? 'success'
                        : overview?.marked
                          ? 'default'
                          : 'muted'
                    }
                  >
                    <CalendarCheck2 />
                    {overview
                      ? `${overview.present}/${overview.expectedStudents} present`
                      : 'No students'}
                    {overview && !overview.attendanceComplete && overview.expectedStudents > 0 && (
                      <ArrowRight />
                    )}
                  </Badge>
                </Link>
                {(() => {
                  const p =
                    overview?.batch.coachFeedback === false
                      ? null
                      : overview?.hasLessonPlan && overview.lessonPlanFilled
                        ? { label: 'Plan filled', variant: 'success' as const }
                        : overview?.hasLessonPlan && overview.lessonPlanFits !== false
                          ? { label: 'Fill plan', variant: 'default' as const }
                          : overview?.hasLessonPlan
                            ? { label: 'Plan needs update', variant: 'warning' as const }
                            : { label: 'No plan yet', variant: 'warning' as const };
                  return p ? (
                    <Link to={`/lesson-plans?batch=${item.batch.id}`} aria-label="Lesson plan">
                      <Badge variant={p.variant}>
                        {p.variant === 'success' ? <CheckCircle2 /> : <ClipboardList />}
                        {p.label}
                        {p.variant !== 'success' && <ArrowRight />}
                      </Badge>
                    </Link>
                  ) : null;
                })()}
                {!item.session && (
                  <span className="ml-auto">
                    <CheckInButton item={item} overview={overview} compact />
                  </span>
                )}
              </div>
            )}
          </div>
        </div>
      </Card>
    </Floating>
  );
}

/** Batches whose lesson plan is missing or no longer fits the sessions. */
function PlanningNudge() {
  const q = usePlanOverview();
  const due = (q.data?.batches ?? []).filter((b) => !b.attendanceOnly && b.status !== 'ready');
  if (!due.length) return null;
  const first = due[0]!;
  const stale = due.filter((b) => b.status === 'needs-update').length;
  return (
    <Link
      to={`/lesson-plans?batch=${first.id}&plan=1`}
      className="flex items-center gap-2 rounded-lg border bg-card p-1 pl-2 text-[13px] leading-tight shadow-e1 transition-colors hover:bg-muted/50"
    >
      <ClipboardList className="size-4 shrink-0 text-primary" />
      <span className="flex-1">
        <span className="font-medium">
          {plural(due.length, 'batch', 'batches')} without a ready lesson plan
        </span>
        <span className="text-muted-foreground">
          {stale
            ? ` · ${stale} need${stale === 1 ? 's' : ''} an update after a timing change`
            : '.'}
        </span>
      </span>
      <ArrowRight className="size-4" />
    </Link>
  );
}

/** Greeting, date and today at a glance. */
function Hello({ chips }: { chips: { label: string; tone?: 'warn' | 'bad' }[] }) {
  const user = useUser();
  return (
    <div>
      <p className="text-[12px] text-muted-foreground">{formatLongDate(today())}</p>
      <h1 className="text-[21px] leading-tight font-semibold tracking-tight sm:text-2xl">
        {greeting()}, {user.name.split(' ')[0]}
      </h1>
      {chips.length > 0 && (
        <div className="mt-1.5 flex flex-wrap gap-1">
          {chips.map((c) => (
            <span
              key={c.label}
              className={cn(
                'rounded-full px-2 py-0.5 text-[11px] font-semibold',
                c.tone === 'bad'
                  ? 'bg-destructive/10 text-destructive'
                  : c.tone === 'warn'
                    ? 'bg-warning/15 text-warning-foreground dark:text-warning'
                    : 'bg-muted text-muted-foreground',
              )}
            >
              {c.label}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

function CoachToday() {
  const day = today();
  const todayQ = useCoachToday();
  const overview = useAttendanceOverview(day);
  const tasks = useTasks();
  const lastWeek = startOfWeek(addDays(day, -7));
  const feedback = useFeedbackWeek({ weekStart: lastWeek });
  const sessions = todayQ.data?.sessions ?? [];
  const live = sessions.filter((s) => !s.cancelled).length;
  const todo = tasks.data?.items.length ?? 0;
  const fb = feedback.data?.summary;
  const reportsDue = fb ? fb.pending + fb.draft : 0;

  return (
    <div className="space-y-3">
      <Hello
        chips={[
          { label: live ? plural(live, 'session') + ' today' : 'Rest day' },
          ...(todo ? [{ label: plural(todo, 'to-do'), tone: 'warn' as const }] : []),
          ...(reportsDue
            ? [{ label: plural(reportsDue, 'report') + ' due', tone: 'warn' as const }]
            : []),
        ]}
      />

      <SectionDivider>Today’s plan</SectionDivider>
      <DayPlan
        isAdmin={false}
        renderToday={() =>
          todayQ.isPending ? (
            <ListSkeleton rows={2} />
          ) : todayQ.isError ? (
            <ErrorState error={todayQ.error} onRetry={() => void todayQ.refetch()} />
          ) : sessions.length === 0 ? (
            <EmptyState
              icon={<CalendarCheck2 />}
              title="No sessions today"
              description="Enjoy the rest day. Use the arrows to see what’s coming up."
            />
          ) : (
            <div className="grid grid-cols-1 gap-1 xl:grid-cols-2">
              {sessions.map((s) => (
                <CoachSessionCard
                  key={s.batch.id}
                  item={s}
                  overview={overview.data?.sessions.find((o) => o.batch.id === s.batch.id)}
                />
              ))}
            </div>
          )
        }
      />

      <SectionDivider>To-dos</SectionDivider>
      <div className="grid grid-cols-1 gap-2 lg:grid-cols-2">
        <TodoList />
        <div className="space-y-2">
          <PlanningNudge />
        </div>
      </div>

      <SectionDivider>Follow-ups</SectionDivider>
      <CoachFollowUps />

      <SectionDivider>My money</SectionDivider>
      <CoachMoney />

      <SectionDivider>Overview</SectionDivider>
      <PeriodOverview isAdmin={false} />
    </div>
  );
}

// ─── Admin dashboard ─────────────────────────────────────────────────────────

function AdminToday() {
  const day = today();
  const finance = useFinance({});
  const overview = useAttendanceOverview(day);
  const tasks = useTasks();
  const t = finance.data?.totals;
  const sessions = overview.data?.sessions ?? [];
  const todo = tasks.data?.items.length ?? 0;

  return (
    <div className="space-y-3">
      <Hello
        chips={[
          {
            label: sessions.length
              ? plural(sessions.filter((s) => !s.cancelled).length, 'session') + ' today'
              : 'No sessions today',
          },
          ...(todo ? [{ label: plural(todo, 'to-do'), tone: 'warn' as const }] : []),
          ...(t?.overdueCount
            ? [{ label: plural(t.overdueCount, 'overdue invoice'), tone: 'bad' as const }]
            : []),
        ]}
      />

      <div className="grid grid-cols-2 gap-1.5 rounded-2xl border bg-card p-1.5 shadow-e1 sm:grid-cols-4">
        {[
          {
            label: 'Collected · month',
            value: t ? money(t.collected) : '—',
            hint: t ? `${plural(t.paymentsReceived, 'payment')}` : '',
            to: '/finance',
            tone: 'text-success',
          },
          {
            label: 'Billed · month',
            value: t ? money(t.billed) : '—',
            hint:
              t?.collectionRate !== null && t ? `${t.collectionRate}% collected this month` : '',
            to: '/finance',
          },
          {
            label: 'Outstanding',
            value: t ? money(t.outstanding) : '—',
            hint: t ? plural(t.dueCount + t.overdueCount, 'invoice') : '',
            to: '/finance?tab=invoices&status=open',
            tone: 'text-warning-foreground dark:text-warning',
          },
          {
            label: 'Overdue',
            value: t ? money(t.overdue) : '—',
            hint: t ? plural(t.overdueCount, 'invoice') : '',
            to: '/finance?tab=invoices&status=overdue',
            tone: 'text-destructive',
          },
        ].map((x) => (
          <Link
            key={x.label}
            to={x.to}
            className="min-w-0 rounded-xl bg-muted/40 px-2 py-1.5 transition-colors hover:bg-muted"
          >
            <p className="truncate text-[10px] font-medium text-muted-foreground">{x.label}</p>
            <p className={cn('tabular truncate text-[16px] leading-tight font-bold', x.tone)}>
              {x.value}
            </p>
            <p className="truncate text-[10px] text-muted-foreground">{x.hint}</p>
          </Link>
        ))}
      </div>

      <SectionDivider>Today’s plan</SectionDivider>
      <div className="grid grid-cols-1 gap-2 lg:grid-cols-5">
        <div className="min-w-0 lg:col-span-3">
          <DayPlan isAdmin />
        </div>
        <div className="min-w-0 lg:col-span-2">
          <TodoList />
        </div>
      </div>

      <SectionDivider>Follow-ups</SectionDivider>
      <AdminFollowUps />

      <SectionDivider>Money</SectionDivider>
      <div className="grid grid-cols-1 gap-2 lg:grid-cols-2">
        <MoneySnapshot />
        <Suspense fallback={<Skeleton className="h-64 rounded-2xl" />}>
          <CollectedByCard admin />
        </Suspense>
      </div>

      <SectionDivider>Overview</SectionDivider>
      <PeriodOverview isAdmin />
    </div>
  );
}

export function TodayPage() {
  const user = useUser();
  return user.role === 'admin' ? <AdminToday /> : <CoachToday />;
}
