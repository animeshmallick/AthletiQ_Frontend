/**
 * Batch details: everything about one batch at a glance — coach, place, timings, capacity, fee
 * plan — then how it is doing (attendance trend, sessions, coach punctuality, skills, fees) and
 * its students as cards. Tapping a student opens their summary; their name opens their page.
 * Coaches see each student's fee status but not money totals.
 */
import {
  CalendarCheck2,
  CalendarClock,
  CheckCircle2,
  ClipboardList,
  Clock,
  FileText,
  IndianRupee,
  MapPin,
  MessageCircle,
  Pencil,
  Phone,
  Search,
  Trophy,
  UserRound,
  Users,
  XCircle,
} from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link, useParams } from 'react-router';
import { useUser } from '@/app/auth';
import { Avatar, EmptyState, ErrorState, PageHeader } from '@/components/common';
import { BATCH_REPORT_INCLUDES, ReportDialog, slug } from '@/components/report-dialog';
import { Button } from '@/components/ui/button';
import { Segmented } from '@/components/ui/controls';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/overlays';
import { Badge, Card, Input, Skeleton } from '@/components/ui/primitives';
import { scheduleGroups, timesVary } from '@/lib/batch-times';
import {
  formatDate,
  formatShortDate,
  formatTimeRange,
  money,
  plural,
  relativeDay,
  today,
  weekdaysLabel,
} from '@/lib/format';
import {
  useBatch,
  useBatchInsights,
  type BatchInsights,
  type BatchRosterEntry,
  type BatchSessionInfo,
} from '@/lib/queries';
import type { BatchDetail } from '@/lib/types';
import { cn } from '@/lib/utils';
import { LevelBadge } from './skills/ui';
import { BatchDialog } from './batches';

const phoneDigits = (p: string) => p.replace(/\D/g, '');
const whatsapp = (p: string) => `https://wa.me/${phoneDigits(p)}`;

export function BatchDetailPage() {
  const { id = '' } = useParams();
  const user = useUser();
  const isAdmin = user.role === 'admin';
  const q = useBatch(id);
  const ins = useBatchInsights(id);
  const [editing, setEditing] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const [openStudent, setOpenStudent] = useState<BatchRosterEntry | null>(null);

  if (q.isPending) return <Skeleton className="h-64 w-full rounded-xl" />;
  if (q.isError) return <ErrorState error={q.error} onRetry={() => void q.refetch()} />;
  const b = q.data;
  const d = ins.data;

  return (
    <div className="space-y-3">
      <PageHeader
        className="mb-0"
        title={
          <span className="flex items-center gap-2">
            <span className="truncate">{b.name}</span>
            {!b.isActive && <Badge variant="muted">Inactive</Badge>}
          </span>
        }
        description={`${b.sport.name} · ${b.location.name} · Coach ${b.coach.name}`}
        actions={
          <div className="flex items-center gap-1">
            <Button asChild variant="outline" size="sm" className="gap-1 px-2.5">
              <Link to={`/attendance?batch=${b.id}`}>
                <CalendarCheck2 /> Attendance
              </Link>
            </Button>
            <Button asChild variant="outline" size="sm" className="gap-1 px-2.5">
              <Link to={`/lesson-plans?batch=${b.id}&plan=1`}>
                <ClipboardList /> Lesson plan
              </Link>
            </Button>
            {isAdmin && (
              <Button
                variant="outline"
                size="icon-sm"
                aria-label="Batch report"
                title="Batch report"
                onClick={() => setReportOpen(true)}
              >
                <FileText />
              </Button>
            )}
            {isAdmin && (
              <Button
                size="icon-sm"
                aria-label="Edit batch"
                title="Edit batch"
                onClick={() => setEditing(true)}
              >
                <Pencil />
              </Button>
            )}
          </div>
        }
      />

      <Details b={b} students={d?.summary.students ?? b.members.length} />

      {ins.isError ? (
        <ErrorState error={ins.error} onRetry={() => void ins.refetch()} />
      ) : !d ? (
        <Skeleton className="h-40 w-full rounded-xl" />
      ) : (
        <>
          <Kpis d={d} isAdmin={isAdmin} />
          <div className="grid gap-3 lg:grid-cols-2">
            <AttendanceTrend trend={d.trend} />
            <SkillsMix d={d} />
          </div>
          <Students roster={d.roster} isAdmin={isAdmin} onOpen={setOpenStudent} />
          <Sessions batchId={b.id} upcoming={d.upcoming} recent={d.recent} />
        </>
      )}

      <StudentDialog
        s={openStudent}
        batchName={b.name}
        isAdmin={isAdmin}
        onClose={() => setOpenStudent(null)}
      />
      {editing && <BatchDialog open onOpenChange={setEditing} batch={b} />}
      {reportOpen && (
        <ReportDialog
          open
          onOpenChange={setReportOpen}
          title={`${b.name} - report`}
          description="Every student in this batch with attendance, skills, fees and history since they joined it."
          options={[{ value: b.id, label: b.name }]}
          path={(v) => `/reports/batches/pdf?batchId=${v}`}
          filename={() => `${slug(b.name)}-report-${today()}.pdf`}
          includes={BATCH_REPORT_INCLUDES}
        />
      )}
    </div>
  );
}

