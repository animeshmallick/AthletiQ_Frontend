import { useQueries } from '@tanstack/react-query';
import { addDays, startOfWeek } from '@/lib/format';
import { planCalendarQuery, type PlanCalendar } from '@/lib/queries';

export type BatchDay = PlanCalendar['days'][number] & { batchId: string; batchName: string };

/** One week of plan calendars for several batches, grouped by date. */
export function useWeekPlans(batchIds: string[], date: string) {
  const from = startOfWeek(date);
  const results = useQueries({
    queries: batchIds.map((batchId) => planCalendarQuery({ batchId, from, to: addDays(from, 6) })),
  });
  const byDate = new Map<string, BatchDay[]>();
  for (const r of results)
    for (const d of r.data?.days ?? [])
      byDate.set(d.date, [
        ...(byDate.get(d.date) ?? []),
        { ...d, batchId: r.data!.batch.id, batchName: r.data!.batch.name },
      ]);
  return { from, pending: results.some((r) => r.isPending), byDate };
}
