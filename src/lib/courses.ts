/**
 * Session changes (reschedules / extra sessions), courses (rounds, completions, decisions,
 * credits, certificates) and monthly delivery (shortfalls, pace): types and React Query hooks.
 */
import { useMutation, useQuery, useQueryClient, type QueryKey } from '@tanstack/react-query';
import { api } from './api';

function useInvalidate() {
  const qc = useQueryClient();
  return (...prefixes: QueryKey[]) =>
    Promise.all(prefixes.map((queryKey) => qc.invalidateQueries({ queryKey })));
}

/** Everything a session change can affect on screen. */
const SCHEDULE_KEYS: QueryKey[] = [
  ['session-changes'],
  ['attendance'],
  ['coach-sessions'],
  ['lessons'],
  ['batches'],
  ['me', 'tasks'],
  ['delivery'],
];

// ─── Session changes ─────────────────────────────────────────────────────────

export type SessionChangeStatus = 'pending' | 'approved' | 'rejected' | 'cancelled' | 'expired';

export interface SessionChange {
  id: string;
  kind: 'reschedule' | 'extra';
  /** The regular day being moved (reschedule; same as `date` for a time-only change). */
  originalDate: string | null;
  date: string;
  startTime: string;
  endTime: string;
  status: SessionChangeStatus;
  reason: string | null;
  reviewNote: string | null;
  reviewedAt: string | null;
  createdAt: string;
  batch: { id: string; name: string; startTime: string; endTime: string };
  location: { id: string; name: string };
  coach: { id: string; name: string };
  requestedBy: { id: string; name: string };
  reviewedBy: { id: string | null; name: string | null } | null;
  /** The regular time of a moved session. */
  from: { date: string; startTime: string; endTime: string } | null;
}

export interface ChangeWarning {
  code: 'location-overlap' | 'students-busy';
  message: string;
  batches?: { id: string; name: string }[];
  students?: { id: string; fullName: string; batchName: string }[];
}

export interface ChangePreview {
  ok: boolean;
  errors: string[];
  warnings: ChangeWarning[];
  kind: 'reschedule' | 'extra';
  originalDate: string | null;
  needsApproval: boolean;
  noticeHours: number | null;
}

export interface ChangeInput {
  /** The session being moved (its current date); absent for a new extra session. */
  sessionDate?: string;
  date: string;
  startTime: string;
  endTime: string;
  reason?: string | null;
  confirm?: boolean;
}

export const useSessionChanges = (q: { status?: SessionChangeStatus; batchId?: string }) =>
  useQuery({
    queryKey: ['session-changes', 'list', q] as const,
    queryFn: () => api.get<SessionChange[]>('/session-changes', q),
  });

export const useBatchSessionChanges = (batchId: string) =>
  useQuery({
    queryKey: ['session-changes', 'batch', batchId] as const,
    queryFn: () => api.get<SessionChange[]>(`/batches/${batchId}/session-changes`),
    enabled: !!batchId,
  });

export const previewChange = (batchId: string, body: ChangeInput) =>
  api.post<ChangePreview>(`/batches/${batchId}/session-changes/preview`, body);

export function useCreateChange(batchId: string) {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (body: ChangeInput) =>
      api.post<SessionChange & { warnings: ChangeWarning[] }>(
        `/batches/${batchId}/session-changes`,
        body,
      ),
    onSuccess: () => invalidate(...SCHEDULE_KEYS),
  });
}

export function useReviewChange() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: ({
      id,
      action,
      note,
      confirm,
    }: {
      id: string;
      action: 'approve' | 'reject' | 'cancel';
      note?: string;
      confirm?: boolean;
    }) =>
      api.post<SessionChange>(`/session-changes/${id}/${action}`, {
        note: note || undefined,
        confirm,
      }),
    onSuccess: () => invalidate(...SCHEDULE_KEYS),
  });
}

// ─── Courses ─────────────────────────────────────────────────────────────────

export type RoundStatus = 'active' | 'awaiting' | 'readmitted' | 'moved' | 'left';

export interface RoundAdjustment {
  invoiceId: string;
  action: 'cancelled' | 'reduced' | 'credited';
  amount: number;
}

