/**
 * Where a session stands, the same everywhere (dashboard, calendar, attendance):
 *
 *   Scheduled → (start passes, no check-in) Delayed → (check-in) Live until the end time →
 *   Completed | Partial | Missed
 *
 *  - Completed: checked in, every expected student marked, and the day's lesson plan filled in
 *    (any drills count; not needed for attendance-only batches).
 *  - Partial: checked in, but attendance or the plan is still open.
 *  - Missed: the session ended and nobody checked in.
 *  - Cancelled stays Cancelled. A check-in over 10 minutes after the start shows "late".
 */
import type { FloatTone } from '@/components/floating-badge';
import { today as todayIso } from './format';

export type SessionStatus =
  'scheduled' | 'delayed' | 'live' | 'completed' | 'partial' | 'missed' | 'cancelled';

export interface StatusInput {
  startTime: string;
  endTime: string;
  cancelled?: string | null;
  checkInAt?: string | null;
  expectedStudents: number;
  attendanceComplete: boolean;
  lessonPlanFilled?: boolean;
  /** False for attendance-only batches (no lesson plan needed). */
  coachFeedback?: boolean;
}

export const toMin = (t: string) => {
  const [h = 0, m = 0] = t.split(':').map(Number);
  return h * 60 + m;
};

const istClock = new Intl.DateTimeFormat('en-GB', {
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
  timeZone: 'Asia/Kolkata',
});

/** Minutes since midnight in IST. */
export const istMinutes = (d: Date = new Date()) => toMin(istClock.format(d));

/** Minutes after the start the coach checked in (null when on time or not checked in). */
export function lateMinutes(s: Pick<StatusInput, 'startTime' | 'checkInAt'>) {
  if (!s.checkInAt) return null;
  const late = istMinutes(new Date(s.checkInAt)) - toMin(s.startTime);
  return late > 10 ? late : null;
}

export const lateLabel = (m: number) =>
  m >= 60 ? `${Math.floor(m / 60)}h${m % 60 ? ` ${m % 60}m` : ''} late` : `${m}m late`;

/** What's still open on a checked-in session (for Partial). */
export function missingParts(s: StatusInput) {
  const out: string[] = [];
  if (s.expectedStudents > 0 && !s.attendanceComplete) out.push('attendance');
  if (s.coachFeedback !== false && !s.lessonPlanFilled) out.push('lesson plan');
  return out;
}

export function sessionStatus(
  s: StatusInput,
  date: string,
  now: { today?: string; minutes?: number } = {},
): SessionStatus {
  if (s.cancelled) return 'cancelled';
  const today = now.today ?? todayIso();
  if (date > today) return 'scheduled';
  const minutes = now.minutes ?? istMinutes();
  const ended = date < today || minutes >= toMin(s.endTime);
  const checkedIn = !!s.checkInAt;
  if (!ended) {
    if (date === today && minutes < toMin(s.startTime)) return checkedIn ? 'live' : 'scheduled';
    return checkedIn ? 'live' : 'delayed';
  }
  if (!checkedIn) return 'missed';
  return missingParts(s).length ? 'partial' : 'completed';
}

/** How each status reads and looks. */
export const STATUS_META: Record<
  SessionStatus,
  { label: string; tone: FloatTone; dot: string; hint: string }
> = {
  scheduled: {
    label: 'Scheduled',
    tone: 'neutral',
    dot: 'bg-muted-foreground/40',
    hint: 'Not started yet',
  },
  delayed: {
    label: 'Delayed',
    tone: 'warning',
    dot: 'bg-warning animate-pulse',
    hint: 'Started, but nobody has checked in',
  },
  live: { label: 'Live', tone: 'on-air', dot: 'bg-rose-600 animate-pulse', hint: 'Checked in' },
  completed: {
    label: 'Completed',
    tone: 'success',
    dot: 'bg-success',
    hint: 'Checked in, attendance and lesson plan done',
  },
  partial: {
    label: 'Partial',
    tone: 'pending',
    dot: 'bg-warning',
    hint: 'Checked in; something is still open',
  },
  missed: {
    label: 'Missed',
    tone: 'destructive',
    dot: 'bg-destructive',
    hint: 'Ended without a check-in',
  },
  cancelled: {
    label: 'Cancelled',
    tone: 'muted',
    dot: 'bg-muted-foreground/40',
    hint: 'Cancelled',
  },
};

/**
 * The badge text: for a Partial session, what's still pending ("Attendance pending",
 * "Plan pending", "Attendance & plan pending"); otherwise the status's label.
 */
export function statusLabel(status: SessionStatus, s: StatusInput) {
  if (status !== 'partial') return STATUS_META[status].label;
  const open = missingParts(s).map((p) => (p === 'lesson plan' ? 'plan' : p));
  if (!open.length) return STATUS_META.partial.label;
  const text = open.join(' & ');
  return `${text[0]!.toUpperCase()}${text.slice(1)} pending`;
}
