/**
 * A compact "sort by" pill for a card's top-right corner: shows the current order and opens a
 * short list of orders (a bottom sheet on phones).
 */
import { ArrowDownWideNarrow, Check, ChevronDown } from 'lucide-react';
import type { ReactNode } from 'react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from '@/components/ui/overlays';
import { cn } from '@/lib/utils';

export interface SortOption<K extends string> {
  value: K;
  label: string;
  /** Shown under the label in the menu. */
  hint?: string;
  icon?: ReactNode;
}

export function SortMenu<K extends string>({
  value,
  onChange,
  options,
  label = 'Sort by',
  className,
}: {
  value: K;
  onChange: (v: K) => void;
  options: SortOption<K>[];
  label?: string;
  className?: string;
}) {
  const current = options.find((o) => o.value === value) ?? options[0]!;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label={`${label}: ${current.label}`}
          className={cn(
            'inline-flex h-7 shrink-0 cursor-pointer items-center gap-1 rounded-full border bg-muted/50 pr-1.5 pl-2 text-[11px] font-semibold text-muted-foreground transition-colors hover:bg-muted hover:text-foreground active:scale-[0.97] data-[state=open]:border-primary/40 data-[state=open]:bg-primary/8 data-[state=open]:text-primary',
            className,
          )}
        >
          <ArrowDownWideNarrow className="size-3.5" />
          <span className="max-w-28 truncate">{current.label}</span>
          <ChevronDown className="size-3 opacity-70" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-56">
        <DropdownMenuLabel>{label}</DropdownMenuLabel>
        {options.map((o) => {
          const on = o.value === value;
          return (
            <DropdownMenuItem key={o.value} onSelect={() => onChange(o.value)}>
              {o.icon}
              <span className="min-w-0 flex-1">
                <span className={cn('block', on && 'font-semibold text-primary')}>{o.label}</span>
                {o.hint && (
                  <span className="block text-[11px] font-normal text-muted-foreground">
                    {o.hint}
                  </span>
                )}
              </span>
              {on && <Check className="size-4 text-primary" />}
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
