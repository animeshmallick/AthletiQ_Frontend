/**
 * The app's standard filter controls:
 *  - PeriodFilter: one compact dropdown of reporting periods, with the dates it covers.
 *  - FilterMenu: a small filter icon (with a count of active filters) that opens a popover
 *    holding a page's other filters, so toolbars stay one short row on phones.
 */
import { CalendarRange, ListFilter, RotateCcw } from 'lucide-react';
import type { ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/overlays';
import { Select } from '@/components/ui/primitives';
import { formatShortDate } from '@/lib/format';
import { PERIOD_LABELS, periodRange, type PeriodKey } from '@/lib/periods';
import { cn } from '@/lib/utils';

/** A row of filters: period first, then the filter button, then anything else. */
export function FilterBar({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn('mb-2 flex items-center gap-1.5', className)}>{children}</div>;
}

export function PeriodFilter<K extends PeriodKey>({
  value,
  onChange,
  options,
  future = false,
  showRange = true,
  className,
}: {
  value: K;
  onChange: (key: K) => void;
  options: readonly K[];
  /** Current week / month run to their end (planning views). */
  future?: boolean;
  /** Show the dates the period covers next to the dropdown. */
  showRange?: boolean;
  className?: string;
}) {
  const { from, to } = periodRange(value, { future });
  return (
    <div className={cn('flex min-w-0 flex-1 items-center gap-1.5', className)}>
      <Select
        aria-label="Period"
        compact
        className="w-auto max-w-44 shrink-0"
        value={value}
        onChange={(e) => onChange(e.target.value as K)}
      >
        {options.map((o) => (
          <option key={o} value={o}>
            {PERIOD_LABELS[o]}
          </option>
        ))}
      </Select>
      {showRange && (
        <span className="flex min-w-0 items-center gap-1 text-[12px] text-muted-foreground">
          <CalendarRange aria-hidden className="size-3.5 shrink-0" />
          <span className="truncate">
            {formatShortDate(from)} – {formatShortDate(to)}
          </span>
        </span>
      )}
    </div>
  );
}

/** Compact filter button; `active` is how many filters differ from their defaults. */
export function FilterMenu({
  active,
  onReset,
  children,
  className,
}: {
  active: number;
  onReset?: () => void;
  children: ReactNode;
  className?: string;
}) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant={active ? 'tonal' : 'outline'}
          size="sm"
          className={cn('relative h-8 shrink-0 gap-1 px-2', className)}
          aria-label={active ? `Filters (${active} on)` : 'Filters'}
        >
          <ListFilter className="size-4" />
          <span className="hidden sm:inline">Filters</span>
          {active > 0 && (
            <span className="tabular flex size-4 items-center justify-center rounded-full bg-primary text-[10px] font-bold text-primary-foreground">
              {active}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[min(18rem,calc(100vw-1.5rem))] space-y-2.5 p-3">
        <div className="flex items-center justify-between">
          <p className="text-[12px] font-semibold tracking-wide text-muted-foreground uppercase">
            Filters
          </p>
          {onReset && active > 0 && (
            <button
              type="button"
              onClick={onReset}
              className="inline-flex cursor-pointer items-center gap-1 text-[12px] font-medium text-primary hover:underline"
            >
              <RotateCcw className="size-3" /> Reset
            </button>
          )}
        </div>
        {children}
      </PopoverContent>
    </Popover>
  );
}

/** One labelled control inside a FilterMenu. */
export function FilterField({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block space-y-1">
      <span className="text-[12px] font-medium text-muted-foreground">{label}</span>
      {children}
    </label>
  );
}
