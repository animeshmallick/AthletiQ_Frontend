/** API response shapes (mirrors the backend; amounts in paise, dates as YYYY-MM-DD). */

export type Role = 'admin' | 'coach';
import type { DayTimes } from './batch-times';
export type UserStatus = 'invited' | 'active' | 'disabled';
export type AttendanceStatus = 'present' | 'absent' | 'late' | 'excused';
export type InvoiceStatus = 'due' | 'paid' | 'refunded' | 'cancelled';
export type InvoiceDisplayStatus = InvoiceStatus | 'overdue';
export type PaymentMode = 'cash' | 'upi' | 'bank_transfer' | 'card' | 'cheque' | 'other';

export interface User {
  id: string;
  email: string;
  name: string;
  phone: string | null;
  /** The role in use (for team lists: the one they last signed in as). */
  role: Role;
  /** Every role they hold: coach, admin, or both. */
  roles?: Role[];
  status: UserStatus;
  lastLoginAt: string | null;
  createdAt: string;
  activeBatches?: number;
  /** Team cards (admins): students in their active batches. */
  students?: number;
  /** Check-ins in the last 30 days, and the share that were on time (%). */
  checkIns30?: number;
  onTimeRate?: number | null;
  /** Cash they hold, and what the academy owes them (paise). */
  cashHeld?: number;
  owed?: number;
}

export interface Location {
  id: string;
  name: string;
  address: string | null;
  latitude: number;
  longitude: number;
  radiusMeters: number;
  isActive: boolean;
  activeBatches?: number;
}

export interface FeePlan {
  id: string;
  name: string;
  description: string | null;
  daysPerWeek: number;
  monthlyFee: number;
  isActive: boolean;
  /** The built-in free plan: fits any days, never invoiced, not on the Fee plans page. */
  isSystem?: boolean;
  activeStudents?: number;
  /** Admins only. [] = everything goes to the academy. */
  split?: SplitNode[];
}

// ─── Fee split & money ledger ────────────────────────────────────────────────

export type SplitKind = 'percent' | 'flat';
export type SplitRecipient = 'academy' | 'batch_coach' | 'staff' | 'payee';

/** One section of a plan's fee split. value = basis points (10000 = 100%) or paise. */
export interface SplitNode {
  name: string;
  kind: SplitKind;
  value: number;
  recipient: SplitRecipient | null;
  userId: string | null;
  payeeId: string | null;
  children: SplitNode[];
}

export interface Payee {
  id: string;
  name: string;
  note: string | null;
  isActive: boolean;
}

export interface SplitLine {
  label: string;
  name: string;
  amount: number;
}

export type FundTxnType = 'fee_split' | 'handover' | 'expense' | 'payout' | 'income';
export type FundAccount = 'cash' | 'academy_fund' | 'staff_due' | 'payee_due';

export interface FundTxn {
  id: string;
  type: FundTxnType;
  occurredOn: string;
  amount: number;
  title: string;
  category: string | null;
  note: string | null;
  reference: string | null;
  createdAt: string;
  user: { id: string; name: string | null } | null;
  payee: { id: string; name: string | null } | null;
  createdBy: { id: string; name: string | null };
  invoice: { id: string; number: string } | null;
  reversedAt: string | null;
  reversedBy: { id: string; name: string | null } | null;
  reversalReason: string | null;
  entries: {
    account: FundAccount;
    userId: string | null;
    payeeId: string | null;
    amount: number;
    label: string | null;
    share: boolean;
    name: string | null;
  }[];
}

export interface StaffAmount {
  userId: string;
  name: string;
  role: Role;
  amount: number;
}