export interface RoundView {
  id: string;
  roundNo: number;
  status: RoundStatus;
  startedOn: string;
  completedOn: string | null;
  historical: boolean;
  autoLeft: boolean;
  decidedAt: string | null;
  note: string | null;
  adjustments: RoundAdjustment[];
}

export interface RoundProgress {
  attended: number | null;
  target: number | null;
  remaining: number | null;
  /** Billing month of the course (1-based); past the course length: an extension month. */
  month: number | null;
  extension: boolean;
  perMonth: number;
}

export interface BatchCourse {
  batch: { id: string; name: string; courseMonths: number | null; courseSetOn: string | null };
  sessionsPerMonth: number;
  target: number | null;
  students: (RoundProgress & {
    student: { id: string; code: string; fullName: string };
    round: RoundView;
  })[];
  awaiting: (RoundProgress & {
    student: { id: string; code: string; fullName: string };
    round: RoundView;
  })[];
}

export interface StudentCourse {
  rounds: (RoundView &
    RoundProgress & { batch: { id: string; name: string; courseMonths: number | null } })[];
  /** Admins only. */
  credits: Credit[] | null;
}

export type CreditStatus =
  'held' | 'assigned' | 'applied' | 'refund_due' | 'refunded' | 'forfeited' | 'void';

export interface Credit {
  id: string;
  studentId: string;
  kind: 'course_unused' | 'shortfall';
  amount: number;
  status: CreditStatus;
  enrollmentId: string | null;
  roundId: string | null;
  sourceInvoiceId: string | null;
  appliedInvoiceId: string | null;
  reason: string;
  settledAt: string | null;
  note: string | null;
  createdAt: string;
  student?: { id: string; code: string; fullName: string };
  sourceInvoice?: { id: string; number: string } | null;
}

export interface CourseDecision extends RoundView {
  attended: number;
  target: number;
  student: { id: string; code: string; fullName: string; phone: string };
  batch: { id: string; name: string; capacity: number };
  fee: { customMonthlyFee: number | null; monthlyDiscount: number };
  dues: { amount: number; count: number };
  /** Credit waiting for the decision (paise). */
  credit: number;
  autoLeaveOn: string;
}

export interface DecisionInput {
  action: 'readmit' | 'move' | 'leave';
  startsOn?: string;
  batchId?: string;
  customMonthlyFee?: number | null;
  monthlyDiscount?: number;
  credit?: 'refund' | 'forfeit';
  confirmDues?: boolean;
  note?: string | null;
}

export const useBatchCourse = (batchId: string, enabled = true) =>
  useQuery({
    queryKey: ['courses', 'batch', batchId] as const,
    queryFn: () => api.get<BatchCourse>(`/courses/batches/${batchId}`),
    enabled: !!batchId && enabled,
  });

export const useStudentCourse = (studentId: string) =>
  useQuery({
    queryKey: ['courses', 'student', studentId] as const,
    queryFn: () => api.get<StudentCourse>(`/courses/students/${studentId}`),
    enabled: !!studentId,
  });

export const useCourseDecisions = () =>
  useQuery({
    queryKey: ['courses', 'decisions'] as const,
    queryFn: () => api.get<CourseDecision[]>('/courses/decisions'),
  });

export function useDecide() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: ({ roundId, ...body }: DecisionInput & { roundId: string }) =>
      api.post<{ enrollmentId: string | null; leftAcademy: boolean; creditTotal: number }>(
        `/courses/rounds/${roundId}/decide`,
        body,
      ),
    onSuccess: () =>
      invalidate(['courses'], ['students'], ['batches'], ['invoices'], ['me', 'tasks']),
  });
}

export const useCredits = (q: { status?: CreditStatus; studentId?: string }) =>
  useQuery({
    queryKey: ['courses', 'credits', q] as const,
    queryFn: () => api.get<Credit[]>('/courses/credits', q),
  });

export function useSettleCredit() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: ({
      id,
      ...body
    }: {
      id: string;
      action: 'refunded' | 'forfeited' | 'assign';
      enrollmentId?: string;
      note?: string | null;
    }) => api.post<Credit>(`/courses/credits/${id}/settle`, body),
    onSuccess: () => invalidate(['courses'], ['me', 'tasks']),
  });
}

