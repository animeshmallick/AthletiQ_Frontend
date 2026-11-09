/**
 * Small, dependency-free charts for the activity screens (plain HTML, so the page stays light).
 * Each shows a one-line readout of the hovered / tapped mark instead of a floating tooltip.
 */
import { useState, type ReactNode } from 'react';
import { cn } from '@/lib/utils';

export type BarDatum = {
  key: string;
  /** Axis label (shown for a few bars only). */
  tick: string;
  /** Readout when hovered. */
  label: string;
  value: number;
  /** Part of `value` drawn in the second colour (stacked), e.g. server errors. */
  part?: number;
};

/** Vertical bars over time, with a readout line. */
export function Bars({
  data,
  unit,
  partLabel,
  restLabel,
  className,
  tone = 'primary',
}: {
  data: BarDatum[];
  unit: string;
  partLabel?: string;
  restLabel?: string;
  className?: string;
  tone?: 'primary' | 'warning';
}) {
  const [hover, setHover] = useState<number | null>(null);
  const max = Math.max(1, ...data.map((d) => d.value));
  const total = data.reduce((n, d) => n + d.value, 0);
  const h = hover === null ? null : data[hover];
  // Up to ~6 evenly spaced ticks.
  const every = Math.max(1, Math.ceil(data.length / 6));
  return (
    <div className={className}>
      <p className="tabular mb-1 h-4 truncate text-[12px] text-muted-foreground" aria-live="polite">
        {h ? (
          <>
            <span className="font-medium text-foreground">{h.label}</span> · {h.value} {unit}
            {partLabel && h.part ? ` (${h.part} ${partLabel})` : ''}
          </>
        ) : (
          <>
            {total} {unit} in all
          </>
        )}
      </p>
      <div
        className="flex h-24 items-end gap-[2px]"
        role="img"
        aria-label={`${total} ${unit}; busiest ${max}`}
        onMouseLeave={() => setHover(null)}
      >
        {data.map((d, i) => {
          const part = Math.min(d.part ?? 0, d.value);
          return (
            <button
              key={d.key}
              type="button"
              aria-label={`${d.label}: ${d.value} ${unit}`}
              onMouseEnter={() => setHover(i)}
              onFocus={() => setHover(i)}
              onClick={() => setHover(i)}
              className="group flex h-full min-w-0 flex-1 cursor-default flex-col justify-end"
            >
              {d.value > 0 ? (
                <span
                  className="flex w-full flex-col overflow-hidden rounded-t-[4px]"
                  style={{ height: `${Math.max(4, (d.value / max) * 100)}%` }}
                >
                  <span
                    className={cn(
                      'w-full flex-1 transition-opacity',
                      tone === 'warning' ? 'bg-warning' : 'bg-primary',
                      hover !== null && hover !== i && 'opacity-45',
                    )}
                  />
                  {part > 0 && (
                    <span
                      className={cn(
                        'w-full border-t-2 border-card bg-destructive transition-opacity',
                        hover !== null && hover !== i && 'opacity-45',
                      )}
                      style={{ height: `${(part / d.value) * 100}%` }}
                    />
                  )}
                </span>
              ) : (
                <span className="h-px w-full bg-border" />
              )}
            </button>
          );
        })}
      </div>
      <div className="mt-1 flex gap-[2px] text-[10px] text-muted-foreground">
        {data.map((d, i) => (
          <span key={d.key} className="min-w-0 flex-1 overflow-visible whitespace-nowrap">
            {i % every === 0 ? d.tick : ''}
          </span>
        ))}
      </div>
      {partLabel && restLabel && (
        <div className="mt-1.5 flex items-center gap-3 text-[11px] text-muted-foreground">
          <span className="inline-flex items-center gap-1">
            <span
              className={cn(
                'size-2.5 rounded-sm',
                tone === 'warning' ? 'bg-warning' : 'bg-primary',
              )}
            />
            {restLabel}
          </span>
          <span className="inline-flex items-center gap-1">
            <span className="size-2.5 rounded-sm bg-destructive" />
            {partLabel}
          </span>
        </div>
      )}
    </div>
  );
}