export interface AcademyFunds {
  scope: 'academy';
  from: string;
  to: string;
  balances: {
    academyCash: number;
    withStaff: number;
    academyFund: number;
    owedToStaff: number;
    owedToPayees: number;
    holders: StaffAmount[];
    staffDue: StaffAmount[];
    payeeDue: { payeeId: string; name: string; amount: number }[];
  };
  period: {
    collected: number;
    payments: number;
    keptByStaff: number;
    keptBy: { userId: string; name: string; amount: number }[];
    handedOver: number;
    spent: number;
    paidOut: number;
    income: number;
    distribution: {
      label: string;
      account: FundAccount;
      userId: string | null;
      payeeId: string | null;
      name: string;
      amount: number;
    }[];
    byRecipient: {
      key: string;
      kind: 'academy' | 'staff' | 'payee';
      name: string;
      amount: number;
    }[];
    expensesByCategory: { category: string; amount: number; count: number }[];
  };
}

export interface MyFunds {
  scope: 'self';
  from: string;
  to: string;
  /** Cash I hold for the academy. */
  cash: number;
  /** What the academy owes me. */
  due: number;
  period: {
    collected: number;
    earned: number;
    earnedBy: { label: string | null; amount: number }[];
    kept: number;
    handedOver: number;
    spent: number;
    paidToMe: number;
  };
}

export type FundsOverview = AcademyFunds | MyFunds;

export interface Batch {
  id: string;
  name: string;
  weekdays: number[];
  startTime: string;
  endTime: string;
  /** Days that run at their own time (ISO weekday → start/end); others use the times above. */
  dayTimes: DayTimes;
  capacity: number;
  isActive: boolean;
  coach: { id: string; name: string; phone: string | null };
  location: { id: string; name: string; latitude: number; longitude: number; radiusMeters: number };
  /** What the batch trains; decides the skills its students are assessed on. */
  sport: { id: string; name: string };
  /** The batch's price: every student in it is billed this plan. */
  feePlan: { id: string; name: string; monthlyFee: number; daysPerWeek: number };
  /** Coach gives feedback (reports, assessments, plan reminders). Off = attendance only. */
  coachFeedback?: boolean;
  memberCount: number;
  /** Set when you only cover this batch as a substitute coach (current or upcoming days). */
  substitution?: { id: string; fromDate: string; toDate: string } | null;
}

export interface BatchMember {
  studentId: string;
  code: string;
  fullName: string;
  phone: string;
  trainingDays: number[];
  effectiveFrom: string;
  status: 'active' | 'left';
}

export interface BatchDetail extends Batch {
  members: BatchMember[];
}

export interface StudentListItem {
  id: string;
  code: string;
  fullName: string;
  phone: string;
  guardianName: string | null;
  status: 'active' | 'left';
  joiningDate: string;
  leftOn: string | null;
  /** Current batches (coaches see only their own), each with its monthly fee. */
  batches: {
    id: string;
    name: string;
    coachId: string;
    coachName: string;
    planName: string;
    fee: number;
  }[];
  outstanding: number;
  overdue: number;
  effectiveFee: number;
  /** Last 30 days, in the batches you can see (null when nothing was marked). */
  attendanceRate?: number | null;
  /** Latest assessed level. */
  level?: { code: string | null; name: string | null } | null;
}

export interface Enrollment {
  id: string;
  batchId: string;
  batchName: string;
  coachId: string;
  coachName: string;
  locationName: string;
  startTime: string;
  endTime: string;
  trainingDays: number[];
  effectiveFrom: string;
  effectiveTo: string | null;
  reason: string | null;
}

export interface Makeup {
  id: string;
  date: string;
  missedDate: string | null;
  reason: string | null;
  batchId: string;
  batchName: string;
  startTime: string;
  /** Coach requests wait for an admin. */
  status?: 'pending' | 'approved';
}

/** A student's current batch, with its plan, own price and next invoice. */
export interface Membership {
  enrollmentId: string;
  batchId: string;
  batchName: string;
  coachId: string;
  coachName: string;
  locationName: string;
  weekdays: number[];
  startTime: string;
  endTime: string;
  dayTimes?: DayTimes;
  since: string;
  plan: { id: string; name: string; monthlyFee: number; daysPerWeek: number };
  customMonthlyFee: number | null;
  monthlyDiscount: number;
  fee: { base: number; discount: number; total: number };
  /** Day of the month this batch's invoices are issued. */
  billingDay: number;
  nextInvoice: { issueDate: string; periodStart: string; periodEnd: string } | null;
}

