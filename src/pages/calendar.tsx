/**
 * My calendar: a week grid (time down the side, days across — like Outlook / Teams) and a day view
 * with every session's details and quick actions. Coaches see their batches, admins see all.
 */
import { PeriodStepper, WeekStrip } from '@/components/date-nav';
import { Repeat } from 'lucide-react';
import { useEffect, useMemo, useRef, useState, useSyncExternalStore, type RefObject } from 'react';
import { useSearchParams } from 'react-router';
import { useUser } from '@/app/auth';
import { ErrorState, PageHeader } from '@/components/common';
import { Segmented } from '@/components/ui/controls';
import { Card, Skeleton } from '@/components/ui/primitives';
import {
  addDays,
  formatLongDate,
  formatShortDate,
  relativeDay,
  formatTimeRange,
  startOfWeek,
  today,
  WEEKDAYS,
} from '@/lib/format';
import { useCalendar } from '@/lib/queries';
import type { DayOverviewSession } from '@/lib/types';
import { cn } from '@/lib/utils';
import { batchTone, minutes } from './calendar-meta';
import { CoachDayView } from './calendar-coach-day';
import { SwipeDays } from '@/components/swipe-days';
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

  // Which way the day last moved, so the day view slides in from that side.
  const [lastDate, setLastDate] = useState(date);
  const [dir, setDir] = useState<1 | -1 | 0>(0);
  if (date !== lastDate) {
    setDir(date > lastDate ? 1 : -1);
    setLastDate(date);
  }

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

      {/* Week navigation + day strip (compact) */}
      <div className="mb-2 space-y-1">
        <PeriodStepper
          label={
            <span
              key={weekStart}
              className={cn(
                'inline-block',
                dir === 1 && 'animate-day-next',
                dir === -1 && 'animate-day-prev',
              )}
            >
              {formatShortDate(weekStart)} – {formatShortDate(weekEnd)}
            </span>
          }
          sublabel={
            weekStart === startOfWeek(q.data?.today ?? today())
              ? 'This week'
              : view === 'day'
                ? formatLongDate(date)
                : undefined
          }
          prevLabel="Previous week"
          nextLabel="Next week"
          onPrev={() => set({ date: addDays(date, -7) })}
          onNext={() => set({ date: addDays(date, 7) })}
          onToday={date !== today() ? () => set({ date: today() }) : undefined}
          pick={{ value: date, onChange: (d) => set({ date: d }) }}
        />
        {view === 'day' && (
          <WeekStrip
            className="rounded-xl border bg-card p-0.5 shadow-e1"
            days={Array.from({ length: 7 }, (_, i) => addDays(weekStart, i))}
            value={date}
            todayDate={q.data?.today ?? today()}
            count={(d) =>
              days.find((x) => x.date === d)?.sessions.filter((x) => !x.cancelled).length ?? 0
            }
            onSelect={(d) => set({ date: d, view: 'day' })}
          />
        )}
      </div>

      {q.isError ? (
        <ErrorState error={q.error} onRetry={() => void q.refetch()} />
      ) : q.isPending ? (
        <Skeleton className="h-[28rem] rounded-2xl" />
      ) : view === 'week' ? (
        <SwipeDays
          dayKey={weekStart}
          direction={dir}
          onStep={(n) => set({ date: addDays(date, 7 * n) })}
          prevLabel="Last week"
          nextLabel="Next week"
        >
          {q.isPlaceholderData ? (
            <Skeleton className="h-[28rem] rounded-2xl" />
          ) : (
            <WeekGrid
              days={days}
              startHour={startHour}
              endHour={endHour}
              todayDate={q.data.today}
              selected={date}
              now={now}
              onOpenDay={(d) => set({ date: d, view: 'day' })}
              onOpenSession={(s, d) => setOpenSession({ s, date: d })}
            />
          )}
        </SwipeDays>
      ) : (
        // Coaches: the day grouped by where they need to be; admins: the same tiles in time order.
        // Swipe (or tap a day) to move between days, across weeks too.
        <Card className="min-w-0 p-2">
          <SwipeDays
            dayKey={date}
            direction={dir}
            onStep={(n) => set({ date: addDays(date, n) })}
            prevLabel={relativeDay(addDays(date, -1))}
            nextLabel={relativeDay(addDays(date, 1))}
          >
            {!selected && q.isPlaceholderData ? (
              <Skeleton className="h-40 rounded-xl" />
            ) : (
              <CoachDayView
                date={date}
                sessions={selected?.sessions ?? []}
                isToday={date === q.data.today}
                isPast={date < q.data.today}
                now={now}
                isAdmin={user.role === 'admin'}
              />
            )}
          </SwipeDays>
        </Card>
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
  now,
}: {
  days: { date: string; sessions: DayOverviewSession[] }[];
  startHour: number;
  endHour: number;
  todayDate: string;
  selected: string;
  onOpenDay: (d: string) => void;
  onOpenSession: (s: DayOverviewSession, date: string) => void;
  /** Minutes since midnight now (IST). */
  now: number;
}) {
  const height = (endHour - startHour) * HOUR_PX;
  const scroller = useRef<HTMLDivElement>(null);
  useFitAboveTabBar(scroller);
  // Open the grid with the current time 30% of the way down the visible area.
  useEffect(() => {
    const el = scroller.current;
    if (!el) return;
    const nowPx = ((now - startHour * 60) / 60) * HOUR_PX;
    el.scrollTop = Math.max(0, nowPx - el.clientHeight * 0.3);
    // Only when the grid opens (a new week remounts it), not on every minute tick.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [startHour]);
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