// ─── Details ─────────────────────────────────────────────────────────────────

function Row({
  icon,
  label,
  children,
  action,
}: {
  icon: React.ReactNode;
  label: string;
  children: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex min-w-0 items-start gap-2.5">
      <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary [&_svg]:size-4">
        {icon}
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-[11px] font-medium text-muted-foreground">{label}</p>
        <div className="text-[13px] font-medium">{children}</div>
      </div>
      {action}
    </div>
  );
}

function Details({ b, students }: { b: BatchDetail; students: number }) {
  const fill = b.capacity ? Math.min(100, (students / b.capacity) * 100) : 0;
  const full = !!b.capacity && students >= b.capacity;
  const map = `https://www.google.com/maps/search/?api=1&query=${b.location.latitude},${b.location.longitude}`;
  return (
    <Card className="grid gap-3 p-3 sm:grid-cols-2">
      <Row
        icon={<UserRound />}
        label="Coach"
        action={
          b.coach.phone ? (
            <span className="flex gap-1">
              <Button asChild size="icon-sm" variant="outline" aria-label={`Call ${b.coach.name}`}>
                <a href={`tel:${b.coach.phone}`}>
                  <Phone />
                </a>
              </Button>
              <Button
                asChild
                size="icon-sm"
                variant="outline"
                aria-label={`WhatsApp ${b.coach.name}`}
              >
                <a href={whatsapp(b.coach.phone)} target="_blank" rel="noreferrer">
                  <MessageCircle />
                </a>
              </Button>
            </span>
          ) : undefined
        }
      >
        {b.coach.name}
      </Row>
      <Row
        icon={<MapPin />}
        label="Location"
        action={
          <Button asChild size="sm" variant="ghost" className="h-8 px-2 text-[12px]">
            <a href={map} target="_blank" rel="noreferrer">
              Map
            </a>
          </Button>
        }
      >
        {b.location.name}
      </Row>
      <Row icon={<Clock />} label="Schedule">
        {timesVary(b) ? (
          <ul>
            {scheduleGroups(b).map((g) => (
              <li key={g.label}>
                {g.label} · {g.time}
              </li>
            ))}
          </ul>
        ) : (
          <>
            {weekdaysLabel(b.weekdays)} · {formatTimeRange(b.startTime, b.endTime)}
          </>
        )}
      </Row>
      <Row icon={<Users />} label="Capacity">
        <span className={cn(full && 'text-warning-foreground dark:text-warning')}>
          {students} / {b.capacity} students ·{' '}
          {full ? 'full' : `${b.capacity - students} seats left`}
        </span>
        <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-muted">
          <div
            className={cn('h-full rounded-full', full ? 'bg-warning' : 'bg-primary')}
            style={{ width: `${fill}%` }}
          />
        </div>
      </Row>
      <Row icon={<IndianRupee />} label="Fee plan">
        {b.feePlan.monthlyFee === 0
          ? `${b.feePlan.name} · free`
          : `${b.feePlan.name} · ${money(b.feePlan.monthlyFee)}/month`}
      </Row>
      <Row icon={<Trophy />} label="Sport">
        {b.sport.name}
      </Row>
    </Card>
  );
}

// ─── KPIs ────────────────────────────────────────────────────────────────────

