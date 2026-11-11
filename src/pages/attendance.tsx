import {
  Repeat,
  CalendarCheck2,
  CalendarX2,
  CheckCheck,
  Lock,
  MapPin,
  RotateCcw,
  Save,
  StickyNote,
  Users,
} from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import {
  ATTENDANCE_META,
  Avatar,
  EmptyState,
  ErrorState,
  ListSkeleton,
  PageHeader,
} from '@/components/common';
import { BatchSelect, DateStepper, useBatchDateParams } from '@/components/pickers';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/controls';
import { Badge, Card, Input } from '@/components/ui/primitives';
import { errorMessage } from '@/lib/api';
import { formatShortDate, isoWeekday, today, WEEKDAYS } from '@/lib/format';
import { useAttendanceSheet, useSaveAttendance } from '@/lib/queries';
import type { AttendanceStatus } from '@/lib/types';
import { cn } from '@/lib/utils';
import { haptic } from '@/app/native';
import { useUser } from '@/app/auth';
import { CoachAttendance } from './attendance-coach';
import { CancelledBanner, CancelSessionButton, MonthlyRegister } from './attendance-parts';
import { Link } from 'react-router';

const STATUSES: AttendanceStatus[] = ['present', 'absent', 'late', 'excused'];

type Draft = Record<string, { status: AttendanceStatus | null; note: string | null }>;

function StatusToggle({
  value,
  onChange,
  disabled,
}: {
  value: AttendanceStatus | null;
  onChange: (s: AttendanceStatus) => void;
  disabled: boolean;
}) {
  return (
    <div role="radiogroup" aria-label="Attendance status" className="flex shrink-0 gap-1">
      {STATUSES.map((s) => {
        const meta = ATTENDANCE_META[s];
        const active = value === s;
        return (
          <button
            key={s}
            type="button"
            role="radio"
            aria-checked={active}
            aria-label={meta.label}
            title={meta.label}
            disabled={disabled}
            onClick={() => {
              haptic();
              onChange(s);
            }}
            className={cn(
              'flex h-8 w-8 cursor-pointer items-center justify-center rounded-lg border text-[12px] font-bold transition-all active:scale-[0.94] disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto sm:px-2.5 sm:text-[12.5px] sm:font-semibold',
              active
                ? meta.active
                : 'bg-card text-muted-foreground hover:border-foreground/30 hover:text-foreground',
            )}
          >
            {/* Phones: the first letter (P, L, A, E); wider screens: the word. */}
            <span className="sm:hidden">{meta.label[0]}</span>
            <span className="hidden sm:inline">{meta.label}</span>
          </button>
        );
      })}
    </div>
  );
}

