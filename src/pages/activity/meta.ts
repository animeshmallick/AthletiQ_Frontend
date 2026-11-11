/** Labels, icons and formatting shared by the activity screens. */
import {
  Building2,
  CalendarClock,
  ClipboardCheck,
  Cog,
  IndianRupee,
  LayoutGrid,
  MapPin,
  MessageSquareText,
  NotebookPen,
  Repeat,
  ScrollText,
  ShieldCheck,
  Tags,
  UserPlus,
  UserRound,
  Wallet,
  type LucideIcon,
} from 'lucide-react';
import { addDays, formatLongDate, money, today } from '@/lib/format';
import type { AuditLog } from '@/lib/queries';

export const TZ = 'Asia/Kolkata';

export const ENTITY: Record<
  string,
  { label: string; icon: LucideIcon; tone: string; link?: string }
> = {
  invoice: {
    label: 'Invoice',
    icon: IndianRupee,
    tone: 'bg-emerald-500/14 text-emerald-700 dark:text-emerald-300',
    link: '/invoices/',
  },
  student: {
    label: 'Student',
    icon: UserRound,
    tone: 'bg-indigo-500/12 text-indigo-700 dark:text-indigo-300',
    link: '/students/',
  },
  user: {
    label: 'User',
    icon: ShieldCheck,
    tone: 'bg-violet-500/12 text-violet-700 dark:text-violet-300',
  },
  batch: {
    label: 'Batch',
    icon: LayoutGrid,
    tone: 'bg-sky-500/14 text-sky-800 dark:text-sky-300',
    link: '/batches/',
  },
  attendance: {
    label: 'Attendance',
    icon: ClipboardCheck,
    tone: 'bg-sky-500/14 text-sky-800 dark:text-sky-300',
  },
  fee_plan: {
    label: 'Fee plan',
    icon: Tags,
    tone: 'bg-amber-500/18 text-amber-800 dark:text-amber-300',
  },
  fund_txn: {
    label: 'Money',
    icon: Wallet,
    tone: 'bg-emerald-500/14 text-emerald-700 dark:text-emerald-300',
  },
  payee: {
    label: 'Payee',
    icon: Wallet,
    tone: 'bg-emerald-500/14 text-emerald-700 dark:text-emerald-300',
  },
  session: {
    label: 'Sign-in',
    icon: ShieldCheck,
    tone: 'bg-violet-500/12 text-violet-700 dark:text-violet-300',
  },
  location: {
    label: 'Location',
    icon: MapPin,
    tone: 'bg-rose-500/12 text-rose-700 dark:text-rose-300',
  },
  registration: {
    label: 'Registration',
    icon: UserPlus,
    tone: 'bg-teal-500/14 text-teal-800 dark:text-teal-300',
  },
  coach_session: {
    label: 'Check-in',
    icon: CalendarClock,
    tone: 'bg-orange-500/14 text-orange-800 dark:text-orange-300',
  },
  lesson_plan: {
    label: 'Lesson plan',
    icon: NotebookPen,
    tone: 'bg-fuchsia-500/12 text-fuchsia-700 dark:text-fuchsia-300',
  },
  feedback: {
    label: 'Feedback',
    icon: MessageSquareText,
    tone: 'bg-pink-500/12 text-pink-700 dark:text-pink-300',
  },
  substitution: {
    label: 'Substitute',
    icon: Repeat,
    tone: 'bg-cyan-500/14 text-cyan-800 dark:text-cyan-300',
  },
  academy_settings: { label: 'Settings', icon: Building2, tone: 'bg-muted text-foreground' },
  job: { label: 'Automation', icon: Cog, tone: 'bg-muted text-foreground' },
};

export const entityMeta = (t: string) =>
  ENTITY[t] ?? { label: humanize(t), icon: ScrollText, tone: 'bg-muted text-foreground' };

/** "invoice.payment_reverted" → "Invoice payment reverted" */
const ACTION_LABELS: Record<string, string> = {
  'auth.login': 'Signed in',
  'auth.locked': 'Account locked after failed sign-ins',
  'auth.password_changed': 'Password changed',
  'auth.token_reuse': 'Old session reused: signed out everywhere',
  'auth.role_switched': 'Switched role',
  'user.roles_changed': 'Roles changed',
};

export function humanize(action: string) {
  if (ACTION_LABELS[action]) return ACTION_LABELS[action];
  const text = action.replace(/[._]/g, ' ');
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/** Matches the server's list of actions worth a second look. */
const SENSITIVE =
  /(refund|revert|revers|cancel|disabl|delete|remov|password|roles_changed|split|discount|waive|reject|token_reuse|locked)/i;
export const isSensitive = (action: string) => SENSITIVE.test(action);

/** "monthlyDiscount" → "Monthly discount" */
export const label = (key: string) =>
  key
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/_/g, ' ')
    .toLowerCase()
    .replace(/^./, (c) => c.toUpperCase());

/** Readable value for a metadata field (money in paise, dates, lists, nested objects). */
export function display(key: string, value: unknown): string {
  if (value === null || value === undefined || value === '') return '—';
  if (typeof value === 'number' && /amount|fee|discount|total|paise/i.test(key))
    return money(value);
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  if (Array.isArray(value)) return value.length ? value.map(String).join(', ') : '—';
  if (typeof value === 'object') return JSON.stringify(value);
  const s = String(value);
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return formatLongDate(s);
  return s;
}

