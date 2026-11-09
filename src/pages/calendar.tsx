/**
 * My calendar: a week grid (time down the side, days across — like Outlook / Teams) and a day view
 * with every session's details and quick actions. Coaches see their batches, admins see all.
 */
import {
  CalendarDays,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  CloudRain,
  MapPin,
  Repeat,
  UserRound,
  Users,
} from 'lucide-react';
import { useEffect, useMemo, useRef, useState, useSyncExternalStore, type RefObject } from 'react';
import { Link, useSearchParams } from 'react-router';
import { useUser } from '@/app/auth';
import { EmptyState, ErrorState, PageHeader } from '@/components/common';
import { Button } from '@/components/ui/button';
import { Segmented } from '@/components/ui/controls';
import { Badge, Card, Skeleton } from '@/components/ui/primitives';
import {
  addDays,
  formatClock,
  formatLongDate,
  formatShortDate,
  formatTime,
  formatTimeRange,
  startOfWeek,
  today,
  WEEKDAYS,
} from '@/lib/format';
import { useCalendar } from '@/lib/queries';
import type { DayOverviewSession } from '@/lib/types';
import { cn } from '@/lib/utils';
import { batchTone, liveStatus, minutes } from './calendar-meta';
import { SessionDialog } from './calendar-session';

type View = 'week' | 'day';

const HOUR_PX = 56; // height of one hour in the grid

/**
 * Caps a scroll area so it ends just above the phone tab bar (and the screen edge), so the
 * last hours of the day are never hidden behind the bottom navigation.
 */
function useFitAboveTabBar(ref: RefObject<HTMLElement | null>) {
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const fit = () => {
      const tabBar = document.querySelector<HTMLElement>('nav[aria-label="Quick navigation"]');
      const barH = tabBar?.offsetHeight ?? 0; // 0 when hidden (desktop)
      const top = el.getBoundingClientRect().top + window.scrollY;
      const available = window.innerHeight - top - barH - 12;
      el.style.maxHeight = `${Math.max(240, available)}px`;
    };
    fit();
    window.addEventListener('resize', fit);
    return () => window.removeEventListener('resize', fit);
  }, [ref]);
}
const hourLabel = (h: number) => `${h % 12 === 0 ? 12 : h % 12} ${h < 12 ? 'am' : 'pm'}`;

/** Current time in IST as minutes since midnight (ticks every minute). */
const istClock = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Asia/Kolkata',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
});
function useNowMinutes() {
  const [now, setNow] = useState(() => minutes(istClock.format(new Date())));
  useEffect(() => {
    const t = setInterval(() => setNow(minutes(istClock.format(new Date()))), 60_000);
    return () => clearInterval(t);
  }, []);
  return now;
}

const PHONE = '(max-width: 639px)';
function useIsPhone() {
  return useSyncExternalStore(
    (cb) => {
      const mq = window.matchMedia?.(PHONE);
      mq?.addEventListener?.('change', cb);
      return () => mq?.removeEventListener?.('change', cb);
    },
    () => window.matchMedia?.(PHONE).matches ?? false,
    () => false,
  );
}

/** Places overlapping sessions side by side (lanes), like calendar apps. */
function layout(sessions: DayOverviewSession[]) {
  const sorted = [...sessions].sort(
    (a, b) => minutes(a.batch.startTime) - minutes(b.batch.startTime),
  );
  const laneEnds: number[] = [];
  const placed = sorted.map((s) => {
    const start = minutes(s.batch.startTime);
    let lane = laneEnds.findIndex((end) => end <= start);
    if (lane === -1) lane = laneEnds.length;
    laneEnds[lane] = minutes(s.batch.endTime);
    return { s, lane };
  });
  return placed.map((p) => ({ ...p, lanes: Math.max(1, laneEnds.length) }));
}

