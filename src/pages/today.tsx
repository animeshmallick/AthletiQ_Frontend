import {
  ArrowRight,
  CalendarCheck2,
  CheckCircle2,
  ClipboardList,
  Clock,
  CloudRain,
  Lock,
  LogIn,
  LogOut,
  MapPin,
  MessageSquareText,
  Repeat,
  ShieldAlert,
} from 'lucide-react';
import { Suspense, useState } from 'react';
import { Link } from 'react-router';
import { toast } from 'sonner';
import { useUser } from '@/app/auth';
import {
  ConfirmDialog,
  EmptyState,
  ErrorState,
  ListSkeleton,
  Progress,
  SectionDivider,
} from '@/components/common';
import { Button } from '@/components/ui/button';
import { Badge, Card, Skeleton } from '@/components/ui/primitives';
import { errorMessage } from '@/lib/api';
import {
  addDays,
  formatClock,
  formatLongDate,
  formatTimeRange,
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
  useLessonInsights,
  useTasks,
} from '@/lib/queries';
import type { DayOverviewSession, TodaySession } from '@/lib/types';
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

export function CheckInButton({
  item,
  overview,
  compact = false,
}: {
  item: TodaySession;
  overview?: DayOverviewSession;
  /** Small button for dense lists (calendar cards). */
  compact?: boolean;
}) {
  const checkIn = useCheck('check-in');
  const checkOut = useCheck('check-out');
  const [locating, setLocating] = useState(false);
  const [confirmOut, setConfirmOut] = useState(false);
  const unmarked = overview ? overview.expectedStudents - overview.marked : 0;
  const s = item.session;
  const done = Boolean(s?.checkOutAt);
  const mode: 'check-in' | 'check-out' = s ? 'check-out' : 'check-in';

  async function run() {
    setLocating(true);
    try {
      const pos = await getCurrentPosition();
      const mutation = mode === 'check-in' ? checkIn : checkOut;
      const res = await mutation.mutateAsync({
        batchId: item.batch.id,
        latitude: pos.latitude,
        longitude: pos.longitude,
        accuracy: pos.accuracy,
      });
      (res.session.flagged ? toast.warning : toast.success)(res.message);
    } catch (err) {
      toast.error(mode === 'check-in' ? 'Check-in failed' : 'Check-out failed', {
        description: errorMessage(err),
      });
    } finally {
      setLocating(false);
    }
  }

  if (done) {
    return (
      <Badge
        variant={s?.flagged ? 'warning' : 'success'}
        className={compact ? 'h-6 px-1.5 text-[10px]' : 'h-8 px-3'}
      >
        <CheckCircle2 /> {formatClock(s!.checkInAt)} – {formatClock(s!.checkOutAt!)}
      </Badge>
    );
  }
  return (
    <>
      <Button
        size="sm"
        variant={mode === 'check-in' ? 'success' : 'outline'}
        className={cn(
          'shrink-0',
          compact
            ? 'h-6 gap-1 rounded-md px-2 text-[11px] pointer-coarse:h-6 pointer-coarse:text-[11px] [&_svg:not([class*=size-])]:size-3'
            : 'h-8 gap-1.5 rounded-lg px-3 text-[12px] pointer-coarse:h-8 [&_svg:not([class*=size-])]:size-3.5',
        )}
        title={s ? `In since ${formatClock(s.checkInAt)}` : undefined}
        loading={locating || checkIn.isPending || checkOut.isPending}
        onClick={() => (mode === 'check-out' ? setConfirmOut(true) : void run())}
      >
        {mode === 'check-in' ? <LogIn /> : <LogOut />}
        {locating
          ? 'Locating…'
          : mode === 'check-in'
            ? 'Check in'
            : compact
              ? 'Check out'
              : `Check out · in since ${formatClock(s!.checkInAt)}`}
      </Button>
      <ConfirmDialog
        open={confirmOut}
        onOpenChange={setConfirmOut}
        title={unmarked > 0 ? 'Attendance is not complete' : 'Check out now?'}
        description={
          unmarked > 0
            ? `${unmarked} of ${overview!.expectedStudents} students are not marked. After you check out, attendance for ${item.batch.name} is locked and only an admin can change it.`
            : `After you check out, attendance for ${item.batch.name} is locked and only an admin can change it.`
        }
        confirmLabel={unmarked > 0 ? 'Check out anyway' : 'Check out'}
        destructive={unmarked > 0}
        onConfirm={() => {
          setConfirmOut(false);
          void run();
        }}
      />
    </>
  );
}

