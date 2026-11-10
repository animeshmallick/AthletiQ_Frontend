/**
 * Badges that float on a card's top edge — half outside, half in — like a notification badge:
 * a solid tone fill, a ring in the card colour so they lift off the border, and a soft glow in
 * their own colour. Wrap the card in <Floating> and pass the badges; they sit top-right.
 */
import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

export type FloatTone =
  'success' | 'warning' | 'destructive' | 'primary' | 'muted' | 'neutral' | 'live' | 'on-air';

// Light, opaque tints (they sit over the card's border): soft fill, tone-coloured text and a
// hairline border, with a faint glow in the same colour.
const TONE: Record<FloatTone, string> = {
  success:
    'bg-[color-mix(in_oklab,var(--color-success)_14%,var(--color-card))] border border-success/25 text-success shadow-success/15',
  live: 'bg-[color-mix(in_oklab,var(--color-success)_16%,var(--color-card))] border border-success/30 text-success shadow-success/20',
  warning:
    'bg-[color-mix(in_oklab,var(--color-warning)_22%,var(--color-card))] border border-warning/40 text-warning-foreground shadow-warning/20 dark:text-warning',
  destructive:
    'bg-[color-mix(in_oklab,var(--color-destructive)_12%,var(--color-card))] border border-destructive/25 text-destructive shadow-destructive/15',
  primary:
    'bg-[color-mix(in_oklab,var(--color-primary)_12%,var(--color-card))] border border-primary/25 text-primary shadow-primary/15',
  /** Red for what is happening right now. */
  'on-air':
    'bg-[color-mix(in_oklab,var(--color-rose-600)_12%,var(--color-card))] border border-rose-600/25 text-rose-700 shadow-rose-600/15 dark:text-rose-400',
  /** Quiet states (later, done): a light card-coloured pill. */
  neutral: 'border bg-card text-muted-foreground shadow-black/8',
  muted: 'border bg-muted text-muted-foreground shadow-black/8',
};

export function FloatBadge({
  tone,
  icon,
  children,
  title,
  className,
}: {
  tone: FloatTone;
  icon?: ReactNode;
  children: ReactNode;
  title?: string;
  className?: string;
}) {
  return (
    <span
      title={title}
      data-slot="float-badge"
      className={cn(
        'tabular inline-flex h-5 items-center gap-1 rounded-full px-2 text-[10.5px] leading-none font-semibold tracking-[0.01em] whitespace-nowrap',
        'shadow-sm ring-2 ring-card [&_svg]:size-3 [&_svg]:shrink-0',
        TONE[tone],
        className,
      )}
    >
      {(tone === 'live' || tone === 'on-air') && (
        <span className="relative flex size-1.5" aria-hidden>
          <span className="absolute inline-flex size-full animate-ping rounded-full bg-current opacity-60" />
          <span className="relative inline-flex size-1.5 rounded-full bg-current" />
        </span>
      )}
      {icon}
      {children}
    </span>
  );
}

/**
 * Wraps a card so its badges straddle the top edge (top-right). Leaves room above the card for
 * the badges' upper half; nothing is clipped even if the card hides its overflow.
 */
export function Floating({
  badges,
  children,
  className,
}: {
  badges: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  const has = Array.isArray(badges) ? badges.some(Boolean) : Boolean(badges);
  return (
    <div className={cn('relative', has && 'pt-2.5', className)}>
      {has && (
        <div className="pointer-events-none absolute top-0 right-3 z-10 flex max-w-[calc(100%-1.5rem)] items-center justify-end gap-1 [&>*]:pointer-events-auto">
          {badges}
        </div>
      )}
      {children}
    </div>
  );
}