export const shareCertificate = (roundId: string) =>
  api.post<{ url: string; expiresAt: string; whatsapp: string }>(
    `/courses/rounds/${roundId}/certificate/share`,
  );

export const certificatePath = (roundId: string) => `/courses/rounds/${roundId}/certificate`;

// ─── Delivery ────────────────────────────────────────────────────────────────

export type ShortfallStatus =
  'at_risk' | 'short' | 'recovered' | 'discounted' | 'extra_added' | 'dismissed';

export interface Shortfall {
  id: string;
  enrollmentId: string;
  cycleNumber: number;
  periodStart: string;
  periodEnd: string;
  target: number;
  held: number;
  remaining: number;
  status: ShortfallStatus;
  amount: number | null;
  invoiceId: string | null;
  sessionChangeId: string | null;
  resolvedAt: string | null;
  note: string | null;
  student: { id: string; code: string; fullName: string };
  batch: { id: string; name: string };
  missing: number;
  /** What a discount would be worth (admins only). */
  discountValue?: number;
}

export interface PaceRow {
  roundId: string;
  student: { id: string; fullName: string; code: string };
  batch: { id: string; name: string; coachId: string };
  attended: number;
  target: number;
  remaining: number;
  short: number;
  courseEndsOn: string;
  inExtension: boolean;
}

export const useShortfalls = (q: { status?: ShortfallStatus | 'open'; batchId?: string }) =>
  useQuery({
    queryKey: ['delivery', 'shortfalls', q] as const,
    queryFn: () => api.get<Shortfall[]>('/delivery/shortfalls', q),
  });

export const usePace = (batchId?: string) =>
  useQuery({
    queryKey: ['delivery', 'pace', batchId ?? 'all'] as const,
    queryFn: () => api.get<PaceRow[]>('/delivery/pace', batchId ? { batchId } : undefined),
  });

export function useResolveShortfall() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: ({
      id,
      action,
      ...body
    }: {
      id: string;
      action: 'discount' | 'extra' | 'dismiss';
      note?: string | null;
      reason?: string;
      sessionChangeId?: string;
    }) => api.post(`/delivery/shortfalls/${id}/${action}`, body),
    onSuccess: () => invalidate(['delivery'], ['invoices'], ['courses'], ['me', 'tasks']),
  });
}

/** How a round reads: "8 of 12", "Completed · awaiting decision", … */
export const ROUND_STATUS: Record<
  RoundStatus,
  { label: string; badge: 'default' | 'success' | 'warning' | 'muted' }
> = {
  active: { label: 'In progress', badge: 'default' },
  awaiting: { label: 'Completed · awaiting decision', badge: 'warning' },
  readmitted: { label: 'Completed · re-admitted', badge: 'success' },
  moved: { label: 'Completed · moved batch', badge: 'success' },
  left: { label: 'Ended', badge: 'muted' },
};

export const CREDIT_STATUS: Record<
  CreditStatus,
  { label: string; badge: 'default' | 'success' | 'warning' | 'muted' | 'destructive' }
> = {
  held: { label: 'Waiting for decision', badge: 'warning' },
  assigned: { label: 'Off next invoice', badge: 'default' },
  applied: { label: 'Applied', badge: 'success' },
  refund_due: { label: 'Refund owed', badge: 'destructive' },
  refunded: { label: 'Refunded', badge: 'muted' },
  forfeited: { label: 'Forfeited', badge: 'muted' },
  void: { label: 'Undone', badge: 'muted' },
};

/** "12 sessions a month · 36 in all", and what a change means for current students. */
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
  if (!batch) return total;
  if (!batch.courseMonths)
    return n >= 1 && batch.memberCount
      ? `${total}. Current students’ past attendance is counted towards it.`
      : `${total}. Leave empty to set it up later.`;
  if (n >= 1 && n !== batch.courseMonths && batch.memberCount)
    return `${total}. Applies to everyone now; anyone already past it completes today.`;
  return total;
}
