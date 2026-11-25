/**
 * Batch cycles, renewals, missed sessions and rescheduling: types and React Query hooks.
 */
import { useMutation, useQuery, useQueryClient, type QueryKey } from '@tanstack/react-query';
import { api } from './api';
import type { InvoiceStatus } from './types';

function useInvalidate() {
  const qc = useQueryClient();
  return (...prefixes: QueryKey[]) =>
    Promise.all(prefixes.map((queryKey) => qc.invalidateQueries({ queryKey })));
}

/** Everything a change to the timetable can affect on screen. */
const SCHEDULE_KEYS: QueryKey[] = [
  ['session-changes'],
  ['attendance'],
  ['coach-sessions'],
  ['lessons'],
  ['batches'],
  ['cycles'],
  ['me', 'tasks'],
];

// ─── Session changes ─────────────────────────────────────────────────────────

export interface SessionChange {
  id: string;
  kind: 'reschedule' | 'extra';
  originalDate: string | null;
  date: string;
  startTime: string;
  endTime: string;
  reason: string | null;
  from: { date: string; startTime: string; endTime: string } | null;
}

export interface ChangeWarning {
  code: string;
  message: string;
  students?: { id: string; fullName: string; detail: string }[];
}

export interface ChangePreview {
  ok: boolean;
  errors: string[];
  warnings: ChangeWarning[];
  /** Students booked to make it up elsewhere. */
  booked?: number;
}

export interface ChangeInput {
  sessionDate?: string;
  date: string;
  startTime: string;
  endTime: string;
  reason?: string | null;
  confirm?: boolean;
  /** Students booked to make it up elsewhere come to this session instead. */
  releaseMakeups?: boolean;
}

export interface SmartDay {
  date: string;
  /** Why this day can't be used, or null. */
  blocked: string | null;
  /** Students whose billing month ends before it. */
  outside: string[];
  smart: boolean;
}

export interface SmartDates {
  originalDate: string;
  students: number;
  days: SmartDay[];
  message: string | null;
}

export const useBatchSessionChanges = (batchId: string) =>
  useQuery({
    queryKey: ['session-changes', 'batch', batchId] as const,
    queryFn: () => api.get<SessionChange[]>(`/batches/${batchId}/session-changes`),
  });

export const useSmartDates = (batchId: string, sessionDate: string, enabled: boolean) =>
  useQuery({
    queryKey: ['session-changes', 'smart', batchId, sessionDate] as const,
    queryFn: () => api.get<SmartDates>(`/batches/${batchId}/smart-dates`, { sessionDate }),
    enabled,
  });

export const previewChange = (batchId: string, body: ChangeInput) =>
  api.post<ChangePreview>(`/batches/${batchId}/session-changes/preview`, body);

export function useCreateChange(batchId: string) {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (body: ChangeInput) =>
      api.post<SessionChange>(`/batches/${batchId}/session-changes`, body),
    onSuccess: () => invalidate(...SCHEDULE_KEYS),
  });
}

export function useUndoChange() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (id: string) => api.post<SessionChange>(`/session-changes/${id}/cancel`),
    onSuccess: () => invalidate(...SCHEDULE_KEYS),
  });
}

// ─── Missed sessions ─────────────────────────────────────────────────────────

export interface MissedSession {
  batch: { id: string; name: string; coach: { id: string; name: string } };
  date: string;
  originalDate: string;
  startTime: string;
  endTime: string;
  /** Still to have it: to make up, or booked. */
  students: number;
  pending?: number;
  booked?: number;
  madeUp?: number;
  excused?: number;
  /** Rescheduled and held; only some students still need a makeup. */
  makeupOnly?: boolean;
  reason: string | null;
  missed: boolean;
  coachUntil: string;
  /** Past the coach's 30 days: only an admin can reschedule it. */
  overdue: boolean;
  /** Every student gets their full count without it. */
  optional?: boolean;
}

