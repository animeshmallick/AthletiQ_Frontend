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
  useInfiniteQuery,
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
  LessonInsights,
  Substitution,
  SubstitutionInsights,
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
  TasksResponse,
  FundsOverview,
  FundTxn,
  Payee,
  SplitNode,
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
  calendar: (from: string, to: string) => ['attendance', 'calendar', from, to] as const,
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
  jobRuns: ['job-runs'] as const,
  fundsOverview: (q: Query) => ['funds', 'overview', q] as const,
  fundTxns: (q: Query) => ['funds', 'txns', q] as const,
  payees: ['funds', 'payees'] as const,
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
        // Joining or leaving batches issues / stops invoices.
        qc.invalidateQueries({ queryKey: ['invoices'] }),
        qc.invalidateQueries({ queryKey: ['finance'] }),
        qc.invalidateQueries({ queryKey: ['funds'] }),
        qc.invalidateQueries({ queryKey: ['skills'] }),
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
/** A batch to join, with this student's own price adjustments (the plan comes from the batch). */
export interface BatchPick {
  batchId: string;
  customMonthlyFee?: number | null;
  monthlyDiscount?: number;
}

/** Adds a student to another batch (billed separately from the day they join). */
export const useJoinBatch = (id: string) =>
  useStudentMutation((body: BatchPick & { effectiveFrom: string; reason?: string | null }) =>
    api.post<StudentDetail>(`/students/${id}/batches`, body),
  );
/** Changes one membership's custom fee / discount (from its next invoice). */
export const useUpdateMembership = (id: string) =>
  useStudentMutation(
    ({
      enrollmentId,
      ...body
    }: {
      enrollmentId: string;
      customMonthlyFee?: number | null;
      monthlyDiscount?: number;
    }) => api.patch<StudentDetail>(`/students/${id}/batches/${enrollmentId}`, body),
  );
/** Moves a membership to another batch; billing continues on the same day. */
export const useMoveMembership = (id: string) =>
  useStudentMutation(
    ({
      enrollmentId,
      ...body
    }: {
      enrollmentId: string;
      batchId: string;
      effectiveFrom: string;
      reason?: string | null;
    }) => api.post<StudentDetail>(`/students/${id}/batches/${enrollmentId}/move`, body),
  );
/** Ends one membership (its invoices stop). */
export const useLeaveBatch = (id: string) =>
  useStudentMutation(
    ({ enrollmentId, ...body }: { enrollmentId: string; leftOn: string; reason?: string | null }) =>
      api.post<StudentDetail>(`/students/${id}/batches/${enrollmentId}/leave`, body),
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

/** Week (or longer) of day overviews for the calendar. */
export const useCalendar = (from: string, to: string) =>
  useQuery({
    queryKey: keys.calendar(from, to),
    queryFn: () =>
      api.get<{
        from: string;
        to: string;
        today: string;
        days: { date: string; sessions: DayOverviewSession[] }[];
      }>('/attendance/calendar', { from, to }),
    placeholderData: (prev) => prev, // keep the grid while moving between weeks
  });

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

/** Admin: close a session a coach forgot to check out of. */
export function useAdminCheckOut() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: ({ id, at, reason }: { id: string; at?: string; reason?: string | null }) =>
      api.post(`/coach-sessions/${id}/check-out`, { at, reason }),
    onSuccess: () => invalidate(['coach-sessions'], ['attendance'], ['me', 'tasks']),
  });
}

// ─── Lessons ─────────────────────────────────────────────────────────────────

/** A batch's plan template: its stages (columns) or events (rows). */
export const useLibrary = (
  kind: 'stages' | 'events',
  q: { batchId?: string; includeArchived?: 'true' },
) =>
  useQuery({
    queryKey: keys.library(kind, q),
    queryFn: () => api.get<LibraryItem[]>(`/lessons/${kind}`, q),
    enabled: Boolean(q.batchId),
  });