/** One-line summary under the title, from the most telling fields. */
export function summaryLine(l: AuditLog): string {
  const m = l.metadata ?? {};
  const parts: string[] = [];
  for (const k of ['amount', 'mode', 'reason', 'date', 'effectiveFrom', 'code', 'name', 'note']) {
    if (m[k] !== undefined && m[k] !== null && m[k] !== '') parts.push(display(k, m[k]));
    if (parts.length === 2) break;
  }
  return parts.join(' · ');
}

/** The IST calendar day of an instant. */
export const istDay = (iso: string) =>
  new Intl.DateTimeFormat('en-CA', { timeZone: TZ }).format(new Date(iso));

export function dayLabel(iso: string) {
  const d = istDay(iso);
  if (d === today()) return 'Today';
  if (d === addDays(today(), -1)) return 'Yesterday';
  return formatLongDate(d);
}

export const clock = (iso: string) =>
  new Date(iso).toLocaleTimeString('en-IN', { timeZone: TZ, hour: 'numeric', minute: '2-digit' });

/** 18 → "6 pm"; 0 → "12 am". */
export const hourLabel = (h: number) => `${h % 12 || 12} ${h < 12 ? 'am' : 'pm'}`;

/** 1234 → "1.2 s"; 87 → "87 ms". */
export const ms = (n: number) => (n >= 1000 ? `${(n / 1000).toFixed(1)} s` : `${n} ms`);

export const num = (n: number) => n.toLocaleString('en-IN');

/** "/api/v1/students/:id" → "/students/:id" */
export const shortRoute = (r: string) => r.replace(/^\/api\/v\d+/, '') || '/';

const VERB: Record<string, string> = {
  POST: 'Created',
  PUT: 'Saved',
  PATCH: 'Updated',
  DELETE: 'Deleted',
  GET: 'Opened',
};

/** "PATCH /api/v1/students/:id/fee-plan" → "Updated students › fee plan" */
export function requestLabel(method: string, route: string) {
  const parts = shortRoute(route)
    .split('/')
    .filter((p) => p && !p.startsWith(':'))
    .map((p) => p.replace(/-/g, ' '));
  return `${VERB[method] ?? method} ${parts.join(' › ') || 'home'}`;
}

export type StatusTone = 'success' | 'warning' | 'destructive' | 'muted';
export const statusTone = (s: number): StatusTone =>
  s >= 500 ? 'destructive' : s >= 400 ? 'warning' : s >= 200 && s < 300 ? 'success' : 'muted';

/** Makes the server's plain-language highlights friendlier: action names and ISO dates. */
export const friendly = (s: string) =>
  s
    .replace(/\b[a-z]+(?:_[a-z]+)*\.[a-z]+(?:_[a-z]+)*\b/g, (a) => humanize(a).toLowerCase())
    .replace(/\b\d{4}-\d{2}-\d{2}\b/g, (d) => formatLongDate(d))
    .replace(
      /\b(\d{1,2}):00–(\d{1,2}):00\b/g,
      (_, a: string, b: string) => `${hourLabel(Number(a))}–${hourLabel(Number(b) % 24)}`,
    );

const istHour = new Intl.DateTimeFormat('en-GB', {
  hour: '2-digit',
  hourCycle: 'h23',
  timeZone: 'Asia/Kolkata',
});
const hourOf = (d: Date) => Number(istHour.format(d)) % 24;

/** The clock hours (IST) a window covers, in order: 2 pm, 3 pm, … up to the current hour. */
export function hoursSince(since: string, now: Date = new Date()): number[] {
  const start = hourOf(new Date(since));
  const span = now.getTime() - Date.parse(since);
  const count = span >= 23 * 3_600_000 ? 24 : ((hourOf(now) - start + 24) % 24) + 1;
  return Array.from({ length: count }, (_, i) => (start + i) % 24);
}

const istClock = new Intl.DateTimeFormat('en-IN', {
  hour: 'numeric',
  minute: '2-digit',
  hour12: true,
  timeZone: 'Asia/Kolkata',
});
/** "2:05 pm" (IST) for a chart slice. */
export const clockAt = (iso: string) => istClock.format(new Date(iso)).toLowerCase();
/** Chart bars for time slices: short tick ("2:05"), full label ("2:05 – 2:10 pm"). */
export function sliceBars<T extends { at: string; n: number }>(
  slices: T[],
  part?: (s: T) => number,
) {
  const step = slices.length > 1 ? Date.parse(slices[1]!.at) - Date.parse(slices[0]!.at) : 0;
  return slices.map((s) => ({
    key: s.at,
    tick: clockAt(s.at).replace(/ ?[ap]m$/, ''),
    label: `${clockAt(s.at)} – ${clockAt(new Date(Date.parse(s.at) + step).toISOString())}`,
    value: s.n,
    ...(part ? { part: part(s) } : {}),
  }));
}
/** "every 5 min" for a chart title. */
export const sliceSize = (slices: { at: string }[]) =>
  slices.length > 1
    ? `every ${Math.round((Date.parse(slices[1]!.at) - Date.parse(slices[0]!.at)) / 60_000)} min`
    : '';
