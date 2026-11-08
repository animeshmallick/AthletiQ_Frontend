import { cn } from '@/lib/utils';

/** Shared look for text inputs, textareas and select triggers. */
export const fieldClass = cn(
  'flex w-full min-w-0 rounded-xl border border-input bg-card px-3 text-base shadow-xs outline-none md:text-sm',
  'transition-[color,box-shadow,border-color] duration-150',
  'placeholder:text-muted-foreground/70',
  // Hover hint, focus ring, error state (red border + red ring on focus).
  'hover:not-focus-visible:not-aria-invalid:border-muted-foreground/40',
  'focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/20',
  'aria-invalid:border-destructive aria-invalid:focus-visible:ring-destructive/20',
  'disabled:cursor-not-allowed disabled:bg-muted/50 disabled:opacity-60',
  // Browser autofill keeps our colours instead of a yellow/blue fill.
  'autofill:shadow-[inset_0_0_0_1000px_var(--color-card)] autofill:[-webkit-text-fill-color:var(--color-foreground)]',
);
