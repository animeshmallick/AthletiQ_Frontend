/** The standard reporting periods used by every period filter in the app. */
import { addDays, addMonths, endOfMonth, startOfMonth, startOfWeek, today } from './format';

export type PeriodKey = 'week' | 'next' | '4w' | 'month' | 'last-month' | 'quarter' | 'fy';

export const PERIOD_LABELS: Record<PeriodKey, string> = {
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

/**
 * Dates covered by a period. Periods end today unless `future` is set, in which case the
 * current week / month run to their end (useful for planning).
 */
export function periodRange(
  key: PeriodKey,
  { now = today(), future = false }: { now?: string; future?: boolean } = {},
): { from: string; to: string } {
  switch (key) {
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