const hourName = (h: number) => `${h % 12 || 12}${h < 12 ? 'am' : 'pm'}`;

/** 24 cells, darker = busier: when in the day things happen. */
export function HourStrip({ hours, unit }: { hours: number[]; unit: string }) {
  const [hover, setHover] = useState<number | null>(null);
  const max = Math.max(1, ...hours);
  return (
    <div>
      <p className="tabular mb-1 h-4 truncate text-[12px] text-muted-foreground" aria-live="polite">
        {hover !== null ? (
          <>
            <span className="font-medium text-foreground">
              {hourName(hover)}–{hourName((hover + 1) % 24)}
            </span>{' '}
            · {hours[hover]} {unit}
          </>
        ) : (
          'Darker = busier'
        )}
      </p>
      <div className="grid grid-cols-24 gap-[2px]" onMouseLeave={() => setHover(null)}>
        {hours.map((n, h) => (
          <button
            key={h}
            type="button"
            aria-label={`${hourName(h)}: ${n} ${unit}`}
            onMouseEnter={() => setHover(h)}
            onFocus={() => setHover(h)}
            onClick={() => setHover(h)}
            className={cn(
              'h-7 cursor-default rounded-[3px] bg-muted',
              hover === h && 'ring-2 ring-foreground/30',
            )}
          >
            {n > 0 && (
              <span
                className="block size-full rounded-[3px] bg-primary"
                style={{ opacity: 0.15 + (n / max) * 0.85 }}
              />
            )}
          </button>
        ))}
      </div>
      <div className="mt-1 grid grid-cols-4 text-[10px] text-muted-foreground">
        <span>12am</span>
        <span>6am</span>
        <span>12pm</span>
        <span>6pm</span>
      </div>
    </div>
  );
}

export type RankItem = {
  key: string;
  label: ReactNode;
  value: number;
  icon?: ReactNode;
  /** Text after the value, e.g. "2 failed". */
  hint?: ReactNode;
  onClick?: () => void;
};

/** A ranked list with proportional bars; rows can be tapped to drill in. */
export function RankList({ items, empty = 'Nothing yet' }: { items: RankItem[]; empty?: string }) {
  if (!items.length)
    return <p className="py-3 text-center text-[13px] text-muted-foreground">{empty}</p>;
  const max = Math.max(1, ...items.map((i) => i.value));
  return (
    <ul className="space-y-0.5">
      {items.map((it) => {
        const body = (
          <>
            {it.icon}
            <span className="min-w-0 flex-1">
              <span className="flex items-baseline justify-between gap-2">
                <span className="truncate text-[13px]">{it.label}</span>
                <span className="tabular shrink-0 text-[12px] text-muted-foreground">
                  <span className="font-semibold text-foreground">
                    {it.value.toLocaleString('en-IN')}
                  </span>
                  {it.hint ? <> · {it.hint}</> : null}
                </span>
              </span>
              <span className="mt-0.5 block h-1.5 overflow-hidden rounded-full bg-muted">
                <span
                  className="block h-full rounded-full bg-primary/70"
                  style={{ width: `${Math.max(3, (it.value / max) * 100)}%` }}
                />
              </span>
            </span>
          </>
        );
        return (
          <li key={it.key}>
            {it.onClick ? (
              <button
                type="button"
                onClick={it.onClick}
                className="flex w-full cursor-pointer items-center gap-2 rounded-lg px-1 py-1 text-left transition-colors hover:bg-muted/60 active:bg-muted"
              >
                {body}
              </button>
            ) : (
              <div className="flex items-center gap-2 px-1 py-1">{body}</div>
            )}
          </li>
        );
      })}
    </ul>
  );
}
