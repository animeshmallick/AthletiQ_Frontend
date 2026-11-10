/**
 * The app's date navigation, compact enough for phones:
 *  - PeriodStepper: ‹ label › with an inline "Today" chip; tapping the label opens a date picker.
 *  - WeekStrip: seven slim day cells (weekday, date, session dots) for picking a day in a week.
 */
import { ChevronLeft, ChevronRight } from 'lucide-react';
import type { ReactNode } from 'react';
import { formatLongDate, WEEKDAYS } from '@/lib/format';
import { cn } from '@/lib/utils';

const ARROW =
  'flex size-8 shrink-0 cursor-pointer items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40';

export function PeriodStepper({
  label,
  sublabel,
  onPrev,
  onNext,
  prevLabel = 'Previous',
  nextLabel = 'Next',
  prevDisabled,
  nextDisabled,
  onToday,
  todayLabel = 'Today',
  pick,
  className,
}: {
  label: ReactNode;
  sublabel?: ReactNode;
  onPrev: () => void;
  onNext: () => void;
  prevLabel?: string;
  nextLabel?: string;
  prevDisabled?: boolean;
  nextDisabled?: boolean;
  /** Shown as a chip when set (i.e. when not already on the current period). */
  onToday?: () => void;
  todayLabel?: string;
  /** Lets the label open the native date picker. */
  pick?: { value: string; min?: string; max?: string; onChange: (d: string) => void };
  className?: string;
}) {
  return (
    <div
      className={cn(
        'flex h-10 min-w-0 items-center gap-0.5 rounded-xl border bg-card px-1 shadow-e1',
        className,
      )}
    >
      <button
        type="button"
        className={ARROW}
        aria-label={prevLabel}
        disabled={prevDisabled}
        onClick={onPrev}
      >
        <ChevronLeft className="size-4" />
      </button>
      <label
        className={cn(
          'relative min-w-0 flex-1 rounded-lg px-1 text-center leading-tight',
          pick && 'cursor-pointer hover:bg-muted/60',
        )}
      >
        <span className="block truncate text-[13px] font-semibold">{label}</span>
        {sublabel && (
          <span className="block truncate text-[10px] font-medium text-muted-foreground">
            {sublabel}
          </span>
        )}
        {pick && (
          <input
            type="date"
            aria-label="Pick a date"
            value={pick.value}
            min={pick.min}
            max={pick.max}
            onChange={(e) => e.target.value && pick.onChange(e.target.value)}
            className="absolute inset-0 cursor-pointer opacity-0"
          />
        )}
      </label>
      {onToday && (
        <button
          type="button"
          onClick={onToday}
          className="h-6 shrink-0 cursor-pointer rounded-full bg-primary/10 px-2 text-[11px] font-semibold text-primary transition-colors hover:bg-primary/15"
        >
          {todayLabel}
        </button>
      )}
      <button
        type="button"
        className={ARROW}
        aria-label={nextLabel}
        disabled={nextDisabled}
        onClick={onNext}
      >
        <ChevronRight className="size-4" />
      </button>
    </div>
  );
}

/** Seven slim day cells; the selected day is filled, today is ringed, a corner badge counts sessions. */
export function WeekStrip({
  days,
  value,
  todayDate,
  count,
  onSelect,
  className,
}: {
  /** The seven dates (Mon–Sun). */
  days: string[];
  value: string;
  todayDate: string;
  count?: (d: string) => number;
  onSelect: (d: string) => void;
  className?: string;
}) {
  return (
    <div
      className={cn('grid grid-cols-7 gap-0.5 pt-1', className)}
      role="tablist"
      aria-label="Days"
    >
      {days.map((d, i) => {
        const n = count?.(d) ?? 0;
        const selected = d === value;
        const isToday = d === todayDate;
        return (
          <button
            key={d}
            type="button"
            role="tab"
            aria-selected={selected}
            aria-label={`${formatLongDate(d)}${count ? `, ${n} session${n === 1 ? '' : 's'}` : ''}`}
            onClick={() => onSelect(d)}
            className={cn(
              'relative flex h-11 cursor-pointer flex-col items-center justify-center gap-0.5 rounded-lg transition-colors active:scale-95',
              selected ? 'bg-primary text-primary-foreground shadow-e1' : 'hover:bg-muted',
            )}
          >
            <span
              className={cn(
                'text-[9px] leading-none font-semibold tracking-wide uppercase',
                !selected && 'text-muted-foreground',
              )}
            >
              {WEEKDAYS[i]?.short}
            </span>
            <span
              className={cn(
                'tabular flex size-6 items-center justify-center rounded-full text-[13px] leading-none font-bold',
                isToday && !selected && 'text-primary ring-1 ring-primary',
              )}
            >
              {Number(d.slice(8))}
            </span>
            {/* Session count, floating on the top corner. */}
            {n > 0 && (
              <span
                aria-hidden
                className={cn(
                  'tabular absolute -top-1.5 -right-1 flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[9px] leading-none font-bold shadow-e1 ring-2 ring-card',
                  selected ? 'bg-card text-primary' : 'bg-primary text-primary-foreground',
                )}
              >
                {n}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
