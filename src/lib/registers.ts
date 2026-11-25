/** Monthly attendance registers: types, hooks and the colours marks are shown in. */
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { api } from './api';
import { addMonths, startOfMonth, today } from './format';
import type { AttendanceStatus, SessionOrigin } from './types';

export type RegisterState = 'held' | 'cancelled' | 'unrecorded' | 'upcoming';

export interface RegisterSummary {
  students: number;
  rate: number | null;
  previousRate: number | null;
  change: number | null;
  present: number;
  late: number;
  absent: number;
  excused: number;
  madeUp: number;
  sessions: number;
  held: number;
  cancelled: number;
  unrecorded: number;
  upcoming: number;
  moved: number;
  extra: number;
  covered: number;
  averagePresent: number | null;
  completeness: number | null;
  unmarked: number;
  punctuality: number | null;
  checkIns: number;
}

export interface RegisterBatchInfo {
  id: string;
  name: string;
  coach: { id: string; name: string };
  location: string;
  sport: string;
  weekdays: number[];
  startTime: string;
  endTime: string;
  dayTimes?: Record<string, { start: string; end: string }>;
  capacity: number;
  isActive: boolean;
}

export interface RegisterTile {
  batch: RegisterBatchInfo;
  month: string;
  summary: RegisterSummary;
  low: number;
  absentRuns: number;
  perfect: number;
  trend: { date: string; rate: number | null }[];
}

export interface RegisterSession {
  date: string;
  startTime: string;
  endTime: string;
  origin: SessionOrigin;
  state: RegisterState;
  reason: string | null;
  substitute: string | null;
  checkedIn: { coachName: string; lateBy: number } | null;
  expected: number;
  marked: number;
  present: number;
  late: number;
  absent: number;
  excused: number;
  rate: number | null;
}

export interface RegisterCell {
  mark: AttendanceStatus | null;
  note?: string;
  /** "Evening on 2026-03-12": made up in another batch. */
  madeUp?: string;
}

export interface RegisterStudent {
  studentId: string;
  fullName: string;
  code: string;
  joinedOn: string | null;
  leftOn: string | null;
  cells: Record<string, RegisterCell | undefined>;
  present: number;
  late: number;
  absent: number;
  excused: number;
  unmarked: number;
  counted: number;
  attended: number;
  rate: number | null;
  previousRate: number | null;
  change: number | null;
  bestStreak: number;
  absentRun: number;
  longestAbsence: number;
  lastAttended: string | null;
}

export interface RegisterPerson {
  studentId: string;
  fullName: string;
  rate: number | null;
  change: number | null;
  attended: number;
  counted: number;
  absentRun: number;
  bestStreak: number;
  late: number;
  lastAttended: string | null;
}

export interface MonthlyRegister {
  batch: RegisterBatchInfo;
  month: string;
  today: string;
  sessions: RegisterSession[];
  students: RegisterStudent[];
  summary: RegisterSummary;
  insights: {
    byWeekday: { weekday: number; sessions: number; rate: number | null }[];
    byWeek: { week: string; sessions: number; rate: number | null }[];
    bands: { excellent: number; good: number; fair: number; low: number; none: number };
    best: { date: string; rate: number | null } | null;
    worst: { date: string; rate: number | null } | null;
    top: RegisterPerson[];
    perfect: RegisterPerson[];
    low: RegisterPerson[];
    absentRuns: RegisterPerson[];
    improved: RegisterPerson[];
    declined: RegisterPerson[];
    oftenLate: RegisterPerson[];
    neverMarked: RegisterPerson[];
    joined: number;
    left: number;
  };
}

/** "November 2026". */
export const monthLabel = (month: string) =>
  new Intl.DateTimeFormat('en-IN', { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(
    new Date(`${month.slice(0, 7)}-01T00:00:00Z`),
  );

export const thisMonth = () => startOfMonth(today());

/** The month in an address (its first day), this month when missing, mistyped or in the future. */
export function monthParam(raw: string | null): string {
  const now = thisMonth();
  const m = raw && /^\d{4}-(0[1-9]|1[0-2])(-\d{2})?$/.test(raw) ? `${raw.slice(0, 7)}-01` : now;
  return m > now ? now : m;
}
export const monthStep = (month: string, n: number) => startOfMonth(addMonths(month, n));

export const useRegisterTiles = (month: string) =>
  useQuery({
    queryKey: ['attendance', 'registers', month] as const,
    queryFn: ({ signal }) =>
      api.get<{ month: string; batches: RegisterTile[] }>(
        '/attendance/registers',
        { month },
        signal,
      ),
    placeholderData: keepPreviousData,
  });

export const useMonthlyRegister = (batchId: string, month: string) =>
  useQuery({
    queryKey: ['attendance', 'registers', batchId, month] as const,
    queryFn: ({ signal }) =>
      api.get<MonthlyRegister>(`/attendance/registers/${batchId}`, { month }, signal),
    // The same batch's other month stays on screen while the next one loads.
    placeholderData: (prev) => (prev?.batch.id === batchId ? prev : undefined),
    enabled: !!batchId,
  });

/** Text colour for an attendance percentage. */
export const rateTone = (r: number | null) =>
  r === null
    ? 'text-muted-foreground'
    : r >= 80
      ? 'text-success'
      : r >= 60
        ? 'text-warning-foreground dark:text-warning'
        : 'text-destructive';
export const rateBar = (r: number | null) =>
  r === null ? 'bg-muted' : r >= 80 ? 'bg-success' : r >= 60 ? 'bg-warning' : 'bg-destructive';
