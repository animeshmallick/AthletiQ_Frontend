/**
 * Attendance (coaches and admins): a day at a time, each session a collapsible card. Marking is
 * one tap per student (P / A / L / E): every tap saves at once with an undo, and each student
 * shows their last few sessions so patterns are easy to spot.
 */
import { usePendingMarks } from '@/lib/attendance-outbox';
import { useOnline } from '@/lib/use-online';
import { FloatBadge } from '@/components/floating-badge';
import {
  AttendanceSummary,
  AttendanceTrail,
  type AttendanceFilter,
  countMarks,
  matchesFilter,
  StatusToggle,
} from '@/components/attendance-kit';
import {
  CalendarDays,
  ChevronDown,
  CheckCheck,
  CheckCircle2,
  Lock,
  MapPin,
  MoreVertical,
  TableProperties,
  RefreshCw,
  StickyNote,
  Users,
  WifiOff,
  X,
} from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router';
import { Accordion } from 'radix-ui';
import { useUser } from '@/app/auth';
import { Floating } from '@/components/floating-badge';
import { SwipeDays } from '@/components/swipe-days';
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
import { Badge, Card, Input } from '@/components/ui/primitives';
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

/**
 * Attendance for coaches and admins alike: one day at a time (swipe or use the arrows), every
 * session of that day as a collapsible card. Today opens the live / next session.
 */
export function AttendanceDay() {
  const isAdmin = useUser().role === 'admin';
  const [params, setParams] = useSearchParams();
  const date = params.get('date') ?? today();
  const batchParam = params.get('batch') ?? '';
  const isToday = date === today();
  const now = useIstMinutes();
  const cal = useCalendar(date, date);
  const [direction, setDirection] = useState<1 | -1 | 0>(0);
  const [open, setOpen] = useState('');
  const openedFor = useRef<string | null>(null);

  const go = (d: string) => {
    if (d > today() || d === date) return;
    setDirection(d > date ? 1 : -1);
    const p = new URLSearchParams(params);
    p.set('date', d);
    p.delete('batch');
    setParams(p, { replace: true });
  };

  const sessions = useMemo(
    () =>
      [...(cal.data?.days.find((d) => d.date === date)?.sessions ?? [])].sort(
        (a, b) => minutes(a.batch.startTime) - minutes(b.batch.startTime),
      ),
    [cal.data, date],
  );

  // Once per day: open the session asked for (a link with ?batch=), else today's live / next one.
  const ready = !!cal.data && !cal.isPlaceholderData;
  useEffect(() => {
    if (!ready || openedFor.current === date) return;
    openedFor.current = date;
    const asked = sessions.find((s) => s.batch.id === batchParam);
    const pick = asked ?? (isToday ? pickDefault(sessions, now, true) : undefined);
    setOpen(pick?.batch.id ?? '');
  }, [ready, date, sessions, batchParam, isToday, now]);

  const marked = sessions.reduce((n, s) => n + (s.cancelled ? 0 : s.marked), 0);
  const expected = sessions.reduce((n, s) => n + (s.cancelled ? 0 : s.expectedStudents), 0);

  return (
    <div className="space-y-1.5">
      <PageHeader
        className="mb-0.5 sm:mb-2"
        title="Attendance"
        description="Tap P, A, L or E for each student. Every tap saves."
      />

      <PeriodStepper
        label={relativeDay(date)}
        sublabel={
          cal.isPending
            ? 'Loading…'
            : `${isToday ? '' : `${formatLongDate(date)} · `}${plural(sessions.length, 'session')}${
                expected ? ` · ${marked}/${expected} marked` : ''
              }`
        }
        prevLabel="Previous day"
        nextLabel="Next day"
        onPrev={() => go(addDays(date, -1))}
        onNext={() => go(addDays(date, 1))}
        nextDisabled={date >= today()}
        onToday={isToday ? undefined : () => go(today())}
        pick={{ value: date, max: today(), onChange: go }}
      />

      <SwipeDays
        dayKey={date}
        direction={direction}
        onStep={(n) => go(addDays(date, n))}
        prevLabel="Previous day"
        nextLabel={isToday ? 'Today' : 'Next day'}
      >
        {cal.isPending ? (
          <ListSkeleton rows={3} />
        ) : cal.isError ? (
          <ErrorState error={cal.error} onRetry={() => void cal.refetch()} />
        ) : sessions.length === 0 ? (
          <EmptyState
            icon={<CalendarDays />}
            title={`No sessions ${isToday ? 'today' : `on ${formatShortDate(date)}`}`}
            description="Swipe or use the arrows to see another day."
          />
        ) : (
          <Accordion.Root
            type="single"
            collapsible
            value={open}
            onValueChange={setOpen}
            className="space-y-1.5 pt-1"
          >
            {sessions.map((s) => (
              <SessionItem
                key={s.batch.id}
                s={s}
                date={date}
                live={
                  isToday &&
                  !s.cancelled &&
                  now >= minutes(s.batch.startTime) &&
                  now < minutes(s.batch.endTime)
                }
                isAdmin={isAdmin}
              />
            ))}
          </Accordion.Root>
        )}
      </SwipeDays>
    </div>
  );
}

