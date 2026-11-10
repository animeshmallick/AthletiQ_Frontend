/**
 * Homepage sections, focused on today: the day's plan as a timeline (swipe between days), the
 * to-do list, follow-ups that need attention, money right now, and a week / month overview.
 * Shared by the admin and coach homepages; each decides which sections to show.
 */
import { PeriodStepper } from '@/components/date-nav';
import { SwipeDays } from '@/components/swipe-days';
import {
  AlertTriangle,
  CalendarCheck2,
  CalendarClock,
  CheckCircle2,
  ChevronRight,
  ClipboardList,
  IndianRupee,
  LogIn,
  LogOut,
  MapPin,
  MessageSquareText,
  Repeat,
  ShieldAlert,
  UserPlus,
  Users,
} from 'lucide-react';
import { useEffect, useState, type ReactNode } from 'react';
import { Link } from 'react-router';
import { Badge, Card, Skeleton } from '@/components/ui/primitives';
import { Segmented } from '@/components/ui/controls';
import {
  addDays,
  formatClock,
  formatDate,
  formatLongDate,
  formatTime,
  money,
  plural,
  relativeDay,
  startOfMonth,
  startOfWeek,
  today,
} from '@/lib/format';
import {
  useCalendar,
  useCoachSessions,
  useDashboard,
  useFinance,
  useFundsOverview,
  useRegistrations,
  useStudents,
  useTasks,
} from '@/lib/queries';
import type { AppTask, DayOverviewSession } from '@/lib/types';
import { cn } from '@/lib/utils';

// ─── Shared bits ─────────────────────────────────────────────────────────────

const istClock = new Intl.DateTimeFormat('en-GB', {
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
  timeZone: 'Asia/Kolkata',
});
const toMin = (t: string) => {
  const [h = 0, m = 0] = t.split(':').map(Number);
  return h * 60 + m;
};
/** Minutes since midnight (IST), refreshed every minute. */
function useNowMinutes() {
  const [now, setNow] = useState(() => toMin(istClock.format(new Date())));
  useEffect(() => {
    const t = setInterval(() => setNow(toMin(istClock.format(new Date()))), 60_000);
    return () => clearInterval(t);
  }, []);
  return now;
}

/** A compact titled block; sections are separated by the page's dividers. */
export function Panel({
  title,
  icon,
  action,
  children,
  className,
}: {
  title: ReactNode;
  icon?: ReactNode;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <Card className={cn('min-w-0 p-2.5', className)}>
      <div className="mb-1.5 flex items-center justify-between gap-2">
        <h3 className="flex min-w-0 items-center gap-1.5 text-[13px] font-semibold [&_svg]:size-4 [&_svg]:text-muted-foreground">
          {icon}
          <span className="truncate">{title}</span>
        </h3>
        {action}
      </div>
      {children}
    </Card>
  );
}

const Empty = ({ children }: { children: ReactNode }) => (
  <p className="py-2 text-center text-[12px] text-muted-foreground">{children}</p>
);

// ─── Today's plan: day timeline ──────────────────────────────────────────────

type SessionState = 'live' | 'next' | 'later' | 'done' | 'cancelled' | 'past';

function stateOf(
  s: DayOverviewSession,
  isToday: boolean,
  isPast: boolean,
  now: number,
  nextId: string | null,
): SessionState {
  if (s.cancelled) return 'cancelled';
  if (isPast) return 'past';
  if (!isToday) return 'later';
  const start = toMin(s.batch.startTime);
  const end = toMin(s.batch.endTime);
  if (now >= start && now < end) return 'live';
  if (now >= end) return 'done';
  return s.batch.id === nextId ? 'next' : 'later';
}

const STATE_STYLE: Record<SessionState, { label: string; dot: string; badge: string }> = {
  live: { label: 'Live', dot: 'bg-success animate-pulse', badge: 'bg-success/12 text-success' },
  next: { label: 'Next', dot: 'bg-primary', badge: 'bg-primary/10 text-primary' },
  later: { label: 'Later', dot: 'bg-muted-foreground/40', badge: 'bg-muted text-muted-foreground' },
  done: { label: 'Done', dot: 'bg-muted-foreground/60', badge: 'bg-muted text-muted-foreground' },
  past: { label: '', dot: 'bg-muted-foreground/60', badge: '' },
  cancelled: {
    label: 'Cancelled',
    dot: 'bg-destructive/60',
    badge: 'bg-destructive/10 text-destructive',
  },
};