function SessionSheet({ batchId, date }: { batchId: string; date: string }) {
  const sheet = useAttendanceSheet(batchId, date);
  const save = useSaveAttendance();
  const [draft, setDraft] = useState<Draft>({});
  const [openNote, setOpenNote] = useState<string | null>(null);

  // Re-sync local edits only when the *saved* marks change (not on every background refetch),
  // so unsaved taps are never wiped.
  const serverKey =
    sheet.data?.students.map((s) => `${s.studentId}:${s.status}:${s.note}`).join('|') ?? '';
  const [syncedKey, setSyncedKey] = useState<string | null>(null);
  if (sheet.data && serverKey !== syncedKey) {
    setSyncedKey(serverKey);
    setDraft(
      Object.fromEntries(
        sheet.data.students.map((s) => [s.studentId, { status: s.status, note: s.note }]),
      ),
    );
  }

  const changed = useMemo(() => {
    if (!sheet.data) return [];
    return sheet.data.students.filter((s) => {
      const d = draft[s.studentId];
      return d && d.status && (d.status !== s.status || (d.note ?? null) !== (s.note ?? null));
    });
  }, [draft, sheet.data]);

  const counts = useMemo(() => {
    const c = { present: 0, late: 0, absent: 0, excused: 0, unmarked: 0 };
    for (const d of Object.values(draft)) {
      if (d.status) c[d.status]++;
      else c.unmarked++;
    }
    return c;
  }, [draft]);

  if (sheet.isPending) return <ListSkeleton rows={6} />;
  if (sheet.isError) return <ErrorState error={sheet.error} onRetry={() => void sheet.refetch()} />;
  const data = sheet.data;
  const editable = data.editable;
  const nothingMarked = data.students.every((s) => s.status === null);

  if (data.cancelled)
    return <CancelledBanner batchId={batchId} date={date} reason={data.cancelled.reason} />;

  if (!data.isScheduledDay && data.students.length === 0) {
    return (
      <EmptyState
        icon={<CalendarX2 />}
        title={`No session on ${WEEKDAYS[isoWeekday(date) - 1]?.long}`}
        description="This batch does not run on the selected day."
      />
    );
  }
  if (data.students.length === 0) {
    return (
      <EmptyState
        icon={<Users />}
        title="No students expected"
        description="Nobody in this batch trains on this day, and no makeups are booked."
        action={data.isScheduledDay && <CancelSessionButton batchId={batchId} date={date} />}
      />
    );
  }

  const setStatus = (id: string, status: AttendanceStatus) =>
    setDraft((d) => ({ ...d, [id]: { status, note: d[id]?.note ?? null } }));
  const markAll = (status: AttendanceStatus, onlyUnmarked: boolean) =>
    setDraft((d) =>
      Object.fromEntries(
        Object.entries(d).map(([id, v]) => [
          id,
          onlyUnmarked && v.status ? v : { status, note: v.note },
        ]),
      ),
    );

  async function submit() {
    try {
      const res = await save.mutateAsync({
        batchId,
        date,
        records: changed.map((s) => ({
          studentId: s.studentId,
          status: draft[s.studentId]!.status!,
          note: draft[s.studentId]!.note,
        })),
      });
      toast.success(`Attendance saved for ${res.saved} student${res.saved === 1 ? '' : 's'}`);
    } catch (err) {
      toast.error('Could not save attendance', { description: errorMessage(err) });
    }
  }

  return (
    <div className="space-y-3">
      {data.needsCheckIn ? (
        <div
          role="status"
          className="flex flex-wrap items-center gap-3 rounded-xl border border-primary/25 bg-accent/60 px-3.5 py-3"
        >
          <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-primary/12 text-primary">
            <MapPin className="size-4.5" />
          </span>
          <span className="min-w-0 flex-1 text-[13px] leading-snug">
            <b className="block text-sm font-semibold">Check in to mark attendance</b>
            <span className="text-muted-foreground">
              Attendance unlocks once you check in at the batch location.
            </span>
          </span>
          {date === today() && (
            <Button size="sm" asChild className="w-full sm:w-auto">
              <Link to="/">
                <MapPin /> Check in now
              </Link>
            </Button>
          )}
        </div>
      ) : (
        !editable && (
          <div className="flex items-center gap-2 rounded-xl border bg-muted/50 px-3 py-2.5 text-[13px] text-muted-foreground">
            <Lock className="size-4 shrink-0" />
            {data.lockedReason ??
              'This session is locked for editing. Admins can correct older records.'}
          </div>
        )
      )}

      <div className="flex flex-wrap items-center justify-between gap-1.5">
        <div className="flex flex-wrap gap-1 text-xs [&_[data-slot=badge]]:px-1.5">
          {STATUSES.map((s) => (
            <Badge
              key={s}
              variant="outline"
              className={cn('tabular gap-1.5', ATTENDANCE_META[s].className)}
            >
              {ATTENDANCE_META[s].label} {counts[s]}
            </Badge>
          ))}
          {counts.unmarked > 0 && <Badge variant="muted">Unmarked {counts.unmarked}</Badge>}
        </div>
        {editable && (
          <div className="flex flex-wrap gap-1.5 [&_button]:h-8 [&_button]:px-2.5 [&_button]:text-[12px]">
            {nothingMarked && data.isScheduledDay && (
              <CancelSessionButton batchId={batchId} date={date} />
            )}
            <Button variant="outline" size="sm" onClick={() => markAll('present', true)}>
              <CheckCheck /> Rest present
            </Button>
            <Button variant="outline" size="sm" onClick={() => markAll('present', false)}>
              All present
            </Button>
          </div>
        )}
      </div>

      <Card className="divide-y overflow-hidden">
        {data.students.map((s) => {
          const d = draft[s.studentId];
          return (
            <div key={s.studentId} className="px-2 py-1.5">
              <div className="flex items-center gap-2">
                <Avatar name={s.fullName} className="size-7 text-[10px]" />
                <div className="min-w-0 flex-1 leading-tight">
                  <p className="truncate text-[13.5px] font-medium">{s.fullName}</p>
                  <p className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                    {s.code}
                    {s.isMakeup && (
                      <Badge variant="default" className="px-1.5 py-0 text-[10px]">
                        Makeup
                      </Badge>
                    )}
                  </p>
                </div>
                <StatusToggle
                  value={d?.status ?? null}
                  onChange={(st) => setStatus(s.studentId, st)}
                  disabled={!editable}
                />
                <button
                  type="button"
                  aria-label={`Note for ${s.fullName}`}
                  onClick={() => setOpenNote((o) => (o === s.studentId ? null : s.studentId))}
                  className={cn(
                    'flex size-8 shrink-0 cursor-pointer items-center justify-center rounded-lg text-muted-foreground hover:bg-muted',
                    d?.note && 'text-primary',
                  )}
                >
                  <StickyNote className="size-4" />
                </button>
              </div>
              {(openNote === s.studentId || d?.note) && (
                <Input
                  className="mt-1.5 h-8 text-[13px]"
                  placeholder="Add a note (e.g. left early, minor injury)…"
                  value={d?.note ?? ''}
                  disabled={!editable}
                  onChange={(e) =>
                    setDraft((x) => ({
                      ...x,
                      [s.studentId]: {
                        status: x[s.studentId]?.status ?? null,
                        note: e.target.value || null,
                      },
                    }))
                  }
                />
              )}
            </div>
          );
        })}
      </Card>

      {/* Sticky save bar */}
      {editable && changed.length > 0 && (
        <div className="fixed inset-x-0 bottom-[calc(4rem+env(safe-area-inset-bottom))] z-20 animate-rise px-3 lg:bottom-6 lg:left-64">
          <div className="mx-auto flex max-w-xl items-center gap-3 rounded-2xl border bg-card p-3 shadow-xl">
            <p className="flex-1 text-sm">
              <span className="font-semibold">{changed.length}</span> unsaved change
              {changed.length === 1 ? '' : 's'}
            </p>
            <Button
              variant="ghost"
              size="sm"
              onClick={() =>
                setDraft(
                  Object.fromEntries(
                    data.students.map((s) => [s.studentId, { status: s.status, note: s.note }]),
                  ),
                )
              }
            >
              <RotateCcw /> Undo
            </Button>
            <Button size="sm" loading={save.isPending} onClick={() => void submit()}>
              <Save /> Save attendance
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

export function AttendancePage() {
  const user = useUser();
  return user.role === 'coach' ? <CoachAttendance /> : <AdminAttendance />;
}

/** Admins: any batch, any day, with a save bar for corrections. */
function AdminAttendance() {
  const { batches, batchId, date, batch, setBatch, setDate } = useBatchDateParams();
  const runsToday = batch ? batch.weekdays.includes(isoWeekday(date)) : true;
  // A substitute only works the batch on the days they cover (and never ahead of today).
  const cover = batch?.substitution ?? null;
  const minDate = cover?.fromDate;
  const maxDate = cover && cover.toDate < today() ? cover.toDate : today();
  const clamped = minDate && date < minDate ? minDate : cover && date > maxDate ? maxDate : date;
  useEffect(() => {
    if (clamped !== date) setDate(clamped);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- setDate changes every render
  }, [clamped, date]);

  return (
    <div>
      <PageHeader
        title="Attendance"
        description="Mark who showed up. Changes save in one tap — even on a slow connection."
      />
      <div className="mb-3 flex flex-col gap-3 sm:flex-row sm:items-center">
        <BatchSelect
          value={batchId}
          onChange={setBatch}
          batches={batches.data}
          loading={batches.isPending}
        />
        <DateStepper value={date} onChange={setDate} min={minDate} max={maxDate} />
      </div>

      {!batchId ? (
        <EmptyState
          icon={<CalendarCheck2 />}
          title="Pick a batch"
          description="Choose a batch to see its students for the day."
        />
      ) : (
        <Tabs defaultValue="session">
          {cover ? (
            <p
              role="status"
              className="mb-3 flex items-center gap-2 rounded-lg border border-primary/25 bg-primary/5 px-2.5 py-1.5 text-[12px]"
            >
              <Repeat aria-hidden className="size-3.5 shrink-0 text-primary" />
              You’re the substitute coach for {batch?.name} from {formatShortDate(cover.fromDate)}{' '}
              to {formatShortDate(cover.toDate)}.
            </p>
          ) : (
            <TabsList className="mb-4">
              <TabsTrigger value="session">Session</TabsTrigger>
              <TabsTrigger value="register">Monthly register</TabsTrigger>
            </TabsList>
          )}
          <TabsContent value="session">
            {!runsToday && (
              <p className="mb-3 text-sm text-muted-foreground">
                {batch?.name} doesn’t usually run on {WEEKDAYS[isoWeekday(date) - 1]?.long}s — only
                makeups appear here.
              </p>
            )}
            <SessionSheet key={`${batchId}:${date}`} batchId={batchId} date={date} />
          </TabsContent>
          <TabsContent value="register">
            <MonthlyRegister batchId={batchId} />
          </TabsContent>
        </Tabs>
      )}
    </div>
  );
}
