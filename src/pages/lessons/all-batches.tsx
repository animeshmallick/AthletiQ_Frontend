import { ChevronRight, CloudRain } from 'lucide-react';
import { EmptyState, ListSkeleton } from '@/components/common';
import { Badge, Card } from '@/components/ui/primitives';
import { formatTimeRange } from '@/lib/format';
import type { Batch } from '@/lib/types';
import { cn } from '@/lib/utils';
import { planStatus, STATUS_META } from './meta';
import { useWeekPlans } from './week-data';
import { timesOn } from '@/lib/batch-times';

/** Every batch's session on one day, with its plan state; tap one to open its plan. */
export function AllBatchesDay({
  batches,
  date,
  onOpen,
}: {
  batches: Batch[];
  date: string;
  onOpen: (batchId: string) => void;
}) {
  const { pending, byDate } = useWeekPlans(
    batches.map((b) => b.id),
    date,
  );
  if (pending) return <ListSkeleton rows={3} />;
  const rows = (byDate.get(date) ?? [])
    .filter((d) => d.isSessionDay)
    .map((d) => ({ d, b: batches.find((x) => x.id === d.batchId) }))
    .filter((r): r is { d: typeof r.d; b: Batch } => Boolean(r.b))
    .map((r) => ({ ...r, t: timesOn(r.b, date) }))
    .sort((x, y) => x.t.startTime.localeCompare(y.t.startTime));

  if (!rows.length)
    return <EmptyState title="No sessions this day" description="None of your batches train." />;

  return (
    <ul className="space-y-1.5" aria-label="Sessions this day">
      {rows.map(({ d, b, t }) => {
        const status = planStatus(d);
        const meta = STATUS_META[status];
        return (
          <li key={b.id}>
            <Card className={cn('overflow-hidden', d.cancelled && 'opacity-70')}>
              <button
                type="button"
                onClick={() => onOpen(b.id)}
                className="flex w-full cursor-pointer items-center gap-2.5 px-2.5 py-2 text-left hover:bg-muted/40"
              >
                <span className={cn('size-2 shrink-0 rounded-full', meta.dot)} />
                <span className="min-w-0 flex-1">
                  <span
                    className={cn(
                      'block truncate text-[14px] font-semibold',
                      d.cancelled && 'line-through',
                    )}
                  >
                    {b.name}
                  </span>
                  <span className="block truncate text-[12px] text-muted-foreground">
                    {formatTimeRange(t.startTime, t.endTime)} · {b.location.name}
                  </span>
                </span>
                {d.cancelled ? (
                  <Badge variant="muted">
                    <CloudRain /> Cancelled
                  </Badge>
                ) : (
                  <Badge variant={meta.badge} className="tabular">
                    {d.planId ? `${d.filledCells}/${d.totalCells}` : meta.label}
                  </Badge>
                )}
                <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
              </button>
            </Card>
          </li>
        );
      })}
    </ul>
  );
}
