/**
 * Building blocks shared by the coach and admin attendance sheets, so both take and review
 * attendance the same way: the P / A / L / E buttons, the summary that doubles as a filter, and
 * each student's recent-sessions trail.
 */
import type { ReactNode } from 'react';
import { haptic } from '@/app/native';
import { ATTENDANCE_META } from '@/components/common';
import { Card } from '@/components/ui/primitives';
import { formatShortDate } from '@/lib/format';
import type { AttendanceStatus } from '@/lib/types';
import { cn } from '@/lib/utils';

/** Button and summary order: the common answers first. */
export const ATTENDANCE_ORDER: readonly AttendanceStatus[] = [
  'present',
  'absent',
  'late',
  'excused',
];

export const ATTENDANCE_DOT: Record<AttendanceStatus, string> = {
  present: 'bg-success',
  late: 'bg-warning',
  absent: 'bg-destructive',
  excused: 'bg-info',
};

/** Four small buttons: letters on phones, words on wider screens. */
export function StatusToggle({
  value,
  onChange,
  disabled,
  name,
}: {
  value: AttendanceStatus | null;
  onChange: (s: AttendanceStatus) => void;
  disabled: boolean;
  /** The student's name, for screen readers. */
  name: string;
}) {
  return (
    <div role="radiogroup" aria-label={`Attendance for ${name}`} className="flex shrink-0 gap-1">
      {ATTENDANCE_ORDER.map((s) => {
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
              if (active) return;
              haptic();
              onChange(s);
            }}
            className={cn(
              'flex h-8 w-8 cursor-pointer items-center justify-center rounded-lg border text-[12px] font-bold transition-all active:scale-[0.94] disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto sm:px-2.5 sm:text-[12.5px] sm:font-semibold',
              active
                ? cn(meta.active, 'shadow-sm')
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

export type AttendanceFilter = 'all' | 'unmarked' | AttendanceStatus;
export type AttendanceCounts = Record<AttendanceStatus | 'unmarked', number>;

export function countMarks(statuses: (AttendanceStatus | null)[]): AttendanceCounts {
  const c: AttendanceCounts = { present: 0, absent: 0, late: 0, excused: 0, unmarked: 0 };
  for (const s of statuses) c[s ?? 'unmarked']++;
  return c;
}

/**
 * Progress at a glance (marked / total and a bar split by status) and the counts as chips: tap
 * one to show only those students, tap it again for everyone.
 */
export function AttendanceSummary({
  counts,
  filter,
  onFilter,
  actions,
}: {
  counts: AttendanceCounts;
  filter: AttendanceFilter;
  onFilter: (f: AttendanceFilter) => void;
  /** Buttons on the right of the progress line (e.g. "Rest present"). */
  actions?: ReactNode;
}) {
  const total = ATTENDANCE_ORDER.reduce((n, k) => n + counts[k], 0) + counts.unmarked;
  const marked = total - counts.unmarked;
  const chips: { key: AttendanceFilter; label: string; n: number; dot?: string }[] = [
    { key: 'all', label: 'All', n: total },
    ...(counts.unmarked
      ? [{ key: 'unmarked' as const, label: 'Unmarked', n: counts.unmarked }]
      : []),
    ...ATTENDANCE_ORDER.filter((k) => counts[k] > 0 || filter === k).map((k) => ({
      key: k,
      label: ATTENDANCE_META[k].label,
      n: counts[k],
      dot: ATTENDANCE_DOT[k],
    })),
  ];
  return (
    <Card className="space-y-1 px-2 py-1.5">
      <div className="flex min-h-7 items-center gap-2">
        <p className="shrink-0 text-[12px] font-semibold">
          <span className="tabular">{marked}</span>/<span className="tabular">{total}</span>{' '}
          <span className="font-normal text-muted-foreground">marked</span>
        </p>
        <div
          className="flex h-1.5 min-w-0 flex-1 gap-px overflow-hidden rounded-full bg-muted"
          role="img"
          aria-label={`${marked} of ${total} marked`}
        >
          {ATTENDANCE_ORDER.map((k) =>
            counts[k] ? (
              <span
                key={k}
                className={cn('h-full transition-[width] duration-300', ATTENDANCE_DOT[k])}
                style={{ width: `${(counts[k] / total) * 100}%` }}
              />
            ) : null,
          )}
        </div>
        {actions}
      </div>
      <div
        role="radiogroup"
        aria-label="Show students"
        className="-mx-0.5 flex [scrollbar-width:none] gap-1 overflow-x-auto px-0.5 [&::-webkit-scrollbar]:hidden"
      >
        {chips.map((c) => {
          const on = filter === c.key;
          return (
            <button
              key={c.key}
              type="button"
              role="radio"
              aria-checked={on}
              disabled={c.n === 0 && c.key !== 'all' && !on}
              onClick={() => onFilter(on ? 'all' : c.key)}
              className={cn(
                'flex h-5.5 shrink-0 cursor-pointer items-center gap-1 rounded-full border px-1.5 text-[10.5px] font-medium transition-colors disabled:cursor-default disabled:opacity-45',
                on
                  ? 'border-foreground/80 bg-foreground text-background'
                  : 'bg-card text-muted-foreground hover:text-foreground',
                c.key === 'unmarked' && !on && 'border-dashed',
              )}
            >
              {c.dot && <span className={cn('size-1.5 rounded-full', c.dot)} />}
              {c.label}
              <b className={cn('tabular font-semibold', !on && 'text-foreground')}>{c.n}</b>
            </button>
          );
        })}
      </div>
    </Card>
  );
}

/** The last few sessions as dots (oldest → newest) and the 30-day rate. */
export function AttendanceTrail({
  recent,
  rate30,
}: {
  recent?: { date: string; status: AttendanceStatus }[] | null;
  rate30?: number | null;
}) {
  const list = [...(recent ?? [])].reverse();
  const low = rate30 !== null && rate30 !== undefined && rate30 < 60;
  return (
    <>
      {list.length > 0 ? (
        <span
          className="flex items-center gap-0.5"
          title={list
            .map((r) => `${formatShortDate(r.date)}: ${ATTENDANCE_META[r.status].label}`)
            .join('\n')}
          aria-label={`Last ${list.length}: ${list.map((r) => ATTENDANCE_META[r.status].label).join(', ')}`}
        >
          {list.map((r) => (
            <span key={r.date} className={cn('size-1.5 rounded-full', ATTENDANCE_DOT[r.status])} />
          ))}
        </span>
      ) : (
        <span>New</span>
      )}
      {rate30 !== null && rate30 !== undefined && (
        <span className={cn('tabular', low && 'font-semibold text-destructive')}>
          {rate30}% · 30d
        </span>
      )}
    </>
  );
}

export function matchesFilter(status: AttendanceStatus | null, f: AttendanceFilter) {
  return f === 'all' || (f === 'unmarked' ? status === null : status === f);
}