export const useMissedSessions = () =>
  useQuery({
    queryKey: ['session-changes', 'missed'] as const,
    queryFn: () =>
      api.get<{ open: MissedSession[]; unconfirmed: MissedSession[] }>('/session-changes/missed'),
  });

export function useResolveMissed() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: ({
      action,
      ...body
    }: {
      action: 'confirm' | 'close';
      batchId: string;
      date: string;
      reason?: string;
    }) => api.post(`/session-changes/missed/${action}`, body),
    onSuccess: () => invalidate(...SCHEDULE_KEYS),
  });
}

// ─── Makeups of a missed session ─────────────────────────────────────────────

type Missed = { batchId: string; originalDate: string };

export interface MissedStudent {
  id: string;
  fullName: string;
  state: 'pending' | 'booked' | 'made-up' | 'excused';
  /** Their makeup was cancelled or never held. */
  lapsed: boolean;
  reason: string | null;
  makeup: {
    id: string;
    batchName: string;
    date: string;
    startTime: string | null;
    endTime: string | null;
    mark: 'present' | 'late' | 'absent' | 'excused' | null;
  } | null;
}

export interface MakeupOption {
  batch: { id: string; name: string; coachName: string };
  date: string;
  startTime: string;
  endTime: string;
  expected: number;
  capacity: number;
  full: boolean;
  blocked: string | null;
}

export const useMissedStudents = (m: Missed) =>
  useQuery({
    queryKey: ['session-changes', 'missed', 'students', m] as const,
    queryFn: () =>
      api.get<{ students: MissedStudent[] }>('/session-changes/missed/students', { ...m }),
  });

export const useMakeupOptions = (m: Missed, studentId: string) =>
  useQuery({
    queryKey: ['session-changes', 'missed', 'options', m, studentId] as const,
    queryFn: () => api.get<MakeupOption[]>('/session-changes/missed/options', { ...m, studentId }),
    staleTime: 0,
  });

type MakeupAction =
  | ({
      action: 'book';
      studentId: string;
      toBatchId: string;
      toDate: string;
      confirm?: boolean;
    } & Missed)
  | ({ action: 'excuse'; studentId: string; reason: string } & Missed)
  | ({ action: 'unexcuse'; studentId: string } & Missed)
  | { action: 'cancel'; id: string };

export function useMakeupAction() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (a: MakeupAction): Promise<unknown> => {
      if (a.action === 'cancel') return api.delete(`/session-changes/missed/makeups/${a.id}`);
      const { action, ...body } = a;
      return api.post(`/session-changes/missed/${action === 'book' ? 'makeups' : action}`, body);
    },
    onSuccess: () => invalidate(...SCHEDULE_KEYS, ['students']),
  });
}

// ─── Cycles ──────────────────────────────────────────────────────────────────

export interface CycleCounts {
  target: number;
  conducted: number;
  attended: number;
  present: number;
  late: number;
  absent: number;
  excused: number;
  missed: number;
  unconfirmed: number;
  upcoming: number;
  rate: number | null;
}

interface CycleBase extends CycleCounts {
  id: string;
  roundNo: number;
  months: number;
  startsOn: string;
  endsOn: string;
  status: 'active' | 'completed' | 'exited';
  endedOn: string | null;
}

export interface BatchCycles {
  courseMonths: number | null;
  perMonth: number;
  cycles: (CycleBase & {
    student: { id: string; code: string; fullName: string };
    plannedEndOn: string | null;
  })[];
}

export interface CycleSession {
  date: string;
  originalDate: string | null;
  kind: 'regular' | 'moved' | 'extra';
  startTime: string;
  endTime: string;
  state: 'held' | 'missed' | 'closed' | 'unconfirmed' | 'upcoming';
  reason: string | null;
  mark: 'present' | 'late' | 'absent' | 'excused' | null;
  /** Made up (or to be) in another batch. */
  makeup?: { batchName: string; date: string } | null;
}

