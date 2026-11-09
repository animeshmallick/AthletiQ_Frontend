/**
 * Batch timings: a default start/end time, and any weekday can run at its own time.
 * Overrides are keyed by ISO weekday ("1" = Monday … "7" = Sunday).
 */
import { formatTimeRange, isoWeekday, WEEKDAYS, weekdaysLabel } from './format';

export interface TimeSlot {
  start: string;
  end: string;
}
export type DayTimes = Partial<Record<string, TimeSlot>>;

export interface Timed {
  startTime: string;
  endTime: string;
  dayTimes?: DayTimes | null;
}

/** The batch's time on an ISO weekday or a 'YYYY-MM-DD' date. */
export function timesOn(b: Timed, day: number | string): { startTime: string; endTime: string } {
  const weekday = typeof day === 'number' ? day : isoWeekday(day);
  const own = b.dayTimes?.[String(weekday)];
  return own
    ? { startTime: own.start, endTime: own.end }
    : { startTime: b.startTime, endTime: b.endTime };
}

const rangeOf = (t: { startTime: string; endTime: string }) =>
  formatTimeRange(t.startTime, t.endTime);

/** The batch's days grouped by the time they run, in weekday order of first appearance. */
export function scheduleGroups(
  b: Timed & { weekdays: number[] },
): { days: number[]; label: string; time: string }[] {
  const groups = new Map<string, number[]>();
  for (const d of [...b.weekdays].sort((x, y) => x - y)) {
    const r = rangeOf(timesOn(b, d));
    groups.set(r, [...(groups.get(r) ?? []), d]);
  }
  return [...groups].map(([time, days]) => ({ days, label: weekdaysLabel(days), time }));
}

/** True when some day runs at a different time than the others. */
export const timesVary = (b: Timed & { weekdays: number[] }) => scheduleGroups(b).length > 1;

/** "6:00 am – 8:00 am", or "Times vary" when days differ (for tight spots). */
export const timeLabel = (b: Timed & { weekdays: number[] }) =>
  timesVary(b) ? 'Times vary' : rangeOf(b);

/**
 * "Mon, Wed, Fri · 6:00 am – 8:00 am" when every day runs at the same time, otherwise
 * "Mon, Wed 6:00 am – 8:00 am · Sat 7:00 am – 9:00 am".
 */
export function scheduleLabel(b: Timed & { weekdays: number[] }): string {
  const groups = scheduleGroups(b);
  if (groups.length <= 1) return `${weekdaysLabel(b.weekdays)} · ${rangeOf(b)}`;
  return groups
    .map((g) => `${g.days.map((d) => WEEKDAYS[d - 1]?.short).join(', ')} ${g.time}`)
    .join(' · ');
}