/**
 * The day's sessions on a timeline, with today's to-dos pinned to the session they belong to.
 * Arrows (or a swipe) move between days. `renderToday` lets coaches show their check-in cards
 * for today's sessions instead of plain rows.
 */
export function DayPlan({
  isAdmin,
  renderToday,
}: {
  isAdmin: boolean;
  renderToday?: (sessions: DayOverviewSession[]) => ReactNode;
}) {
  const [day, setDay] = useState(today());
  const q = useCalendar(day, day);
  const tasks = useTasks();
  const now = useNowMinutes();
  const isToday = day === today();
  const isPast = day < today();
  const sessions = [...(q.data?.days.find((d) => d.date === day)?.sessions ?? [])].sort(
    (a, b) => toMin(a.batch.startTime) - toMin(b.batch.startTime),
  );
  const nextId = isToday
    ? (sessions.find((s) => !s.cancelled && toMin(s.batch.startTime) > now)?.batch.id ?? null)
    : null;
  const todosFor = (batchId: string) =>
    isToday ? (tasks.data?.items ?? []).filter((t) => t.id.includes(`:${batchId}:`)) : [];

  // Which way the day last changed, so the new day slides in from that side.
  const [dir, setDir] = useState<1 | -1 | 0>(0);
  const goTo = (d: string) => {
    if (d === day) return;
    setDir(d > day ? 1 : -1);
    setDay(d);
  };
  const move = (n: 1 | -1) => goTo(addDays(day, n));

  return (
    <Card className="min-w-0 space-y-2 p-2">
      <PeriodStepper
        label={
          <span
            key={day}
            className={cn(
              'inline-block',
              dir === 1 && 'animate-day-next',
              dir === -1 && 'animate-day-prev',
            )}
          >
            {relativeDay(day)}
          </span>
        }
        sublabel={
          q.isPending
            ? 'Loading…'
            : sessions.length
              ? `${isToday ? '' : `${formatLongDate(day)} · `}${plural(sessions.filter((s) => !s.cancelled).length, 'session')}${sessions.some((s) => s.cancelled) ? ` · ${sessions.filter((s) => s.cancelled).length} cancelled` : ''}`
              : isToday
                ? 'No sessions'
                : `${formatLongDate(day)} · no sessions`
        }
        prevLabel="Previous day"
        nextLabel="Next day"
        onPrev={() => move(-1)}
        onNext={() => move(1)}
        onToday={isToday ? undefined : () => goTo(today())}
        pick={{ value: day, onChange: goTo }}
        className="shadow-none"
      />

      <SwipeDays
        dayKey={day}
        direction={dir}
        onStep={move}
        prevLabel={relativeDay(addDays(day, -1))}
        nextLabel={relativeDay(addDays(day, 1))}
      >
        {isToday && renderToday ? (
          renderToday(sessions)
        ) : q.isPending ? (
          <Skeleton className="h-24 rounded-2xl" />
        ) : sessions.length === 0 ? (
          <Card className="p-4 text-center text-[13px] text-muted-foreground">
            <CalendarCheck2 className="mx-auto mb-1 size-5" />
            {isToday ? 'No sessions today. Enjoy the rest day.' : 'No sessions on this day.'}
          </Card>
        ) : (
          <ol className="space-y-1.5" aria-label="Timeline">
            {sessions.map((s) => {
              const st = stateOf(s, isToday, isPast, now, nextId);
              const style = STATE_STYLE[st];
              const todos = todosFor(s.batch.id);
              return (
                <li key={s.batch.id}>
                  <Card
                    className={cn('p-2', (st === 'done' || st === 'cancelled') && 'opacity-70')}
                  >
                    <div className="flex items-start gap-2.5">
                      <div className="w-[4.5rem] shrink-0">
                        <p className="tabular flex items-center gap-1.5 text-[13px] font-semibold">
                          <span
                            aria-hidden
                            className={cn('size-2 shrink-0 rounded-full', style.dot)}
                          />
                          {formatTime(s.batch.startTime)}
                        </p>
                        <p className="tabular pl-3.5 text-[11px] text-muted-foreground">
                          to {formatTime(s.batch.endTime)}
                        </p>
                      </div>
                      <div className="min-w-0 flex-1">
                        <Link
                          to={`/attendance?batch=${s.batch.id}&date=${day}`}
                          className="block truncate text-[14px] font-semibold hover:underline"
                        >
                          {s.batch.name}
                        </Link>
                        <p className="truncate text-[11px] text-muted-foreground">
                          {isAdmin ? `${s.batch.coach.name} · ` : ''}
                          {s.batch.location.name}
                        </p>
                        <div className="mt-1 flex flex-wrap items-center gap-1 text-[11px]">
                          {style.label && (
                            <span
                              className={cn(
                                'rounded-full px-1.5 py-0.5 font-semibold',
                                style.badge,
                              )}
                            >
                              {style.label}
                              {st === 'cancelled' && s.cancelled ? ` · ${s.cancelled}` : ''}
                            </span>
                          )}
                          {s.substitute && (
                            <Badge variant="muted">
                              <Repeat /> {s.substitute.name}
                            </Badge>
                          )}
                          {!s.cancelled && (isToday || isPast) && (
                            <>
                              <Badge
                                variant={
                                  s.coachSession
                                    ? s.coachSession.flagged
                                      ? 'warning'
                                      : 'success'
                                    : 'muted'
                                }
                              >
                                <MapPin />
                                {s.coachSession
                                  ? `In ${formatClock(s.coachSession.checkInAt)}`
                                  : 'No check-in'}
                              </Badge>
                              <Badge
                                variant={
                                  s.attendanceComplete ? 'success' : s.marked ? 'warning' : 'muted'
                                }
                              >
                                <Users /> {s.marked}/{s.expectedStudents}
                              </Badge>
                            </>
                          )}
                          {!s.cancelled && (
                            <Badge variant={s.hasLessonPlan ? 'success' : 'muted'}>
                              <ClipboardList /> {s.hasLessonPlan ? 'Plan' : 'No plan'}
                            </Badge>
                          )}
                        </div>
                        {todos.length > 0 && (
                          <ul className="mt-1.5 space-y-0.5">
                            {todos.map((t) => (
                              <li key={t.id}>
                                <Link
                                  to={t.link}
                                  className="flex items-center gap-1 text-[12px] font-medium text-primary hover:underline"
                                >
                                  <span
                                    className={cn(
                                      'size-1.5 rounded-full',
                                      SEVERITY_DOT[t.severity],
                                    )}
                                  />
                                  {t.title}
                                </Link>
                              </li>
                            ))}
                          </ul>
                        )}
                      </div>
                    </div>
                  </Card>
                </li>
              );
            })}
          </ol>
        )}
      </SwipeDays>
    </Card>
  );
}

