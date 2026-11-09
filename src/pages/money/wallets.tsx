/**
 * Choose whose cash pays: the academy's or a staff member's. Every wallet shows its balance;
 * one that can't cover the amount in full is disabled (payments are never split or partial).
 */
import { Building2, Check, Wallet as WalletIcon } from 'lucide-react';
import { money } from '@/lib/format';
import { cn } from '@/lib/utils';

export type Wallet = { id: string; name: string; amount: number };

export function WalletPicker({
  wallets,
  value,
  onChange,
  need,
}: {
  wallets: Wallet[];
  value: string;
  onChange: (id: string) => void;
  /** The amount to pay; wallets with less are disabled. */
  need: number;
}) {
  const anyEnough = wallets.some((w) => w.amount >= need);
  return (
    <div>
      <div role="radiogroup" aria-label="Paid from" className="grid gap-1.5 sm:grid-cols-2">
        {wallets.map((w) => {
          const enough = w.amount >= need;
          const selected = value === w.id;
          const Icon = w.id ? WalletIcon : Building2;
          return (
            <button
              key={w.id || 'academy'}
              type="button"
              role="radio"
              aria-checked={selected}
              disabled={!enough}
              onClick={() => onChange(w.id)}
              className={cn(
                'flex min-w-0 cursor-pointer items-center gap-2 rounded-xl border px-2.5 py-2 text-left transition-colors',
                selected ? 'border-primary bg-primary/8 ring-1 ring-primary' : 'hover:bg-muted/60',
                !enough && 'cursor-not-allowed opacity-50 hover:bg-transparent',
              )}
            >
              <span
                className={cn(
                  'flex size-8 shrink-0 items-center justify-center rounded-lg [&_svg]:size-4',
                  selected
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-muted text-muted-foreground',
                )}
              >
                {selected ? <Check /> : <Icon />}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[13px] font-medium">{w.name}</span>
                <span
                  className={cn(
                    'tabular block text-[12px]',
                    enough ? 'text-muted-foreground' : 'text-destructive',
                  )}
                >
                  {money(w.amount)}
                  {!enough && ' · not enough'}
                </span>
              </span>
            </button>
          );
        })}
      </div>
      {need > 0 && !anyEnough && (
        <p role="alert" className="mt-1.5 text-[12px] text-destructive">
          No single wallet has {money(need)}. Collect cash from staff or add income first.
        </p>
      )}
    </div>
  );
}