function CoachSessionCard({
  item,
  overview,
}: {
  item: TodaySession;
  overview?: DayOverviewSession;
}) {
  const pct =
    overview && overview.expectedStudents ? (overview.marked / overview.expectedStudents) * 100 : 0;
  return (
    <Card className="overflow-hidden">
      <div className="flex items-start justify-between gap-2 p-1.5 pl-2 sm:items-center">
        <div className="min-w-0 space-y-1">
          <div className="flex items-center gap-2">
            <h3 className="truncate font-semibold">{item.batch.name}</h3>
            {item.asSubstitute ? (
              <Badge variant="default">
                <Repeat /> Substitute
              </Badge>
            ) : (
              item.substitute && (
                <Badge variant="muted">
                  <Repeat /> Covered by {item.substitute.name}
                </Badge>
              )
            )}
            {item.session?.flagged && (
              <Badge variant="warning">
                <ShieldAlert /> Flagged
              </Badge>
            )}
          </div>
          <p className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[13px] text-muted-foreground">
            <span className="inline-flex items-center gap-1">
              <Clock className="size-3.5" />{' '}
              {formatTimeRange(item.batch.startTime, item.batch.endTime)}
            </span>
            <span className="inline-flex items-center gap-1">
              <MapPin className="size-3.5" /> {item.location.name}
            </span>
          </p>
        </div>
        {item.cancelled ? (
          <Badge variant="muted" className="h-8 px-3">
            <CloudRain /> Cancelled · {item.cancelled}
          </Badge>
        ) : (
          <CheckInButton item={item} overview={overview} compact />
        )}
      </div>
      <div className="grid grid-cols-2 border-t text-sm">
        <Link
          to={`/attendance?batch=${item.batch.id}`}
          className="group flex flex-col gap-1 border-r p-1.5 pl-2 transition-colors hover:bg-muted/50"
        >
          <span className="flex items-center justify-between font-medium">
            <span className="inline-flex items-center gap-2">
              <CalendarCheck2 className="size-4 text-primary" /> Attendance
            </span>
            <ArrowRight className="size-4 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
          </span>
          {overview ? (
            <>
              <Progress
                label="Attendance marked"
                value={pct}
                tone={overview.attendanceComplete ? 'success' : 'primary'}
              />
              <span className="tabular text-xs text-muted-foreground">
                {overview.marked}/{overview.expectedStudents} marked · {overview.present} present
              </span>
              {item.session?.checkOutAt && (
                <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                  <Lock className="size-3" /> Locked after check-out
                </span>
              )}
            </>
          ) : (
            <span className="text-xs text-muted-foreground">No students today</span>
          )}
        </Link>
        <Link
          to={`/lesson-plans?batch=${item.batch.id}&date=${today()}`}
          className="group flex flex-col gap-1 p-1.5 pl-2 transition-colors hover:bg-muted/50"
        >
          <span className="flex items-center justify-between font-medium">
            <span className="inline-flex items-center gap-2">
              <ClipboardList className="size-4 text-primary" /> Lesson plan
            </span>
            <ArrowRight className="size-4 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
          </span>
          {overview?.hasLessonPlan ? (
            <Badge variant="success">
              <CheckCircle2 /> Ready
            </Badge>
          ) : (
            <Badge variant="warning">Not planned yet</Badge>
          )}
        </Link>
      </div>
    </Card>
  );
}

/** Upcoming sessions (next two weeks) that still have no lesson plan. */
function PlanningNudge() {
  const day = today();
  const q = useLessonInsights({ from: day, to: addDays(day, 13) });
  const missing = q.data?.totals?.upcomingUnplanned ?? 0;
  if (!missing) return null;
  const first = q.data?.needsPlan?.find((n) => n.status === 'unplanned');
  return (
    <Link
      to={first ? `/lesson-plans?batch=${first.batchId}&date=${first.date}` : '/lesson-plans'}
      className="flex items-center gap-2 rounded-lg border bg-card p-1 pl-2 text-[13px] leading-tight shadow-e1 transition-colors hover:bg-muted/50"
    >
      <ClipboardList className="size-4 shrink-0 text-primary" />
      <span className="flex-1">
        <span className="font-medium">{plural(missing, 'session')} without a lesson plan</span>
        <span className="text-muted-foreground"> in the next two weeks.</span>
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
            <div className="grid gap-2 xl:grid-cols-2">
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
      <div className="grid gap-2 lg:grid-cols-2">
        <TodoList />
        <div className="space-y-2">
          {reportsDue > 0 && (
            <Link
              to="/feedback"
              className="flex items-center gap-2 rounded-lg border border-warning/40 bg-warning/10 p-1 pl-2 text-[13px] leading-tight transition-colors hover:bg-warning/15"
            >
              <MessageSquareText className="size-4 shrink-0 text-warning-foreground dark:text-warning" />
              <span className="flex-1">
                <span className="font-medium">Weekly feedback due</span> —{' '}
                {plural(reportsDue, 'student')} still need last week’s report.
              </span>
              <ArrowRight className="size-4" />
            </Link>
          )}
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
      <div className="grid gap-2 lg:grid-cols-5">
        <div className="lg:col-span-3">
          <DayPlan isAdmin />
        </div>
        <div className="lg:col-span-2">
          <TodoList />
        </div>
      </div>

      <SectionDivider>Follow-ups</SectionDivider>
      <AdminFollowUps />

      <SectionDivider>Money</SectionDivider>
      <div className="grid gap-2 lg:grid-cols-2">
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
