/**
 * React Query hooks for every API resource. Pages only use these hooks — never `fetch` directly —
 * so caching, invalidation and loading states are consistent across the app.
 */
import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
  type QueryKey,
} from '@tanstack/react-query';
import { api, type PageMeta, type Session } from './api';
import type {
  AcademySettings,
  AttendanceSheet,
  AttendanceStatus,
  AttendanceSummary,
  Batch,
  BatchDetail,
  CoachSession,
  DayOverviewSession,
  FeedbackTemplate,
  FeePlan,
  FinanceSummary,
  Invoice,
  InvoiceDetail,
  LessonPlan,
  LibraryItem,
  Location,
  Registration,
  RosterEntry,
  StudentDetail,
  StudentListItem,
  TodaySession,
  User,
  WeeklyFeedback,
} from './types';

type Query = Record<string, unknown>;

export const keys = {
  users: (q?: Query) => ['users', q ?? {}] as const,
  locations: (q?: Query) => ['locations', q ?? {}] as const,
  feePlans: (q?: Query) => ['fee-plans', q ?? {}] as const,
  batches: (q?: Query) => ['batches', q ?? {}] as const,
  batch: (id: string) => ['batches', 'detail', id] as const,
  roster: (id: string, date: string) => ['batches', 'roster', id, date] as const,
  students: (q?: Query) => ['students', q ?? {}] as const,
  student: (id: string) => ['students', 'detail', id] as const,
  attendanceOverview: (date: string) => ['attendance', 'overview', date] as const,
  attendanceSession: (batchId: string, date: string) =>
    ['attendance', 'session', batchId, date] as const,
  studentAttendance: (id: string, q: Query) => ['attendance', 'student', id, q] as const,
  register: (q: Query) => ['attendance', 'register', q] as const,
  coachToday: ['coach-sessions', 'today'] as const,
  coachSessions: (q: Query) => ['coach-sessions', q] as const,
  library: (kind: 'stages' | 'events', q?: Query) => ['lessons', kind, q ?? {}] as const,
  planCalendar: (q: Query) => ['lessons', 'calendar', q] as const,
  planDay: (batchId: string, date: string) => ['lessons', 'day', batchId, date] as const,
  feedbackTemplate: ['feedback', 'template'] as const,
  feedbackWeek: (q: Query) => ['feedback', 'week', q] as const,
  feedbackReport: (studentId: string, weekStart: string) =>
    ['feedback', 'report', studentId, weekStart] as const,
  feedbackHistory: (studentId: string) => ['feedback', 'history', studentId] as const,
  feedbackTrends: (studentId: string) => ['feedback', 'trends', studentId] as const,
  invoices: (q?: Query) => ['invoices', q ?? {}] as const,
  invoice: (id: string) => ['invoices', 'detail', id] as const,
  finance: (q: Query) => ['finance', 'summary', q] as const,
  projection: (days: number) => ['finance', 'projection', days] as const,
  registrations: (q: Query) => ['registrations', q] as const,
  settings: ['settings'] as const,
  auditLogs: (q: Query) => ['audit-logs', q] as const,
  jobRuns: ['job-runs'] as const,
};

/** Invalidate several key prefixes after a mutation. */
function useInvalidate() {
  const qc = useQueryClient();
  return (...prefixes: QueryKey[]) =>
    Promise.all(prefixes.map((queryKey) => qc.invalidateQueries({ queryKey })));
}

// ─── Users / coaches ─────────────────────────────────────────────────────────

export const useUsers = (q: Query) =>
  useQuery({
    queryKey: keys.users(q),
    queryFn: ({ signal }) => api.page<User[]>('/users', q, signal),
    placeholderData: keepPreviousData,
  });

export function useCreateUser() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (body: {
      name: string;
      email: string;
      phone?: string | null;
      role: 'admin' | 'coach';
    }) => api.post<{ user: User; inviteUrl: string; inviteExpiresAt: string }>('/users', body),
    onSuccess: () => invalidate(['users']),
  });
}

export function useUpdateUser() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: ({
      id,
      ...body
    }: {
      id: string;
      name?: string;
      email?: string;
      phone?: string | null;
    }) => api.patch<User>(`/users/${id}`, body),
    onSuccess: () => invalidate(['users']),
  });
}