/** One session: collapsed to its time, name, place and progress; open to mark it. */
function SessionItem({
  s,
  date,
  live,
  isAdmin,
}: {
  s: DayOverviewSession;
  date: string;
  live: boolean;
  isAdmin: boolean;
}) {
  const [register, setRegister] = useState(false);
  const left = s.expectedStudents - s.marked;
  const pct = s.expectedStudents ? (s.marked / s.expectedStudents) * 100 : 0;
  const badge = s.cancelled ? (
    <FloatBadge tone="muted">Cancelled</FloatBadge>
  ) : live ? (
    <FloatBadge tone="on-air">Live</FloatBadge>
  ) : s.expectedStudents === 0 ? null : s.attendanceComplete ? (
    <FloatBadge tone="success">All marked</FloatBadge>
  ) : s.marked > 0 ? (
    <FloatBadge tone="pending">{left} to mark</FloatBadge>
  ) : null;
  return (
    <Floating badges={badge}>
      <Accordion.Item
        value={s.batch.id}
        className={cn(
          'overflow-hidden rounded-xl border border-l-4 bg-card shadow-e1',
          batchTone(s.batch.id),
          s.cancelled && 'opacity-75',
        )}
      >
        <Accordion.Header>
          <Accordion.Trigger className="group grid w-full cursor-pointer grid-cols-[3.75rem_minmax(0,1fr)_auto] items-center gap-x-2 px-2 py-1.5 text-left hover:bg-muted/40">
            <span className="tabular leading-tight">
              <span className="block text-[12.5px] font-bold">{formatTime(s.batch.startTime)}</span>
              <span className="block text-[10px] text-muted-foreground">
                to {formatTime(s.batch.endTime)}
              </span>
            </span>
            <span className="min-w-0 leading-tight">
              <span
                className={cn(
                  'block truncate text-[13.5px] font-semibold',
                  s.cancelled && 'line-through',
                )}
              >
                {s.batch.name}
              </span>
              <span className="flex min-w-0 items-center gap-1 text-[11px] text-muted-foreground">
                <MapPin className="size-3 shrink-0" />
                <span className="truncate">
                  {s.batch.location.name}
                  {isAdmin ? ` · ${s.batch.coach.name}` : ''}
                </span>
              </span>
            </span>
            <span className="flex items-center gap-1.5">
              {!s.cancelled && s.expectedStudents > 0 && (
                <span className="flex w-11 flex-col items-end gap-0.5">
                  <span
                    className={cn(
                      'tabular text-[11px] font-semibold',
                      s.attendanceComplete ? 'text-success' : 'text-foreground/80',
                    )}
                  >
                    {s.marked}/{s.expectedStudents}
                  </span>
                  <span className="h-1 w-full overflow-hidden rounded-full bg-muted">
                    <span
                      className={cn(
                        'block h-full rounded-full',
                        s.attendanceComplete ? 'bg-success' : 'bg-primary',
                      )}
                      style={{ width: `${pct}%` }}
                    />
                  </span>
                </span>
              )}
              <ChevronDown className="size-4 shrink-0 text-muted-foreground transition-transform group-data-[state=open]:rotate-180" />
            </span>
          </Accordion.Trigger>
        </Accordion.Header>
        <Accordion.Content className="space-y-1 border-t bg-muted/15 p-1">
          <CoachSheet key={`${s.batch.id}:${date}`} session={s} date={date} />
          <button
            type="button"
            onClick={() => setRegister(true)}
            className="flex w-full cursor-pointer items-center justify-center gap-1 rounded-lg py-1 text-[11.5px] font-medium text-primary hover:bg-primary/5"
          >
            <TableProperties className="size-3.5" /> Monthly register
          </button>
        </Accordion.Content>
      </Accordion.Item>
      <Dialog open={register} onOpenChange={setRegister}>
        <DialogContent className="sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle>Monthly register</DialogTitle>
            <DialogDescription>{s.batch.name}: every session this month.</DialogDescription>
          </DialogHeader>
          {register && <MonthlyRegister batchId={s.batch.id} />}
        </DialogContent>
      </Dialog>
    </Floating>
  );
}