function Kpi({
  label,
  value,
  hint,
  tone,
}: {
  label: string;
  value: string;
  hint?: string;
  tone?: 'good' | 'warn' | 'bad';
}) {
  return (
    <div className="min-w-0 rounded-xl bg-muted/40 px-2.5 py-2">
      <p className="truncate text-[11px] font-medium text-muted-foreground">{label}</p>
      <p
        className={cn(
          'tabular truncate text-[16px] leading-tight font-bold',
          tone === 'good' && 'text-success',
          tone === 'warn' && 'text-warning-foreground dark:text-warning',
          tone === 'bad' && 'text-destructive',
        )}
      >
        {value}
      </p>
      {hint && <p className="truncate text-[11px] text-muted-foreground">{hint}</p>}
    </div>
  );
}

const rateTone = (r: number | null) =>
  r === null
    ? undefined
    : r >= 80
      ? ('good' as const)
      : r >= 60
        ? ('warn' as const)
        : ('bad' as const);

function Kpis({ d, isAdmin }: { d: BatchInsights; isAdmin: boolean }) {
  const s = d.summary;
  const m = s.fees.money;
  return (
    <Card className="space-y-1.5 p-1.5">
      <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-4">
        <Kpi
          label="Attendance · 30 days"
          value={s.attendanceRate === null ? '—' : `${s.attendanceRate}%`}
          tone={rateTone(s.attendanceRate)}
          hint={`${plural(s.sessions30.held, 'session')} held`}
        />
        <Kpi
          label="Sessions · 30 days"
          value={`${s.sessions30.held}/${s.sessions30.scheduled}`}
          tone={s.sessions30.missed ? 'warn' : undefined}
          hint={
            [
              s.sessions30.cancelled && `${s.sessions30.cancelled} cancelled`,
              s.sessions30.missed && `${s.sessions30.missed} not marked`,
              s.sessions30.covered && `${s.sessions30.covered} by substitute`,
            ]
              .filter(Boolean)
              .join(' · ') || 'All held'
          }
        />
        <Kpi
          label="Coach on time"
          value={s.checkIns30.rate === null ? '—' : `${s.checkIns30.rate}%`}
          tone={rateTone(s.checkIns30.rate)}
          hint={`${s.checkIns30.onTime} of ${plural(s.checkIns30.total, 'check-in')}`}
        />
        <Kpi
          label="Assessed this month"
          value={`${s.skills.assessedThisMonth}/${s.students}`}
          tone={s.skills.assessedThisMonth < s.students ? 'warn' : 'good'}
          hint={`${s.sessions30.withPlan} sessions had a lesson plan`}
        />
        <Kpi
          label="Fees overdue"
          value={plural(s.fees.studentsOverdue, 'student')}
          tone={s.fees.studentsOverdue ? 'bad' : 'good'}
          hint={`${s.fees.studentsDue} more with fees due`}
        />
        <Kpi
          label="Joined · 90 days"
          value={String(s.movement90.joined)}
          hint={`${s.movement90.left} left`}
        />
        {isAdmin && m && (
          <>
            <Kpi
              label="Expected / month"
              value={money(m.expectedMonthly)}
              hint="From current students"
            />
            <Kpi
              label="Collected this month"
              value={money(m.monthCollected)}
              tone="good"
              hint={`of ${money(m.monthIssued)} billed · ${money(m.overdue)} overdue overall`}
            />
          </>
        )}
      </div>
    </Card>
  );
}

// ─── Trend & skills ──────────────────────────────────────────────────────────