export function useSaveLibraryItem(kind: 'stages' | 'events') {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: ({
      id,
      ...body
    }: {
      id?: string;
      batchId?: string;
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
    mutationFn: (body: { batchId: string; ids: string[] }) =>
      api.put(`/lessons/${kind}/order`, body),
    onSuccess: () => invalidate(['lessons', kind]),
  });
}

export function useCopyTemplate() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (body: { fromBatchId: string; toBatchId: string }) =>
      api.post<{ stages: number; events: number }>('/lessons/template/copy', body),
    onSuccess: () => invalidate(['lessons', 'stages'], ['lessons', 'events']),
  });
}

export interface PlanCalendar {
  batch: { id: string; name: string; weekdays: number[] };
  days: {
    date: string;
    isSessionDay: boolean;
    cancelled: string | null;
    planId: string | null;
    filledCells: number;
    totalCells: number;
  }[];
}

/** Query options for one batch's plan calendar (shared by the hook and multi-batch views). */
export const planCalendarQuery = (q: { batchId?: string; from: string; to: string }) => ({
  queryKey: keys.planCalendar(q),
  queryFn: () => api.get<PlanCalendar>('/lessons/plans', q),
  enabled: Boolean(q.batchId),
  placeholderData: keepPreviousData,
});

export const usePlanCalendar = (q: { batchId?: string; from: string; to: string }) =>
  useQuery(planCalendarQuery(q));

export const useLessonInsights = (q: {
  from: string;
  to: string;
  batchId?: string;
  coachId?: string;
}) =>
  useQuery({
    queryKey: ['lessons', 'insights', q] as const,
    queryFn: () => api.get<LessonInsights>('/lessons/insights', q),
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
        previousPlanDate?: string | null;
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
        qc.invalidateQueries({ queryKey: ['lessons', 'insights'] }),
        qc.invalidateQueries({ queryKey: ['attendance', 'overview'] }),
      ]);
    },
  });
}

export function useDeletePlan() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (q: { batchId: string; date: string }) => api.delete('/lessons/plans/day', q),
    onSuccess: (_d, v) =>
      invalidate(keys.planDay(v.batchId, v.date), ['lessons', 'calendar'], ['lessons', 'insights']),
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
        qc.invalidateQueries({ queryKey: ['funds'] }),
      ]);
    },
  });
}

