import {
  AlertTriangle,
  ArrowRight,
  CalendarCheck2,
  CheckCircle2,
  ClipboardList,
  Clock,
  IndianRupee,
  LogIn,
  LogOut,
  MapPin,
  MessageSquareText,
  ShieldAlert,
  UserPlus,
  Users,
  Wallet,
} from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router';
import { toast } from 'sonner';
import { useUser } from '@/app/auth';
import { EmptyState, ErrorState, ListSkeleton, Progress, StatCard } from '@/components/common';
import { Button } from '@/components/ui/button';
import {
  Badge,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/primitives';
import { errorMessage } from '@/lib/api';
import {
  addDays,
  formatClock,
  formatDate,
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
  useCoachSessions,
  useCoachToday,
  useFeedbackWeek,
  useFinance,
  useRegistrations,
} from '@/lib/queries';
import type { DayOverviewSession, TodaySession } from '@/lib/types';
import { cn } from '@/lib/utils';

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

function CheckInButton({ item }: { item: TodaySession }) {
  const checkIn = useCheck('check-in');
  const checkOut = useCheck('check-out');
  const [locating, setLocating] = useState(false);
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
      <Badge variant={s?.flagged ? 'warning' : 'success'} className="h-8 px-3">
        <CheckCircle2 /> {formatClock(s!.checkInAt)} – {formatClock(s!.checkOutAt!)}
      </Badge>
    );
  }
  return (
    <Button
      size="sm"
      variant={mode === 'check-in' ? 'default' : 'outline'}
      loading={locating || checkIn.isPending || checkOut.isPending}
      onClick={() => void run()}
    >
      {mode === 'check-in' ? <LogIn /> : <LogOut />}
      {locating
        ? 'Locating…'
        : mode === 'check-in'
          ? 'Check in'
          : `Check out · in since ${formatClock(s!.checkInAt)}`}
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
  const pct =
    overview && overview.expectedStudents ? (overview.marked / overview.expectedStudents) * 100 : 0;
  return (
    <Card className="overflow-hidden">
      <div className="flex flex-col gap-4 p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5">
        <div className="min-w-0 space-y-1">
          <div className="flex items-center gap-2">
            <h3 className="truncate font-semibold">{item.batch.name}</h3>
            {item.session?.flagged && (
              <Badge variant="warning">
                <ShieldAlert /> Flagged
              </Badge>
            )}
          </div>
          <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground">
            <span className="inline-flex items-center gap-1">
              <Clock className="size-3.5" />{' '}
              {formatTimeRange(item.batch.startTime, item.batch.endTime)}
            </span>
            <span className="inline-flex items-center gap-1">
              <MapPin className="size-3.5" /> {item.location.name}
            </span>
          </p>
        </div>
        <CheckInButton item={item} />
      </div>
      <div className="grid grid-cols-2 border-t text-sm">
        <Link
          to={`/attendance?batch=${item.batch.id}`}
          className="group flex flex-col gap-2 border-r p-4 transition-colors hover:bg-muted/50"
        >
          <span className="flex items-center justify-between font-medium">
            <span className="inline-flex items-center gap-2">
              <CalendarCheck2 className="size-4 text-primary" /> Attendance
            </span>
            <ArrowRight className="size-4 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
          </span>
          {overview ? (
            <>
              <Progress value={pct} tone={overview.attendanceComplete ? 'success' : 'primary'} />
              <span className="tabular text-xs text-muted-foreground">
                {overview.marked}/{overview.expectedStudents} marked · {overview.present} present
              </span>
            </>
          ) : (
            <span className="text-xs text-muted-foreground">No students today</span>
          )}
        </Link>
        <Link
          to={`/lesson-plans?batch=${item.batch.id}`}
          className="group flex flex-col gap-2 p-4 transition-colors hover:bg-muted/50"
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

function CoachToday() {
  const user = useUser();
  const day = today();
  const todayQ = useCoachToday();
  const overview = useAttendanceOverview(day);
  const lastWeek = startOfWeek(addDays(day, -7));
  const feedback = useFeedbackWeek({ weekStart: lastWeek });

  return (
    <div className="space-y-6">
      <div>
        <p className="text-sm text-muted-foreground">{formatLongDate(day)}</p>
        <h1 className="text-2xl font-semibold tracking-tight">
          {greeting()}, {user.name.split(' ')[0]}
        </h1>
      </div>

      {feedback.data && feedback.data.summary.pending + feedback.data.summary.draft > 0 && (
        <Link
          to="/feedback"
          className="flex items-center gap-3 rounded-xl border border-warning/40 bg-warning/10 p-4 text-sm transition-colors hover:bg-warning/15"
        >
          <MessageSquareText className="size-5 shrink-0 text-warning-foreground dark:text-warning" />
          <span className="flex-1">
            <span className="font-medium">Weekly feedback due</span> —{' '}
            {plural(feedback.data.summary.pending + feedback.data.summary.draft, 'student')} still
            need last week’s report.
          </span>
          <ArrowRight className="size-4" />
        </Link>
      )}

      <section className="space-y-3">
        <h2 className="text-sm font-semibold tracking-wide text-muted-foreground uppercase">
          Today’s sessions
        </h2>
        {todayQ.isPending ? (
          <ListSkeleton rows={2} />
        ) : todayQ.isError ? (
          <ErrorState error={todayQ.error} onRetry={() => void todayQ.refetch()} />
        ) : todayQ.data.sessions.length === 0 ? (
          <EmptyState
            icon={<CalendarCheck2 />}
            title="No sessions today"
            description="Enjoy the rest day. Your batches will show up here on training days."
          />
        ) : (
          <div className="grid gap-3 xl:grid-cols-2">
            {todayQ.data.sessions.map((s) => (
              <CoachSessionCard
                key={s.batch.id}
                item={s}
                overview={overview.data?.sessions.find((o) => o.batch.id === s.batch.id)}
              />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

// ─── Admin dashboard ─────────────────────────────────────────────────────────

function AdminToday() {
  const user = useUser();
  const day = today();
  const finance = useFinance({});
  const overview = useAttendanceOverview(day);
  const regs = useRegistrations({ status: 'pending', pageSize: 1 });
  const flagged = useCoachSessions({ flagged: 'true' });
  const t = finance.data?.totals;
  const pendingRegs =
    (regs.data?.meta?.pending.pendingStudents ?? 0) +
    (regs.data?.meta?.pending.pendingCoaches ?? 0);
  const unreviewed = flagged.data?.summary.unreviewedFlagged ?? 0;

  return (
    <div className="space-y-6">
      <div>
        <p className="text-sm text-muted-foreground">{formatLongDate(day)}</p>
        <h1 className="text-2xl font-semibold tracking-tight">
          {greeting()}, {user.name.split(' ')[0]}
        </h1>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard
          label="Collected this month"
          icon={<Wallet />}
          tone="success"
          loading={finance.isPending}
          value={t ? money(t.collected) : '—'}
          hint={t ? `${plural(t.paymentsReceived, 'payment')}` : undefined}
        />
        <StatCard
          label="Billed this month"
          icon={<IndianRupee />}
          loading={finance.isPending}
          value={t ? money(t.billed) : '—'}
          hint={t?.collectionRate !== null && t ? `${t.collectionRate}% collected` : undefined}
        />
        <StatCard
          label="Outstanding"
          icon={<Clock />}
          tone="warning"
          loading={finance.isPending}
          value={t ? money(t.outstanding) : '—'}
          hint={t ? `${plural(t.dueCount + t.overdueCount, 'invoice')}` : undefined}
        />
        <StatCard
          label="Overdue"
          icon={<AlertTriangle />}
          tone="destructive"
          loading={finance.isPending}
          value={t ? money(t.overdue) : '—'}
          hint={t ? `${plural(t.overdueCount, 'invoice')}` : undefined}
        />
      </div>

      {(pendingRegs > 0 || unreviewed > 0) && (
        <div className="grid gap-3 sm:grid-cols-2">
          {pendingRegs > 0 && (
            <Link
              to="/registrations"
              className="flex items-center gap-3 rounded-xl border bg-card p-4 transition-colors hover:bg-muted/50"
            >
              <div className="flex size-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <UserPlus className="size-5" />
              </div>
              <div className="flex-1">
                <p className="font-medium">{plural(pendingRegs, 'registration')} to review</p>
                <p className="text-sm text-muted-foreground">
                  New students and coaches waiting for approval
                </p>
              </div>
              <ArrowRight className="size-4 text-muted-foreground" />
            </Link>
          )}
          {unreviewed > 0 && (
            <Link
              to="/coach-sessions?flagged=true"
              className="flex items-center gap-3 rounded-xl border bg-card p-4 transition-colors hover:bg-muted/50"
            >
              <div className="flex size-10 items-center justify-center rounded-lg bg-warning/18 text-warning-foreground dark:text-warning">
                <ShieldAlert className="size-5" />
              </div>
              <div className="flex-1">
                <p className="font-medium">{plural(unreviewed, 'check-in')} flagged</p>
                <p className="text-sm text-muted-foreground">
                  Coach GPS readings outside the location radius
                </p>
              </div>
              <ArrowRight className="size-4 text-muted-foreground" />
            </Link>
          )}
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-5">
        <Card className="lg:col-span-3">
          <CardHeader>
            <CardTitle>Sessions today</CardTitle>
            <CardDescription>
              Attendance, lesson plans and coach check-ins across all batches.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {overview.isPending ? (
              <ListSkeleton rows={3} />
            ) : overview.isError ? (
              <ErrorState error={overview.error} onRetry={() => void overview.refetch()} />
            ) : overview.data.sessions.length === 0 ? (
              <EmptyState icon={<CalendarCheck2 />} title="No sessions scheduled today" />
            ) : (
              <ul className="divide-y">
                {overview.data.sessions.map((s) => (
                  <li key={s.batch.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 py-3">
                    <div className="min-w-0 flex-1">
                      <Link
                        to={`/attendance?batch=${s.batch.id}`}
                        className="font-medium hover:underline"
                      >
                        {s.batch.name}
                      </Link>
                      <p className="text-xs text-muted-foreground">
                        {formatTimeRange(s.batch.startTime, s.batch.endTime)} · {s.batch.coach.name}
                      </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-1.5">
                      <Badge
                        variant={s.attendanceComplete ? 'success' : s.marked ? 'warning' : 'muted'}
                      >
                        <Users /> {s.marked}/{s.expectedStudents}
                      </Badge>
                      <Badge variant={s.hasLessonPlan ? 'success' : 'muted'}>
                        <ClipboardList /> {s.hasLessonPlan ? 'Plan' : 'No plan'}
                      </Badge>
                      <Badge
                        variant={
                          s.coachSession
                            ? s.coachSession.flagged
                              ? 'warning'
                              : 'success'
                            : 'muted'
                        }
                      >
                        <MapPin />{' '}
                        {s.coachSession ? formatClock(s.coachSession.checkInAt) : 'Not in'}
                      </Badge>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Largest overdue balances</CardTitle>
            <CardDescription>Follow up on these first.</CardDescription>
          </CardHeader>
          <CardContent>
            {finance.isPending ? (
              <ListSkeleton rows={3} />
            ) : !finance.data?.topOverdue.length ? (
              <EmptyState
                icon={<CheckCircle2 />}
                title="No overdue fees"
                description="Every invoice is within its due date."
              />
            ) : (
              <ul className="divide-y">
                {finance.data.topOverdue.slice(0, 6).map((r) => (
                  <li key={r.studentId} className="flex items-center justify-between gap-3 py-2.5">
                    <div className="min-w-0">
                      <Link
                        to={`/students/${r.studentId}`}
                        className="block truncate text-sm font-medium hover:underline"
                      >
                        {r.fullName}
                      </Link>
                      <p className="text-xs text-muted-foreground">
                        Since {formatDate(r.oldestDueDate)}
                      </p>
                    </div>
                    <span className={cn('tabular text-sm font-semibold text-destructive')}>
                      {money(r.overdue)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

export function TodayPage() {
  const user = useUser();
  return user.role === 'admin' ? <AdminToday /> : <CoachToday />;
}
