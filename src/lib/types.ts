/** API response shapes (mirrors the backend; amounts in paise, dates as YYYY-MM-DD). */

export type Role = 'admin' | 'coach';
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
  role: Role;
  status: UserStatus;
  lastLoginAt: string | null;
  createdAt: string;
  activeBatches?: number;
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
  activeStudents?: number;
}

export interface Batch {
  id: string;
  name: string;
  weekdays: number[];
  startTime: string;
  endTime: string;
  capacity: number | null;
  isActive: boolean;
  coach: { id: string; name: string; phone: string | null };
  location: { id: string; name: string; latitude: number; longitude: number; radiusMeters: number };
  memberCount: number;
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
  feePlan: { id: string; name: string; monthlyFee: number };
  customMonthlyFee: number | null;
  monthlyDiscount: number;
  batch: { id: string; name: string } | null;
  coach: { id: string; name: string } | null;
  trainingDays: number[] | null;
  outstanding: number;
  overdue: number;
  effectiveFee: number;
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
}

export interface StudentDetail {
  id: string;
  code: string;
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
  feePlanId: string;
  customMonthlyFee: number | null;
  monthlyDiscount: number;
  billingStartsOn: string;
  billingAnchorDate: string | null;
  cycleOffset: number;
  feePlan: { id: string; name: string; monthlyFee: number; daysPerWeek: number };
  effectiveFee: { base: number; discount: number; total: number };
  currentEnrollment: Enrollment | null;
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
  checkOutLat: number | null;
  checkOutLng: number | null;
  checkInDistanceM: number;
  checkInWithinFence: boolean;
  checkOutAt: string | null;
  checkOutDistanceM: number | null;
  checkOutWithinFence: boolean | null;
  note: string | null;
  reviewedAt: string | null;
  reviewNote: string | null;
  flagged: boolean;
  durationMinutes: number | null;
}

export interface DayOverviewSession {
  batch: {
    id: string;
    name: string;
    startTime: string;
    endTime: string;
    coach: { id: string; name: string };
    location: { id: string; name: string };
  };
  expectedStudents: number;
  marked: number;
  present: number;
  attendanceComplete: boolean;
  hasLessonPlan: boolean;
  coachSession: { checkInAt: string; checkOutAt: string | null; flagged: boolean } | null;
  cancelled: string | null;
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
}

export interface LibraryItem {
  id: string;
  coachId: string;
  name: string;
  description?: string | null;
  color?: string | null;
  sortOrder: number;
  isArchived: boolean;
}

export interface LessonPlan {
  id: string;
  batchId: string;
  coachId: string;
  date: string;
  notes: string | null;
  updatedAt: string;
  stages: { id: string; name: string; color: string | null }[];
  events: { id: string; name: string; description: string | null }[];
  cells: { eventId: string; stageId: string; content: string }[];
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
  };
  payments: Payment[];
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
