/**
 * Today screen insights (from GET /dashboard): people, attendance trend, batch health,
 * coach performance (admin), the coach's own month, students needing attention, birthdays.
 */
import {
  Activity,
  AlertTriangle,
  CalendarCheck2,
  Clock,
  Cake,
  IndianRupee,
  LayoutGrid,
  MessageSquareText,
  ShieldAlert,
  Timer,
  TrendingUp,
  Users,
  UsersRound,
  Wallet,
} from 'lucide-react';
import { Link } from 'react-router';
import { StatCard } from '@/components/common';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Skeleton,
} from '@/components/ui/primitives';
import { formatShortDate, money, plural } from '@/lib/format';
import { useDashboard, useFinance, type Dashboard } from '@/lib/queries';
import { cn } from '@/lib/utils';

const rateTone = (r: number | null) =>
  r === null
    ? 'text-muted-foreground'
    : r >= 80
      ? 'text-success'
      : r >= 60
        ? 'text-warning-foreground dark:text-warning'
        : 'text-destructive';
const barTone = (r: number | null) =>
  r === null ? 'bg-muted' : r >= 80 ? 'bg-success' : r >= 60 ? 'bg-warning' : 'bg-destructive';
const pctLabel = (r: number | null) => (r === null ? '—' : `${r}%`);

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="px-0.5 text-[11px] font-semibold tracking-wider text-muted-foreground uppercase">
      {children}
    </h2>
  );
}

/** 14-day attendance as compact bars (no chart library needed). */
function AttendanceTrend({ d }: { d: Dashboard }) {
  const max = 100;
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center justify-between gap-2">
          <span>Attendance</span>
          <span className={cn('tabular text-xl font-bold', rateTone(d.attendance.rate30d))}>
            {pctLabel(d.attendance.rate30d)}
          </span>
        </CardTitle>
        <CardDescription>
          Last 30 days · {d.attendance.attended} present, {d.attendance.absent} absent
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div
          className="flex h-24 items-end gap-1"
          role="img"
          aria-label="Attendance over the last 14 days"
        >
          {d.attendance.trend.map((t) => (
            <div
              key={t.date}
              className="flex h-full flex-1 flex-col items-center justify-end gap-1"
            >
              <div
                title={`${formatShortDate(t.date)}: ${pctLabel(t.rate)}`}
                className={cn(
                  'w-full rounded-t-md transition-all duration-500',
                  t.rate === null ? 'h-1 bg-muted' : barTone(t.rate),
                )}
                style={
                  t.rate === null ? undefined : { height: `${Math.max(6, (t.rate / max) * 100)}%` }
                }
              />
            </div>
          ))}
        </div>
        <div className="mt-1.5 flex justify-between text-[10px] text-muted-foreground">
          <span>{formatShortDate(d.attendance.trend[0]!.date)}</span>
          <span>Today</span>
        </div>
      </CardContent>
    </Card>
  );
}