export interface CycleInvoice {
  id: string;
  number: string;
  periodStart: string;
  periodEnd: string;
  totalAmount: number;
  status: InvoiceStatus;
}

export interface MembershipHistory {
  enrollmentId: string;
  batch: { id: string; name: string };
  coach: { id: string; name: string };
  from: string;
  to: string | null;
  plannedEndOn: string | null;
  reason: string | null;
  cycles: (CycleBase & { sessions: CycleSession[]; invoices: CycleInvoice[] })[];
  earlier: CycleInvoice[];
}

export const useBatchCycles = (batchId: string, enabled = true) =>
  useQuery({
    queryKey: ['cycles', 'batch', batchId] as const,
    queryFn: () => api.get<BatchCycles>(`/cycles/batches/${batchId}`),
    enabled,
  });

export const useStudentCycles = (studentId: string) =>
  useQuery({
    queryKey: ['cycles', 'student', studentId] as const,
    queryFn: () => api.get<MembershipHistory[]>(`/cycles/students/${studentId}`),
  });

export const certificatePath = (cycleId: string) => `/cycles/${cycleId}/certificate`;
export const shareCertificate = (cycleId: string) =>
  api.post<{ url: string; expiresAt: string; whatsappUrl: string }>(
    `/cycles/${cycleId}/certificate/share`,
  );

// ─── Renewals ────────────────────────────────────────────────────────────────

export interface Renewal {
  cycleId: string;
  enrollmentId: string;
  student: { id: string; code: string; fullName: string };
  batch: { id: string; name: string };
  coach: { id: string; name: string };
  roundNo: number;
  months: number;
  startsOn: string;
  endsOn: string;
  renewsOn: string;
  progress: CycleCounts;
  stopped: {
    on: string;
    reason: string | null;
    by: string | null;
    moveTo: { id: string; name: string | null } | null;
  } | null;
  /** Admins only. */
  dues: { amount: number; count: number } | null;
}

export interface ExitInvoice {
  id: string;
  number: string;
  periodStart: string;
  periodEnd: string;
  amount: number;
  running: boolean;
  attended: number;
  suggestion: 'cancel' | 'lost' | 'due';
}

export const useRenewals = () =>
  useQuery({
    queryKey: ['cycles', 'renewals'] as const,
    queryFn: () => api.get<Renewal[]>('/renewals'),
  });

export const useExitPreview = (enrollmentId: string) =>
  useQuery({
    queryKey: ['cycles', 'exit', enrollmentId] as const,
    queryFn: () =>
      api.get<{ lastDay: string; invoices: ExitInvoice[] }>(`/renewals/${enrollmentId}/exit`),
    // Money: always what it is now.
    staleTime: 0,
    gcTime: 0,
  });

export function useRenewalAction() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: ({
      id,
      action,
      ...body
    }: {
      id: string;
      action: 'stop' | 'restore' | 'exit';
      reason?: string;
      moveToBatchId?: string | null;
      lostInvoiceIds?: string[];
    }) => api.post(`/renewals/${id}/${action}`, action === 'restore' ? undefined : body),
    onSettled: () =>
      invalidate(['cycles'], ['students'], ['batches'], ['invoices'], ['finance'], ['me', 'tasks']),
  });
}

/** "12 sessions a month · 36 in all". */
export function courseHint(
  daysPerWeek: number,
  months: string,
  batch?: { courseMonths?: number | null; memberCount: number },
) {
  const perMonth = daysPerWeek * 4;
  const n = Number(months);
  const total =
    n >= 1
      ? `${perMonth} sessions a month · ${perMonth * n} in all`
      : `${perMonth} sessions a month`;
  if (!batch || batch.courseMonths) return total;
  return n >= 1 && batch.memberCount
    ? `${total}. Students start round 1 with their current billing month.`
    : `${total}. Leave empty to set it up later.`;
}