// ─── To-dos ──────────────────────────────────────────────────────────────────

const SEVERITY_DOT: Record<AppTask['severity'], string> = {
  critical: 'bg-destructive',
  warning: 'bg-warning',
  info: 'bg-primary',
};
const KIND_ICON: Partial<Record<AppTask['kind'], ReactNode>> = {
  'check-in': <LogIn />,
  'missed-check-in': <AlertTriangle />,
  attendance: <Users />,
  'lesson-plan': <ClipboardList />,
  'check-out': <LogOut />,
  feedback: <MessageSquareText />,
  registrations: <UserPlus />,
  'flagged-check-ins': <ShieldAlert />,
  'overdue-fees': <IndianRupee />,
};
const GROUPS: { severity: AppTask['severity']; title: string }[] = [
  { severity: 'critical', title: 'Do now' },
  { severity: 'warning', title: 'Today' },
  { severity: 'info', title: 'Later' },
];

/** Everything the app wants done, most urgent first; each item opens where it's resolved. */
export function TodoList() {
  const q = useTasks();
  const items = q.data?.items ?? [];
  return (
    <Panel title={`To-dos${items.length ? ` · ${items.length}` : ''}`} icon={<CheckCircle2 />}>
      {q.isPending ? (
        <Skeleton className="h-16 rounded-xl" />
      ) : items.length === 0 ? (
        <p className="flex items-center justify-center gap-1.5 py-3 text-[13px] text-success">
          <CheckCircle2 className="size-4" /> All caught up
        </p>
      ) : (
        <div className="space-y-2">
          {GROUPS.map((g) => {
            const list = items.filter((t) => t.severity === g.severity);
            if (!list.length) return null;
            return (
              <div key={g.severity}>
                <p className="mb-0.5 flex items-center gap-1.5 text-[10px] font-semibold tracking-wide text-muted-foreground uppercase">
                  <span className={cn('size-1.5 rounded-full', SEVERITY_DOT[g.severity])} />
                  {g.title}
                </p>
                <ul className="divide-y rounded-xl border">
                  {list.map((t) => (
                    <li key={t.id}>
                      <Link
                        to={t.link}
                        className="flex items-center gap-2 px-2 py-1.5 hover:bg-muted/40"
                      >
                        <span className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground [&_svg]:size-3.5">
                          {KIND_ICON[t.kind] ?? <CheckCircle2 />}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-[13px] font-medium">
                            {t.title}
                            {t.count && t.count > 1 ? ` · ${t.count}` : ''}
                          </span>
                          <span className="block truncate text-[11px] text-muted-foreground">
                            {t.detail}
                          </span>
                        </span>
                        <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
        </div>
      )}
    </Panel>
  );
}

// ─── Follow-ups ──────────────────────────────────────────────────────────────

function LinkRow({ to, children, aside }: { to: string; children: ReactNode; aside?: ReactNode }) {
  return (
    <li>
      <Link to={to} className="flex items-center justify-between gap-2 py-1.5 hover:bg-muted/30">
        <span className="min-w-0 truncate text-[13px]">{children}</span>
        {aside && <span className="tabular shrink-0 text-[12px]">{aside}</span>}
      </Link>
    </li>
  );
}

/** Admin: who to chase and what's waiting for a decision. */
export function AdminFollowUps() {
  const finance = useFinance({});
  const regs = useRegistrations({ status: 'pending', pageSize: 1 });
  const flagged = useCoachSessions({ flagged: 'true' });
  const dash = useDashboard();
  const pendingRegs =
    (regs.data?.meta?.pending.pendingStudents ?? 0) +
    (regs.data?.meta?.pending.pendingCoaches ?? 0);
  const unreviewed = flagged.data?.summary.unreviewedFlagged ?? 0;
  const overdue = finance.data?.topOverdue ?? [];
  const low = dash.data?.needsAttention ?? [];
  const birthdays = dash.data?.birthdays ?? [];
  return (
    <div className="grid grid-cols-1 gap-2 lg:grid-cols-2">
      <Panel
        title="Largest overdue balances"
        icon={<IndianRupee />}
        action={
          <Link
            to="/finance?tab=invoices&status=overdue"
            className="text-[12px] font-medium text-primary"
          >
            All
          </Link>
        }
      >
        {finance.isPending ? (
          <Skeleton className="h-20 rounded-xl" />
        ) : overdue.length === 0 ? (
          <Empty>No overdue fees.</Empty>
        ) : (
          <ul className="divide-y">
            {overdue.slice(0, 5).map((r) => (
              <LinkRow
                key={r.studentId}
                to={`/students/${r.studentId}`}
                aside={<b className="text-destructive">{money(r.overdue)}</b>}
              >
                {r.fullName}
                <span className="text-[11px] text-muted-foreground">
                  {' '}
                  · since {formatDate(r.oldestDueDate)}
                </span>
              </LinkRow>
            ))}
          </ul>
        )}
      </Panel>
      <Panel title="Needs attention" icon={<AlertTriangle />}>
        <ul className="divide-y">
          {pendingRegs > 0 && (
            <LinkRow to="/registrations" aside={<Badge variant="warning">{pendingRegs}</Badge>}>
              Registrations to review
            </LinkRow>
          )}
          {unreviewed > 0 && (
            <LinkRow
              to="/coach-sessions?flagged=true"
              aside={<Badge variant="warning">{unreviewed}</Badge>}
            >
              Flagged check-ins to review
            </LinkRow>
          )}
          {low.slice(0, 4).map((s) => (
            <LinkRow
              key={s.studentId}
              to={`/students/${s.studentId}`}
              aside={<b className="text-destructive">{s.rate}%</b>}
            >
              Low attendance · {s.fullName}
            </LinkRow>
          ))}
          {birthdays
            .filter((b) => b.inDays <= 1)
            .map((b) => (
              <LinkRow key={b.studentId} to={`/students/${b.studentId}`} aside="🎂">
                {b.fullName} · birthday {b.inDays === 0 ? `today (${b.turning})` : 'tomorrow'}
              </LinkRow>
            ))}
        </ul>
        {pendingRegs === 0 && unreviewed === 0 && low.length === 0 && (
          <Empty>Nothing needs attention.</Empty>
        )}
      </Panel>
    </div>
  );
}

/** Coach: my students to chase (names and status only), attendance worries, birthdays. */
export function CoachFollowUps() {
  const overdue = useStudents({ dues: 'overdue', sort: 'dues', pageSize: 6 });
  const dash = useDashboard();
  const low = dash.data?.needsAttention ?? [];
  const birthdays = dash.data?.birthdays ?? [];
  const list = overdue.data?.data ?? [];
  return (
    <div className="grid grid-cols-1 gap-2 lg:grid-cols-2">
      <Panel
        title="Fees overdue · my students"
        icon={<IndianRupee />}
        action={
          <Link to="/students?dues=overdue" className="text-[12px] font-medium text-primary">
            All
          </Link>
        }
      >
        {overdue.isPending ? (
          <Skeleton className="h-16 rounded-xl" />
        ) : list.length === 0 ? (
          <Empty>No overdue fees.</Empty>
        ) : (
          <ul className="divide-y">
            {list.map((s) => (
              <LinkRow
                key={s.id}
                to={`/students/${s.id}`}
                aside={<Badge variant="destructive">Overdue</Badge>}
              >
                {s.fullName}
                <span className="text-[11px] text-muted-foreground">
                  {' '}
                  · {s.batches.map((b) => b.name).join(', ')}
                </span>
              </LinkRow>
            ))}
          </ul>
        )}
      </Panel>
      <Panel title="Needs attention" icon={<AlertTriangle />}>
        <ul className="divide-y">
          {low.slice(0, 5).map((s) => (
            <LinkRow
              key={s.studentId}
              to={`/students/${s.studentId}`}
              aside={<b className="text-destructive">{s.rate}%</b>}
            >
              Low attendance · {s.fullName}
            </LinkRow>
          ))}
          {birthdays.map((b) => (
            <LinkRow key={b.studentId} to={`/students/${b.studentId}`} aside="🎂">
              {b.fullName} ·{' '}
              {b.inDays === 0
                ? `birthday today (${b.turning})`
                : b.inDays === 1
                  ? 'tomorrow'
                  : `in ${b.inDays} days`}
            </LinkRow>
          ))}
        </ul>
        {low.length === 0 && birthdays.length === 0 && <Empty>Everyone is doing well.</Empty>}
      </Panel>
    </div>
  );
}

// ─── Money ───────────────────────────────────────────────────────────────────

/** Coach: only the cash they hold and what they received (no academy totals). */
export function CoachMoney() {
  const range = { from: startOfMonth(today()), to: today() };
  const q = useFundsOverview(range);
  const mine = q.data?.scope === 'self' ? q.data : undefined;
  if (q.isPending) return <Skeleton className="h-20 rounded-2xl" />;
  if (!mine) return null;
  return (
    <Link to="/finance?tab=money" className="block">
      <div className="grid grid-cols-3 gap-1.5 rounded-2xl border bg-card p-1.5 shadow-e1">
        {[
          { label: 'Cash with me', value: money(mine.cash), warn: mine.cash > 0 },
          { label: 'Collected · month', value: money(mine.period.collected) },
          { label: 'Academy owes me', value: money(mine.due) },
        ].map((x) => (
          <div key={x.label} className="rounded-xl bg-muted/40 px-1 py-1.5 text-center">
            <p
              className={cn(
                'tabular truncate text-[15px] leading-tight font-bold',
                x.warn && 'text-warning-foreground dark:text-warning',
              )}
            >
              {x.value}
            </p>
            <p className="truncate text-[10px] font-medium text-muted-foreground">{x.label}</p>
          </div>
        ))}
      </div>
    </Link>
  );
}

// ─── Week / month overview ───────────────────────────────────────────────────

/** Sessions, attendance and punctuality for this week or month (fees too, for admins). */
export function PeriodOverview({ isAdmin }: { isAdmin: boolean }) {
  const [period, setPeriod] = useState<'week' | 'month'>('week');
  const to = today();
  const from = period === 'week' ? startOfWeek(to) : startOfMonth(to);
  const cal = useCalendar(from, to);
  const fin = useFinance({ from, to });
  const days = cal.data?.days ?? [];
  const sessions = days.flatMap((d) => d.sessions.map((s) => ({ ...s, date: d.date })));
  const live = sessions.filter((s) => !s.cancelled);
  const held = live.filter((s) => s.marked > 0 || s.coachSession);
  const marked = live.reduce((n, s) => n + s.marked, 0);
  const present = live.reduce((n, s) => n + s.present, 0);
  const checked = live.filter((s) => s.coachSession);
  const onTime = checked.filter((s) => {
    const at = toMin(istClock.format(new Date(s.coachSession!.checkInAt)));
    return at <= toMin(s.batch.startTime) + 10;
  });
  const pct = (n: number, d: number) => (d ? `${Math.round((n * 100) / d)}%` : '—');
  const t = fin.data?.totals;
  const tiles = [
    {
      label: 'Sessions held',
      value: `${held.length}/${live.filter((s) => s.date < to || s.marked || s.coachSession).length}`,
      hint: `${sessions.length - live.length} cancelled`,
    },
    { label: 'Attendance', value: pct(present, marked), hint: `${present} of ${marked} marked` },
    {
      label: 'On-time check-ins',
      value: pct(onTime.length, checked.length),
      hint: `${checked.length} check-ins`,
    },
    {
      label: 'Lesson plans',
      value: pct(live.filter((s) => s.hasLessonPlan).length, live.length),
      hint: 'of sessions planned',
    },
    ...(isAdmin && t
      ? [
          {
            label: 'Fees collected',
            value: money(t.collected),
            hint: `${plural(t.paymentsReceived, 'payment')}`,
          },
          {
            label: 'Billed',
            value: money(t.billed),
            hint: t.collectionRate === null ? '' : `${t.collectionRate}% collected`,
          },
        ]
      : []),
  ];
  return (
    <section className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <p className="flex items-center gap-1.5 text-[12px] text-muted-foreground">
          <CalendarClock className="size-4" /> {formatDate(from)} – {formatDate(to)}
        </p>
        <Segmented
          ariaLabel="Overview period"
          value={period}
          onChange={(v) => setPeriod(v as 'week' | 'month')}
          options={[
            { value: 'week', label: 'This week' },
            { value: 'month', label: 'This month' },
          ]}
        />
      </div>
      {cal.isPending ? (
        <Skeleton className="h-20 rounded-2xl" />
      ) : (
        <div className="grid grid-cols-2 gap-1.5 rounded-2xl border bg-card p-1.5 shadow-e1 sm:grid-cols-3 lg:grid-cols-6">
          {tiles.map((x) => (
            <div key={x.label} className="min-w-0 rounded-xl bg-muted/40 px-2 py-1.5">
              <p className="truncate text-[10px] font-medium text-muted-foreground">{x.label}</p>
              <p className="tabular truncate text-[16px] leading-tight font-bold">{x.value}</p>
              <p className="truncate text-[10px] text-muted-foreground">{x.hint}</p>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
