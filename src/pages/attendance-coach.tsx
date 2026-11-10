/**
 * Coach attendance: pick the day, (optionally) a place, then one of that day's sessions. Marking
 * is "everyone's here, tap the exceptions": every tap saves at once with an undo, and each
 * student shows their last few sessions so patterns are easy to spot.
 */
import { usePendingMarks } from '@/lib/attendance-outbox';
import { useOnline } from '@/lib/use-online';
import { FloatBadge } from '@/components/floating-badge';
import {
  CalendarDays,
  CheckCheck,
  CheckCircle2,
  Lock,
  MapPin,
  MoreHorizontal,
  RefreshCw,
  Search,
  StickyNote,
  Users,
  WifiOff,
  X,
} from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router';
import { toast } from 'sonner';
import { haptic } from '@/app/native';
import {
  ATTENDANCE_META,
  Avatar,
  EmptyState,
  ErrorState,
  ListSkeleton,
  PageHeader,
} from '@/components/common';
import { PeriodStepper } from '@/components/date-nav';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/controls';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/overlays';
import { Badge, Card, Input, Skeleton } from '@/components/ui/primitives';
import { errorMessage } from '@/lib/api';
import {
  addDays,
  formatLongDate,
  formatShortDate,
  formatTime,
  plural,
  relativeDay,
  today,
} from '@/lib/format';
import {
  type MarkRecord,
  useAttendanceSheet,
  useCalendar,
  useCoachToday,
  useMarkAttendance,
} from '@/lib/queries';
import type { AttendanceSheet, AttendanceStatus, DayOverviewSession } from '@/lib/types';
import { cn } from '@/lib/utils';
import { CancelledBanner, CancelSessionButton, MonthlyRegister } from './attendance-parts';
import { batchTone, minutes, useIstMinutes } from './calendar-meta';
import { CheckInButton } from './today';

type Student = AttendanceSheet['students'][number];

const DOT: Record<AttendanceStatus, string> = {
  present: 'bg-success',
  late: 'bg-warning',
  absent: 'bg-destructive',
  excused: 'bg-info',
};

/** The live session, else the next one, else the last that started, else the first. */
function pickDefault(sessions: DayOverviewSession[], now: number, isToday: boolean) {
  const open = sessions.filter((s) => !s.cancelled);
  if (!open.length) return sessions[0];
  if (!isToday) return open[0];
  return (
    open.find((s) => now >= minutes(s.batch.startTime) && now < minutes(s.batch.endTime)) ??
    open.find((s) => minutes(s.batch.startTime) > now) ??
    open.at(-1)
  );
}

