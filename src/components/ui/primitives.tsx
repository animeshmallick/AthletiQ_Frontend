/** Small, stateless building blocks: inputs, cards, badges, skeletons, separators. */
import { cva, type VariantProps } from 'class-variance-authority';
import { Mail, Phone } from 'lucide-react';
import { Label as LabelPrimitive, Separator as SeparatorPrimitive } from 'radix-ui';
import type { ComponentProps, ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { fieldClass } from './field-styles';

export { Select } from './select';

const field = fieldClass;

const DATE_TYPES = new Set(['date', 'time', 'month', 'week', 'datetime-local']);
/** Native date/time inputs: block layout (flex breaks Chrome's picker), value left-aligned (iOS centres it), icon pinned right. */
const dateField =
  'block [&::-webkit-date-and-time-value]:text-left [&::-webkit-calendar-picker-indicator]:ml-auto [&::-webkit-calendar-picker-indicator]:cursor-pointer [&::-webkit-calendar-picker-indicator]:rounded [&::-webkit-calendar-picker-indicator]:opacity-60 [&::-webkit-calendar-picker-indicator]:hover:opacity-100';
const numberField =
  '[appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none';

/** Icons shown automatically for common input types (purely visual). */
const TYPE_ICON: Record<string, ReactNode> = { tel: <Phone />, email: <Mail /> };

export type InputProps = ComponentProps<'input'> & {
  /** Icon or short text shown inside the field on the left (e.g. ₹). `false` hides the automatic icon. */
  leading?: ReactNode;
  /** Icon or control shown inside the field on the right. */
  trailing?: ReactNode;
};

export function Input({ className, type = 'text', leading, trailing, ...props }: InputProps) {
  const start = leading === undefined ? TYPE_ICON[type] : leading;
  const textLead = typeof start === 'string';
  const input = (
    <input
      type={type}
      data-slot="input"
      inputMode={props.inputMode ?? (type === 'tel' ? 'tel' : undefined)}
      className={cn(
        field,
        'h-10 py-2 read-only:bg-muted/40',
        DATE_TYPES.has(type) && dateField,
        type === 'number' && numberField,
        start && (textLead ? (start.length > 1 ? 'pl-11' : 'pl-7') : 'pl-9'),
        trailing && 'pr-10',
        !start && !trailing && className,
      )}
      {...props}
    />
  );
  if (!start && !trailing) return input;
  return (
    <div className={cn('relative w-full', className)}>
      {start && (
        <span
          aria-hidden
          className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3 text-sm text-muted-foreground [&_svg]:size-4"
        >
          {start}
        </span>
      )}
      {input}
      {trailing && (
        <span className="absolute inset-y-0 right-0 flex items-center pr-2 text-muted-foreground [&_svg]:size-4">
          {trailing}
        </span>
      )}
    </div>
  );
}

export function Textarea({ className, ...props }: ComponentProps<'textarea'>) {
  return (
    <textarea
      data-slot="textarea"
      // Grows with its content (where supported) up to a comfortable maximum, then scrolls.
      className={cn(
        field,
        '[field-sizing:content] max-h-72 min-h-20 py-2 leading-relaxed',
        className,
      )}
      {...props}
    />
  );
}

export function Label({ className, ...props }: ComponentProps<typeof LabelPrimitive.Root>) {
  return (
    <LabelPrimitive.Root
      data-slot="label"
      className={cn(
        'text-sm leading-none font-medium select-none peer-disabled:opacity-50',
        className,
      )}
      {...props}
    />
  );
}

export function Card({ className, ...props }: ComponentProps<'div'>) {
  return (
    <div
      data-slot="card"
      className={cn(
        'rounded-2xl border border-border/70 bg-card text-card-foreground shadow-e1',
        className,
      )}
      {...props}
    />
  );
}

export function CardHeader({ className, ...props }: ComponentProps<'div'>) {
  return (
    <div
      className={cn('flex flex-col gap-0.5 p-3 pb-1.5 sm:p-4 sm:pb-2.5', className)}
      {...props}
    />
  );
}

export function CardTitle({ className, ...props }: ComponentProps<'h3'>) {
  return (
    <h3
      className={cn(
        'text-[15px] leading-snug font-semibold tracking-tight sm:text-base',
        className,
      )}
      {...props}
    />
  );
}

export function CardDescription({ className, ...props }: ComponentProps<'p'>) {
  return (
    <p
      className={cn('text-[13px] leading-snug text-muted-foreground sm:text-sm', className)}
      {...props}
    />
  );
}

export function CardContent({ className, ...props }: ComponentProps<'div'>) {
  return <div className={cn('p-3 pt-0 sm:p-4 sm:pt-0', className)} {...props} />;
}

export function CardFooter({ className, ...props }: ComponentProps<'div'>) {
  return (
    <div
      className={cn('flex items-center gap-2 border-t px-3 py-2 sm:px-4 sm:py-2.5', className)}
      {...props}
    />
  );
}

const badgeVariants = cva(
  'inline-flex w-fit shrink-0 items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium whitespace-nowrap [&_svg]:size-3',
  {
    variants: {
      variant: {
        default: 'border-transparent bg-primary/10 text-primary',
        secondary: 'border-transparent bg-secondary text-secondary-foreground',
        success: 'border-transparent bg-success/12 text-success',
        warning: 'border-transparent bg-warning/18 text-warning-foreground dark:text-warning',
        destructive: 'border-transparent bg-destructive/10 text-destructive',
        outline: 'text-foreground',
        muted: 'border-transparent bg-muted text-muted-foreground',
      },
    },
    defaultVariants: { variant: 'default' },
  },
);

export type BadgeVariant = NonNullable<VariantProps<typeof badgeVariants>['variant']>;

export function Badge({
  className,
  variant,
  ...props
}: ComponentProps<'span'> & VariantProps<typeof badgeVariants>) {
  return (
    <span data-slot="badge" className={cn(badgeVariants({ variant }), className)} {...props} />
  );
}

export function Skeleton({ className, ...props }: ComponentProps<'div'>) {
  return (
    <div
      data-slot="skeleton"
      aria-hidden
      className={cn(
        'relative overflow-hidden rounded-md bg-muted before:absolute before:inset-0 before:animate-shimmer before:bg-linear-to-r before:from-transparent before:via-(--shimmer) before:to-transparent',
        className,
      )}
      {...props}
    />
  );
}

export function Separator({
  className,
  orientation = 'horizontal',
  ...props
}: ComponentProps<typeof SeparatorPrimitive.Root>) {
  return (
    <SeparatorPrimitive.Root
      decorative
      orientation={orientation}
      className={cn(
        'shrink-0 bg-border',
        orientation === 'horizontal' ? 'h-px w-full' : 'h-full w-px',
        className,
      )}
      {...props}
    />
  );
}

export function Kbd({ className, ...props }: ComponentProps<'kbd'>) {
  return (
    <kbd
      className={cn(
        'pointer-events-none inline-flex h-5 items-center rounded border bg-muted px-1.5 font-mono text-[10px] font-medium text-muted-foreground',
        className,
      )}
      {...props}
    />
  );
}
