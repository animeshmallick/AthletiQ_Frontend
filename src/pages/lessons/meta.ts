import { addDays, formatShortDate, isoWeekday, today, WEEKDAYS } from '@/lib/format';
import type { PlanStatus } from '@/lib/types';

export const STAGE_COLORS = [
  '#22c55e',
  '#4f46e5',
  '#f59e0b',
  '#ef4444',
  '#06b6d4',
  '#a855f7',
  '#64748b',
];

/** How each plan state looks everywhere on the page (dot, chip and words). */
export const STATUS_META: Record<
  PlanStatus,
  {
    label: string;
    dot: string;
    chip: string;
    badge: 'success' | 'warning' | 'muted' | 'destructive';
  }
> = {
  complete: {
    label: 'Planned',
    dot: 'bg-success',
    chip: 'border-success/30 bg-success/10',
    badge: 'success',
  },
  partial: {
    label: 'Partly planned',
    dot: 'bg-warning',
    chip: 'border-warning/40 bg-warning/12',
    badge: 'warning',
  },
  empty: {
    label: 'Grid empty',
    dot: 'bg-warning/60',
    chip: 'border-warning/30 bg-warning/8',
    badge: 'warning',
  },
  unplanned: {
    label: 'Not planned',
    dot: 'bg-muted-foreground/40',
    chip: 'border-dashed bg-card',
    badge: 'muted',
  },
};

export function planStatus(info?: {
  planId: string | null;
  filledCells: number;
  totalCells: number;
}): PlanStatus {
  if (!info?.planId) return 'unplanned';
  if (info.filledCells === 0) return 'empty';
  return info.filledCells >= info.totalCells ? 'complete' : 'partial';
}

export const pct = (n: number | null | undefined) =>
  n === null || n === undefined ? '—' : `${Math.round(n * 100)}%`;

export function daysAgo(date: string, now = today()): string {
  const d = Math.round((Date.parse(now) - Date.parse(date)) / 864e5);
  if (d <= 0) return 'today';
  if (d === 1) return 'yesterday';
  if (d < 14) return `${d} days ago`;
  return `${Math.round(d / 7)} weeks ago`;
}

/** "today", "tomorrow", "yesterday", else "Thu 12 Nov". */
export function whenLabel(date: string, now = today()): string {
  if (date === now) return 'today';
  if (date === addDays(now, 1)) return 'tomorrow';
  if (date === addDays(now, -1)) return 'yesterday';
  return `${WEEKDAYS[isoWeekday(date) - 1]?.short} ${formatShortDate(date)}`;
}

/**
 * The nearest day on or after (dir 1) / on or before (dir -1) `date` that the batch trains,
 * or `date` itself if the batch has no training days.
 */
export function snapToSession(date: string, weekdays: number[], dir: 1 | -1 = 1): string {
  if (!weekdays.length) return date;
  let d = date;
  for (let i = 0; i < 7 && !weekdays.includes(isoWeekday(d)); i++) d = addDays(d, dir);
  return d;
}
