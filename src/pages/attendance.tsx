import {
  CalendarCheck2,
  CalendarX2,
  CheckCheck,
  Lock,
  RotateCcw,
  Save,
  StickyNote,
  Users,
} from 'lucide-react';
import { useMemo, useState } from 'react';
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
import {
  addMonths,
  endOfMonth,
  formatShortDate,
  isoWeekday,
  startOfMonth,
  today,
  WEEKDAYS,
} from '@/lib/format';
import { useAttendanceSheet, useRegister, useSaveAttendance } from '@/lib/queries';
import type { AttendanceStatus } from '@/lib/types';
import { cn } from '@/lib/utils';

const STATUSES: AttendanceStatus[] = ['present', 'late', 'absent', 'excused'];

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
    <div role="radiogroup" aria-label="Attendance status" className="grid grid-cols-4 gap-1">
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
            onClick={() => onChange(s)}
            className={cn(
              'h-10 min-w-10 cursor-pointer rounded-lg border text-sm font-semibold transition-all disabled:cursor-not-allowed disabled:opacity-60 sm:min-w-20',
              active
                ? meta.active
                : 'bg-card text-muted-foreground hover:border-foreground/30 hover:text-foreground',
            )}
          >
            <span className="sm:hidden">{meta.short}</span>
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
    <div className="space-y-4">
      {!editable && (
        <div className="flex items-center gap-2 rounded-lg border bg-muted/50 px-3 py-2.5 text-sm text-muted-foreground">
          <Lock className="size-4" /> This session is locked for editing. Admins can correct older
          records.
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-1.5 text-xs">
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
          <div className="flex gap-2">
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
            <div key={s.studentId} className="p-3 sm:p-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                <div className="flex min-w-0 flex-1 items-center gap-3">
                  <Avatar name={s.fullName} />
                  <div className="min-w-0">
                    <p className="truncate font-medium">{s.fullName}</p>
                    <p className="flex items-center gap-2 text-xs text-muted-foreground">
                      {s.code}
                      {s.isMakeup && <Badge variant="default">Makeup</Badge>}
                    </p>
                  </div>
                  <button
                    type="button"
                    aria-label={`Note for ${s.fullName}`}
                    onClick={() => setOpenNote((o) => (o === s.studentId ? null : s.studentId))}
                    className={cn(
                      'ml-auto cursor-pointer rounded-md p-2 text-muted-foreground hover:bg-muted sm:hidden',
                      d?.note && 'text-primary',
                    )}
                  >
                    <StickyNote className="size-4" />
                  </button>
                </div>
                <div className="flex items-center gap-2">
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
                      'hidden cursor-pointer rounded-md p-2 text-muted-foreground hover:bg-muted sm:block',
                      d?.note && 'text-primary',
                    )}
                  >
                    <StickyNote className="size-4" />
                  </button>
                </div>
              </div>
              {(openNote === s.studentId || d?.note) && (
                <Input
                  className="mt-3"
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
        <div className="fixed inset-x-0 bottom-[calc(4.25rem+env(safe-area-inset-bottom))] z-20 px-4 lg:bottom-6 lg:left-64">
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

function MonthlyRegister({ batchId }: { batchId: string }) {
  const [month, setMonth] = useState(startOfMonth(today()));
  const from = month;
  const to = endOfMonth(month);
  const reg = useRegister({ batchId, from, to });

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Button variant="outline" size="sm" onClick={() => setMonth(addMonths(month, -1))}>
          ‹ Prev
        </Button>
        <p className="w-36 text-center font-medium">
          {new Intl.DateTimeFormat('en-IN', {
            month: 'long',
            year: 'numeric',
            timeZone: 'UTC',
          }).format(new Date(`${month}T00:00:00Z`))}
        </p>
        <Button
          variant="outline"
          size="sm"
          disabled={addMonths(month, 1) > today()}
          onClick={() => setMonth(addMonths(month, 1))}
        >
          Next ›
        </Button>
      </div>
      {reg.isPending ? (
        <ListSkeleton rows={4} />
      ) : reg.isError ? (
        <ErrorState error={reg.error} onRetry={() => void reg.refetch()} />
      ) : reg.data.students.length === 0 ? (
        <EmptyState icon={<CalendarCheck2 />} title="No attendance recorded this month" />
      ) : (
        <Card className="overflow-x-auto">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b bg-muted/50">
                <th className="sticky left-0 z-10 min-w-44 bg-muted/95 px-3 py-2 text-left font-medium">
                  Student
                </th>
                {reg.data.dates.map((d) => (
                  <th
                    key={d}
                    className="min-w-9 px-1 py-2 text-center text-xs font-medium text-muted-foreground"
                  >
                    <div>{WEEKDAYS[isoWeekday(d) - 1]?.min}</div>
                    <div className="tabular">{Number(d.slice(8))}</div>
                  </th>
                ))}
                <th className="px-3 py-2 text-right font-medium">Rate</th>
              </tr>
            </thead>
            <tbody>
              {reg.data.students.map((s) => {
                const marks = Object.values(s.marks);
                const attended = marks.filter((m) => m === 'present' || m === 'late').length;
                const countable = marks.filter((m) => m !== 'excused').length;
                return (
                  <tr key={s.studentId} className="border-b last:border-0">
                    <td className="sticky left-0 z-10 bg-card px-3 py-2 font-medium">
                      {s.fullName}
                    </td>
                    {reg.data.dates.map((d) => {
                      const m = s.marks[d];
                      return (
                        <td key={d} className="px-1 py-2 text-center">
                          {m ? (
                            <span
                              title={`${formatShortDate(d)}: ${ATTENDANCE_META[m].label}`}
                              className={cn('text-xs font-bold', ATTENDANCE_META[m].className)}
                            >
                              {ATTENDANCE_META[m].short}
                            </span>
                          ) : (
                            <span className="text-muted-foreground/40">·</span>
                          )}
                        </td>
                      );
                    })}
                    <td className="tabular px-3 py-2 text-right">
                      {countable ? `${Math.round((attended / countable) * 100)}%` : '—'}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </Card>
      )}
    </div>
  );
}

export function AttendancePage() {
  const { batches, batchId, date, batch, setBatch, setDate } = useBatchDateParams();
  const runsToday = batch ? batch.weekdays.includes(isoWeekday(date)) : true;

  return (
    <div>
      <PageHeader
        title="Attendance"
        description="Mark who showed up. Changes save in one tap — even on a slow connection."
      />
      <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center">
        <BatchSelect
          value={batchId}
          onChange={setBatch}
          batches={batches.data}
          loading={batches.isPending}
        />
        <DateStepper value={date} onChange={setDate} max={today()} />
      </div>

      {!batchId ? (
        <EmptyState
          icon={<CalendarCheck2 />}
          title="Pick a batch"
          description="Choose a batch to see its students for the day."
        />
      ) : (
        <Tabs defaultValue="session">
          <TabsList className="mb-4">
            <TabsTrigger value="session">Session</TabsTrigger>
            <TabsTrigger value="register">Monthly register</TabsTrigger>
          </TabsList>
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
