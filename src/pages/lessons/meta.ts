import { addDays, isoWeekday, WEEKDAYS } from '@/lib/format';
import type { FloatTone } from '@/components/floating-badge';
import type { PlanStatus } from '@/lib/types';

/** Block colours (warm-up green, ball drills amber, workout red, cool-down cyan…). */
export const BLOCK_COLORS = [
  '#22c55e',
  '#f59e0b',
  '#ef4444',
  '#06b6d4',
  '#4f46e5',
  '#a855f7',
  '#64748b',
];

/** Common blocks offered when adding one, with their usual colour. */
export const BLOCK_SUGGESTIONS: { name: string; color: string }[] = [
  { name: 'Warm-up', color: '#22c55e' },
  { name: 'Agility drills', color: '#22c55e' },
  { name: 'Ball drills', color: '#f59e0b' },
  { name: 'Skill work', color: '#4f46e5' },
  { name: 'Game play', color: '#a855f7' },
  { name: 'Workout', color: '#ef4444' },
  { name: 'Cool down', color: '#06b6d4' },
];

/** How each plan status looks on the overview. */
export const STATUS_META: Record<
  PlanStatus,
  { label: string; badge: 'success' | 'warning' | 'muted'; tone: FloatTone }
> = {
  ready: { label: 'Ready', badge: 'success', tone: 'success' },
  'needs-update': { label: 'Needs update', badge: 'warning', tone: 'warning' },
  none: { label: 'Not set up', badge: 'muted', tone: 'neutral' },
};

/** "Mon 60 min · Thu 90 min" for a batch whose days differ. */
export const dayLengths = (byDay: Record<string, number>) =>
  Object.entries(byDay)
    .map(([d, m]) => `${WEEKDAYS[Number(d) - 1]?.short} ${m} min`)
    .join(' · ');

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