export function CalendarPage() {
  const user = useUser();
  const isPhone = useIsPhone();
  const [params, setParams] = useSearchParams();
  const date = params.get('date') ?? today();
  const view: View = (params.get('view') as View | null) ?? (isPhone ? 'day' : 'week');
  const weekStart = startOfWeek(date);
  const weekEnd = addDays(weekStart, 6);
  const q = useCalendar(weekStart, weekEnd);

  const set = (patch: { date?: string; view?: View }) => {
    const p = new URLSearchParams(params);
    if (patch.date) p.set('date', patch.date);
    if (patch.view) p.set('view', patch.view);
    setParams(p, { replace: true });
  };

  const days = useMemo(() => q.data?.days ?? [], [q.data]);
  const selected = days.find((d) => d.date === date);

  // The grid always shows the whole day (12 am – 12 am); it opens scrolled to the first session.
  const startHour = 0;
  const endHour = 24;

  const [openSession, setOpenSession] = useState<{
    s: DayOverviewSession;
    date: string;
  } | null>(null);
  const now = useNowMinutes();

  const total = days.reduce((n, d) => n + d.sessions.filter((s) => !s.cancelled).length, 0);

  return (
    <div>
      <PageHeader
        title="My calendar"
        description={
          q.data
            ? `${formatShortDate(weekStart)} – ${formatShortDate(weekEnd)} · ${total} session${total === 1 ? '' : 's'}${user.role === 'admin' ? ' across all batches' : ''}`
            : 'Your sessions for the week'
        }
        actions={
          <Segmented
            ariaLabel="Calendar view"
            value={view}
            onChange={(v) => set({ view: v })}
            options={[
              { value: 'day', label: 'Day' },
              { value: 'week', label: 'Week' },
            ]}
          />
        }
      />

      {/* Week navigation + day strip */}
      <Card className="mb-2.5 p-1.5 sm:p-2">
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="Previous week"
            onClick={() => set({ date: addDays(date, -7) })}
          >
            <ChevronLeft />
          </Button>
          {view === 'week' ? (
            <p className="flex-1 text-center text-sm font-semibold">
              {formatShortDate(weekStart)} – {formatShortDate(weekEnd)}
            </p>
          ) : (
            <div className="grid flex-1 grid-cols-7 gap-1" role="tablist" aria-label="Days">
              {WEEKDAYS.map((w, i) => {
                const d = addDays(weekStart, i);
                const info = days.find((x) => x.date === d);
                const count = info?.sessions.filter((s) => !s.cancelled).length ?? 0;
                const isSel = d === date;
                const isToday = d === (q.data?.today ?? today());
                return (
                  <button
                    key={d}
                    type="button"
                    role="tab"
                    aria-selected={isSel}
                    aria-label={`${formatLongDate(d)}, ${count} session${count === 1 ? '' : 's'}`}
                    onClick={() => set({ date: d, view: 'day' })}
                    className={cn(
                      'flex cursor-pointer flex-col items-center gap-0.5 rounded-xl py-1.5 transition-colors active:scale-95',
                      isSel ? 'bg-primary text-primary-foreground shadow-e1' : 'hover:bg-muted',
                    )}
                  >
                    <span
                      className={cn(
                        'text-[10px] font-semibold tracking-wide uppercase',
                        !isSel && 'text-muted-foreground',
                      )}
                    >
                      {w.short}
                    </span>
                    <span
                      className={cn(
                        'tabular flex size-7 items-center justify-center rounded-full text-sm font-bold',
                        isToday && !isSel && 'ring-2 ring-primary',
                      )}
                    >
                      {Number(d.slice(8))}
                    </span>
                    <span className="flex h-1.5 items-center gap-0.5" aria-hidden>
                      {Array.from({ length: Math.min(3, count) }, (_, k) => (
                        <span
                          key={k}
                          className={cn(
                            'size-1 rounded-full',
                            isSel ? 'bg-primary-foreground' : 'bg-primary',
                          )}
                        />
                      ))}
                    </span>
                  </button>
                );
              })}
            </div>
          )}
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="Next week"
            onClick={() => set({ date: addDays(date, 7) })}
          >
            <ChevronRight />
          </Button>
        </div>
        {date !== today() && (
          <div className="mt-1 flex justify-center">
            <Button
              variant="tonal"
              size="sm"
              className="h-7 px-2.5 text-[12px] pointer-coarse:h-7"
              onClick={() => set({ date: today() })}
            >
              <CalendarDays /> Back to today
            </Button>
          </div>
        )}
      </Card>

      {q.isError ? (
        <ErrorState error={q.error} onRetry={() => void q.refetch()} />
      ) : q.isPending ? (
        <Skeleton className="h-[28rem] rounded-2xl" />
      ) : view === 'week' ? (
        <WeekGrid
          days={days}
          startHour={startHour}
          endHour={endHour}
          todayDate={q.data.today}
          selected={date}
          onOpenDay={(d) => set({ date: d, view: 'day' })}
          onOpenSession={(s, d) => setOpenSession({ s, date: d })}
        />
      ) : (
        <DayView
          date={date}
          sessions={selected?.sessions ?? []}
          isToday={date === q.data.today}
          isAdmin={user.role === 'admin'}
        />
      )}
      <SessionDialog
        session={openSession?.s ?? null}
        date={openSession?.date ?? date}
        todayDate={q.data?.today ?? today()}
        now={now}
        isAdmin={user.role === 'admin'}
        onOpenChange={(o) => !o && setOpenSession(null)}
      />
    </div>
  );
}