export const useMarkPaid = (id: string) =>
  useInvoiceMutation(
    (body: {
      mode: string;
      reference?: string | null;
      paidOn: string;
      note?: string | null;
      heldBy?: 'collector' | 'academy';
    }) => api.post<InvoiceDetail>(`/invoices/${id}/payments`, body),
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

// ─── Activity (audit trail, request log, failures) ───────────────────────────
// Admins see the whole academy; coaches see only their own activity.

export type ActivityLog = AuditLog & {
  actorId: string | null;
  actor: { id: string; name: string; role?: string } | null;
};
type Count = { n: number };
export type ActivityPerson = { id: string; name: string; role: string; n: number };
export type ActivityInsights = {
  from: string;
  to: string;
  totals: {
    events: number;
    people: number;
    records: number;
    sensitive: number;
    activeDays: number;
    perDay: number;
    previous: number;
    change: number | null;
  };
  busiestDay: ({ date: string } & Count) | null;
  busiestHour: number | null;
  byDay: ({ date: string } & Count)[];
  byHour: number[];
  byEntity: ({ entityType: string } & Count)[];
  byAction: ({ action: string } & Count)[];
  byActor: ActivityPerson[];
  notable: ActivityLog[];
};
export type RouteStat = {
  method: string;
  route: string;
  n: number;
  failed: number;
  avgMs: number;
  maxMs: number;
};
export type RequestInsights = {
  totals: {
    total: number;
    writes: number;
    failed: number;
    avgMs: number;
    p95Ms: number;
    people: number;
  };
  byRoute: RouteStat[];
  slowest: RouteStat[];
  byPerson: (ActivityPerson & { failed: number })[];
};
export type ErrorInsights = {
  totals: { total: number; server: number; client: number; routes: number; users: number };
  byDay: ({ date: string; server: number } & Count)[];
  byStatus: ({ status: number } & Count)[];
  byCode: ({ code: string | null } & Count)[];
  byRoute: ({
    method: string;
    route: string;
    server: number;
    last: string;
    sample: string | null;
  } & Count)[];
};
export type ApiRequest = {
  id: string;
  method: string;
  route: string;
  status: number;
  durationMs: number;
  code: string | null;
  message: string | null;
  userId: string | null;
  requestId: string | null;
  ipAddress: string | null;
  userAgent: string | null;
  createdAt: string;
  user: { id: string; name: string } | null;
};
export type ActivitySummary = {
  generatedAt: string;
  scope: 'academy' | 'self';
  totals: {
    events: number;
    people: number;
    records: number;
    activeDays: number;
    spanDays: number;
    sensitive: number;
    first: string | null;
    last: string | null;
  };
  busiestDay: ({ date: string } & Count) | null;
  busiestHour: number | null;
  byMonth: ({ month: string } & Count)[];
  byHour: number[];
  topActions: ({ action: string } & Count)[];
  topActors: ActivityPerson[];
  byEntity: ({ entityType: string } & Count)[];
  sensitive: ({ action: string } & Count)[];
  errors: { total: number; server: number; routes: number } | null;
  highlights: string[];
};
type Range = { from: string; to: string };
const nextPage = (last: { meta?: PageMeta }) =>
  last.meta && last.meta.page < last.meta.totalPages ? last.meta.page + 1 : undefined;

export const ACTIVITY_PAGE_SIZE = 50;
export const useActivityLogs = (q: Query) =>
  useInfiniteQuery({
    queryKey: ['activity', 'logs', q],
    queryFn: ({ pageParam, signal }) =>
      api.page<ActivityLog[]>(
        '/activity/logs',
        { ...q, page: pageParam, pageSize: ACTIVITY_PAGE_SIZE },
        signal,
      ),
    initialPageParam: 1,
    getNextPageParam: nextPage,
  });

export const useActivityInsights = (r: Range, enabled = true) =>
  useQuery({
    queryKey: ['activity', 'insights', r],
    queryFn: ({ signal }) => api.get<ActivityInsights>('/activity/insights', r, signal),
    placeholderData: keepPreviousData,
    enabled,
  });

export const useRequestInsights = (r: Range, enabled = true) =>
  useQuery({
    queryKey: ['activity', 'requests', r],
    queryFn: ({ signal }) => api.get<RequestInsights>('/activity/requests/insights', r, signal),
    placeholderData: keepPreviousData,
    enabled,
  });

export const useErrorInsights = (r: Range, enabled = true) =>
  useQuery({
    queryKey: ['activity', 'errors', 'insights', r],
    queryFn: ({ signal }) => api.get<ErrorInsights>('/activity/errors/insights', r, signal),
    placeholderData: keepPreviousData,
    enabled,
  });

export const useApiErrors = (q: Range & Query, enabled = true) =>
  useInfiniteQuery({
    queryKey: ['activity', 'errors', 'list', q],
    queryFn: ({ pageParam, signal }) =>
      api.page<ApiRequest[]>(
        '/activity/errors',
        { ...q, page: pageParam, pageSize: ACTIVITY_PAGE_SIZE },
        signal,
      ),
    initialPageParam: 1,
    getNextPageParam: nextPage,
    enabled,
  });

/** Every recorded change and failed request (newest first). */
export const useApiRequests = (q: Range & Query, enabled = true) =>
  useInfiniteQuery({
    queryKey: ['activity', 'requests', 'list', q],
    queryFn: ({ pageParam, signal }) =>
      api.page<ApiRequest[]>(
        '/activity/requests',
        { ...q, page: pageParam, pageSize: ACTIVITY_PAGE_SIZE },
        signal,
      ),
    initialPageParam: 1,
    getNextPageParam: nextPage,
    enabled,
  });

/** Reads the whole log on the server (slow on a big log), so it runs only when asked. */
export const useActivitySummary = () =>
  useMutation({ mutationFn: () => api.post<ActivitySummary>('/activity/summary', {}) });

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
  useStudentMutation((body: { rejoinDate: string; batches: BatchPick[]; reason?: string | null }) =>
    api.post<StudentDetail>(`/students/${id}/rejoin`, body),
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

/** Pending tasks + badge counts; refreshed every minute and when the app regains focus. */
export const useTasks = () =>
  useQuery({
    queryKey: ['me', 'tasks'] as const,
    queryFn: () => api.get<TasksResponse>('/me/tasks'),
    refetchInterval: 60_000,
    staleTime: 20_000,
  });

// ─── Makeup requests (admin) ────────────────────────────────────────────────

export interface MakeupRequest {
  id: string;
  date: string;
  missedDate: string | null;
  reason: string | null;
  status: 'pending' | 'approved' | 'rejected';
  createdAt: string;
  reviewedAt: string | null;
  reviewNote: string | null;
  student: { id: string; code: string; fullName: string };
  batch: { id: string; name: string; startTime: string; endTime: string };
  batchCoach: { id: string; name: string };
  homeBatch: { id: string | null; name: string | null } | null;
  homeCoach: { id: string | null; name: string | null } | null;
  requestedBy: { id: string | null; name: string | null } | null;
  /** The session is with a different coach than the student's regular one. */
  otherCoach: boolean;
}

export const useMakeupRequests = (status: string) =>
  useQuery({
    queryKey: ['makeups', status] as const,
    queryFn: () => api.get<MakeupRequest[]>('/makeups', { status }),
  });

export function useReviewMakeup() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: ({
      id,
      action,
      reason,
    }: {
      id: string;
      action: 'approve' | 'reject';
      reason?: string;
    }) => api.post(`/makeups/${id}/${action}`, action === 'reject' ? { reason } : undefined),
    onSuccess: () => invalidate(['makeups'], ['me', 'tasks'], ['students'], ['attendance']),
  });
}