export function useSetUserStatus() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: ({ id, status }: { id: string; status: 'active' | 'disabled' }) =>
      api.post<User>(`/users/${id}/status`, { status }),
    onSuccess: () => invalidate(['users']),
  });
}

export const useAccessLink = () =>
  useMutation({
    mutationFn: (id: string) =>
      api.post<{ type: 'invite' | 'password_reset'; url: string; expiresAt: string }>(
        `/users/${id}/access-link`,
      ),
  });

export const useUpdateProfile = () =>
  useMutation({
    mutationFn: (body: { name?: string; phone?: string | null }) =>
      api.patch<User>('/users/me', body),
  });

export const useChangePassword = () =>
  useMutation({
    mutationFn: (body: { currentPassword: string; newPassword: string }) =>
      api.post<Session>('/auth/change-password', body),
  });

// ─── Locations / fee plans / settings ────────────────────────────────────────

export const useLocations = (q: Query = {}) =>
  useQuery({
    queryKey: keys.locations(q),
    queryFn: ({ signal }) => api.get<Location[]>('/locations', q, signal),
  });

export function useSaveLocation() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: ({ id, ...body }: Partial<Location> & { id?: string }) =>
      id ? api.patch<Location>(`/locations/${id}`, body) : api.post<Location>('/locations', body),
    onSuccess: () => invalidate(['locations'], ['batches']),
  });
}

export const useFeePlans = (q: Query = {}) =>
  useQuery({
    queryKey: keys.feePlans(q),
    queryFn: ({ signal }) => api.get<FeePlan[]>('/fee-plans', q, signal),
  });

export function useSaveFeePlan() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: ({ id, ...body }: Partial<FeePlan> & { id?: string }) =>
      id ? api.patch<FeePlan>(`/fee-plans/${id}`, body) : api.post<FeePlan>('/fee-plans', body),
    onSuccess: () => invalidate(['fee-plans']),
  });
}

export const useSettings = () =>
  useQuery({
    queryKey: keys.settings,
    queryFn: () => api.get<AcademySettings>('/settings'),
    staleTime: 5 * 60_000,
  });

export function useSaveSettings() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (body: Partial<AcademySettings>) => api.put<AcademySettings>('/settings', body),
    onSuccess: () => invalidate(keys.settings),
  });
}

// ─── Batches ─────────────────────────────────────────────────────────────────

export const useBatches = (q: Query = {}) =>
  useQuery({
    queryKey: keys.batches(q),
    queryFn: ({ signal }) => api.get<Batch[]>('/batches', q, signal),
  });

export const useBatch = (id: string | undefined) =>
  useQuery({
    queryKey: keys.batch(id ?? ''),
    queryFn: () => api.get<BatchDetail>(`/batches/${id}`),
    enabled: Boolean(id),
  });

export const useRoster = (id: string, date: string) =>
  useQuery({
    queryKey: keys.roster(id, date),
    queryFn: () =>
      api.get<{ date: string; students: RosterEntry[] }>(`/batches/${id}/roster`, { date }),
  });

export function useSaveBatch() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: ({ id, ...body }: { id?: string } & Record<string, unknown>) =>
      id ? api.patch<Batch>(`/batches/${id}`, body) : api.post<Batch>('/batches', body),
    onSuccess: () => invalidate(['batches'], ['users'], ['locations']),
  });
}

// ─── Students ────────────────────────────────────────────────────────────────

export const useStudents = (q: Query) =>
  useQuery({
    queryKey: keys.students(q),
    queryFn: ({ signal }) => api.page<StudentListItem[]>('/students', q, signal),
    placeholderData: keepPreviousData,
  });

const studentQuery = (id: string) => ({
  queryKey: keys.student(id),
  queryFn: () => api.get<StudentDetail>(`/students/${id}`),
});

export const useStudent = (id: string) => useQuery(studentQuery(id));

/** Warms the student detail cache on intent (touch/hover) so the page opens with data. */
export function usePrefetchStudent() {
  const qc = useQueryClient();
  return (id: string) => void qc.prefetchQuery({ ...studentQuery(id), staleTime: 30_000 });
}

function useStudentMutation<B>(fn: (body: B) => Promise<StudentDetail>) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: (s) => {
      qc.setQueryData(keys.student(s.id), s);
      return Promise.all([
        qc.invalidateQueries({ queryKey: ['students'] }),
        qc.invalidateQueries({ queryKey: ['batches'] }),
        qc.invalidateQueries({ queryKey: ['attendance'] }),
      ]);
    },
  });
}

