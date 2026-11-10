import {
  AlertTriangle,
  CalendarCheck2,
  CheckCircle2,
  ClipboardList,
  CloudRain,
  LayoutGrid,
  MapPin,
  UserRound,
  Users,
} from 'lucide-react';
import type { ReactNode } from 'react';
import { Link } from 'react-router';
import { ATTENDANCE_META, SectionDivider } from '@/components/common';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/overlays';
import { Badge, Skeleton } from '@/components/ui/primitives';
import {
  addDays,
  coachTimes,
  formatLongDate,
  formatTimeRange,
  plural,
  relativeDay,
  weekdaysLabel,
} from '@/lib/format';
import { useAttendanceSheet, useBatch, useSessionPlan, useRegister } from '@/lib/queries';
import type { AttendanceStatus, DayOverviewSession } from '@/lib/types';
import { cn } from '@/lib/utils';
import { batchTone, liveStatus } from './calendar-meta';

const STATUSES: AttendanceStatus[] = ['present', 'late', 'absent', 'excused'];
const BAR: Record<AttendanceStatus, string> = {
  present: 'bg-success',
  late: 'bg-warning',
  absent: 'bg-destructive',
  excused: 'bg-info',
};

function Tile({
  icon,
  label,
  value,
  hint,
  tone = 'muted',
}: {
  icon: ReactNode;
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  tone?: 'success' | 'warning' | 'muted' | 'destructive';
}) {
  return (
    <div className="min-w-0 rounded-lg border bg-card px-2 py-1.5">
      <p
        className={cn(
          'mb-0.5 flex items-center gap-1 text-[11px] font-medium [&_svg]:size-3.5',
          tone === 'success' && 'text-success',
          tone === 'warning' && 'text-warning-foreground dark:text-warning',
          tone === 'destructive' && 'text-destructive',
          tone === 'muted' && 'text-muted-foreground',
        )}
      >
        {icon}
        {label}
      </p>
      <p className="tabular truncate text-[14px] leading-tight font-bold">{value}</p>
      {hint && <p className="truncate text-[11px] text-muted-foreground">{hint}</p>}
    </div>
  );
}

/** Attendance over the four weeks up to the session, from the register. */
function useAttendanceTrend(batchId: string, date: string) {
  const reg = useRegister({ batchId, from: addDays(date, -27), to: date });
  if (!reg.data) return { loading: reg.isPending, data: null };
  let attended = 0;
  let marked = 0;
  const held = new Set<string>();
  const low: { name: string; rate: number; marked: number }[] = [];
  for (const s of reg.data.students) {
    const marks = Object.entries(s.marks);
    const here = marks.filter(([, m]) => m === 'present' || m === 'late').length;
    marks.forEach(([d]) => held.add(d));
    attended += here;
    marked += marks.length;
    if (marks.length >= 3 && here / marks.length < 0.6)
      low.push({ name: s.fullName, rate: here / marks.length, marked: marks.length });
  }
  low.sort((a, b) => a.rate - b.rate);
  return {
    loading: false,
    data: { rate: marked ? attended / marked : null, sessions: held.size, low },
  };
}

/** Details, today's numbers and recent trends for one session in the calendar. */
export function SessionDialog({
  session: s,
  date,
  todayDate,
  now,
  isAdmin,
  onOpenChange,
}: {
  session: DayOverviewSession | null;
  date: string;
  todayDate: string;
  now: number;
  isAdmin: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Dialog open={Boolean(s)} onOpenChange={onOpenChange}>
      <DialogContent className="gap-2 p-2.5 pt-4 sm:max-w-xl sm:gap-2.5 sm:p-3.5">
        {s && <Body s={s} date={date} todayDate={todayDate} now={now} isAdmin={isAdmin} />}
      </DialogContent>
    </Dialog>
  );
}

