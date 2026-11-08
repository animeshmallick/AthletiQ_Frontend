import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useEffect } from 'react';
import { useSearchParams } from 'react-router';
import { useAuth } from '@/app/auth';
import { addDays, formatTimeRange, relativeDay, today } from '@/lib/format';
import { useBatches } from '@/lib/queries';
import type { Batch } from '@/lib/types';
import { cn } from '@/lib/utils';
import { Button } from './ui/button';
import { Input, NativeSelect, Skeleton } from './ui/primitives';

/** Prev / date / next control for day-based screens. */
export function DateStepper({
  value,
  onChange,
  max,
  className,
}: {
  value: string;
  onChange: (d: string) => void;
  max?: string;
  className?: string;
}) {
  return (
    <div className={cn('flex items-center gap-1', className)}>
      <Button
        variant="outline"
        size="icon"
        aria-label="Previous day"
        onClick={() => onChange(addDays(value, -1))}
      >
        <ChevronLeft />
      </Button>
      <div className="relative">
        <Input
          type="date"
          value={value}
          max={max}
          onChange={(e) => e.target.value && onChange(e.target.value)}
          aria-label="Date"
          className="w-40 text-center"
        />
      </div>
      <Button
        variant="outline"
        size="icon"
        aria-label="Next day"
        disabled={max !== undefined && value >= max}
        onClick={() => onChange(addDays(value, 1))}
      >
        <ChevronRight />
      </Button>
      <span className="ml-2 hidden text-sm font-medium text-muted-foreground sm:inline">
        {relativeDay(value)}
      </span>
    </div>
  );
}

/** Active batches visible to the current user (coaches: their own). */
export function BatchSelect({
  value,
  onChange,
  batches,
  loading,
  className,
  allowAll,
}: {
  value: string;
  onChange: (id: string) => void;
  batches: Batch[] | undefined;
  loading?: boolean;
  className?: string;
  allowAll?: boolean;
}) {
  if (loading) return <Skeleton className={cn('h-10 w-64', className)} />;
  return (
    <NativeSelect
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className={cn('w-full sm:w-72', className)}
      aria-label="Batch"
    >
      {allowAll && <option value="">All batches</option>}
      {!allowAll && !value && <option value="">Select a batch…</option>}
      {batches?.map((b) => (
        <option key={b.id} value={b.id}>
          {b.name} · {formatTimeRange(b.startTime, b.endTime)}
          {b.coach && ` · ${b.coach.name}`}
        </option>
      ))}
    </NativeSelect>
  );
}

/**
 * Batch + date selection persisted in the URL (?batch=&date=), so links like
 * /attendance?batch=… from the dashboard open the right session and the back button works.
 */
export function useBatchDateParams({ defaultDate = today() }: { defaultDate?: string } = {}) {
  const { user } = useAuth();
  const [params, setParams] = useSearchParams();
  const batches = useBatches({ active: 'true' });
  const batchId = params.get('batch') ?? '';
  const date = params.get('date') ?? defaultDate;

  // Auto-select the first batch for coaches with a single/obvious choice.
  useEffect(() => {
    if (!batchId && batches.data?.length && (user?.role === 'coach' || batches.data.length === 1)) {
      const p = new URLSearchParams(params);
      p.set('batch', batches.data[0]!.id);
      setParams(p, { replace: true });
    }
  }, [batchId, batches.data, user?.role, params, setParams]);

  const set = (key: 'batch' | 'date', value: string) => {
    const p = new URLSearchParams(params);
    if (value) p.set(key, value);
    else p.delete(key);
    setParams(p, { replace: true });
  };

  return {
    batches,
    batchId,
    date,
    batch: batches.data?.find((b) => b.id === batchId),
    setBatch: (id: string) => set('batch', id),
    setDate: (d: string) => set('date', d),
  };
}