export const useCreateStudent = () =>
  useStudentMutation((body: Record<string, unknown>) => api.post<StudentDetail>('/students', body));
export const useUpdateStudent = (id: string) =>
  useStudentMutation((body: Record<string, unknown>) =>
    api.patch<StudentDetail>(`/students/${id}`, body),
  );
export const useTransferStudent = (id: string) =>
  useStudentMutation(
    (body: {
      batchId: string;
      trainingDays: number[];
      effectiveFrom: string;
      reason?: string | null;
    }) => api.post<StudentDetail>(`/students/${id}/transfer`, body),
  );
export const useStudentLeave = (id: string) =>
  useStudentMutation((body: { leftOn: string; reason?: string | null }) =>
    api.post<StudentDetail>(`/students/${id}/leave`, body),
  );

export function useBookMakeup(studentId: string) {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (body: {
      batchId: string;
      date: string;
      missedDate?: string | null;
      reason?: string | null;
    }) => api.post(`/students/${studentId}/makeups`, body),
    onSuccess: () => invalidate(keys.student(studentId), ['attendance'], ['batches']),
  });
}

export function useCancelMakeup(studentId: string) {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (makeupId: string) => api.delete(`/students/${studentId}/makeups/${makeupId}`),
    onSuccess: () => invalidate(keys.student(studentId), ['attendance']),
  });
}

// ─── Attendance ──────────────────────────────────────────────────────────────

export const useAttendanceOverview = (date: string) =>
  useQuery({
    queryKey: keys.attendanceOverview(date),
    queryFn: () =>
      api.get<{ date: string; sessions: DayOverviewSession[] }>('/attendance/overview', { date }),
  });

export const useAttendanceSheet = (batchId: string | undefined, date: string) =>
  useQuery({
    queryKey: keys.attendanceSession(batchId ?? '', date),
    queryFn: () => api.get<AttendanceSheet>('/attendance/session', { batchId, date }),
    enabled: Boolean(batchId),
  });

export function useSaveAttendance() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (body: {
      batchId: string;
      date: string;
      records: { studentId: string; status: AttendanceStatus; note?: string | null }[];
    }) => api.put<{ saved: number }>('/attendance/session', body),
    onSuccess: (_d, v) =>
      invalidate(
        keys.attendanceSession(v.batchId, v.date),
        ['attendance', 'overview'],
        ['attendance', 'student'],
      ),
  });
}

export const useStudentAttendance = (id: string, q: { from?: string; to?: string }) =>
  useQuery({
    queryKey: keys.studentAttendance(id, q),
    queryFn: () =>
      api.get<{
        from: string;
        to: string;
        records: {
          date: string;
          status: AttendanceStatus;
          note: string | null;
          isMakeup: boolean;
          batchName: string;
        }[];
        summary: AttendanceSummary & { total: number; attendanceRate: number | null };
      }>(`/attendance/students/${id}`, q),
  });

export const useRegister = (q: { batchId?: string; from: string; to: string }) =>
  useQuery({
    queryKey: keys.register(q),
    queryFn: () =>
      api.get<{
        batch: { id: string; name: string };
        dates: string[];
        cancelled: Record<string, string>;
        students: {
          studentId: string;
          fullName: string;
          code: string;
          marks: Record<string, AttendanceStatus>;
        }[];
      }>('/attendance/register', q),
    enabled: Boolean(q.batchId),
  });

// ─── Coach sessions ──────────────────────────────────────────────────────────

export const useCoachToday = (enabled = true) =>
  useQuery({
    queryKey: keys.coachToday,
    queryFn: () => api.get<{ date: string; sessions: TodaySession[] }>('/coach-sessions/today'),
    enabled,
  });

export function useCheck(kind: 'check-in' | 'check-out') {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (body: {
      batchId: string;
      latitude: number;
      longitude: number;
      accuracy?: number | null;
      note?: string | null;
    }) => api.post<{ session: CoachSession; message: string }>(`/coach-sessions/${kind}`, body),
    onSuccess: () => invalidate(['coach-sessions'], ['attendance', 'overview']),
  });
}