// ─── Dashboard insights ─────────────────────────────────────────────────────

export interface Dashboard {
  today: string;
  people: {
    activeStudents: number;
    newThisMonth: number;
    leftThisMonth: number;
    activeCoaches: number;
    activeBatches: number;
    fillRate: number | null;
  };
  attendance: {
    rate30d: number | null;
    attended: number;
    absent: number;
    trend: { date: string; rate: number | null }[];
  };
  myMonth: { sessions: number; hours: number; onTimeRate: number | null; flagged: number } | null;
  feedback: { total: number; submitted: number; draft: number; pending: number } | null;
  batchHealth: {
    id: string;
    name: string;
    coachName: string;
    enrolled: number;
    capacity: number | null;
    fill: number | null;
    attendanceRate: number | null;
  }[];
  coaches: {
    id: string;
    name: string;
    batches: number;
    students: number;
    sessions: number;
    hours: number;
    onTimeRate: number | null;
    flagged: number;
  }[];
  needsAttention: {
    studentId: string;
    fullName: string;
    attended: number;
    counted: number;
    rate: number;
  }[];
  birthdays: { studentId: string; fullName: string; inDays: number; turning: number }[];
}

export const useDashboard = () =>
  useQuery({
    queryKey: ['dashboard'] as const,
    queryFn: () => api.get<Dashboard>('/dashboard'),
    staleTime: 60_000,
  });

// ─── Fee split & money ───────────────────────────────────────────────────────

export function useSaveSplit() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: ({ planId, sections }: { planId: string; sections: SplitNode[] }) =>
      api.put<SplitNode[]>(`/fee-plans/${planId}/split`, { sections }),
    onSuccess: () => invalidate(['fee-plans']),
  });
}

