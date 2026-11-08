/**
 * Formatting & calendar helpers. Business dates are IST calendar days ('YYYY-MM-DD'); we never
 * convert them through local-time Date objects, so a user's device timezone cannot shift them.
 */

const TZ = 'Asia/Kolkata';

export const WEEKDAYS = [
  { value: 1, short: 'Mon', min: 'M', long: 'Monday' },
  { value: 2, short: 'Tue', min: 'T', long: 'Tuesday' },
  { value: 3, short: 'Wed', min: 'W', long: 'Wednesday' },
  { value: 4, short: 'Thu', min: 'T', long: 'Thursday' },
  { value: 5, short: 'Fri', min: 'F', long: 'Friday' },
  { value: 6, short: 'Sat', min: 'S', long: 'Saturday' },
  { value: 7, short: 'Sun', min: 'S', long: 'Sunday' },
] as const;

const inr = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  maximumFractionDigits: 2,
  minimumFractionDigits: 0,
});
const inrCompact = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  notation: 'compact',
  maximumFractionDigits: 1,
});

/** 250000 paise → "₹2,500". */
export function money(paise: number): string {
  return inr.format(paise / 100);
}

/** 12500000 paise → "₹1.3L". */
export function moneyCompact(paise: number): string {
  return inrCompact.format(paise / 100);
}

export function rupeesToPaise(rupees: number | string): number {
  return Math.round(Number(rupees) * 100);
}

export function paiseToRupees(paise: number): number {
  return paise / 100;
}

const utc = (d: string) => new Date(`${d}T00:00:00Z`);

const dateFmt = new Intl.DateTimeFormat('en-IN', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  timeZone: 'UTC',
});
const shortFmt = new Intl.DateTimeFormat('en-IN', {
  day: 'numeric',
  month: 'short',
  timeZone: 'UTC',
});
const longFmt = new Intl.DateTimeFormat('en-IN', {
  weekday: 'long',
  day: 'numeric',
  month: 'long',
  timeZone: 'UTC',
});
const monthFmt = new Intl.DateTimeFormat('en-IN', {
  month: 'short',
  year: '2-digit',
  timeZone: 'UTC',
});

/** "8 Nov 2026" */
export const formatDate = (d: string | null | undefined) => (d ? dateFmt.format(utc(d)) : '—');
/** "8 Nov" */
export const formatShortDate = (d: string) => shortFmt.format(utc(d));
/** "Sunday, 8 November" */
export const formatLongDate = (d: string) => longFmt.format(utc(d));
/** "2026-11" → "Nov 26" */
export const formatMonth = (ym: string) => monthFmt.format(utc(`${ym}-01`));

/** "06:30:00" → "6:30 am" */
export function formatTime(t: string): string {
  const [h = 0, m = 0] = t.split(':').map(Number);
  const suffix = h >= 12 ? 'pm' : 'am';
  const hour = h % 12 === 0 ? 12 : h % 12;
  return `${hour}:${String(m).padStart(2, '0')} ${suffix}`;
}

export const formatTimeRange = (start: string, end: string) =>
  `${formatTime(start)} – ${formatTime(end)}`;

const instantFmt = new Intl.DateTimeFormat('en-IN', {
  day: 'numeric',
  month: 'short',
  hour: 'numeric',
  minute: '2-digit',
  timeZone: TZ,
});
const clockFmt = new Intl.DateTimeFormat('en-IN', {
  hour: 'numeric',
  minute: '2-digit',
  timeZone: TZ,
});

/** ISO instant → "8 Nov, 6:32 am" (IST). */
export const formatInstant = (iso: string | null | undefined) =>
  iso ? instantFmt.format(new Date(iso)) : '—';
/** ISO instant → "6:32 am" (IST). */
export const formatClock = (iso: string) => clockFmt.format(new Date(iso));

export function formatDuration(minutes: number | null): string {
  if (minutes === null) return '—';
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return h ? `${h}h ${m}m` : `${m}m`;
}

export function weekdaysLabel(days: number[]): string {
  const sorted = [...days].sort((a, b) => a - b);
  if (sorted.join() === '1,2,3,4,5') return 'Weekdays';
  if (sorted.join() === '1,2,3,4,5,6') return 'Mon – Sat';
  if (sorted.length === 7) return 'Every day';
  return sorted.map((d) => WEEKDAYS[d - 1]?.short).join(', ');
}

// ─── Calendar arithmetic on 'YYYY-MM-DD' ─────────────────────────────────────

const istDay = new Intl.DateTimeFormat('en-CA', {
  timeZone: TZ,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

export function today(now: Date = new Date()): string {
  return istDay.format(now);
}

export function addDays(d: string, n: number): string {
  const x = utc(d);
  x.setUTCDate(x.getUTCDate() + n);
  return x.toISOString().slice(0, 10);
}

export function isoWeekday(d: string): number {
  const day = utc(d).getUTCDay();
  return day === 0 ? 7 : day;
}

export const startOfWeek = (d: string) => addDays(d, 1 - isoWeekday(d));

export function startOfMonth(d: string): string {
  return `${d.slice(0, 7)}-01`;
}

export function endOfMonth(d: string): string {
  const [y, m] = d.split('-').map(Number) as [number, number];
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return `${d.slice(0, 7)}-${String(last).padStart(2, '0')}`;
}

export function addMonths(d: string, n: number): string {
  const [y, m] = d.split('-').map(Number) as [number, number];
  const total = y * 12 + (m - 1) + n;
  return `${Math.floor(total / 12)}-${String((total % 12) + 1).padStart(2, '0')}-01`;
}

export function eachDay(from: string, to: string): string[] {
  const out: string[] = [];
  for (let d = from; d <= to; d = addDays(d, 1)) out.push(d);
  return out;
}

export function relativeDay(d: string, now = today()): string {
  if (d === now) return 'Today';
  if (d === addDays(now, -1)) return 'Yesterday';
  if (d === addDays(now, 1)) return 'Tomorrow';
  return formatDate(d);
}

export function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join('');
}

export function plural(n: number, one: string, many = `${one}s`) {
  return `${n} ${n === 1 ? one : many}`;
}

export const PAYMENT_MODE_LABELS: Record<string, string> = {
  cash: 'Cash',
  upi: 'UPI',
  bank_transfer: 'Bank transfer',
  card: 'Card',
  cheque: 'Cheque',
  other: 'Other',
};

/** "+919876543210" / "9876543210" → "+91 98765 43210"; other formats are returned unchanged. */
export function formatPhone(phone: string | null | undefined): string {
  if (!phone) return '';
  const digits = phone.replace(/[^\d+]/g, '');
  const m = digits.match(/^(?:\+?91)?([6-9]\d{4})(\d{5})$/);
  return m ? `+91 ${m[1]} ${m[2]}` : phone;
}
