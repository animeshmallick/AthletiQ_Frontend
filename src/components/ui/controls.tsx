/** Interactive controls: tabs, switch, checkbox, segmented control, weekday picker. */
import { Check } from 'lucide-react';
import { Checkbox as C, Switch as S, Tabs as T, ToggleGroup as TG } from 'radix-ui';
import type { ComponentProps, ReactNode } from 'react';
import { WEEKDAYS } from '@/lib/format';
import { cn } from '@/lib/utils';

export const Tabs = T.Root;
export const TabsContent = T.Content;

export function TabsList({ className, ...props }: ComponentProps<typeof T.List>) {
  return (
    <T.List
      className={cn(
        'flex w-full flex-wrap items-center gap-1 rounded-xl bg-muted p-1 text-muted-foreground sm:inline-flex sm:w-fit sm:max-w-full sm:flex-nowrap',
        className,
      )}
      {...props}
    />
  );
}

export function TabsTrigger({ className, ...props }: ComponentProps<typeof T.Trigger>) {
  return (
    <T.Trigger
      className={cn(
        'inline-flex h-8 flex-1 cursor-pointer items-center justify-center gap-1.5 rounded-lg px-2.5 text-[13px] font-medium whitespace-nowrap transition-all hover:text-foreground disabled:opacity-50 data-[state=active]:bg-card data-[state=active]:font-semibold data-[state=active]:text-foreground data-[state=active]:shadow-e1 sm:flex-none sm:px-3 sm:text-sm [&_svg]:size-4',
        className,
      )}
      {...props}
    />
  );
}

export function Switch({ className, ...props }: ComponentProps<typeof S.Root>) {
  return (
    <S.Root
      className={cn(
        'peer inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent transition-colors disabled:cursor-not-allowed disabled:opacity-50 data-[state=checked]:bg-primary data-[state=unchecked]:bg-input',
        className,
      )}
      {...props}
    >
      <S.Thumb className="pointer-events-none block size-5 rounded-full bg-white shadow-sm transition-transform data-[state=checked]:translate-x-5 data-[state=unchecked]:translate-x-0" />
    </S.Root>
  );
}

export function Checkbox({ className, ...props }: ComponentProps<typeof C.Root>) {
  return (
    <C.Root
      className={cn(
        'peer size-5 shrink-0 cursor-pointer rounded-md border border-input bg-card shadow-xs transition-colors disabled:cursor-not-allowed disabled:opacity-50 data-[state=checked]:border-primary data-[state=checked]:bg-primary data-[state=checked]:text-primary-foreground',
        className,
      )}
      {...props}
    >
      <C.Indicator className="flex items-center justify-center">
        <Check className="size-3.5" strokeWidth={3} />
      </C.Indicator>
    </C.Root>
  );
}

/** Single-choice segmented control. */
export function Segmented<V extends string>({
  value,
  onChange,
  options,
  className,
  size = 'default',
  ariaLabel,
}: {
  value: V;
  onChange: (v: V) => void;
  options: readonly { value: V; label: ReactNode; className?: string }[];
  className?: string;
  size?: 'default' | 'sm';
  ariaLabel: string;
}) {
  return (
    <TG.Root
      type="single"
      value={value}
      onValueChange={(v) => v && onChange(v as V)}
      aria-label={ariaLabel}
      className={cn('inline-flex rounded-xl bg-muted p-1', className)}
    >
      {options.map((o) => (
        <TG.Item
          key={o.value}
          value={o.value}
          className={cn(
            'inline-flex flex-1 cursor-pointer items-center justify-center gap-1.5 rounded-lg font-medium whitespace-nowrap text-muted-foreground transition-all hover:text-foreground data-[state=on]:bg-card data-[state=on]:font-semibold data-[state=on]:text-foreground data-[state=on]:shadow-e1',
            size === 'sm' ? 'h-7 px-2.5 text-xs' : 'h-8 px-3 text-sm',
            o.className,
          )}
        >
          {o.label}
        </TG.Item>
      ))}
    </TG.Root>
  );
}

/** Multi-select weekday chips (1 = Mon … 7 = Sun). */
export function WeekdayPicker({
  value,
  onChange,
  allowed,
  disabled,
  invalid,
  id,
}: {
  value: number[];
  onChange: (days: number[]) => void;
  /** Days that can be selected (e.g. the days a batch runs). */
  allowed?: number[];
  disabled?: boolean;
  invalid?: boolean;
  id?: string;
}) {
  return (
    <TG.Root
      id={id}
      type="multiple"
      value={value.map(String)}
      onValueChange={(v) => onChange(v.map(Number).sort((a, b) => a - b))}
      disabled={disabled}
      aria-label="Days of the week"
      aria-invalid={invalid || undefined}
      className="flex flex-wrap gap-1.5"
    >
      {WEEKDAYS.map((d) => {
        const outside = allowed !== undefined && !allowed.includes(d.value);
        const selected = value.includes(d.value);
        const off = outside && !selected;
        return (
          <TG.Item
            key={d.value}
            value={String(d.value)}
            disabled={off}
            aria-label={
              outside && selected ? `${d.long} (batch doesn't run, tap to remove)` : d.long
            }
            data-outside={outside && selected ? '' : undefined}
            className={cn(
              'h-9 w-11 cursor-pointer rounded-lg border text-sm font-medium transition-all hover:border-primary/50 disabled:cursor-not-allowed disabled:opacity-35 data-[state=on]:border-primary data-[state=on]:bg-primary data-[state=on]:text-primary-foreground',
              invalid && 'border-destructive',
              'data-outside:border-destructive data-outside:bg-destructive data-outside:text-white',
            )}
          >
            {d.short}
          </TG.Item>
        );
      })}
    </TG.Root>
  );
}