export function CoachAttendance() {
  const [params, setParams] = useSearchParams();
  const date = params.get('date') ?? today();
  const batchId = params.get('batch') ?? '';
  const loc = params.get('loc') ?? '';
  const isToday = date === today();
  const now = useIstMinutes();
  const cal = useCalendar(date, date);
  const set = (patch: Record<string, string>) => {
    const p = new URLSearchParams(params);
    for (const [k, v] of Object.entries(patch)) {
      if (v) p.set(k, v);
      else p.delete(k);
    }
    setParams(p, { replace: true });
  };

  const sessions = useMemo(
    () =>
      [...(cal.data?.days.find((d) => d.date === date)?.sessions ?? [])].sort(
        (a, b) => minutes(a.batch.startTime) - minutes(b.batch.startTime),
      ),
    [cal.data, date],
  );
  const locations = useMemo(() => {
    const m = new Map<string, { id: string; name: string; n: number }>();
    for (const s of sessions) {
      const l = s.batch.location;
      m.set(l.id, { id: l.id, name: l.name, n: (m.get(l.id)?.n ?? 0) + 1 });
    }
    return [...m.values()];
  }, [sessions]);
  const visible = loc ? sessions.filter((s) => s.batch.location.id === loc) : sessions;
  const selected = sessions.find((s) => s.batch.id === batchId);

  // Keep a sensible session selected as the day / place changes.
  const ready = !!cal.data && !cal.isPlaceholderData;
  useEffect(() => {
    if (!ready || !visible.length) return;
    if (selected && visible.includes(selected)) return;
    const pick = pickDefault(visible, now, isToday);
    if (pick && pick.batch.id !== batchId) set({ batch: pick.batch.id });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `set` changes every render
  }, [ready, visible, selected, batchId, now, isToday]);

  return (
    <div className="space-y-2.5">
      <PageHeader title="Attendance" description="Everyone’s present — tap who isn’t." />

      <PeriodStepper
        label={relativeDay(date)}
        sublabel={
          cal.isPending
            ? 'Loading…'
            : `${isToday ? '' : `${formatLongDate(date)} · `}${plural(sessions.length, 'session')}`
        }
        prevLabel="Previous day"
        nextLabel="Next day"
        onPrev={() => set({ date: addDays(date, -1), batch: '' })}
        onNext={() => set({ date: addDays(date, 1), batch: '' })}
        nextDisabled={date >= today()}
        onToday={isToday ? undefined : () => set({ date: today(), batch: '' })}
        pick={{ value: date, max: today(), onChange: (d) => set({ date: d, batch: '' }) }}
      />

      {locations.length > 1 && (
        <div
          role="radiogroup"
          aria-label="Location"
          className="-mx-1 flex [scrollbar-width:none] gap-1.5 overflow-x-auto px-1 pb-0.5"
        >
          {[{ id: '', name: 'All places', n: sessions.length }, ...locations].map((l) => {
            const on = loc === l.id;
            return (
              <button
                key={l.id || 'all'}
                type="button"
                role="radio"
                aria-checked={on}
                onClick={() => set({ loc: l.id })}
                className={cn(
                  'flex h-7 shrink-0 cursor-pointer items-center gap-1 rounded-full border px-2.5 text-[12px] font-medium transition-colors',
                  on
                    ? 'border-primary bg-primary/10 text-primary'
                    : 'bg-card text-muted-foreground hover:text-foreground',
                )}
              >
                {l.id && <MapPin className="size-3" />}
                <span className="max-w-40 truncate">{l.name}</span>
                <span
                  className={cn(
                    'tabular rounded-full px-1 text-[10px] font-bold',
                    on ? 'bg-primary/15' : 'bg-muted',
                  )}
                >
                  {l.n}
                </span>
              </button>
            );
          })}
        </div>
      )}

      {cal.isPending ? (
        <div className="flex gap-2">
          <Skeleton className="h-[4.5rem] w-44 rounded-xl" />
          <Skeleton className="h-[4.5rem] w-44 rounded-xl" />
        </div>
      ) : cal.isError ? (
        <ErrorState error={cal.error} onRetry={() => void cal.refetch()} />
      ) : sessions.length === 0 ? (
        <EmptyState
          icon={<CalendarDays />}
          title={`No sessions ${isToday ? 'today' : `on ${formatShortDate(date)}`}`}
          description="Pick another day to take or check attendance."
        />
      ) : (
        <SessionCards
          sessions={visible}
          selectedId={selected?.batch.id ?? ''}
          isToday={isToday}
          now={now}
          onSelect={(id) => set({ batch: id })}
        />
      )}

      {selected && (
        <Tabs defaultValue="session" key={selected.batch.id}>
          <TabsList className="mb-2">
            <TabsTrigger value="session">Mark</TabsTrigger>
            <TabsTrigger value="register">Monthly register</TabsTrigger>
          </TabsList>
          <TabsContent value="session">
            <CoachSheet key={`${selected.batch.id}:${date}`} session={selected} date={date} />
          </TabsContent>
          <TabsContent value="register">
            <MonthlyRegister batchId={selected.batch.id} />
          </TabsContent>
        </Tabs>
      )}
    </div>
  );
}