export type CoachSessionRow = CoachSession & {
  coach: { id: string; name: string };
  batch: { id: string; name: string; startTime: string; endTime: string };
  location: { id: string; name: string; radiusMeters: number };
};

export const useCoachSessions = (q: Query) =>
  useQuery({
    queryKey: keys.coachSessions(q),
    queryFn: () =>
      api.get<{
        from: string;
        to: string;
        sessions: CoachSessionRow[];
        summary: {
          sessions: number;
          flagged: number;
          unreviewedFlagged: number;
          missingCheckOut: number;
          totalHours: number;
        };
      }>('/coach-sessions', q),
    placeholderData: keepPreviousData,
  });

export function useReviewSession() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: ({ id, note }: { id: string; note?: string | null }) =>
      api.post(`/coach-sessions/${id}/review`, { note }),
    onSuccess: () => invalidate(['coach-sessions']),
  });
}

// ─── Lessons ─────────────────────────────────────────────────────────────────

export const useLibrary = (kind: 'stages' | 'events', q: Query = {}) =>
  useQuery({
    queryKey: keys.library(kind, q),
    queryFn: () => api.get<LibraryItem[]>(`/lessons/${kind}`, q),
  });

export function useSaveLibraryItem(kind: 'stages' | 'events') {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: ({
      id,
      ...body
    }: {
      id?: string;
      name?: string;
      description?: string | null;
      color?: string | null;
      isArchived?: boolean;
    }) =>
      id
        ? api.patch<LibraryItem>(`/lessons/${kind}/${id}`, body)
        : api.post<LibraryItem>(`/lessons/${kind}`, body),
    onSuccess: () => invalidate(['lessons', kind]),
  });
}

export function useReorderLibrary(kind: 'stages' | 'events') {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (ids: string[]) => api.put(`/lessons/${kind}/order`, { ids }),
    onSuccess: () => invalidate(['lessons', kind]),
  });
}

export const usePlanCalendar = (q: { batchId?: string; from: string; to: string }) =>
  useQuery({
    queryKey: keys.planCalendar(q),
    queryFn: () =>
      api.get<{
        batch: { id: string; name: string; weekdays: number[] };
        days: {
          date: string;
          isSessionDay: boolean;
          cancelled: string | null;
          planId: string | null;
          filledCells: number;
          totalCells: number;
        }[];
      }>('/lessons/plans', q),
    enabled: Boolean(q.batchId),
    placeholderData: keepPreviousData,
  });

export const usePlanDay = (batchId: string | undefined, date: string) =>
  useQuery({
    queryKey: keys.planDay(batchId ?? '', date),
    queryFn: () =>
      api.get<{
        batch: { id: string; name: string };
        date: string;
        isSessionDay: boolean;
        cancelled?: string | null;
        lockedReason?: string | null;
        plan: LessonPlan | null;
      }>('/lessons/plans/day', { batchId, date }),
    enabled: Boolean(batchId),
  });

export function useSavePlan() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: {
      batchId: string;
      date: string;
      stageIds: string[];
      eventIds: string[];
      notes: string | null;
      cells: { eventId: string; stageId: string; content: string }[];
    }) => api.put<LessonPlan>('/lessons/plans/day', body),
    onSuccess: (plan, v) => {
      qc.setQueryData(
        keys.planDay(v.batchId, v.date),
        (old: { plan: LessonPlan | null } | undefined) => (old ? { ...old, plan } : old),
      );
      return Promise.all([
        qc.invalidateQueries({ queryKey: ['lessons', 'calendar'] }),
        qc.invalidateQueries({ queryKey: ['attendance', 'overview'] }),
      ]);
    },
  });
}

export function useDeletePlan() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (q: { batchId: string; date: string }) => api.delete('/lessons/plans/day', q),
    onSuccess: (_d, v) => invalidate(keys.planDay(v.batchId, v.date), ['lessons', 'calendar']),
  });
}

export function useCopyPlan() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (body: {
      batchId: string;
      fromDate: string;
      toDates: string[];
      overwrite?: boolean;
      toBatchId?: string;
    }) => api.post<{ copied: string[]; skipped: string[] }>('/lessons/plans/copy', body),
    onSuccess: () => invalidate(['lessons']),
  });
}

// ─── Feedback ────────────────────────────────────────────────────────────────

export const useFeedbackTemplate = () =>
  useQuery({
    queryKey: keys.feedbackTemplate,
    queryFn: () => api.get<FeedbackTemplate>('/feedback/template'),
    staleTime: Infinity,
  });