function TimeGutter({ startHour, endHour }: { startHour: number; endHour: number }) {
  return (
    <div className="relative w-11 shrink-0 sm:w-14" aria-hidden>
      {Array.from({ length: endHour - startHour }, (_, i) => (
        <div
          key={i}
          className="relative text-right text-[10px] font-medium text-muted-foreground sm:text-[11px]"
          style={{ height: HOUR_PX }}
        >
          <span className="absolute -top-2 right-1.5 sm:right-2">{hourLabel(startHour + i)}</span>
        </div>
      ))}
    </div>
  );
}

function HourLines({ startHour, endHour }: { startHour: number; endHour: number }) {
  return (
    <div className="pointer-events-none absolute inset-0" aria-hidden>
      {Array.from({ length: endHour - startHour }, (_, i) => (
        <div key={i} className="border-t border-border/70" style={{ height: HOUR_PX }}>
          <div
            className="border-t border-dashed border-border/35"
            style={{ marginTop: HOUR_PX / 2 }}
          />
        </div>
      ))}
    </div>
  );
}

function NowLine({ startHour, endHour }: { startHour: number; endHour: number }) {
  const now = useNowMinutes();
  if (now < startHour * 60 || now > endHour * 60) return null;
  return (
    <div
      className="pointer-events-none absolute inset-x-0 z-10 flex items-center"
      style={{ top: ((now - startHour * 60) / 60) * HOUR_PX }}
      aria-hidden
    >
      <span className="-ml-1 size-2.5 rounded-full bg-destructive shadow-e1" />
      <span className="h-0.5 flex-1 bg-destructive" />
    </div>
  );
}

function WeekGrid({
  days,
  startHour,
  endHour,
  todayDate,
  selected,
  onOpenDay,
  onOpenSession,
}: {
  days: { date: string; sessions: DayOverviewSession[] }[];
  startHour: number;
  endHour: number;
  todayDate: string;
  selected: string;
  onOpenDay: (d: string) => void;
  onOpenSession: (s: DayOverviewSession, date: string) => void;
}) {
  const height = (endHour - startHour) * HOUR_PX;
  const scroller = useRef<HTMLDivElement>(null);
  useFitAboveTabBar(scroller);
  const firstStart = Math.min(
    ...days.flatMap((d) => d.sessions.map((s) => minutes(s.batch.startTime))),
    24 * 60,
  );
  // Open the grid at the first session of the week (or at the current time on a light week).
  useEffect(() => {
    const el = scroller.current;
    if (!el) return;
    const target = firstStart < 24 * 60 ? firstStart - 30 : 8 * 60;
    el.scrollTop = Math.max(0, ((target - startHour * 60) / 60) * HOUR_PX);
  }, [firstStart, startHour]);
  return (
    <Card className="overflow-hidden p-0">
      {/* Column headers */}
      <div className="flex border-b bg-muted/30">
        <div className="w-11 shrink-0 sm:w-14" />
        <div className="grid flex-1 grid-cols-7">
          {days.map((d, i) => (
            <button
              key={d.date}
              type="button"
              onClick={() => onOpenDay(d.date)}
              className={cn(
                'cursor-pointer border-l py-1.5 text-center transition-colors hover:bg-muted',
                d.date === todayDate && 'text-primary',
                d.date === selected && 'bg-accent/60',
              )}
              aria-label={`Open ${formatLongDate(d.date)}`}
            >
              <span className="block text-[10px] font-semibold tracking-wide uppercase sm:text-[11px]">
                {WEEKDAYS[i]!.short}
              </span>
              <span className="tabular text-sm font-bold">{Number(d.date.slice(8))}</span>
            </button>
          ))}
        </div>
      </div>
      <div ref={scroller} className="max-h-[70dvh] overflow-y-auto overscroll-contain">
        <div className="flex pt-2.5 pb-3">
          <TimeGutter startHour={startHour} endHour={endHour} />
          <div className="relative grid flex-1 grid-cols-7" style={{ height }}>
            <HourLines startHour={startHour} endHour={endHour} />
            {days.map((d) => (
              <div
                key={d.date}
                className={cn('relative border-l', d.date === todayDate && 'bg-primary/[0.03]')}
              >
                {d.date === todayDate && <NowLine startHour={startHour} endHour={endHour} />}
                {layout(d.sessions).map(({ s, lane, lanes }) => {
                  const top = ((minutes(s.batch.startTime) - startHour * 60) / 60) * HOUR_PX;
                  const h = Math.max(
                    22,
                    ((minutes(s.batch.endTime) - minutes(s.batch.startTime)) / 60) * HOUR_PX - 2,
                  );
                  return (
                    <button
                      key={s.batch.id}
                      type="button"
                      onClick={() => onOpenSession(s, d.date)}
                      aria-haspopup="dialog"
                      title={`${s.batch.name} · ${formatTimeRange(s.batch.startTime, s.batch.endTime)}${s.cancelled ? ` · cancelled (${s.cancelled})` : ''}${s.substitute ? ` · substitute ${s.substitute.name}` : ''}`}
                      className={cn(
                        'absolute cursor-pointer overflow-hidden rounded-md border-l-[3px] px-1 py-0.5 text-left shadow-xs transition-transform hover:z-20 hover:shadow-e2 active:scale-[0.97]',
                        batchTone(s.batch.id),
                        s.cancelled && 'opacity-60 grayscale',
                      )}
                      style={{
                        top: top + 1,
                        height: h,
                        left: `calc(${(lane / lanes) * 100}% + 2px)`,
                        width: `calc(${100 / lanes}% - 4px)`,
                      }}
                    >
                      <span
                        className={cn(
                          'block truncate text-[10px] leading-tight font-semibold sm:text-[11px]',
                          s.cancelled && 'line-through',
                        )}
                      >
                        {s.substitute && <Repeat className="mr-0.5 inline size-2.5" />}
                        {s.batch.name}
                      </span>
                      <span className="hidden truncate text-[10px] leading-tight opacity-80 sm:block">
                        {formatTimeRange(s.batch.startTime, s.batch.endTime)}
                      </span>
                    </button>
                  );
                })}
              </div>
            ))}
          </div>
        </div>
      </div>
    </Card>
  );
}

