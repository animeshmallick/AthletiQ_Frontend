/**
 * Homepage sections, focused on today: the day's plan as a timeline (swipe between days), the
 * to-do list, follow-ups that need attention, money right now, and a week / month overview.
 * Shared by the admin and coach homepages; each decides which sections to show.
 */
import { PeriodStepper } from '@/components/date-nav';
import { Floating, FloatBadge } from '@/components/floating-badge';
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
import {
  lateLabel,
  lateMinutes,
  sessionStatus,
  statusLabel,
  STATUS_META,
} from '@/lib/session-status';
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

/** A session's status on the timeline (shared with the calendar and attendance). */
const statusInput = (s: DayOverviewSession) => ({
  startTime: s.batch.startTime,
  endTime: s.batch.endTime,
  cancelled: s.cancelled,
  checkInAt: s.coachSession?.checkInAt,
  expectedStudents: s.expectedStudents,
  attendanceComplete: s.attendanceComplete,
  lessonPlanFilled: s.lessonPlanFilled,
  coachFeedback: s.batch.coachFeedback,
});
const statusOf = (s: DayOverviewSession, day: string) => sessionStatus(statusInput(s), day);

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
  // Re-evaluated each minute (Scheduled → Delayed/Live → Completed…).
  void now;
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
    <Card className="min-w-0 space-y-1 p-1">
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
              const st = statusOf(s, day);
              const style = STATUS_META[st];
              const todos = todosFor(s.batch.id);
              return (
                <li key={s.batch.id}>
                  <Floating
                    badges={[
                      <FloatBadge key="st" tone={style.tone} title={style.hint}>
                        {statusLabel(st, statusInput(s))}
                      </FloatBadge>,
                      s.substitute ? (
                        <FloatBadge key="sub" tone="primary" icon={<Repeat />}>
                          {s.substitute.name.split(' ')[0]}
                        </FloatBadge>
                      ) : null,
                    ]}
                  >
                    <Card className={cn('p-2', st === 'cancelled' && 'opacity-70')}>
                      <div>
                        {/* Time on one line, then the session below at full width. */}
                        <div className="flex items-center gap-2">
                          <p className="tabular flex shrink-0 items-center gap-1.5 text-[12px] font-semibold text-muted-foreground">
                            <span
                              aria-hidden
                              className={cn('size-2 shrink-0 rounded-full', style.dot)}
                            />
                            {formatTime(s.batch.startTime)} – {formatTime(s.batch.endTime)}
                          </p>
                          {/* The check-in, right beside the session's time. */}
                          {!s.cancelled && (isToday || isPast) && s.coachSession && (
                            <CheckInFloat s={s} />
                          )}
                          {/* What still needs doing for this session, at the right end. */}
                          {todos.length > 0 && (
                            <ul
                              className={cn(
                                'flex min-w-0 flex-wrap justify-end gap-1',
                                !s.coachSession && 'ml-auto',
                              )}
                            >
                              {todos.map((t) => (
                                <li key={t.id}>
                                  <Link
                                    to={t.link}
                                    title={t.title}
                                    aria-label={t.title}
                                    className={cn(
                                      'inline-flex h-5 items-center gap-1 rounded-full px-1.5 text-[10px] font-semibold whitespace-nowrap transition-colors hover:brightness-95',
                                      TODO_CHIP[t.severity],
                                    )}
                                  >
                                    <span
                                      aria-hidden
                                      className={cn(
                                        'size-1.5 rounded-full',
                                        SEVERITY_DOT[t.severity],
                                      )}
                                    />
                                    {TODO_SHORT[t.kind] ?? t.title}
                                  </Link>
                                </li>
                              ))}
                            </ul>
                          )}
                        </div>
                        <div className="mt-0.5 min-w-0">
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
                          <div className="mt-1 flex flex-wrap items-center gap-1 text-[11px] [&_[data-slot=badge]]:gap-0.5 [&_[data-slot=badge]]:px-1.5">
                            {st === 'cancelled' && s.cancelled && (
                              <span className="text-muted-foreground">{s.cancelled}</span>
                            )}
                            {!s.cancelled && (isToday || isPast) && (
                              <>
                                {!s.coachSession && (
                                  <Badge variant="muted">
                                    <MapPin /> No check-in
                                  </Badge>
                                )}
                                <Badge
                                  variant={
                                    s.attendanceComplete
                                      ? 'success'
                                      : s.marked
                                        ? 'default'
                                        : 'muted'
                                  }
                                >
                                  <Users /> {s.marked}/{s.expectedStudents}
                                </Badge>
                              </>
                            )}
                            {!s.cancelled && s.batch.coachFeedback !== false && (
                              // Is today's lesson plan filled in (any drills count)?
                              <Badge variant={s.lessonPlanFilled ? 'success' : 'muted'}>
                                <ClipboardList />{' '}
                                {s.lessonPlanFilled ? 'Plan filled' : 'Plan not filled'}
                              </Badge>
                            )}
                          </div>
                        </div>
                      </div>
                    </Card>
                  </Floating>
                </li>
              );
            })}
          </ol>
        )}
      </SwipeDays>
    </Card>
  );
}

/** Short labels for a session's to-dos, shown as chips beside its time. */
const TODO_SHORT: Partial<Record<AppTask['kind'], string>> = {
  'check-in': 'Check in',
  'missed-check-in': 'Missed check-in',
  attendance: 'Attendance pending',
  'lesson-plan': 'Add plan',
};
const TODO_CHIP: Record<AppTask['severity'], string> = {
  critical: 'bg-destructive/10 text-destructive',
  warning: 'bg-warning/15 text-warning-foreground dark:text-warning',
  info: 'bg-primary/8 text-primary',
};

/** The check-in as plain text beside the session time: when, how late, and if away from the venue. */
function CheckInFloat({ s }: { s: DayOverviewSession }) {
  const cs = s.coachSession!;
  const late = lateMinutes({ startTime: s.batch.startTime, checkInAt: cs.checkInAt });
  return (
    <span
      className="tabular ml-auto inline-flex min-w-0 shrink-0 items-center gap-1 text-[11px] text-muted-foreground"
      title={[
        `Checked in ${formatClock(cs.checkInAt)}`,
        late ? lateLabel(late) : 'on time',
        cs.flagged ? 'away from the venue' : '',
      ]
        .filter(Boolean)
        .join(' · ')}
    >
      <span>
        In <span className="font-medium text-foreground/80">{formatClock(cs.checkInAt)}</span>
      </span>
      {late && (
        <span className="font-medium text-warning-foreground dark:text-warning">
          · {lateLabel(late)}
        </span>
      )}
      {cs.flagged && (
        <span className="inline-flex items-center gap-0.5 font-medium text-destructive">
          · <ShieldAlert className="size-3" /> away
        </span>
      )}
    </span>
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
