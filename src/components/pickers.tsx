import { useEffect } from 'react';
import { useSearchParams } from 'react-router';
import { useAuth } from '@/app/auth';
import { addDays, formatLongDate, relativeDay, today } from '@/lib/format';
import { PeriodStepper } from './date-nav';
import { useBatches } from '@/lib/queries';
import type { Batch } from '@/lib/types';
import { cn } from '@/lib/utils';
import { Select, Skeleton } from './ui/primitives';
import { timeLabel } from '@/lib/batch-times';

/** Prev / date / next control for day-based screens (tap the date to pick one). */
export function DateStepper({
  value,
  onChange,
  min,
  max,
  className,
}: {
  value: string;
  onChange: (d: string) => void;
  min?: string;
  max?: string;
  className?: string;
}) {
  const now = today();
  const rel = relativeDay(value);
  const canToday =
    value !== now && (max === undefined || now <= max) && (min === undefined || now >= min);
  return (
    <PeriodStepper
      className={cn('w-full sm:w-72', className)}
      label={rel}
      sublabel={rel === formatLongDate(value) ? undefined : formatLongDate(value)}
      prevLabel="Previous day"
      nextLabel="Next day"
      prevDisabled={min !== undefined && value <= min}
      nextDisabled={max !== undefined && value >= max}
      onPrev={() => onChange(addDays(value, -1))}
      onNext={() => onChange(addDays(value, 1))}
      onToday={canToday ? () => onChange(now) : undefined}
      pick={{ value, min, max, onChange }}
    />
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
    <Select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className={cn('w-full sm:w-72', className)}
      aria-label="Batch"
    >
      {allowAll && <option value="">All batches</option>}
      {!allowAll && !value && <option value="">Select a batch…</option>}
      {batches?.map((b) => (
        <option key={b.id} value={b.id}>
          {b.name} · {timeLabel(b)}
          {b.substitution &&
            ` · Substitute till ${b.substitution.toDate.slice(8)}/${b.substitution.toDate.slice(5, 7)}`}
          {b.coach && ` · ${b.coach.name}`}
        </option>
      ))}
    </Select>
  );
}

/**
 * Batch + date selection persisted in the URL (?batch=&date=), so links like
 * /attendance?batch=… from the dashboard open the right session and the back button works.
 */
export function useBatchDateParams({
  defaultDate = today(),
  allByDefault = false,
}: {
  defaultDate?: string;
  /** With several batches, start on the combined "all" view instead of the first. */
  allByDefault?: boolean;
} = {}) {
  const { user } = useAuth();
  const [params, setParams] = useSearchParams();
  const batches = useBatches({ active: 'true' });
  const batchId = params.get('batch') ?? '';
  const date = params.get('date') ?? defaultDate;

  // Auto-select the first batch for coaches with a single/obvious choice.
  useEffect(() => {
    if (
      !batchId &&
      batches.data?.length &&
      (user?.role === 'coach' || batches.data.length === 1 || allByDefault)
    ) {
      const p = new URLSearchParams(params);
      p.set('batch', allByDefault && batches.data.length > 1 ? 'all' : batches.data[0]!.id);
      setParams(p, { replace: true });
    }
  }, [batchId, batches.data, user?.role, params, setParams, allByDefault]);

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