function BatchHealth({ d }: { d: Dashboard }) {
  if (!d.batchHealth.length) return null;
  return (
    <Card>
      <CardHeader>
        <CardTitle>Batch health</CardTitle>
        <CardDescription>Enrolment and 30-day attendance, weakest first</CardDescription>
      </CardHeader>
      <CardContent>
        <ul className="space-y-2.5">
          {d.batchHealth.slice(0, 6).map((b) => (
            <li key={b.id}>
              <Link
                to={`/batches/${b.id}`}
                className="block rounded-lg transition-colors hover:bg-muted/40"
              >
                <div className="flex items-baseline justify-between gap-2 text-[13px]">
                  <span className="min-w-0 truncate font-semibold">{b.name}</span>
                  <span
                    className={cn('tabular shrink-0 font-semibold', rateTone(b.attendanceRate))}
                  >
                    {pctLabel(b.attendanceRate)}
                  </span>
                </div>
                <div className="mt-0.5 flex items-center justify-between gap-2 text-[11px] text-muted-foreground">
                  <span className="truncate">{b.coachName}</span>
                  <span className="tabular shrink-0">
                    {b.enrolled}
                    {b.capacity ? `/${b.capacity}` : ''}{' '}
                    {b.enrolled === 1 && !b.capacity ? 'student' : 'students'}
                  </span>
                </div>
                <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-muted">
                  <div
                    className={cn('h-full rounded-full', barTone(b.attendanceRate))}
                    style={{ width: `${b.attendanceRate ?? 0}%` }}
                  />
                </div>
              </Link>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}

function CoachPerformance({ d }: { d: Dashboard }) {
  if (!d.coaches.length) return null;
  return (
    <Card>
      <CardHeader>
        <CardTitle>Coaches this month</CardTitle>
        <CardDescription>Sessions, hours and on-time check-ins (within 10 min)</CardDescription>
      </CardHeader>
      <CardContent className="px-0 sm:px-0">
        <ul className="divide-y">
          {d.coaches.map((c) => (
            <li key={c.id} className="flex items-center gap-3 px-3 py-2 sm:px-4">
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[13px] font-semibold">{c.name}</span>
                <span className="block truncate text-[11px] text-muted-foreground">
                  {plural(c.batches, 'batch', 'batches')} · {plural(c.students, 'student')}
                </span>
              </span>
              <span className="tabular grid shrink-0 grid-cols-3 gap-3 text-right text-[12px]">
                <span>
                  <b className="block text-[13px]">{c.sessions}</b>
                  <span className="text-muted-foreground">sessions</span>
                </span>
                <span>
                  <b className="block text-[13px]">{c.hours}h</b>
                  <span className="text-muted-foreground">coached</span>
                </span>
                <span>
                  <b className={cn('block text-[13px]', rateTone(c.onTimeRate))}>
                    {pctLabel(c.onTimeRate)}
                  </b>
                  <span className="text-muted-foreground">on time</span>
                </span>
              </span>
              {c.flagged > 0 && (
                <span
                  title={`${c.flagged} flagged check-ins`}
                  className="text-warning-foreground dark:text-warning"
                >
                  <ShieldAlert className="size-4" />
                </span>
              )}
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}

function NeedsAttention({ d }: { d: Dashboard }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <AlertTriangle className="size-4 text-warning-foreground dark:text-warning" /> Low
          attendance
        </CardTitle>
        <CardDescription>Under 60% in the last 30 days</CardDescription>
      </CardHeader>
      <CardContent>
        {d.needsAttention.length === 0 ? (
          <p className="py-3 text-center text-[13px] text-muted-foreground">
            Everyone is attending well.
          </p>
        ) : (
          <ul className="divide-y">
            {d.needsAttention.map((s) => (
              <li key={s.studentId} className="flex items-center justify-between gap-2 py-2">
                <Link
                  to={`/students/${s.studentId}`}
                  className="min-w-0 truncate text-[13px] font-medium hover:underline"
                >
                  {s.fullName}
                </Link>
                <span className="tabular shrink-0 text-[12px]">
                  <b className={rateTone(s.rate)}>{s.rate}%</b>{' '}
                  <span className="text-muted-foreground">
                    ({s.attended}/{s.counted})
                  </span>
                </span>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

function Birthdays({ d }: { d: Dashboard }) {
  if (!d.birthdays.length) return null;
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Cake className="size-4 text-primary" /> Birthdays this week
        </CardTitle>
      </CardHeader>
      <CardContent>
        <ul className="flex flex-wrap gap-1.5">
          {d.birthdays.map((b) => (
            <li key={b.studentId}>
              <Link
                to={`/students/${b.studentId}`}
                className="inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-2.5 py-1 text-[12px] font-medium text-primary transition-colors hover:bg-primary/15"
              >
                {b.fullName}
                <span className="text-primary/70">
                  ·{' '}
                  {b.inDays === 0
                    ? `today, ${b.turning}`
                    : b.inDays === 1
                      ? 'tomorrow'
                      : `in ${b.inDays} days`}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}

function InsightsSkeleton() {
  return (
    <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-4">
      {Array.from({ length: 4 }, (_, i) => (
        <Skeleton key={i} className="h-20 rounded-2xl" />
      ))}
    </div>
  );
}

/** Admin: academy pulse, attendance, batches, coaches, follow-ups. */
export function AdminInsights() {
  const q = useDashboard();
  if (q.isPending) return <InsightsSkeleton />;
  if (q.isError || !q.data) return null;
  const d = q.data;
  return (
    <div className="space-y-2.5 sm:space-y-3">
      <SectionTitle>Academy</SectionTitle>
      <div className="grid grid-cols-2 gap-2.5 sm:gap-3 lg:grid-cols-4">
        <StatCard
          label="Active students"
          icon={<Users />}
          to="/students"
          value={d.people.activeStudents}
          hint={`+${d.people.newThisMonth} joined · ${d.people.leftThisMonth} left this month`}
        />
        <StatCard
          label="Attendance"
          icon={<TrendingUp />}
          tone={d.attendance.rate30d !== null && d.attendance.rate30d < 70 ? 'warning' : 'success'}
          to="/attendance"
          value={pctLabel(d.attendance.rate30d)}
          hint="Last 30 days"
        />
        <StatCard
          label="Batches"
          icon={<LayoutGrid />}
          to="/batches"
          value={d.people.activeBatches}
          hint={
            d.people.fillRate === null
              ? 'No capacity limits set'
              : `${d.people.fillRate}% of capacity filled`
          }
        />
        <StatCard
          label="Coaches"
          icon={<UsersRound />}
          to="/coaches"
          value={d.people.activeCoaches}
          hint={`${d.coaches.reduce((n, c) => n + c.sessions, 0)} sessions this month`}
        />
      </div>
      <div className="grid gap-2.5 sm:gap-3 lg:grid-cols-2">
        <AttendanceTrend d={d} />
        <CoachPerformance d={d} />
        <BatchHealth d={d} />
        <div className="space-y-2.5 sm:space-y-3">
          <NeedsAttention d={d} />
          <Birthdays d={d} />
        </div>
      </div>
    </div>
  );
}

/** Coach: my month, my students, my fees. */
export function CoachInsights() {
  const q = useDashboard();
  const fin = useFinance({});
  if (q.isPending) return <InsightsSkeleton />;
  if (q.isError || !q.data) return null;
  const d = q.data;
  const m = d.myMonth!;
  const fb = d.feedback;
  const t = fin.data?.totals;
  return (
    <div className="space-y-2.5 sm:space-y-3">
      <SectionTitle>My month</SectionTitle>
      <div className="grid grid-cols-2 gap-2.5 sm:gap-3 lg:grid-cols-4">
        <StatCard
          label="Sessions"
          icon={<CalendarCheck2 />}
          to="/coach-sessions"
          value={m.sessions}
          hint="This month"
        />
        <StatCard
          label="On-time check-ins"
          icon={<Clock />}
          tone={m.onTimeRate !== null && m.onTimeRate < 80 ? 'warning' : 'success'}
          value={pctLabel(m.onTimeRate)}
          hint={m.flagged ? plural(m.flagged, 'flagged check-in') : 'Within 10 min of start'}
        />
        <StatCard
          label="My students"
          icon={<Users />}
          to="/students"
          value={d.people.activeStudents}
          hint={`${plural(d.people.activeBatches, 'batch', 'batches')} · +${d.people.newThisMonth} this month`}
        />
        <StatCard
          label="Attendance"
          icon={<Activity />}
          tone={d.attendance.rate30d !== null && d.attendance.rate30d < 70 ? 'warning' : 'success'}
          to="/attendance"
          value={pctLabel(d.attendance.rate30d)}
          hint="Last 30 days"
        />
        {fb && (
          <StatCard
            label="Weekly reports"
            icon={<MessageSquareText />}
            tone={fb.pending + fb.draft > 0 ? 'warning' : 'success'}
            to="/feedback"
            value={`${fb.submitted}/${fb.total}`}
            hint={
              fb.pending + fb.draft > 0
                ? `${fb.pending + fb.draft} still to send`
                : 'All sent for last week'
            }
          />
        )}
        {t && (
          <>
            <StatCard
              label="Collected"
              icon={<Wallet />}
              tone="success"
              to="/invoices?view=insights"
              value={money(t.collected)}
              hint="This month, my students"
            />
            <StatCard
              label="Outstanding"
              icon={<IndianRupee />}
              tone={t.overdue > 0 ? 'destructive' : 'warning'}
              to="/invoices"
              value={money(t.outstanding)}
              hint={t.overdue > 0 ? `${money(t.overdue)} overdue` : 'Nothing overdue'}
            />
          </>
        )}
        <StatCard label="Hours" icon={<Timer />} value={`${m.hours}h`} hint="Coached this month" />
      </div>
      <div className="grid gap-2.5 sm:gap-3 lg:grid-cols-2">
        <AttendanceTrend d={d} />
        <BatchHealth d={d} />
        <NeedsAttention d={d} />
        <Birthdays d={d} />
      </div>
    </div>
  );
}