export const usePayees = (enabled = true) =>
  useQuery({
    queryKey: keys.payees,
    queryFn: () => api.get<Payee[]>('/funds/payees'),
    enabled,
  });

export function useSavePayee() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: ({ id, ...body }: Partial<Payee> & { id?: string }) =>
      id ? api.patch<Payee>(`/funds/payees/${id}`, body) : api.post<Payee>('/funds/payees', body),
    onSuccess: () => invalidate(['funds'], ['fee-plans']),
  });
}

export const useFundsOverview = (q: { from: string; to: string }) =>
  useQuery({
    queryKey: keys.fundsOverview(q),
    queryFn: () => api.get<FundsOverview>('/funds/overview', q),
    placeholderData: keepPreviousData,
  });

export const useFundTxns = (q: Query) =>
  useQuery({
    queryKey: keys.fundTxns(q),
    queryFn: ({ signal }) => api.page<FundTxn[]>('/funds/txns', q, signal),
    placeholderData: keepPreviousData,
  });

export type FundAction = 'handovers' | 'expenses' | 'payouts' | 'income';

export function useFundAction(action: FundAction) {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (body: Record<string, unknown>) => api.post<FundTxn>(`/funds/${action}`, body),
    onSuccess: () => invalidate(['funds']),
  });
}

export type Payable = {
  /** Cash the caller holds (coaches); null for admins. */
  cash: number | null;
  payees: { id: string; name: string; owed: number }[];
};

/** Payees the caller may pay: coaches get only those linked to their batches. */
export const usePayable = (enabled = true) =>
  useQuery({
    queryKey: ['funds', 'payable'],
    queryFn: ({ signal }) => api.get<Payable>('/funds/payable', undefined, signal),
    enabled,
  });

export function useReverseFundTxn() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) =>
      api.post<FundTxn>(`/funds/txns/${id}/reverse`, { reason }),
    onSuccess: () => invalidate(['funds']),
  });
}

export function useResplit() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (body: { feePlanId?: string; from: string; to: string }) =>
      api.post<{ updated: number }>('/funds/resplit', body),
    onSuccess: () => invalidate(['funds'], ['invoices']),
  });
}

// ─── Substitute coaches ──────────────────────────────────────────────────────

export const useSubstitutions = (q: { status?: string; batchId?: string; from?: string } = {}) =>
  useQuery({
    queryKey: ['substitutions', 'list', q] as const,
    queryFn: () => api.get<Substitution[]>('/substitutions', q),
    placeholderData: keepPreviousData,
  });

export const useSubstitutionInsights = (q: { from: string; to: string }) =>
  useQuery({
    queryKey: ['substitutions', 'insights', q] as const,
    queryFn: () => api.get<SubstitutionInsights>('/substitutions/insights', q),
    placeholderData: keepPreviousData,
  });

export const useSubstituteCoaches = () =>
  useQuery({
    queryKey: ['substitutions', 'coaches'] as const,
    queryFn: () => api.get<{ id: string; name: string }[]>('/substitutions/coaches'),
    staleTime: 5 * 60_000,
  });

/** Everything a substitution touches: lists, insights, batches, the calendar and tasks. */
const SUB_KEYS = [
  ['substitutions'],
  ['batches'],
  ['attendance'],
  ['coach-sessions'],
  ['me', 'tasks'],
] as const;

export function useCreateSubstitution() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (body: {
      batchId: string;
      substituteCoachId: string;
      fromDate: string;
      toDate: string;
      reason?: string | null;
    }) => api.post<Substitution>('/substitutions', body),
    onSuccess: () => invalidate(...SUB_KEYS),
  });
}

export function useReviewSubstitution() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: ({
      id,
      action,
      note,
    }: {
      id: string;
      action: 'approve' | 'reject' | 'cancel';
      note?: string | null;
    }) => api.post<Substitution>(`/substitutions/${id}/${action}`, { note }),
    onSuccess: () => invalidate(...SUB_KEYS),
  });
}