function Body({
  s,
  date,
  todayDate,
  now,
  isAdmin,
}: {
  s: DayOverviewSession;
  date: string;
  todayDate: string;
  now: number;
  isAdmin: boolean;
}) {
  const id = s.batch.id;
  const past = date <= todayDate;
  const batch = useBatch(id);
  const sheet = useAttendanceSheet(past && !s.cancelled ? id : undefined, date);
  const day = useSessionPlan(id, date);
  const trend = useAttendanceTrend(id, date);
  const live = liveStatus(s.batch.startTime, s.batch.endTime, now, date === todayDate);

  const sum = sheet.data?.summary;
  const plan = day.data && day.data.source !== 'none' ? day.data : undefined;
  const fits = plan ? plan.totalMinutes === plan.minutes : false;
  const rel = relativeDay(date, todayDate);

  return (
    <>
      <DialogHeader className={cn('mr-6 rounded-lg border-l-4 px-2.5 py-1.5', batchTone(id))}>
        <DialogTitle className={cn(s.cancelled && 'line-through')}>{s.batch.name}</DialogTitle>
        <DialogDescription className="flex flex-wrap items-center gap-x-2.5 gap-y-0.5 text-[13px]">
          <span>
            {['Today', 'Tomorrow', 'Yesterday'].includes(rel) ? `${rel} · ` : ''}
            {formatLongDate(date)} · {formatTimeRange(s.batch.startTime, s.batch.endTime)}
          </span>
        </DialogDescription>
        <div className="flex flex-wrap gap-1 pt-0.5">
          {live && <Badge variant={live === 'Live now' ? 'success' : 'default'}>{live}</Badge>}
          {s.cancelled && (
            <Badge variant="muted">
              <CloudRain /> Cancelled · {s.cancelled}
            </Badge>
          )}
          <Badge variant="outline">
            <MapPin /> {s.batch.location.name}
          </Badge>
          {isAdmin && (
            <Badge variant="outline">
              <UserRound /> {s.batch.coach.name}
            </Badge>
          )}
          {batch.data && (
            <Badge variant="outline">
              <Users /> {batch.data.memberCount}
              {batch.data.capacity ? `/${batch.data.capacity}` : ''} students ·{' '}
              {weekdaysLabel(batch.data.weekdays)}
            </Badge>
          )}
        </div>
      </DialogHeader>

      {!s.cancelled && (
        <section aria-label="This session" className="space-y-1.5">
          <SectionDivider as="h3">This session</SectionDivider>
          <div className="grid grid-cols-3 gap-1">
            <Tile
              icon={<CalendarCheck2 />}
              label="Attendance"
              value={`${s.marked}/${s.expectedStudents}`}
              hint={past ? `${s.present} present` : 'Not started'}
              tone={s.attendanceComplete ? 'success' : s.marked ? 'warning' : 'muted'}
            />
            <Tile
              icon={<CheckCircle2 />}
              label="Check-in"
              value={s.coachSession ? (s.coachSession.flagged ? 'Flagged' : 'Done') : '—'}
              hint={s.coachSession ? coachTimes(s.coachSession) : 'Not checked in'}
              tone={s.coachSession ? (s.coachSession.flagged ? 'warning' : 'success') : 'muted'}
            />
            <Tile
              icon={<ClipboardList />}
              label="Lesson plan"
              value={day.isPending ? '…' : plan ? `${plan.totalMinutes} min` : 'None'}
              hint={plan ? plan.blocks.map((b) => b.name).join(' · ') : 'Not planned yet'}
              tone={plan ? (fits ? 'success' : 'warning') : 'muted'}
            />
          </div>
          {sum && sum.total > 0 && (
            <div>
              <div
                className="flex h-2 gap-0.5 overflow-hidden rounded-full"
                role="img"
                aria-label={STATUSES.map((k) => `${sum[k]} ${k}`).join(', ')}
              >
                {STATUSES.map((k) =>
                  sum[k] ? (
                    <span
                      key={k}
                      className={cn('h-full', BAR[k])}
                      style={{ width: `${(sum[k] / sum.total) * 100}%` }}
                    />
                  ) : null,
                )}
                {sum.unmarked > 0 && (
                  <span
                    className="h-full bg-muted"
                    style={{ width: `${(sum.unmarked / sum.total) * 100}%` }}
                  />
                )}
              </div>
              <ul className="mt-1 flex flex-wrap gap-x-3 text-[11px] text-muted-foreground">
                {STATUSES.map((k) => (
                  <li key={k} className="inline-flex items-center gap-1">
                    <span className={cn('size-1.5 rounded-full', BAR[k])} />
                    {ATTENDANCE_META[k].label} {sum[k]}
                  </li>
                ))}
                <li>Unmarked {sum.unmarked}</li>
              </ul>
            </div>
          )}
          {plan?.note && (
            <p className="rounded-lg bg-muted/50 px-2.5 py-1.5 text-[12px] text-muted-foreground">
              <b className="font-medium text-foreground">Session note:</b> {plan.note}
            </p>
          )}
        </section>
      )}

      <section aria-label="Last 4 weeks" className="space-y-1.5">
        <SectionDivider as="h3">Last 4 weeks</SectionDivider>
        {trend.loading ? (
          <Skeleton className="h-16 rounded-xl" />
        ) : (
          <div className="grid grid-cols-3 gap-1">
            <Tile
              icon={<Users />}
              label="Attendance"
              value={
                trend.data?.rate === null || trend.data?.rate === undefined
                  ? '—'
                  : `${Math.round(trend.data.rate * 100)}%`
              }
              hint={trend.data ? plural(trend.data.sessions, 'session') : undefined}
              tone={
                trend.data?.rate === null || trend.data?.rate === undefined
                  ? 'muted'
                  : trend.data.rate >= 0.8
                    ? 'success'
                    : 'warning'
              }
            />
          </div>
        )}
        {trend.data && trend.data.low.length > 0 && (
          <div className="rounded-lg border border-warning/40 bg-warning/8 px-2.5 py-2 text-[12px]">
            <p className="mb-1 flex items-center gap-1.5 font-medium">
              <AlertTriangle className="size-3.5 text-warning-foreground dark:text-warning" />
              Below 60% attendance
            </p>
            <ul className="flex flex-wrap gap-1">
              {trend.data.low.slice(0, 6).map((l) => (
                <li key={l.name}>
                  <Badge variant="outline" className="bg-card font-normal">
                    {l.name} · {Math.round(l.rate * 100)}%
                  </Badge>
                </li>
              ))}
              {trend.data.low.length > 6 && (
                <li className="text-muted-foreground">+{trend.data.low.length - 6} more</li>
              )}
            </ul>
          </div>
        )}
      </section>

      {/* One row on every screen: two quick actions and the batch. */}
      <div className="flex gap-1.5 border-t pt-2 *:flex-1">
        {!s.cancelled && (
          <>
            <Button
              size="sm"
              variant="outline"
              asChild
              className="min-w-0 gap-1 px-2 text-[12px] pointer-coarse:text-[12px] [&_svg:not([class*=size-])]:size-3.5"
            >
              <Link to={`/attendance?batch=${id}&date=${date}`}>
                <Users /> <span className="truncate">Attendance</span>
              </Link>
            </Button>
            <Button
              size="sm"
              variant="outline"
              asChild
              className="min-w-0 gap-1 px-2 text-[12px] pointer-coarse:text-[12px] [&_svg:not([class*=size-])]:size-3.5"
            >
              <Link to={`/lesson-plans?batch=${id}&date=${date}`}>
                <ClipboardList /> <span className="truncate">Lesson plan</span>
              </Link>
            </Button>
          </>
        )}
        <Button
          size="sm"
          asChild
          className="min-w-0 gap-1 px-2 text-[12px] pointer-coarse:text-[12px] [&_svg:not([class*=size-])]:size-3.5"
        >
          <Link to={`/batches/${id}`} aria-label="Open batch">
            <LayoutGrid /> <span className="truncate">Batch</span>
          </Link>
        </Button>
      </div>
    </>
  );
}
