/** Small pieces shared by the skills screens. */
import { ChevronLeft, ChevronRight, TrendingDown, TrendingUp } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { bandOf, score } from '@/lib/skills';
import { cn } from '@/lib/utils';
import { addMonth, levelTone, monthName } from './meta';

/** ‹ March 2026 › — never past the current month. */
export function MonthPicker({
  value,
  onChange,
  max,
}: {
  value: string;
  onChange: (m: string) => void;
  max: string;
}) {
  return (
    <div className="flex items-center gap-0.5 rounded-lg border bg-card">
      <Button
        variant="ghost"
        size="icon"
        className="size-8"
        aria-label="Previous month"
        onClick={() => onChange(addMonth(value, -1))}
      >
        <ChevronLeft />
      </Button>
      <span className="min-w-28 text-center text-[13px] font-semibold tabular-nums">
        {monthName(value)}
      </span>
      <Button
        variant="ghost"
        size="icon"
        className="size-8"
        aria-label="Next month"
        disabled={value >= max}
        onClick={() => onChange(addMonth(value, 1))}
      >
        <ChevronRight />
      </Button>
    </div>
  );
}

/** +0.25 ↑ / -0.5 ↓ (scores × 100). */
export function Change({ value, className }: { value: number | null; className?: string }) {
  if (value === null || value === 0) return null;
  const up = value > 0;
  const Icon = up ? TrendingUp : TrendingDown;
  return (
    <span
      className={cn(
        'inline-flex items-center gap-0.5 text-[11px] font-semibold tabular-nums',
        up ? 'text-success' : 'text-destructive',
        className,
      )}
    >
      <Icon className="size-3" />
      {up ? '+' : '-'}
      {score(Math.abs(value))}
    </span>
  );
}

/** "B1 · Lower Intermediate" — coloured by band; `short` shows just the code. */
export function LevelBadge({
  name,
  code,
  short = false,
  className,
}: {
  name: string;
  code?: string | null;
  short?: boolean;
  className?: string;
}) {
  return (
    <span
      title={code ? `${code} · ${name}${bandOf(code) ? ` (${bandOf(code)})` : ''}` : name}
      className={cn(
        'inline-flex max-w-full shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold',
        levelTone(code),
        className,
      )}
    >
      {code && <span className="font-bold">{code}</span>}
      {(!code || !short) && (
        <span className={cn('truncate', code && 'font-medium')}>{code ? `· ${name}` : name}</span>
      )}
    </span>
  );
}