export interface StudentDetail {
  id: string;
  code: string;
  /** Registration number (1001…): only shown on the profile; parents type it to open shared links. */
  registrationNo: number;
  fullName: string;
  dateOfBirth: string | null;
  gender: 'male' | 'female' | 'other' | null;
  guardianName: string | null;
  phone: string;
  alternatePhone: string | null;
  email: string | null;
  address: string | null;
  medicalNotes: string | null;
  notes: string | null;
  joiningDate: string;
  status: 'active' | 'left';
  leftOn: string | null;
  leftReason: string | null;
  /** Current batches, each billed on its own. */
  memberships: Membership[];
  /** Monthly total across all current batches. */
  effectiveFee: { base: number; discount: number; total: number };
  enrollmentHistory: Enrollment[];
  upcomingMakeups: Makeup[];
  billing: { outstanding: number; overdue: number; paid: number; invoiceCount: number };
}

export interface RosterEntry {
  studentId: string;
  code: string;
  fullName: string;
  phone: string;
  isMakeup: boolean;
  makeupReason: string | null;
}

export interface AttendanceSheet {
  batch: { id: string; name: string; startTime: string; endTime: string };
  date: string;
  isScheduledDay: boolean;
  cancelled: { reason: string; cancelledAt: string } | null;
  editable: boolean;
  /** Coach hasn't checked in to this session yet (attendance stays locked until they do). */
  needsCheckIn?: boolean;
  lockedReason?: string | null;
  students: (RosterEntry & {
    status: AttendanceStatus | null;
    note: string | null;
    markedAt: string | null;
    /** Last sessions in this batch before this date, newest first. */
    recent?: { date: string; status: AttendanceStatus }[];
    /** Present + late share of marked sessions in the last 30 days. */
    rate30?: number | null;
  })[];
  summary: {
    total: number;
    present: number;
    late: number;
    absent: number;
    excused: number;
    unmarked: number;
  };
}

export interface CoachSession {
  id: string;
  coachId: string;
  batchId: string;
  date: string;
  checkInAt: string;
  checkInLat: number;
  checkInLng: number;
  checkInDistanceM: number;
  checkInWithinFence: boolean;
  note: string | null;
  reviewedAt: string | null;
  reviewNote: string | null;
  flagged: boolean;
  /** The session's scheduled length (hours coached count this). */
  durationMinutes: number;
  scheduledStart: string;
  scheduledEnd: string;
}

export interface DayOverviewSession {
  batch: {
    id: string;
    name: string;
    startTime: string;
    endTime: string;
    /** False for attendance-only batches. */
    coachFeedback?: boolean;
    coach: { id: string; name: string };
    location: { id: string; name: string; latitude?: number; longitude?: number };
  };
  expectedStudents: number;
  marked: number;
  present: number;
  attendanceComplete: boolean;
  hasLessonPlan: boolean;
  /** The plan adds up to this session (false after a timing change). */
  lessonPlanFits?: boolean;
  /** The coach picked this session's drills. */
  lessonPlanFilled?: boolean;
  coachSession: { checkInAt: string; flagged: boolean } | null;
  cancelled: string | null;
  /** Substitute coach covering this session, if any. */
  substitute?: { id: string; name: string } | null;
}

export interface TodaySession {
  batch: { id: string; name: string; startTime: string; endTime: string };
  location: {
    id: string;
    name: string;
    address: string | null;
    latitude: number;
    longitude: number;
    radiusMeters: number;
  };
  session: CoachSession | null;
  cancelled: string | null;
  /** You're covering this batch today as a substitute. */
  asSubstitute?: boolean;
  substitute?: { id: string; name: string } | null;
}

export type SubstitutionStatus = 'pending' | 'approved' | 'rejected' | 'cancelled';