function SessionCards({
  sessions,
  selectedId,
  isToday,
  now,
  onSelect,
}: {
  sessions: DayOverviewSession[];
  selectedId: string;
  isToday: boolean;
  now: number;
  onSelect: (id: string) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  // Fade the edges that have more cards behind them, so it reads as scrollable.
  const [edges, setEdges] = useState({ left: false, right: false });
  const measure = () => {
    const el = ref.current;
    if (!el) return;
    setEdges({
      left: el.scrollLeft > 4,
      right: el.scrollLeft + el.clientWidth < el.scrollWidth - 4,
    });
  };
  useEffect(() => {
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, [sessions.length]);
  // Bring the selected card into view.
  useEffect(() => {
    const el = ref.current?.querySelector<HTMLElement>('[aria-checked="true"]');
    el?.scrollIntoView?.({ block: 'nearest', inline: 'nearest', behavior: 'smooth' });
  }, [selectedId]);

  return (
    <div className="relative -mx-1">
      <div
        ref={ref}
        onScroll={measure}
        role="radiogroup"
        aria-label="Session"
        className="flex snap-x scroll-px-1 [scrollbar-width:none] gap-2 overflow-x-auto px-1 pt-2.5 pb-1.5 [&::-webkit-scrollbar]:hidden"
      >
        {sessions.map((s) => {
          const on = s.batch.id === selectedId;
          const live =
            isToday &&
            !s.cancelled &&
            now >= minutes(s.batch.startTime) &&
            now < minutes(s.batch.endTime);
          const pct = s.expectedStudents ? (s.marked / s.expectedStudents) * 100 : 0;
          return (
            <button
              key={s.batch.id}
              type="button"
              role="radio"
              aria-checked={on}
              aria-label={`${s.batch.name}, ${formatTime(s.batch.startTime)}, ${s.batch.location.name}`}
              onClick={() => onSelect(s.batch.id)}
              className={cn(
                // ~2.4 cards per row on phones, so the next one always peeks in.
                'relative flex w-[40%] max-w-48 min-w-36 shrink-0 cursor-pointer snap-start flex-col gap-0.5 rounded-xl border p-2 text-left transition-all duration-200 active:scale-[0.98]',
                on
                  ? 'border-primary bg-primary/8 shadow-e2 ring-1 ring-primary dark:bg-primary/15'
                  : cn(
                      'border-l-4 bg-card shadow-e1 hover:shadow-e2',
                      batchTone(s.batch.id),
                      'bg-card',
                    ),
                s.cancelled && !on && 'opacity-60',
              )}
            >
              {(live || s.cancelled) && (
                <FloatBadge tone={live ? 'on-air' : 'muted'} className="absolute -top-2.5 right-2">
                  {live ? 'Live' : 'Cancelled'}
                </FloatBadge>
              )}
              <span
                className={cn(
                  'tabular text-[10px] font-semibold',
                  on ? 'text-primary' : 'text-muted-foreground',
                )}
              >
                {formatTime(s.batch.startTime)} – {formatTime(s.batch.endTime)}
              </span>
              <span
                className={cn(
                  'truncate text-[13px] leading-tight font-semibold',
                  on ? 'text-primary' : 'text-foreground',
                  s.cancelled && 'line-through',
                )}
              >
                {s.batch.name}
              </span>
              <span
                className={cn(
                  'flex items-center gap-1 truncate text-[10px]',
                  'text-muted-foreground',
                )}
              >
                <MapPin className="size-3 shrink-0" />
                <span className="truncate">{s.batch.location.name}</span>
              </span>
              {!s.cancelled && (
                <span className="mt-0.5 flex items-center gap-1.5">
                  <span
                    className={cn(
                      'h-1 flex-1 overflow-hidden rounded-full',
                      on ? 'bg-primary/15' : 'bg-muted',
                    )}
                  >
                    <span
                      className={cn(
                        'block h-full rounded-full',
                        s.attendanceComplete ? 'bg-success' : 'bg-primary',
                      )}
                      style={{ width: `${pct}%` }}
                    />
                  </span>
                  <span
                    className={cn(
                      'tabular text-[10px] font-semibold',
                      on ? 'text-primary' : 'text-muted-foreground',
                    )}
                  >
                    {s.marked}/{s.expectedStudents}
                  </span>
                  {s.attendanceComplete && (
                    <CheckCircle2
                      aria-label="All marked"
                      className={cn('size-3', 'text-success')}
                    />
                  )}
                </span>
              )}
            </button>
          );
        })}
      </div>
      {edges.left && (
        <span
          aria-hidden
          className="pointer-events-none absolute inset-y-0 left-0 w-6 bg-gradient-to-r from-background to-transparent"
        />
      )}
      {edges.right && (
        <span
          aria-hidden
          className="pointer-events-none absolute inset-y-0 right-0 w-8 bg-gradient-to-l from-background to-transparent"
        />
      )}
    </div>
  );
}

function CoachSheet({ session, date }: { session: DayOverviewSession; date: string }) {
  const batchId = session.batch.id;
  const sheet = useAttendanceSheet(batchId, date);
  const mark = useMarkAttendance(batchId, date);
  const pendingHere = usePendingMarks(batchId, date);
  const online = useOnline();
  const coachToday = useCoachToday(date === today());
  const [query, setQuery] = useState('');
  const [noteFor, setNoteFor] = useState<Student | null>(null);

  if (sheet.isPending) return <ListSkeleton rows={6} />;
  if (sheet.isError) return <ErrorState error={sheet.error} onRetry={() => void sheet.refetch()} />;
  const data = sheet.data;
  if (data.cancelled)
    return <CancelledBanner batchId={batchId} date={date} reason={data.cancelled.reason} />;
  if (data.students.length === 0)
    return (
      <EmptyState
        icon={<Users />}
        title="No students expected"
        description="Nobody in this batch trains on this day, and no makeups are booked."
        action={data.isScheduledDay && <CancelSessionButton batchId={batchId} date={date} />}
      />
    );

  const editable = data.editable;
  const { summary } = data;
  const marked = summary.total - summary.unmarked;
  const unmarked = data.students.filter((s) => !s.status);
  const todayItem = coachToday.data?.sessions.find((t) => t.batch.id === batchId);
  const waiting = pendingHere;

  /** Save, then offer to put things back exactly as they were. */
  function save(records: MarkRecord[], message: string, before: Student[]) {
    haptic();
    mark.mutate(records, {
      onSuccess: (res) =>
        toast(res?.queued ? `${message} · saved on this phone` : message, {
          id: `att-${batchId}`,
          duration: 4000,
          action: {
            label: 'Undo',
            onClick: () =>
              mark.mutate(
                before.map((s) => ({ studentId: s.studentId, status: s.status, note: s.note })),
                { onError: (e) => toast.error('Could not undo', { description: errorMessage(e) }) },
              ),
          },
        }),
      onError: (e) => toast.error('Not saved', { description: errorMessage(e) }),
    });
  }
  const setStatus = (s: Student, status: AttendanceStatus | null) =>
    save(
      [{ studentId: s.studentId, status, note: status ? s.note : null }],
      status ? `${s.fullName} · ${ATTENDANCE_META[status].label}` : `${s.fullName} · mark cleared`,
      [s],
    );
  // One tap: unmarked → present → absent → present. Late / excused go back to present.
  const toggle = (s: Student) => setStatus(s, s.status === 'present' ? 'absent' : 'present');
  const allPresent = () =>
    save(
      unmarked.map((s) => ({ studentId: s.studentId, status: 'present', note: s.note })),
      `${plural(unmarked.length, 'student')} marked present`,
      unmarked,
    );

  const q = query.trim().toLowerCase();
  const rows = q
    ? data.students.filter(
        (s) => s.fullName.toLowerCase().includes(q) || s.code.toLowerCase().includes(q),
      )
    : data.students;

  return (
    <div className="space-y-2">
      {/* No signal: marks are kept on the phone and sync when the connection is back. */}
      {(!online || waiting > 0) && (
        <div
          role="status"
          className={cn(
            'flex items-center gap-2 rounded-xl border px-2.5 py-2 text-[12px] leading-snug',
            online ? 'border-primary/25 bg-primary/5' : 'border-warning/40 bg-warning/12',
          )}
        >
          {online ? (
            <RefreshCw className="size-4 shrink-0 animate-spin text-primary" />
          ) : (
            <WifiOff className="size-4 shrink-0 text-warning-foreground dark:text-warning" />
          )}
          <p className="min-w-0 flex-1">
            {online ? (
              <>
                <b className="font-semibold">
                  Syncing {waiting} mark{waiting === 1 ? '' : 's'}
                </b>{' '}
                taken while offline…
              </>
            ) : (
              <>
                <b className="font-semibold">No connection.</b> Keep marking: marks are saved on
                this phone{waiting ? ` (${waiting} waiting)` : ''} and sync when you’re back online.
              </>
            )}
          </p>
        </div>
      )}
      {data.needsCheckIn ? (
        <div
          role="status"
          className="flex items-center gap-2 rounded-xl border border-primary/25 bg-accent/60 px-2.5 py-2"
        >
          <MapPin className="size-4 shrink-0 text-primary" />
          <p className="min-w-0 flex-1 text-[12px] leading-snug">
            <b className="font-semibold">Check in to mark attendance.</b>{' '}
            <span className="text-muted-foreground">It unlocks at the batch location.</span>
          </p>
          {todayItem && <CheckInButton item={todayItem} overview={session} compact />}
        </div>
      ) : (
        !editable && (
          <p className="flex items-center gap-2 rounded-xl border bg-muted/50 px-2.5 py-2 text-[12px] text-muted-foreground">
            <Lock className="size-3.5 shrink-0" />
            {data.lockedReason ??
              'This session is locked for editing. Admins can correct older records.'}
          </p>
        )
      )}

      {/* Progress, counts and the one-tap action in a single slim card. */}
      <Card className="space-y-1.5 px-2.5 py-2">
        <div className="flex items-center gap-2">
          <p className="shrink-0 text-[12px] font-semibold">
            <span className="tabular">{marked}</span>/
            <span className="tabular">{summary.total}</span>{' '}
            <span className="font-normal text-muted-foreground">marked</span>
          </p>
          <div className="flex h-1.5 min-w-0 flex-1 overflow-hidden rounded-full bg-muted">
            {(['present', 'late', 'excused', 'absent'] as const).map((k) =>
              summary[k] ? (
                <span
                  key={k}
                  className={cn('h-full', DOT[k])}
                  style={{ width: `${(summary[k] / summary.total) * 100}%` }}
                />
              ) : null,
            )}
          </div>
          {editable && marked === 0 && data.isScheduledDay && (
            <CancelSessionButton batchId={batchId} date={date} compact />
          )}
          {editable && unmarked.length > 0 ? (
            <Button
              variant="success"
              size="sm"
              className="h-7 gap-1 rounded-lg px-2.5 text-[11px] pointer-coarse:h-7 pointer-coarse:text-[11px] [&_svg:not([class*=size-])]:size-3.5"
              loading={mark.isPending}
              onClick={allPresent}
              aria-label={
                marked === 0
                  ? `Mark all ${unmarked.length} present`
                  : `Mark remaining ${unmarked.length} present`
              }
            >
              <CheckCheck />
              {marked === 0 ? 'All present' : `Rest present · ${unmarked.length}`}
            </Button>
          ) : (
            editable && (
              <span className="flex shrink-0 items-center gap-1 text-[11px] font-semibold text-success">
                <CheckCircle2 className="size-3.5" /> Done
              </span>
            )
          )}
        </div>
        <div className="flex items-center gap-2.5 text-[10px] text-muted-foreground">
          {(['present', 'late', 'absent', 'excused'] as const).map((k) => (
            <span key={k} className="inline-flex items-center gap-1">
              <span className={cn('size-1.5 rounded-full', DOT[k])} />
              {ATTENDANCE_META[k].label}
              <b className="tabular text-foreground">{summary[k]}</b>
            </span>
          ))}
        </div>
      </Card>

      {data.students.length > 10 && (
        <div className="relative">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            aria-label="Find a student"
            placeholder="Find a student"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="pl-8"
          />
          {query && (
            <button
              type="button"
              aria-label="Clear search"
              onClick={() => setQuery('')}
              className="absolute top-1/2 right-2 -translate-y-1/2 cursor-pointer rounded p-1 text-muted-foreground"
            >
              <X className="size-3.5" />
            </button>
          )}
        </div>
      )}

      <Card className="divide-y overflow-hidden">
        {rows.length === 0 && (
          <p className="p-4 text-center text-[13px] text-muted-foreground">No one matches.</p>
        )}
        {rows.map((s) => (
          <StudentRow
            key={s.studentId}
            s={s}
            editable={editable}
            onToggle={() => toggle(s)}
            onSet={(st) => setStatus(s, st)}
            onNote={() => setNoteFor(s)}
          />
        ))}
      </Card>

      <NoteDialog
        student={noteFor}
        onClose={() => setNoteFor(null)}
        onSave={(s, note) => {
          save(
            [{ studentId: s.studentId, status: s.status, note }],
            `Note saved for ${s.fullName}`,
            [s],
          );
          setNoteFor(null);
        }}
      />
    </div>
  );
}

function StudentRow({
  s,
  editable,
  onToggle,
  onSet,
  onNote,
}: {
  s: Student;
  editable: boolean;
  onToggle: () => void;
  onSet: (st: AttendanceStatus | null) => void;
  onNote: () => void;
}) {
  const navigate = useNavigate();
  const meta = s.status ? ATTENDANCE_META[s.status] : null;
  const recent = [...(s.recent ?? [])].reverse(); // oldest → newest, left to right
  const low = s.rate30 !== null && s.rate30 !== undefined && s.rate30 < 60;
  return (
    <div
      className={cn(
        'flex items-center gap-2 px-2 py-1.5 transition-colors',
        s.status === 'absent' && 'bg-destructive/5',
      )}
    >
      <button
        type="button"
        disabled={!editable}
        onClick={onToggle}
        aria-label={`${s.fullName}: ${meta?.label ?? 'not marked'}${editable ? '. Tap to change' : ''}`}
        className="flex min-w-0 flex-1 cursor-pointer items-center gap-2 rounded-lg text-left disabled:cursor-default"
      >
        <Avatar
          name={s.fullName}
          className={cn('size-8', meta && 'ring-2 ring-offset-1 ring-offset-card', {
            'ring-success': s.status === 'present',
            'ring-warning': s.status === 'late',
            'ring-destructive': s.status === 'absent',
            'ring-info': s.status === 'excused',
          })}
        />
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-1.5">
            <span className="truncate text-[13px] font-medium">{s.fullName}</span>
            {s.isMakeup && (
              <Badge variant="warning" className="h-4 px-1 text-[9px]">
                Makeup
              </Badge>
            )}
          </span>
          <span className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
            {recent.length > 0 ? (
              <span
                className="flex items-center gap-0.5"
                title={recent
                  .map((r) => `${formatShortDate(r.date)}: ${ATTENDANCE_META[r.status].label}`)
                  .join('\n')}
                aria-label={`Last ${recent.length}: ${recent.map((r) => ATTENDANCE_META[r.status].label).join(', ')}`}
              >
                {recent.map((r) => (
                  <span key={r.date} className={cn('size-1.5 rounded-full', DOT[r.status])} />
                ))}
              </span>
            ) : (
              <span>New</span>
            )}
            {s.rate30 !== null && s.rate30 !== undefined && (
              <span className={cn('tabular', low && 'font-semibold text-destructive')}>
                {s.rate30}% · 30d
              </span>
            )}
            {s.note && (
              <span className="flex min-w-0 items-center gap-0.5 text-primary">
                <StickyNote className="size-3 shrink-0" />
                <span className="truncate">{s.note}</span>
              </span>
            )}
          </span>
        </span>
        <span
          aria-hidden
          className={cn(
            'flex h-7 w-[4.5rem] shrink-0 items-center justify-center rounded-lg border text-[11px] font-semibold transition-colors',
            meta ? meta.active : 'border-dashed text-muted-foreground',
          )}
        >
          {meta?.label ?? 'Tap'}
        </span>
      </button>
      {editable && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              aria-label={`More for ${s.fullName}`}
              className="flex size-7 shrink-0 cursor-pointer items-center justify-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground"
            >
              <MoreHorizontal className="size-4" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {(['present', 'late', 'absent', 'excused'] as const).map((k) => (
              <DropdownMenuItem key={k} onSelect={() => onSet(k)}>
                <span className={cn('size-2 rounded-full', DOT[k])} />
                {ATTENDANCE_META[k].label}
                {s.status === k && <CheckCircle2 className="ml-auto size-3.5" />}
              </DropdownMenuItem>
            ))}
            <DropdownMenuSeparator />
            <DropdownMenuItem disabled={!s.status} onSelect={onNote}>
              <StickyNote /> {s.note ? 'Edit note' : 'Add note'}
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => void navigate(`/students/${s.studentId}`)}>
              <Users /> Open student
            </DropdownMenuItem>
            {s.status && (
              <DropdownMenuItem onSelect={() => onSet(null)}>
                <X /> Clear mark
              </DropdownMenuItem>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      )}
    </div>
  );
}

function NoteDialog({
  student,
  onClose,
  onSave,
}: {
  student: Student | null;
  onClose: () => void;
  onSave: (s: Student, note: string | null) => void;
}) {
  const [text, setText] = useState('');
  const [for_, setFor] = useState<string | null>(null);
  if (student && for_ !== student.studentId) {
    setFor(student.studentId);
    setText(student.note ?? '');
  }
  return (
    <Dialog open={!!student} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Note for {student?.fullName}</DialogTitle>
          <DialogDescription>Shown on this session’s record.</DialogDescription>
        </DialogHeader>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (student) onSave(student, text.trim() || null);
          }}
          className="space-y-3"
        >
          <Input
            autoFocus
            aria-label="Note"
            maxLength={500}
            placeholder="e.g. left early, minor injury"
            value={text}
            onChange={(e) => setText(e.target.value)}
          />
          <div className="flex flex-wrap gap-1">
            {['Left early', 'Came late', 'Minor injury', 'Not well'].map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setText(t)}
                className="h-6 cursor-pointer rounded-full border px-2 text-[11px] text-muted-foreground hover:text-foreground"
              >
                {t}
              </button>
            ))}
          </div>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit">Save note</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