function DayView({
  date,
  sessions,
  isToday,
  isAdmin,
}: {
  date: string;
  sessions: DayOverviewSession[];
  isToday: boolean;
  isAdmin: boolean;
}) {
  const now = useNowMinutes();
  const sorted = [...sessions].sort(
    (a, b) => minutes(a.batch.startTime) - minutes(b.batch.startTime),
  );
  // Where the "now" marker goes: before the first session that hasn't ended yet.
  const nowIndex = isToday ? sorted.findIndex((s) => minutes(s.batch.endTime) > now) : -1;
  const status = (s: DayOverviewSession) =>
    liveStatus(s.batch.startTime, s.batch.endTime, now, isToday);
  return (
    <div className="space-y-2">
      <h2 className="text-[14px] font-semibold">
        {formatLongDate(date)}
        {isToday && <Badge className="ml-2 align-middle">Today</Badge>}
      </h2>
      {sorted.length === 0 ? (
        <EmptyState
          icon={<CalendarDays />}
          title="Nothing scheduled"
          description="No batch sessions on this day."
        />
      ) : (
        <ol className="space-y-1.5">
          {sorted.map((s, i) => {
            const live = status(s);
            return (
              <li
                key={s.batch.id}
                className="animate-rise"
                style={{ animationDelay: `${i * 40}ms` }}
              >
                {i === nowIndex && <NowMarker />}
                <div className="flex gap-2">
                  <div className="tabular w-[3.25rem] shrink-0 pt-2 text-right whitespace-nowrap">
                    <p className="text-[12px] leading-tight font-bold">
                      {formatTime(s.batch.startTime)}
                    </p>
                    <p className="text-[10px] text-muted-foreground">
                      {formatTime(s.batch.endTime)}
                    </p>
                  </div>
                  <Card
                    className={cn(
                      'relative min-w-0 flex-1 border-l-4 px-2.5 py-2 transition-shadow hover:shadow-e2',
                      batchTone(s.batch.id),
                      s.cancelled && 'opacity-70 grayscale',
                    )}
                  >
                    {live && (
                      <Badge className="mb-1" variant={live === 'Live now' ? 'success' : 'default'}>
                        {live === 'Live now' && (
                          <span className="relative mr-0.5 flex size-1.5">
                            <span className="absolute inline-flex size-full animate-ping rounded-full bg-success opacity-75" />
                            <span className="relative inline-flex size-1.5 rounded-full bg-success" />
                          </span>
                        )}
                        {live}
                      </Badge>
                    )}
                    <SessionDetails s={s} date={date} isAdmin={isAdmin} />
                  </Card>
                </div>
              </li>
            );
          })}
          {isToday && nowIndex === -1 && <NowMarker label="All sessions done for today" />}
        </ol>
      )}
    </div>
  );
}