export interface Substitution {
  id: string;
  fromDate: string;
  toDate: string;
  reason: string | null;
  status: SubstitutionStatus;
  reviewNote: string | null;
  reviewedAt: string | null;
  createdAt: string;
  sessions: number;
  batch: {
    id: string;
    name: string;
    startTime: string;
    endTime: string;
    dayTimes?: DayTimes;
    weekdays: number[];
  };
  substitute: { id: string; name: string };
  coach: { id: string; name: string };
  requestedBy: { id: string; name: string };
  reviewedBy: { id: string | null; name: string | null } | null;
}

export interface SubstitutionInsights {
  from: string;
  to: string;
  totals: {
    substitutions: number;
    sessions: number;
    pending: number;
    upcoming: number;
    active: number;
    coveredByMe: number;
    coveredForMe: number;
  };
  bySubstitute: { id: string; name: string; sessions: number; substitutions: number }[];
  byCoach: { id: string; name: string; sessions: number; substitutions: number }[];
  byBatch: { id: string; name: string; sessions: number; substitutions: number }[];
}

/** A drill inside a block: optional minutes, reps and a note. */
export interface PlanDrill {
  id?: string;
  name: string;
  minutes: number | null;
  reps: string | null;
  note: string | null;
}

/** A timed block of a lesson plan (warm-up, ball drills…) with its drills. */
export interface PlanBlock {
  id?: string;
  name: string;
  color: string | null;
  minutes: number;
  drills: PlanDrill[];
}

export interface PlanBatchInfo {
  id: string;
  name: string;
  weekdays: number[];
  /** The one session length, or null when the batch's days differ. */
  sessionMinutes: number | null;
  /** ISO weekday → minutes. */
  minutesByDay: Record<string, number>;
}

/** A batch's lesson plan: every session follows it. */
export interface BatchPlan {
  focus: string | null;
  notes: string | null;
  updatedAt: string;
  updatedBy: { id: string; name: string } | null;
  totalMinutes: number;
  blocks: PlanBlock[];
}

export interface BatchPlanView {
  batch: PlanBatchInfo;
  plan: BatchPlan | null;
  /** Why the plan no longer fits the sessions (e.g. after a timing change). */
  mismatch: string | null;
  canEdit: boolean;
}

/** One day's plan: its own adjusted copy, else the batch plan. */
export interface SessionPlanView {
  batch: PlanBatchInfo;
  date: string;
  minutes: number;
  lockedReason: string | null;
  source: 'session' | 'batch' | 'none';
  focus: string | null;
  note: string | null;
  blocks: PlanBlock[];
  totalMinutes: number;
  canAdjust: boolean;
  /** Each block's drills in the batch plan, to pick from when filling in the day. */
  drillOptions?: Record<string, PlanDrill[]>;
}

export type PlanStatus = 'none' | 'ready' | 'needs-update';

export interface PlanOverviewItem {
  id: string;
  name: string;
  sport: string;
  location: string;
  coach: { id: string; name: string };
  attendanceOnly: boolean;
  sessionMinutes: number | null;
  status: PlanStatus;
  totalMinutes: number;
  blocks: number;
  drills: number;
  /** Days adjusted in the last 30 days. */
  adjustedDays: number;
  updatedAt: string | null;
}

export interface FeedbackField {
  id: string;
  type: 'rating' | 'text' | 'textarea' | 'select' | 'multiselect' | 'boolean';
  label: string;
  help?: string;
  required?: boolean;
  max?: number;
  captions?: Record<string, string>;
  maxLength?: number;
  placeholder?: string;
  options?: { value: string; label: string }[];
}

export interface FeedbackTemplate {
  key: string;
  version: number;
  title: string;
  description?: string;
  sections: { id: string; title: string; description?: string; fields: FeedbackField[] }[];
}

export interface AttendanceSummary {
  scheduled: number;
  present: number;
  late: number;
  absent: number;
  excused: number;
  unmarked: number;
}

export interface WeeklyFeedback {
  id: string;
  studentId: string;
  weekStart: string;
  status: 'draft' | 'submitted';
  answers: Record<string, unknown>;
  attendanceSummary: AttendanceSummary | null;
  submittedAt: string | null;
  templateKey: string;
  templateVersion: number;
}