export type FeedbackBoardItem = {
  studentId: string;
  code: string;
  fullName: string;
  batchId: string;
  batchName: string;
  coachId: string;
  feedbackId: string | null;
  status: 'pending' | 'draft' | 'submitted';
  submittedAt: string | null;
  writtenBy: string | null;
};

export const useFeedbackWeek = (q: Query) =>
  useQuery({
    queryKey: keys.feedbackWeek(q),
    queryFn: () =>
      api.get<{
        weekStart: string;
        weekEnd: string;
        students: FeedbackBoardItem[];
        summary: { total: number; submitted: number; draft: number; pending: number };
      }>('/feedback/week', q),
    placeholderData: keepPreviousData,
  });

export const useFeedbackReport = (studentId: string, weekStart: string) =>
  useQuery({
    queryKey: keys.feedbackReport(studentId, weekStart),
    queryFn: () =>
      api.get<{
        student: { id: string; code: string; fullName: string };
        weekStart: string;
        weekEnd: string;
        template: FeedbackTemplate;
        feedback: WeeklyFeedback | null;
        attendance: AttendanceSummary;
        editable: boolean;
        /** Feedback opens only after the week ends. */
        weekCompleted?: boolean;
        opensOn?: string;
      }>(`/feedback/students/${studentId}/weeks/${weekStart}`),
  });

export function useSaveFeedback(studentId: string, weekStart: string) {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (body: { answers: Record<string, unknown>; submit: boolean }) =>
      api.put<WeeklyFeedback>(`/feedback/students/${studentId}/weeks/${weekStart}`, body),
    onSuccess: () =>
      invalidate(
        keys.feedbackReport(studentId, weekStart),
        ['feedback', 'week'],
        keys.feedbackHistory(studentId),
        keys.feedbackTrends(studentId),
      ),
  });
}

export const useFeedbackHistory = (studentId: string) =>
  useQuery({
    queryKey: keys.feedbackHistory(studentId),
    queryFn: () =>
      api.get<(WeeklyFeedback & { coach: { id: string; name: string }; batchName: string })[]>(
        `/feedback/students/${studentId}`,
      ),
  });

export const useFeedbackTrends = (studentId: string) =>
  useQuery({
    queryKey: keys.feedbackTrends(studentId),
    queryFn: () =>
      api.get<{ id: string; label: string; points: { weekStart: string; value: number }[] }[]>(
        `/feedback/students/${studentId}/trends`,
      ),
  });

// ─── Invoices & finance ──────────────────────────────────────────────────────

export const useInvoices = (q: Query) =>
  useQuery({
    queryKey: keys.invoices(q),
    queryFn: ({ signal }) =>
      api.page<Invoice[], PageMeta & { totalAmount: number }>('/invoices', q, signal),
    placeholderData: keepPreviousData,
  });

export const useInvoice = (id: string | null) =>
  useQuery({
    queryKey: keys.invoice(id ?? ''),
    queryFn: () => api.get<InvoiceDetail>(`/invoices/${id}`),
    enabled: Boolean(id),
  });

function useInvoiceMutation<B>(fn: (body: B) => Promise<InvoiceDetail>) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: (inv) => {
      qc.setQueryData(keys.invoice(inv.id), inv);
      return Promise.all([
        qc.invalidateQueries({ queryKey: ['invoices'] }),
        qc.invalidateQueries({ queryKey: ['finance'] }),
        qc.invalidateQueries({ queryKey: ['students'] }),
      ]);
    },
  });
}

export const useMarkPaid = (id: string) =>
  useInvoiceMutation(
    (body: { mode: string; reference?: string | null; paidOn: string; note?: string | null }) =>
      api.post<InvoiceDetail>(`/invoices/${id}/payments`, body),
  );

export const useReversePayment = (id: string) =>
  useInvoiceMutation(
    ({
      paymentId,
      action,
      reason,
    }: {
      paymentId: string;
      action: 'revert' | 'refund';
      reason: string;
    }) => api.post<InvoiceDetail>(`/invoices/${id}/payments/${paymentId}/${action}`, { reason }),
  );

export const useCancelInvoice = (id: string) =>
  useInvoiceMutation((reason: string) =>
    api.post<InvoiceDetail>(`/invoices/${id}/cancel`, { reason }),
  );

