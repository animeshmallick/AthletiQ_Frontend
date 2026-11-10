/**
 * The coach's day, grouped by where they need to be: sessions in time order, with a location
 * divider whenever the place changes (map link, time spent there, travel gap since the last
 * place). Each session is a compact tile with a status badge, attendance and plan status, and
 * check-in / out for today; tapping it lists who is expected (makeups marked).
 */
import {
  CalendarDays,
  Car,
  CheckCircle2,
  ClipboardList,
  CloudRain,
  MapPin,
  Navigation,
  Phone,
  Repeat,
  Users,
} from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router';
import { useUser } from '@/app/auth';
import { Avatar, EmptyState, ListSkeleton } from '@/components/common';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/overlays';
import { Badge, Card } from '@/components/ui/primitives';
import { formatClock, formatTime, formatTimeRange, plural } from '@/lib/format';
import { useCoachToday, useRoster } from '@/lib/queries';
import type { DayOverviewSession } from '@/lib/types';
import { cn } from '@/lib/utils';
import { batchTone, minutes } from './calendar-meta';
import { CheckInButton } from './today';

type State = 'live' | 'next' | 'upcoming' | 'done' | 'cancelled' | 'past' | 'future';

const STATE: Record<State, { label: string; className: string }> = {
  // Broadcast-style red for what is happening now; green stays reserved for the check-in action.
  live: { label: 'Live', className: 'bg-rose-600 text-white' },
  next: { label: 'Next', className: 'bg-primary text-primary-foreground' },
  upcoming: { label: 'Later', className: 'border bg-card text-muted-foreground' },
  done: { label: 'Done', className: 'border bg-card text-muted-foreground' },
  cancelled: { label: 'Cancelled', className: 'bg-zinc-500 text-white dark:bg-zinc-600' },
  past: { label: 'Past', className: 'border bg-card text-muted-foreground' },
  future: { label: 'Scheduled', className: 'border bg-card text-muted-foreground' },
};

const gapLabel = (mins: number) =>
  mins <= 0
    ? 'Back-to-back'
    : mins < 60
      ? `${mins} min travel`
      : `${Math.floor(mins / 60)} h ${mins % 60 ? `${mins % 60} min ` : ''}gap`;