export interface Invoice {
  id: string;
  number: string;
  cycleNumber: number;
  periodStart: string;
  periodEnd: string;
  issueDate: string;
  dueDate: string;
  totalAmount: number;
  status: InvoiceStatus;
  displayStatus: InvoiceDisplayStatus;
  paidAt: string | null;
  batchName: string | null;
  /** List only: for grouping by batch / place. */
  batchId?: string | null;
  location?: { id: string; name: string } | null;
  feePlanName: string;
  student: { id: string; code: string; fullName: string; phone: string };
}

export interface Payment {
  id: string;
  amount: number;
  mode: PaymentMode;
  reference: string | null;
  paidOn: string;
  note: string | null;
  status: 'completed' | 'reverted' | 'refunded';
  createdAt: string;
  recordedBy: { id: string; name: string };
  reversedAt: string | null;
  reversalReason: string | null;
}

export interface InvoiceDetail extends Omit<Invoice, 'student'> {
  baseAmount: number;
  discountAmount: number;
  cancelledReason: string | null;
  student: {
    id: string;
    code: string;
    fullName: string;
    guardianName: string | null;
    phone: string;
    status: string;
    joiningDate?: string;
  };
  payments: Payment[];
  /** Where the fee went (coaches: only their own share). */
  split?: SplitLine[];
  /** The batch, the student's training days and what else they owe. */
  about?: {
    coachName: string | null;
    locationName: string | null;
    startTime: string | null;
    endTime: string | null;
    trainingDays: number[] | null;
    otherDue: { count: number; amount: number };
  };
}

export interface FinanceSummary {
  range: { from: string; to: string };
  totals: {
    billed: number;
    invoicesIssued: number;
    discounts: number;
    collected: number;
    paymentsReceived: number;
    refunded: number;
    due: number;
    dueCount: number;
    overdue: number;
    overdueCount: number;
    outstanding: number;
    collectionRate: number | null;
  };
  trend: { month: string; billed: number; collected: number }[];
  byPaymentMode: { mode: PaymentMode; amount: number; count: number }[];
  /** Who received the money (the person who confirmed the payment). Coaches: only themselves. */
  byReceiver: { userId: string; name: string; role: Role; amount: number; count: number }[];
  byBatch: {
    batchId: string | null;
    batchName: string | null;
    coachId: string | null;
    coachName: string | null;
    billed: number;
    outstanding: number;
    overdue: number;
  }[];
  topOverdue: {
    studentId: string;
    code: string;
    fullName: string;
    phone: string;
    overdue: number;
    invoices: number;
    oldestDueDate: string;
  }[];
}

export interface Registration {
  id: string;
  type: 'student' | 'coach';
  status: 'pending' | 'approved' | 'rejected';
  fullName: string;
  email: string | null;
  phone: string;
  message: string | null;
  details: Record<string, string | null>;
  preferredDays: number[] | null;
  preferredBatch: { id: string; name: string } | null;
  preferredLocation: { id: string; name: string } | null;
  reviewedAt: string | null;
  reviewNote: string | null;
  createdAt: string;
}

export interface AcademySettings {
  id: number;
  name: string;
  legalName: string | null;
  address: string | null;
  phone: string | null;
  email: string | null;
  website: string | null;
  gstin: string | null;
  upiId: string | null;
  invoiceFooter: string | null;
}

/** GET /me/tasks: what needs the signed-in user's attention now. */
export interface AppTask {
  id: string;
  kind:
    | 'check-in'
    | 'missed-check-in'
    | 'attendance'
    | 'lesson-plan'
    | 'feedback'
    | 'registrations'
    | 'flagged-check-ins'
    | 'overdue-fees';
  severity: 'critical' | 'warning' | 'info';
  title: string;
  detail: string;
  link: string;
  screen: string;
  count?: number;
}

export interface TasksResponse {
  generatedAt: string;
  total: number;
  /** Badge count per screen path, e.g. { "/attendance": 2 }. */
  counts: Record<string, number>;
  items: AppTask[];
}
