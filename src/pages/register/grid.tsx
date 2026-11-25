/**
 * The register itself: students down, sessions across. Names and the header stay put while it
 * scrolls; tapping a day or a mark opens that session.
 */
import { ArrowDownAZ, ArrowDownNarrowWide, ArrowDownWideNarrow, Users } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router';
import { ATTENDANCE_META, EmptyState, SearchInput } from '@/components/common';
import { Button } from '@/components/ui/button';
import { Badge, Card } from '@/components/ui/primitives';
import { formatLongDate, formatShortDate, isoWeekday, WEEKDAYS } from '@/lib/format';
import { rateTone, type MonthlyRegister, type RegisterSession } from '@/lib/registers';
import type { AttendanceStatus } from '@/lib/types';
import { cn } from '@/lib/utils';
import { Change } from './tiles';

const CELL: Record<AttendanceStatus, string> = {
  present: 'bg-success/15 text-success',
  late: 'bg-warning/25 text-warning-foreground dark:text-warning',
  absent: 'bg-destructive/15 text-destructive',
  excused: 'bg-info/15 text-info',
};
const SORTS = [
  { value: 'name', label: 'By name', icon: ArrowDownAZ },
  { value: 'high', label: 'Highest first', icon: ArrowDownWideNarrow },
  { value: 'low', label: 'Lowest first', icon: ArrowDownNarrowWide },
] as const;
type Sort = (typeof SORTS)[number]['value'];

function dayHint(s: RegisterSession) {
  if (s.state === 'cancelled') return `cancelled${s.reason ? `: ${s.reason}` : ''}`;
  if (s.state === 'upcoming') return 'upcoming';
  if (s.state === 'unrecorded') return 'nothing recorded';
  return `${s.present + s.late} of ${s.expected} present`;
}