export function CoachDayView({
  date,
  sessions,
  isToday,
  isPast,
  now,
}: {
  date: string;
  sessions: DayOverviewSession[];
  isToday: boolean;
  isPast: boolean;
  now: number;
}) {
  const today = useCoachToday(isToday);
  const [open, setOpen] = useState<DayOverviewSession | null>(null);
  const sorted = [...sessions].sort(
    (a, b) => minutes(a.batch.startTime) - minutes(b.batch.startTime),
  );
  const nextId = isToday
    ? (sorted.find((s) => !s.cancelled && minutes(s.batch.startTime) > now)?.batch.id ?? null)
    : null;
  const stateOf = (s: DayOverviewSession): State => {
    if (s.cancelled) return 'cancelled';
    if (isPast) return 'past';
    if (!isToday) return 'future';
    const start = minutes(s.batch.startTime);
    const end = minutes(s.batch.endTime);
    if (now >= start && now < end) return 'live';
    if (now >= end) return 'done';
    return s.batch.id === nextId ? 'next' : 'upcoming';
  };

  // Consecutive sessions at the same place form one stop.
  const stops: {
    location: DayOverviewSession['batch']['location'];
    sessions: DayOverviewSession[];
  }[] = [];
  for (const s of sorted) {
    const last = stops.at(-1);
    if (last && last.location.id === s.batch.location.id) last.sessions.push(s);
    else stops.push({ location: s.batch.location, sessions: [s] });
  }
  // Where the "now" line goes: before the first session that hasn't ended.
  const nowBefore = isToday
    ? (sorted.find((s) => minutes(s.batch.endTime) > now)?.batch.id ?? 'end')
    : null;

  if (!sorted.length)
    return (
      <EmptyState
        icon={<CalendarDays />}
        title="Nothing scheduled"
        description="No sessions on this day."
      />
    );

  return (
    <div className="space-y-1.5">
      {stops.map((stop, i) => {
        const live = stop.sessions.filter((s) => !s.cancelled);
        const first = live[0] ?? stop.sessions[0]!;
        const last = live.at(-1) ?? stop.sessions.at(-1)!;
        const prev = stops[i - 1];
        const prevEnd = prev
          ? (prev.sessions.filter((s) => !s.cancelled).at(-1) ?? prev.sessions.at(-1)!)
          : null;
        const gap = prevEnd
          ? minutes(first.batch.startTime) - minutes(prevEnd.batch.endTime)
          : null;
        const map =
          stop.location.latitude !== undefined && stop.location.longitude !== undefined
            ? `https://www.google.com/maps/dir/?api=1&destination=${stop.location.latitude},${stop.location.longitude}`
            : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(stop.location.name)}`;
        return (
          <section
            key={`${stop.location.id}-${i}`}
            aria-label={stop.location.name}
            className="space-y-1"
          >
            {/* Getting here from the previous place: its own slim divider. */}
            {prev && gap !== null && (
              <TravelDivider from={prev.location.name} to={stop.location.name} gap={gap} />
            )}
            {/* Location divider */}
            <div className="flex items-center gap-2 pt-1">
              <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                <MapPin className="size-3.5" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-[13px] font-semibold">{stop.location.name}</p>
                <p className="truncate text-[11px] text-muted-foreground">
                  {formatTimeRange(first.batch.startTime, last.batch.endTime)} ·{' '}
                  {plural(stop.sessions.length, 'session')}
                </p>
              </div>
              <Button
                asChild
                size="sm"
                variant="outline"
                className="h-6 gap-1 rounded-md px-2 text-[11px] pointer-coarse:h-7"
              >
                <a
                  href={map}
                  target="_blank"
                  rel="noreferrer"
                  aria-label={`Directions to ${stop.location.name}`}
                >
                  <Navigation className="size-3" /> Map
                </a>
              </Button>
            </div>
            <ol className="ml-3.5 space-y-2.5 border-l-2 border-primary/20 pt-2 pl-2.5">
              {stop.sessions.map((s) => (
                <li key={s.batch.id}>
                  {nowBefore === s.batch.id && <NowLine />}
                  <SessionTile
                    s={s}
                    state={stateOf(s)}
                    date={date}
                    isToday={isToday}
                    todayItem={today.data?.sessions.find((t) => t.batch.id === s.batch.id)}
                    onOpen={() => setOpen(s)}
                  />
                </li>
              ))}
            </ol>
          </section>
        );
      })}
      {nowBefore === 'end' && <NowLine label="All sessions done for today" />}
      <StudentsDialog s={open} date={date} onClose={() => setOpen(null)} />
    </div>
  );
}

/** Between two places: a slim divider with the time the coach has to get there. */
function TravelDivider({ from, to, gap }: { from: string; to: string; gap: number }) {
  const tight = gap < 15;
  return (
    <div
      className="flex items-center gap-2 py-0.5"
      role="separator"
      aria-label={`${gapLabel(gap)} from ${from} to ${to}`}
    >
      <span className="flex-1 border-t border-dashed border-border" />
      <span
        className={cn(
          'inline-flex max-w-[80%] items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-semibold',
          tight
            ? 'border-warning/40 bg-warning/10 text-warning-foreground dark:text-warning'
            : 'bg-muted/60 text-muted-foreground',
        )}
      >
        <Car className="size-3 shrink-0" />
        <span className="truncate">
          {gapLabel(gap)} · {from.split(' ')[0]} → {to.split(' ')[0]}
        </span>
      </span>
      <span className="flex-1 border-t border-dashed border-border" />
    </div>
  );
}

function NowLine({ label = 'Now' }: { label?: string }) {
  return (
    <div className="my-1 flex items-center gap-1.5" aria-label={label}>
      <span className="size-2 rounded-full bg-destructive" />
      <span className="h-px flex-1 bg-destructive/70" />
      <span className="text-[10px] font-semibold text-destructive">{label}</span>
    </div>
  );
}

function SessionTile({
  s,
  state,
  date,
  isToday,
  todayItem,
  onOpen,
}: {
  s: DayOverviewSession;
  state: State;
  date: string;
  isToday: boolean;
  todayItem?: Parameters<typeof CheckInButton>[0]['item'];
  onOpen: () => void;
}) {
  const me = useUser();
  const st = STATE[state];
  const pct = s.expectedStudents ? Math.round((s.marked / s.expectedStudents) * 100) : 0;
  return (
    <Card
      role="button"
      tabIndex={0}
      aria-label={`${s.batch.name} students`}
      onClick={onOpen}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onOpen();
        }
      }}
      className={cn(
        'relative cursor-pointer border-l-4 px-2 py-1.5 transition-shadow hover:shadow-e2',
        batchTone(s.batch.id),
        (state === 'done' || state === 'cancelled') && 'opacity-75',
      )}
    >
      <div className="flex items-center gap-2">
        <div className="tabular w-14 shrink-0 leading-tight">
          <p className="text-[12px] font-bold">{formatTime(s.batch.startTime)}</p>
          <p className="text-[10px] text-muted-foreground">{formatTime(s.batch.endTime)}</p>
        </div>
        <p
          className={cn(
            'min-w-0 flex-1 truncate text-[13px] font-semibold',
            s.cancelled && 'line-through',
          )}
        >
          {s.batch.name}
        </p>
      </div>
      {/* Status floats on the card's top corner. */}
      <span
        className={cn(
          'absolute -top-2 right-2 inline-flex items-center gap-1 rounded-full px-1.5 py-px text-[9px] font-bold tracking-wide uppercase shadow-e1 ring-2 ring-background',
          st.className,
        )}
      >
        {state === 'live' && (
          <span className="relative flex size-1.5">
            <span className="absolute inline-flex size-full animate-ping rounded-full bg-white/80" />
            <span className="relative inline-flex size-1.5 rounded-full bg-white" />
          </span>
        )}
        {st.label}
      </span>
      {s.cancelled ? (
        <Badge variant="muted" className="mt-1">
          <CloudRain /> {s.cancelled}
        </Badge>
      ) : (
        <div className="mt-1 flex min-w-0 flex-wrap items-center gap-1 [&_[data-slot=badge]]:px-1.5 [&_[data-slot=badge]]:text-[10px]">
          {s.substitute && (
            <Badge variant="default">
              <Repeat />
              {s.substitute.id === me.id ? 'You cover' : s.substitute.name}
            </Badge>
          )}
          <Badge variant={s.attendanceComplete ? 'success' : s.marked ? 'warning' : 'muted'}>
            <Users /> {s.marked}/{s.expectedStudents}
            {s.expectedStudents > 0 && s.marked > 0 ? ` · ${pct}%` : ''}
          </Badge>
          <Link
            to={`/lesson-plans?batch=${s.batch.id}&date=${date}`}
            onClick={(e) => e.stopPropagation()}
          >
            <Badge variant={s.hasLessonPlan ? 'success' : 'warning'}>
              <ClipboardList /> {s.hasLessonPlan ? 'Plan' : 'Add plan'}
            </Badge>
          </Link>
          {s.coachSession ? (
            <Badge variant={s.coachSession.flagged ? 'warning' : 'success'}>
              <CheckCircle2 /> {formatClock(s.coachSession.checkInAt)}
              {s.coachSession.checkOutAt ? `–${formatClock(s.coachSession.checkOutAt)}` : ''}
            </Badge>
          ) : (
            !isToday && <Badge variant="muted">No check-in</Badge>
          )}
          {isToday &&
            todayItem &&
            !todayItem.session?.checkOutAt &&
            (state === 'live' || state === 'next' || !!todayItem.session) && (
              <span className="ml-auto" onClick={(e) => e.stopPropagation()}>
                <CheckInButton item={todayItem} overview={s} compact />
              </span>
            )}
        </div>
      )}
    </Card>
  );
}

function StudentsDialog({
  s,
  date,
  onClose,
}: {
  s: DayOverviewSession | null;
  date: string;
  onClose: () => void;
}) {
  const q = useRoster(s?.batch.id ?? '', date);
  return (
    <Dialog open={!!s} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        {s && (
          <div className="space-y-2.5">
            <DialogHeader>
              <DialogTitle>{s.batch.name}</DialogTitle>
              <DialogDescription>
                {formatTimeRange(s.batch.startTime, s.batch.endTime)} · {s.batch.location.name}
              </DialogDescription>
            </DialogHeader>
            <div className="flex gap-1.5">
              <Button asChild size="sm" className="flex-1">
                <Link to={`/attendance?batch=${s.batch.id}&date=${date}`}>
                  <Users /> Attendance
                </Link>
              </Button>
              <Button asChild size="sm" variant="outline" className="flex-1">
                <Link to={`/lesson-plans?batch=${s.batch.id}&date=${date}`}>
                  <ClipboardList /> Lesson plan
                </Link>
              </Button>
            </div>
            <p className="text-[12px] font-semibold text-muted-foreground">
              Expected · {q.data ? q.data.students.length : '…'}
            </p>
            {q.isPending ? (
              <ListSkeleton rows={3} />
            ) : !q.data?.students.length ? (
              <p className="py-3 text-center text-[13px] text-muted-foreground">
                No students expected.
              </p>
            ) : (
              <ul className="divide-y rounded-xl border">
                {q.data.students.map((st) => (
                  <li key={st.studentId} className="flex items-center gap-2 px-2 py-1.5">
                    <Avatar name={st.fullName} className="size-8" />
                    <Link
                      to={`/students/${st.studentId}`}
                      className="min-w-0 flex-1 truncate text-[13px] font-medium hover:underline"
                    >
                      {st.fullName}
                    </Link>
                    {st.isMakeup && <Badge variant="warning">Makeup</Badge>}
                    {st.phone && (
                      <a
                        href={`tel:${st.phone}`}
                        aria-label={`Call ${st.fullName}`}
                        className="flex size-7 items-center justify-center rounded-lg border text-muted-foreground hover:text-foreground"
                      >
                        <Phone className="size-3.5" />
                      </a>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