function CoachSheet({ session, date }: { session: DayOverviewSession; date: string }) {
  const batchId = session.batch.id;
  const sheet = useAttendanceSheet(batchId, date);
  const mark = useMarkAttendance(batchId, date);
  const pendingHere = usePendingMarks(batchId, date);
  const online = useOnline();
  const isCoach = useUser().role === 'coach';
  const coachToday = useCoachToday(isCoach && date === today());
  const [noteFor, setNoteFor] = useState<Student | null>(null);
  const [filter, setFilter] = useState<AttendanceFilter>('all');

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
  const marked = data.students.filter((s) => s.status).length;
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
  const allPresent = () =>
    save(
      unmarked.map((s) => ({ studentId: s.studentId, status: 'present', note: s.note })),
      `${plural(unmarked.length, 'student')} marked present`,
      unmarked,
    );

  const counts = countMarks(data.students.map((s) => s.status));
  const rows = data.students.filter((s) => matchesFilter(s.status, filter));

  return (
    <div className="space-y-1.5">
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

      {/* Progress and counts; the counts filter the list. */}
      <AttendanceSummary
        counts={counts}
        filter={filter}
        onFilter={setFilter}
        actions={
          <>
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
                  <CheckCircle2 className="size-3.5" /> All marked
                </span>
              )
            )}
          </>
        }
      />

      <Card className="divide-y overflow-hidden">
        {rows.length === 0 && (
          <p className="p-4 text-center text-[13px] text-muted-foreground">
            {filter === 'unmarked' ? 'Everyone is marked.' : 'No one here.'}
          </p>
        )}
        {rows.map((s) => (
          <StudentRow
            key={s.studentId}
            s={s}
            editable={editable}
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
  onSet,
  onNote,
}: {
  s: Student;
  editable: boolean;
  onSet: (st: AttendanceStatus | null) => void;
  onNote: () => void;
}) {
  const navigate = useNavigate();
  return (
    <div
      className={cn(
        'flex items-center gap-1.5 py-1.5 pr-1 pl-1.5 transition-colors',
        s.status === 'absent' && 'bg-destructive/[0.04]',
      )}
    >
      <Avatar
        name={s.fullName}
        className={cn('size-7 text-[10px]', s.status && 'ring-2 ring-offset-1 ring-offset-card', {
          'ring-success': s.status === 'present',
          'ring-warning': s.status === 'late',
          'ring-destructive': s.status === 'absent',
          'ring-info': s.status === 'excused',
        })}
      />
      <div className="min-w-0 flex-1 leading-tight">
        <p className="flex items-center gap-1.5">
          <span className="truncate text-[13px] font-medium">{s.fullName}</span>
          {s.isMakeup && (
            <Badge variant="warning" className="h-4 px-1 text-[9px]">
              Makeup
            </Badge>
          )}
        </p>
        <p className="mt-0.5 flex items-center gap-1.5 text-[10px] text-muted-foreground">
          <AttendanceTrail recent={s.recent} rate30={s.rate30} />
          {s.note && (
            <span className="flex min-w-0 items-center gap-0.5 text-primary">
              <StickyNote className="size-3 shrink-0" />
              <span className="truncate">{s.note}</span>
            </span>
          )}
        </p>
      </div>
      <StatusToggle value={s.status} onChange={onSet} disabled={!editable} name={s.fullName} />
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            aria-label={`More for ${s.fullName}`}
            className="-mr-1 flex h-7 w-5 shrink-0 cursor-pointer items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <MoreVertical className="size-4" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          {editable && (
            <DropdownMenuItem disabled={!s.status} onSelect={onNote}>
              <StickyNote /> {s.note ? 'Edit note' : 'Add note'}
            </DropdownMenuItem>
          )}
          <DropdownMenuItem onSelect={() => void navigate(`/students/${s.studentId}`)}>
            <Users /> Open student
          </DropdownMenuItem>
          {editable && s.status && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem onSelect={() => onSet(null)}>
                <X /> Clear mark
              </DropdownMenuItem>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
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