export function RegisterGrid({
  r,
  onSession,
}: {
  r: MonthlyRegister;
  onSession: (date: string) => void;
}) {
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState<Sort>('name');
  const scroller = useRef<HTMLDivElement>(null);
  const todayCol = useRef<HTMLTableCellElement>(null);
  // Opens at the latest session, not the 1st of the month.
  const latest = useMemo(
    () => [...r.sessions].reverse().find((s) => s.date <= r.today)?.date,
    [r.sessions, r.today],
  );
  useEffect(() => {
    const box = scroller.current;
    const col = todayCol.current;
    if (box && col) box.scrollLeft = col.offsetLeft - box.clientWidth + col.offsetWidth + 8;
  }, [latest]);

  const list = useMemo(() => {
    const n = search.trim().toLowerCase();
    const rate = (x: number | null, none: number) => x ?? none;
    return r.students
      .filter((s) => !n || `${s.fullName} ${s.code}`.toLowerCase().includes(n))
      .sort((a, b) =>
        sort === 'name'
          ? a.fullName.localeCompare(b.fullName)
          : sort === 'high'
            ? rate(b.rate, -1) - rate(a.rate, -1) || a.fullName.localeCompare(b.fullName)
            : rate(a.rate, 101) - rate(b.rate, 101) || a.fullName.localeCompare(b.fullName),
      );
  }, [r.students, search, sort]);
  const next = SORTS[(SORTS.findIndex((s) => s.value === sort) + 1) % SORTS.length]!;
  const now = SORTS.find((s) => s.value === sort)!;

  if (!r.students.length)
    return <EmptyState icon={<Users />} title="No students were in this batch this month" />;
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-1.5">
        <SearchInput
          value={search}
          onChange={setSearch}
          placeholder="Search students"
          className="min-w-0 flex-1"
          dense
        />
        <Button
          variant="outline"
          size="sm"
          className="h-9 shrink-0"
          aria-label={`Sorted: ${now.label}. Sort: ${next.label}`}
          onClick={() => setSort(next.value)}
        >
          <now.icon /> <span className="text-[12px]">{now.label}</span>
        </Button>
      </div>
      <Card className="overflow-hidden">
        <div
          ref={scroller}
          className="max-h-[70dvh] overflow-auto overscroll-x-contain"
          tabIndex={0}
          role="region"
          aria-label="Attendance register, scrolls sideways"
        >
          <table className="w-full border-separate border-spacing-0 text-[12px]">
            <thead>
              <tr>
                <th
                  scope="col"
                  className="sticky top-0 left-0 z-30 w-36 max-w-36 min-w-36 border-r border-b bg-card px-2 py-1.5 text-left font-semibold sm:w-52 sm:max-w-52 sm:min-w-52"
                >
                  Student
                </th>
                {r.sessions.map((s) => (
                  <th
                    key={s.date}
                    ref={s.date === latest ? todayCol : undefined}
                    scope="col"
                    className={cn(
                      'sticky top-0 z-20 min-w-9 border-b bg-card p-0 text-center font-medium',
                      s.date === r.today && 'bg-accent',
                    )}
                  >
                    <button
                      type="button"
                      onClick={() => onSession(s.date)}
                      aria-label={`${formatLongDate(s.date)}: ${dayHint(s)}`}
                      title={`${formatShortDate(s.date)} · ${dayHint(s)}`}
                      className="w-full cursor-pointer px-0.5 py-1 leading-tight hover:bg-muted"
                    >
                      <span className="block text-[10px] text-muted-foreground">
                        {WEEKDAYS[isoWeekday(s.date) - 1]?.min}
                      </span>
                      <span
                        className={cn(
                          'tabular block text-[12.5px] font-semibold',
                          s.date === r.today && 'text-primary',
                          s.state === 'cancelled' && 'text-muted-foreground line-through',
                        )}
                      >
                        {Number(s.date.slice(8))}
                      </span>
                      <span
                        aria-hidden
                        className={cn(
                          'mx-auto mt-0.5 block size-1 rounded-full',
                          s.origin.kind === 'regular' ? 'bg-transparent' : 'bg-primary',
                        )}
                      />
                    </button>
                  </th>
                ))}
                {['P', 'L', 'A', 'E'].map((t) => (
                  <th
                    key={t}
                    scope="col"
                    className="sticky top-0 z-20 hidden min-w-8 border-b bg-card text-center font-semibold text-muted-foreground md:table-cell"
                  >
                    {t}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {list.map((s) => (
                <tr key={s.studentId} className="group">
                  <th
                    scope="row"
                    className="sticky left-0 z-10 w-36 max-w-36 min-w-36 border-r border-b bg-card px-2 py-1 text-left font-normal sm:w-52 sm:max-w-52 sm:min-w-52"
                  >
                    <Link
                      to={`/students/${s.studentId}`}
                      className="block truncate text-[12.5px] font-medium hover:underline"
                    >
                      {s.fullName}
                    </Link>
                    <span className="flex items-center gap-1">
                      <span className={cn('tabular text-[11.5px] font-bold', rateTone(s.rate))}>
                        {s.rate === null ? '—' : `${s.rate}%`}
                      </span>
                      <span className="tabular text-[10.5px] text-muted-foreground">
                        {s.attended}/{s.counted}
                      </span>
                      <Change value={s.change} className="text-[10px]" />
                    </span>
                    {(s.joinedOn || s.leftOn) && (
                      <Badge variant="muted" className="mt-0.5 h-4 px-1 text-[9px]">
                        {s.leftOn
                          ? `Left ${formatShortDate(s.leftOn)}`
                          : `Joined ${formatShortDate(s.joinedOn!)}`}
                      </Badge>
                    )}
                  </th>
                  {r.sessions.map((d) => {
                    const c = s.cells[d.date];
                    const mark = c?.mark ?? null;
                    const label = !c
                      ? 'not in this batch that day'
                      : mark
                        ? `${ATTENDANCE_META[mark].label}${c.madeUp ? `, made up in ${c.madeUp.replace(/ on .*/, '')}` : ''}${c.note ? ` (${c.note})` : ''}`
                        : d.state === 'held'
                          ? 'not marked'
                          : dayHint(d);
                    return (
                      <td
                        key={d.date}
                        className={cn(
                          'border-b p-0 text-center',
                          d.date === r.today && 'bg-accent/50',
                          !c && 'bg-muted/60',
                        )}
                      >
                        <button
                          type="button"
                          disabled={!c}
                          onClick={() => onSession(d.date)}
                          aria-label={`${s.fullName}, ${formatShortDate(d.date)}: ${label}`}
                          title={`${formatShortDate(d.date)}: ${label}`}
                          className="flex h-10 w-full min-w-9 cursor-pointer items-center justify-center disabled:cursor-default"
                        >
                          {mark ? (
                            <span
                              className={cn(
                                'relative flex size-7 items-center justify-center rounded-lg text-[12px] font-bold',
                                CELL[mark],
                              )}
                            >
                              {ATTENDANCE_META[mark].short}
                              {c?.madeUp && (
                                <span className="absolute -top-0.5 -right-0.5 size-2 rounded-full bg-primary ring-2 ring-card" />
                              )}
                              {c?.note && (
                                <span className="absolute -right-0.5 -bottom-0.5 size-1.5 rounded-full bg-foreground/60" />
                              )}
                            </span>
                          ) : c && d.state === 'cancelled' ? (
                            <span className="text-muted-foreground/60">✕</span>
                          ) : c && d.state === 'held' ? (
                            <span className="size-7 rounded-lg border border-dashed border-muted-foreground/40" />
                          ) : c ? (
                            <span className="text-muted-foreground/40">·</span>
                          ) : null}
                        </button>
                      </td>
                    );
                  })}
                  {[s.present, s.late, s.absent, s.excused].map((n, i) => (
                    <td
                      key={i}
                      className="tabular hidden border-b text-center font-medium md:table-cell"
                    >
                      {n}
                    </td>
                  ))}
                </tr>
              ))}
              {!list.length && (
                <tr>
                  <td colSpan={99} className="px-3 py-6 text-center text-muted-foreground">
                    No students match.
                  </td>
                </tr>
              )}
            </tbody>
            <tfoot>
              <tr>
                <th
                  scope="row"
                  className="sticky bottom-0 left-0 z-30 border-t border-r bg-muted px-2 py-1.5 text-left font-semibold"
                >
                  Present
                </th>
                {r.sessions.map((s) => (
                  <td
                    key={s.date}
                    className="tabular sticky bottom-0 z-20 border-t bg-muted text-center text-[11.5px] leading-tight font-semibold"
                  >
                    {s.state === 'held' && s.marked ? (
                      <>
                        {s.present + s.late}
                        <span className={cn('block text-[9.5px]', rateTone(s.rate))}>
                          {s.rate === null ? '' : `${s.rate}%`}
                        </span>
                      </>
                    ) : (
                      ''
                    )}
                  </td>
                ))}
                {[r.summary.present, r.summary.late, r.summary.absent, r.summary.excused].map(
                  (n, i) => (
                    <td
                      key={i}
                      className="tabular sticky bottom-0 z-20 hidden border-t bg-muted text-center font-semibold md:table-cell"
                    >
                      {n}
                    </td>
                  ),
                )}
              </tr>
            </tfoot>
          </table>
        </div>
      </Card>
      <p className="flex flex-wrap items-center gap-x-3 gap-y-1 px-0.5 text-[11px] text-muted-foreground">
        {(['present', 'late', 'absent', 'excused'] as const).map((k) => (
          <span key={k} className="inline-flex items-center gap-1">
            <span
              className={cn(
                'flex size-4 items-center justify-center rounded text-[9px] font-bold',
                CELL[k],
              )}
            >
              {ATTENDANCE_META[k].short}
            </span>
            {ATTENDANCE_META[k].label}
          </span>
        ))}
        <span className="inline-flex items-center gap-1">
          <span className="size-4 rounded border border-dashed border-muted-foreground/40" /> Not
          marked
        </span>
        <span>✕ Cancelled</span>
        <span className="inline-flex items-center gap-1">
          <span className="size-2 rounded-full bg-primary" /> Made up elsewhere
        </span>
        <span className="inline-flex items-center gap-1">
          <span className="size-4 rounded bg-muted" /> Not a member
        </span>
      </p>
    </div>
  );
}
