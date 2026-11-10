/** The standard reporting periods used by every period filter in the app. */
import { addDays, addMonths, endOfMonth, startOfMonth, startOfWeek, today } from './format';

export type PeriodKey =
  | '1h'
  | '3h'
  | '24h'
  | '1m'
  | '1y'
  | 'today'
  | 'yesterday'
  | '7d'
  | 'week'
  | 'next'
  | '4w'
  | 'month'
  | 'last-month'
  | 'quarter'
  | 'fy';

export const PERIOD_LABELS: Record<PeriodKey, string> = {
  '1h': 'Last 1 hour',
  '3h': 'Last 3 hours',
  '24h': 'Last 24 hours',
  '1m': 'Last 1 month',
  '1y': 'Last 1 year',
  today: 'Today',
  yesterday: 'Yesterday',
  '7d': 'Last 7 days',
  week: 'This week',
  next: 'Next 2 weeks',
  '4w': 'Last 4 weeks',
  month: 'This month',
  'last-month': 'Last month',
  quarter: 'Last 3 months',
  fy: 'This financial year',
};

/** Past-looking periods, for money and activity. */
export const PAST_PERIODS: PeriodKey[] = ['week', '4w', 'month', 'last-month', 'quarter', 'fy'];

/** The audit log looks back from now: hours, days, a month, a year. */
export const ACTIVITY_PERIODS: PeriodKey[] = ['1h', '3h', '24h', '7d', '1m', '1y'];

const HOURS: Partial<Record<PeriodKey, number>> = { '1h': 1, '3h': 3, '24h': 24 };

/**
 * An audit-log window. Hour windows also carry the exact start (`since`), rounded to the minute
 * so it stays the same between renders.
 */
export function activityWindow(
  key: PeriodKey,
  nowMs: number = Date.now(),
): { from: string; to: string; since?: string } {
  const hours = HOURS[key];
  if (!hours) return periodRange(key, { now: today(new Date(nowMs)) });
  const start = new Date(Math.floor(nowMs / 60_000) * 60_000 - hours * 3_600_000);
  return { from: today(start), to: today(new Date(nowMs)), since: start.toISOString() };
}

/**
 * Dates covered by a period. Periods end today unless `future` is set, in which case the
 * current week / month run to their end (useful for planning).
 */
export function periodRange(
  key: PeriodKey,
  { now = today(), future = false }: { now?: string; future?: boolean } = {},
): { from: string; to: string } {
  switch (key) {
    // Hour windows as dates (the exact start comes from activityWindow).
    case '1h':
    case '3h':
    case '24h':
      return { from: addDays(now, key === '24h' ? -1 : 0), to: now };
    // Rolling windows ending today: the last 30 days, and the last 365.
    case '1m':
      return { from: addDays(now, -29), to: now };
    case '1y':
      return { from: addDays(now, -364), to: now };
    case 'today':
      return { from: now, to: now };
    case '7d':
      return { from: addDays(now, -6), to: now };
    case 'yesterday': {
      const d = addDays(now, -1);
      return { from: d, to: d };
    }
    case 'week': {
      const from = startOfWeek(now);
      return { from, to: future ? addDays(from, 6) : now };
    }
    case 'next':
      return { from: now, to: addDays(now, 13) };
    case '4w':
      return { from: addDays(now, -27), to: now };
    case 'month':
      return { from: startOfMonth(now), to: future ? endOfMonth(now) : now };
    case 'last-month': {
      const s = addMonths(now, -1);
      return { from: startOfMonth(s), to: endOfMonth(s) };
    }
    case 'quarter':
      return { from: addMonths(now, -2), to: now };
    case 'fy': {
      const [y, m] = now.split('-').map(Number) as [number, number];
      return { from: `${m >= 4 ? y : y - 1}-04-01`, to: now };
    }
  }
}