export const useShareInvoice = () =>
  useMutation({
    mutationFn: (id: string) =>
      api.post<{ message: string; pdfUrl: string; whatsappUrl: string; expiresAt: string }>(
        `/invoices/${id}/share`,
      ),
  });

export const useFinance = (q: Query) =>
  useQuery({
    queryKey: keys.finance(q),
    queryFn: () => api.get<FinanceSummary>('/finance/summary', q),
    placeholderData: keepPreviousData,
  });

export const useProjection = (days: number) =>
  useQuery({
    queryKey: keys.projection(days),
    queryFn: () =>
      api.get<{
        from: string;
        to: string;
        totalAmount: number;
        invoices: {
          studentId: string;
          code: string;
          fullName: string;
          batchName: string | null;
          issueDate: string;
          amount: number;
        }[];
      }>('/finance/projection', { days }),
  });

// ─── Registrations / admin ───────────────────────────────────────────────────

export const useRegistrations = (q: Query) =>
  useQuery({
    queryKey: keys.registrations(q),
    queryFn: () =>
      api.page<
        Registration[],
        PageMeta & { pending: { pendingStudents: number; pendingCoaches: number } }
      >('/registrations', q),
    placeholderData: keepPreviousData,
  });

export function useReviewRegistration() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: ({
      id,
      action,
      body,
    }: {
      id: string;
      action: 'approve' | 'reject';
      body?: Record<string, unknown>;
    }) => api.post(`/registrations/${id}/${action}`, body ?? {}),
    onSuccess: () => invalidate(['registrations'], ['students'], ['users'], ['batches']),
  });
}

export type AuditLog = {
  id: string;
  action: string;
  entityType: string;
  entityId: string | null;
  metadata: Record<string, unknown> | null;
  ipAddress: string | null;
  createdAt: string;
  actor: { id: string; name: string } | null;
};

export const useAuditLogs = (q: Query) =>
  useQuery({
    queryKey: keys.auditLogs(q),
    queryFn: () => api.page<AuditLog[]>('/admin/audit-logs', q),
    placeholderData: keepPreviousData,
  });

export const useJobRuns = () =>
  useQuery({
    queryKey: keys.jobRuns,
    queryFn: () =>
      api.get<
        {
          id: string;
          jobName: string;
          runDate: string;
          trigger: string;
          status: string;
          stats: Record<string, unknown> | null;
          error: string | null;
          startedAt: string;
          finishedAt: string | null;
        }[]
      >('/admin/jobs/runs'),
  });

export function useRunInvoiceJob() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: () =>
      api.post<{ ran: boolean; stats?: { invoicesCreated: number }; reason?: string }>(
        '/admin/jobs/invoices/run',
      ),
    onSuccess: () => invalidate(keys.jobRuns, ['invoices'], ['finance']),
  });
}

// ─── Session cancellations, rejoin, delete, invoice adjustments ──────────────

export function useCancelSession() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: ({ batchId, date, reason }: { batchId: string; date: string; reason: string }) =>
      api.post(`/batches/${batchId}/cancellations`, { date, reason }),
    onSuccess: () =>
      invalidate(['attendance'], ['coach-sessions'], ['lessons', 'calendar'], ['feedback']),
  });
}

export function useRestoreSession() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: ({ batchId, date }: { batchId: string; date: string }) =>
      api.delete(`/batches/${batchId}/cancellations/${date}`),
    onSuccess: () =>
      invalidate(['attendance'], ['coach-sessions'], ['lessons', 'calendar'], ['feedback']),
  });
}

export const useRejoinStudent = (id: string) =>
  useStudentMutation(
    (body: {
      rejoinDate: string;
      batchId: string;
      trainingDays: number[];
      feePlanId?: string;
      customMonthlyFee?: number | null;
      monthlyDiscount?: number;
    }) => api.post<StudentDetail>(`/students/${id}/rejoin`, body),
  );

export function useDeleteStudent() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (id: string) => api.delete(`/students/${id}`),
    onSuccess: () => invalidate(['students'], ['batches']),
  });
}

export const useAdjustInvoice = (id: string) =>
  useInvoiceMutation((body: { discountAmount: number; reason: string }) =>
    api.post<InvoiceDetail>(`/invoices/${id}/adjust`, body),
  );