/** Attendance per week, last 8 weeks (one series: no legend; values on hover). */
function AttendanceTrend({ trend }: { trend: BatchInsights['trend'] }) {
  const H = 72;
  return (
    <Card className="p-3">
      <p className="mb-2 text-[13px] font-semibold">Attendance by week</p>
      {trend.every((w) => w.rate === null) ? (
        <p className="text-[12px] text-muted-foreground">No attendance marked yet.</p>
      ) : (
        <div
          className="flex items-end gap-1.5"
          role="img"
          aria-label={trend
            .map((w) => `Week of ${formatShortDate(w.week)}: ${w.rate ?? 'no'}%`)
            .join('; ')}
        >
          {trend.map((w) => (
            <div
              key={w.week}
              className="flex flex-1 flex-col items-center gap-1"
              title={`Week of ${formatShortDate(w.week)} · ${w.rate === null ? 'nothing marked' : `${w.rate}% present`} · ${plural(w.sessions, 'session')}`}
            >
              <span className="tabular text-[10px] text-muted-foreground">
                {w.rate === null ? '' : `${w.rate}`}
              </span>
              <div className="flex w-full items-end justify-center" style={{ height: H }}>
                <span
                  className={cn(
                    'w-3 rounded-t',
                    w.rate === null
                      ? 'bg-muted'
                      : w.rate >= 80
                        ? 'bg-success/80'
                        : w.rate >= 60
                          ? 'bg-warning/80'
                          : 'bg-destructive/70',
                  )}
                  style={{ height: w.rate === null ? 3 : Math.max(3, (w.rate / 100) * H) }}
                />
              </div>
              <span className="text-[10px] text-muted-foreground">
                {formatShortDate(w.week).replace(/ \d{4}$/, '')}
              </span>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}

function SkillsMix({ d }: { d: BatchInsights }) {
  const levels = d.summary.skills.levels;
  const total = levels.reduce((n, l) => n + l.students, 0);
  return (
    <Card className="p-3">
      <p className="mb-2 text-[13px] font-semibold">Levels</p>
      {levels.length === 0 ? (
        <p className="text-[12px] text-muted-foreground">
          No assessments yet. Levels appear after the first monthly assessment.
        </p>
      ) : (
        <ul className="space-y-1.5">
          {levels.map((l) => (
            <li key={l.code ?? l.name} className="flex items-center gap-2 text-[12px]">
              <LevelBadge
                name={l.name ?? '—'}
                code={l.code}
                short
                className="w-12 justify-center"
              />
              <span className="min-w-0 flex-1 truncate">{l.name}</span>
              <span className="h-1.5 w-24 overflow-hidden rounded-full bg-muted">
                <span
                  className="block h-full rounded-full bg-primary/70"
                  style={{ width: `${(l.students / total) * 100}%` }}
                />
              </span>
              <span className="tabular w-6 text-right font-semibold">{l.students}</span>
            </li>
          ))}
        </ul>
      )}
      {d.summary.students > total && (
        <p className="mt-2 text-[11px] text-muted-foreground">
          {plural(d.summary.students - total, 'student')} not assessed yet.
        </p>
      )}
    </Card>
  );
}

// ─── Students ────────────────────────────────────────────────────────────────

type Sort = 'name' | 'joined' | 'attendance' | 'fees';
type Show = 'all' | 'overdue' | 'unassessed' | 'low';

const FEE_BADGE: Record<
  BatchRosterEntry['fees']['status'],
  { label: string; variant: 'success' | 'warning' | 'destructive' | 'muted' }
> = {
  paid: { label: 'Paid up', variant: 'success' },
  due: { label: 'Fee due', variant: 'warning' },
  overdue: { label: 'Overdue', variant: 'destructive' },
  free: { label: 'Free', variant: 'muted' },
};

const tenure = (days: number) =>
  days < 31
    ? plural(days, 'day')
    : days < 365
      ? plural(Math.floor(days / 30), 'month')
      : `${(days / 365).toFixed(1)} years`;

function Students({
  roster,
  isAdmin,
  onOpen,
}: {
  roster: BatchRosterEntry[];
  isAdmin: boolean;
  onOpen: (s: BatchRosterEntry) => void;
}) {
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState<Sort>('name');
  const [show, setShow] = useState<Show>('all');
  const counts = {
    overdue: roster.filter((r) => r.fees.status === 'overdue').length,
    unassessed: roster.filter((r) => !r.assessedThisMonth).length,
    low: roster.filter((r) => r.attendance.rate !== null && r.attendance.rate < 60).length,
  };
  const list = useMemo(() => {
    const n = search.trim().toLowerCase();
    const feeRank = { overdue: 0, due: 1, paid: 2, free: 3 };
    return roster
      .filter(
        (r) =>
          (show === 'all' ||
            (show === 'overdue' && r.fees.status === 'overdue') ||
            (show === 'unassessed' && !r.assessedThisMonth) ||
            (show === 'low' && r.attendance.rate !== null && r.attendance.rate < 60)) &&
          (!n ||
            `${r.fullName} ${r.code} ${r.registrationNo ?? ''} ${r.guardianName ?? ''}`
              .toLowerCase()
              .includes(n)),
      )
      .sort((a, b) =>
        sort === 'joined'
          ? a.joinedBatch.localeCompare(b.joinedBatch)
          : sort === 'attendance'
            ? (a.attendance.rate ?? 101) - (b.attendance.rate ?? 101)
            : sort === 'fees'
              ? feeRank[a.fees.status] - feeRank[b.fees.status]
              : a.fullName.localeCompare(b.fullName),
      );
  }, [roster, search, sort, show]);

  return (
    <section className="space-y-2" aria-label="Students">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-[15px] font-semibold">Students · {roster.length}</h2>
        <select
          aria-label="Sort students"
          className="h-8 rounded-lg border bg-card px-2 text-[12px]"
          value={sort}
          onChange={(e) => setSort(e.target.value as Sort)}
        >
          <option value="name">Name A–Z</option>
          <option value="joined">Longest in batch</option>
          <option value="attendance">Lowest attendance</option>
          <option value="fees">Fees: overdue first</option>
        </select>
      </div>
      {roster.length > 0 && (
        <>
          <div className="relative">
            <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              type="search"
              className="h-9 pl-9"
              placeholder="Search name, reg. no. or guardian"
              aria-label="Search students"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          {/* Quick views as chips: they wrap instead of truncating on phones. */}
          <div className="flex flex-wrap gap-1" role="radiogroup" aria-label="Show students">
            {(
              [
                ['all', `All · ${roster.length}`],
                ['overdue', `Overdue · ${counts.overdue}`],
                ['unassessed', `Not assessed · ${counts.unassessed}`],
                ['low', `Low attendance · ${counts.low}`],
              ] as [Show, string][]
            ).map(([value, label]) => (
              <button
                key={value}
                type="button"
                role="radio"
                aria-checked={show === value}
                onClick={() => setShow(value)}
                className={cn(
                  'cursor-pointer rounded-full border px-2.5 py-1 text-[12px] font-medium transition-colors',
                  show === value
                    ? 'border-primary bg-primary text-primary-foreground'
                    : 'bg-card text-muted-foreground hover:text-foreground',
                )}
              >
                {label}
              </button>
            ))}
          </div>
        </>
      )}
      {roster.length === 0 ? (
        <EmptyState icon={<Users />} title="No students in this batch yet" />
      ) : list.length === 0 ? (
        <p className="py-6 text-center text-[13px] text-muted-foreground">No students match.</p>
      ) : (
        <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
          {list.map((r) => (
            <StudentCard key={r.studentId} r={r} isAdmin={isAdmin} onOpen={() => onOpen(r)} />
          ))}
        </div>
      )}
    </section>
  );
}

function StudentCard({
  r,
  isAdmin,
  onOpen,
}: {
  r: BatchRosterEntry;
  isAdmin: boolean;
  onOpen: () => void;
}) {
  const fee = FEE_BADGE[r.fees.status];
  const rate = r.attendance.rate;
  return (
    <Card
      role="button"
      tabIndex={0}
      aria-label={`${r.fullName} details`}
      onClick={onOpen}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onOpen();
        }
      }}
      className="cursor-pointer space-y-2 p-2.5 transition-shadow hover:shadow-e2"
    >
      <div className="flex items-center gap-2.5">
        <Avatar name={r.fullName} className="size-10" />
        <div className="min-w-0 flex-1">
          <Link
            to={`/students/${r.studentId}`}
            onClick={(e) => e.stopPropagation()}
            className="block truncate text-[14px] font-semibold hover:underline"
          >
            {r.fullName}
          </Link>
          <p className="truncate text-[11px] text-muted-foreground">
            {r.registrationNo ? `Reg. ${r.registrationNo} · ` : ''}
            Joined {formatDate(r.joinedBatch)} · {tenure(r.daysInBatch)}
          </p>
        </div>
        {r.level?.code && <LevelBadge name={r.level.name ?? ''} code={r.level.code} short />}
      </div>
      <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
        <Badge variant={fee.variant}>
          {fee.label}
          {isAdmin && r.fees.due ? ` · ${money(r.fees.due)}` : ''}
        </Badge>
        <span
          className={cn(
            'rounded-full px-2 py-0.5 font-semibold',
            rate === null
              ? 'bg-muted text-muted-foreground'
              : rate >= 80
                ? 'bg-success/12 text-success'
                : rate >= 60
                  ? 'bg-warning/15 text-warning-foreground dark:text-warning'
                  : 'bg-destructive/10 text-destructive',
          )}
          title="Attendance, last 30 days"
        >
          {rate === null ? 'No attendance yet' : `${rate}% attendance`}
        </span>
        <span className="text-muted-foreground">
          {r.lastAttended ? `Last came ${relativeDay(r.lastAttended)}` : 'Not attended yet'}
        </span>
      </div>
    </Card>
  );
}

const ageOn = (dob: string, on: string) => {
  const [y, m, d] = dob.split('-').map(Number) as [number, number, number];
  const [ty, tm, td] = on.split('-').map(Number) as [number, number, number];
  return ty - y - (tm < m || (tm === m && td < d) ? 1 : 0);
};

function StudentDialog({
  s,
  batchName,
  isAdmin,
  onClose,
}: {
  s: BatchRosterEntry | null;
  batchName: string;
  isAdmin: boolean;
  onClose: () => void;
}) {
  return (
    <Dialog open={!!s} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        {s && (
          <div className="space-y-3">
            <DialogHeader className="flex-row items-center gap-3 text-left">
              <Avatar name={s.fullName} className="size-12" />
              <div className="min-w-0 flex-1">
                <DialogTitle className="truncate">
                  <Link to={`/students/${s.studentId}`} className="hover:underline">
                    {s.fullName}
                  </Link>
                </DialogTitle>
                <DialogDescription className="truncate">
                  {[
                    s.registrationNo && `Reg. ${s.registrationNo}`,
                    s.code,
                    s.dateOfBirth && `${ageOn(s.dateOfBirth, today())} yrs`,
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                </DialogDescription>
              </div>
              {s.level?.code && <LevelBadge name={s.level.name ?? ''} code={s.level.code} short />}
            </DialogHeader>

            <div className="flex gap-1.5">
              <Button asChild size="sm" variant="outline" className="flex-1">
                <a href={`tel:${s.phone}`}>
                  <Phone /> Call
                </a>
              </Button>
              <Button asChild size="sm" variant="outline" className="flex-1">
                <a href={whatsapp(s.phone)} target="_blank" rel="noreferrer">
                  <MessageCircle /> WhatsApp
                </a>
              </Button>
              <Button asChild size="sm" className="flex-1">
                <Link to={`/students/${s.studentId}`}>Open profile</Link>
              </Button>
            </div>

            <dl className="grid grid-cols-2 gap-1.5 text-[12px]">
              {[
                ['Guardian', s.guardianName ?? '—'],
                ['Phone', s.phone],
                ['Joined this batch', `${formatDate(s.joinedBatch)} · ${tenure(s.daysInBatch)}`],
                ['Joined academy', formatDate(s.joinedAcademy)],
                [
                  'Attendance · 30 days',
                  s.attendance.marked
                    ? `${s.attendance.present} of ${s.attendance.marked} · ${s.attendance.rate}%`
                    : 'Nothing marked',
                ],
                ['Last attended', s.lastAttended ? formatDate(s.lastAttended) : '—'],
                [
                  'Latest level',
                  s.level
                    ? `${s.level.code ?? ''} ${s.level.name ?? ''} · ${formatDate(s.level.month).replace(/^\d+ /, '')}`
                    : 'Not assessed yet',
                ],
                ['Assessed this month', s.assessedThisMonth ? 'Yes' : 'Not yet'],
              ].map(([k, v]) => (
                <div key={k} className="min-w-0 rounded-xl bg-muted/40 px-2.5 py-1.5">
                  <dt className="text-[11px] text-muted-foreground">{k}</dt>
                  <dd className="truncate font-medium">{v}</dd>
                </div>
              ))}
            </dl>

            <Card className="flex items-center gap-2 p-2.5">
              <IndianRupee className="size-4 shrink-0 text-muted-foreground" />
              <div className="min-w-0 flex-1 text-[12px]">
                <p className="font-medium">
                  Fees in {batchName}: {FEE_BADGE[s.fees.status].label}
                </p>
                <p className="text-muted-foreground">
                  {isAdmin && s.fees.monthly !== null
                    ? `${money(s.fees.monthly)}/month · ${money(s.fees.due ?? 0)} unpaid${s.fees.overdue ? ` (${money(s.fees.overdue)} overdue)` : ''}`
                    : s.fees.lastPaidAt
                      ? `Last paid ${formatDate(s.fees.lastPaidAt.slice(0, 10))}`
                      : 'No payment recorded yet'}
                </p>
              </div>
              {s.fees.unpaidInvoiceId && (
                <Button asChild size="sm" variant="outline">
                  <Link to={`/finance?tab=invoices&invoice=${s.fees.unpaidInvoiceId}`}>
                    Invoice
                  </Link>
                </Button>
              )}
            </Card>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

// ─── Sessions ────────────────────────────────────────────────────────────────

function SessionRow({ s, batchId, past }: { s: BatchSessionInfo; batchId: string; past: boolean }) {
  return (
    <Link
      to={`/attendance?batch=${batchId}&date=${s.date}`}
      className={cn(
        'flex items-center gap-2.5 px-3 py-2 hover:bg-muted/40',
        s.cancelled && 'opacity-60',
      )}
    >
      <span className="w-32 shrink-0">
        <span className="block text-[13px] font-semibold">{relativeDay(s.date)}</span>
        <span className="block text-[11px] text-muted-foreground">
          {formatTimeRange(s.startTime, s.endTime)}
        </span>
      </span>
      <span className="min-w-0 flex-1 text-[12px]">
        {s.cancelled ? (
          <Badge variant="muted">Cancelled · {s.cancelled}</Badge>
        ) : past ? (
          <span className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-muted-foreground">
            <span className={cn(s.marked === 0 && 'text-warning-foreground dark:text-warning')}>
              {s.marked ? `${s.present}/${s.marked} present` : 'Attendance not marked'}
            </span>
            <span className="inline-flex items-center gap-0.5">
              {s.checkedIn ? (
                <CheckCircle2
                  className={cn('size-3.5', s.onTime ? 'text-success' : 'text-warning')}
                />
              ) : (
                <XCircle className="size-3.5 text-destructive" />
              )}
              {s.checkedIn ? (s.onTime ? 'On time' : 'Late check-in') : 'No check-in'}
            </span>
            {s.hasPlan && <span>Plan ✓</span>}
          </span>
        ) : (
          <span className="text-muted-foreground">
            {s.substitute ? `Substitute: ${s.substitute}` : 'Regular coach'}
            {s.hasPlan ? ' · plan ready' : ''}
          </span>
        )}
      </span>
      {s.substitute && !s.cancelled && <Badge variant="muted">Sub</Badge>}
    </Link>
  );
}

function Sessions({
  batchId,
  upcoming,
  recent,
}: {
  batchId: string;
  upcoming: BatchSessionInfo[];
  recent: BatchSessionInfo[];
}) {
  const [tab, setTab] = useState<'upcoming' | 'recent'>('upcoming');
  const list = tab === 'upcoming' ? upcoming : recent;
  return (
    <section className="space-y-2" aria-label="Sessions">
      <div className="flex items-center justify-between gap-2">
        <h2 className="flex items-center gap-1.5 text-[15px] font-semibold">
          <CalendarClock className="size-4" /> Sessions
        </h2>
        <Segmented
          ariaLabel="Sessions"
          value={tab}
          onChange={(v) => setTab(v as typeof tab)}
          options={[
            { value: 'upcoming', label: 'Upcoming' },
            { value: 'recent', label: 'Recent' },
          ]}
        />
      </div>
      {list.length === 0 ? (
        <p className="py-4 text-center text-[13px] text-muted-foreground">
          {tab === 'upcoming' ? 'No sessions in the next two weeks.' : 'No past sessions yet.'}
        </p>
      ) : (
        <Card className="divide-y overflow-hidden">
          {list.map((s) => (
            <SessionRow key={s.date} s={s} batchId={batchId} past={tab === 'recent'} />
          ))}
        </Card>
      )}
    </section>
  );
}