function NowMarker({ label = 'Now' }: { label?: string }) {
  return (
    <div className="mb-1.5 flex items-center gap-2 pl-1" aria-label={label}>
      <span className="size-2.5 rounded-full bg-destructive shadow-e1" />
      <span className="h-0.5 flex-1 bg-destructive/70" />
      <span className="text-[11px] font-semibold text-destructive">{label}</span>
    </div>
  );
}

const SMALL_BTN =
  'h-6 gap-1 rounded-md bg-card/80 px-2 text-[11px] pointer-coarse:h-7 pointer-coarse:text-[11px] [&_svg:not([class*=size-])]:size-3';

function SessionDetails({
  s,
  date,
  isAdmin,
}: {
  s: DayOverviewSession;
  date: string;
  isAdmin: boolean;
}) {
  const me = useUser();
  const pct = s.expectedStudents ? Math.round((s.marked / s.expectedStudents) * 100) : 0;
  return (
    <div className="space-y-1">
      {/* The whole card opens the batch; the action buttons sit above this link. */}
      <Link
        to={`/batches/${s.batch.id}`}
        className={cn(
          'block truncate text-[13px] leading-tight font-bold after:absolute after:inset-0 after:rounded-[inherit] focus-visible:outline-none focus-visible:after:ring-2 focus-visible:after:ring-ring',
          s.cancelled && 'line-through',
        )}
      >
        {s.batch.name}
      </Link>
      <p className="flex flex-wrap items-center gap-x-2.5 gap-y-0.5 text-[11px] opacity-85">
        <span className="inline-flex items-center gap-1">
          <MapPin className="size-3" /> {s.batch.location.name}
        </span>
        {isAdmin && (
          <span className="inline-flex items-center gap-1">
            <UserRound className="size-3" /> {s.batch.coach.name}
          </span>
        )}
        {s.substitute && (
          <span className="inline-flex items-center gap-1 font-semibold">
            <Repeat className="size-3" />
            {s.substitute.id === me.id
              ? 'You’re the substitute'
              : `Substitute: ${s.substitute.name}`}
          </span>
        )}
      </p>
      {s.cancelled ? (
        <Badge variant="muted">
          <CloudRain /> Cancelled · {s.cancelled}
        </Badge>
      ) : (
        <>
          {/* One row: attendance · plan · check-in → check-out. */}
          <div className="flex min-w-0 items-center gap-1 overflow-hidden [&_[data-slot=badge]]:px-1.5 [&_[data-slot=badge]]:text-[11px]">
            <Badge
              variant={s.attendanceComplete ? 'success' : s.marked ? 'warning' : 'muted'}
              title={`Attendance marked: ${s.marked} of ${s.expectedStudents}`}
            >
              <Users /> {s.marked}/{s.expectedStudents}
              {s.expectedStudents > 0 && ` · ${pct}%`}
            </Badge>
            <Badge variant={s.hasLessonPlan ? 'success' : 'muted'}>
              <ClipboardList /> {s.hasLessonPlan ? 'Plan' : 'No plan'}
            </Badge>
            {s.coachSession ? (
              <Badge
                variant={s.coachSession.flagged ? 'warning' : 'success'}
                className="min-w-0"
                title={s.coachSession.flagged ? 'Check-in flagged for review' : 'Checked in'}
              >
                <CheckCircle2 />
                <span className="tabular truncate">
                  {formatClock(s.coachSession.checkInAt)} →{' '}
                  {s.coachSession.checkOutAt ? formatClock(s.coachSession.checkOutAt) : '--'}
                </span>
              </Badge>
            ) : (
              <Badge variant="muted">
                <MapPin /> Not checked in
              </Badge>
            )}
          </div>
          <div className="relative z-10 flex flex-wrap gap-1 pt-0.5">
            <Button size="sm" variant="outline" asChild className={SMALL_BTN}>
              <Link to={`/attendance?batch=${s.batch.id}&date=${date}`}>
                <Users /> Attendance
              </Link>
            </Button>
            <Button size="sm" variant="outline" asChild className={SMALL_BTN}>
              <Link to={`/lesson-plans?batch=${s.batch.id}&date=${date}`}>
                <ClipboardList /> Lesson plan
              </Link>
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
