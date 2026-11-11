/**
 * Invoices grouped by batch or by place: collapsed cards (one open at a time), each header summing
 * up its invoices — total, overdue, due and paid, with a bar of how much of it is collected.
 */
import { Accordion } from 'radix-ui';
import { ChevronDown, ChevronRight, Layers, MapPin } from 'lucide-react';
import { useState } from 'react';
import { formatMonth, formatShortDate, money, plural, today } from '@/lib/format';
import type { Invoice } from '@/lib/types';
import { cn } from '@/lib/utils';

export type InvoiceGroupBy = 'batch' | 'location';

interface Group {
  id: string;
  name: string;
  invoices: Invoice[];
}

const NONE = '__none__';

function groupInvoices(list: Invoice[], by: InvoiceGroupBy): Group[] {
  const map = new Map<string, Group>();
  for (const inv of list) {
    // Group key and name always come from the same field, so a group never borrows another
    // batch's name. A batch since deleted (no id) still groups by its name on the invoice.
    const id =
      by === 'batch'
        ? (inv.batchId ?? (inv.batchName ? `name:${inv.batchName}` : NONE))
        : (inv.location?.id ?? NONE);
    const name =
      by === 'batch' ? (inv.batchName ?? 'No batch') : (inv.location?.name ?? 'No place');
    const g = map.get(id) ?? { id, name, invoices: [] };
    g.invoices.push(inv);
    map.set(id, g);
  }
  return [...map.values()].sort(
    (a, b) => Number(a.id === NONE) - Number(b.id === NONE) || a.name.localeCompare(b.name),
  );
}

/** Totals by state, in paise. */
function insights(list: Invoice[]) {
  const sum = (f: (i: Invoice) => boolean) => list.filter(f).reduce((n, i) => n + i.totalAmount, 0);
  const cnt = (f: (i: Invoice) => boolean) => list.filter(f).length;
  const overdue = (i: Invoice) => i.displayStatus === 'overdue';
  const due = (i: Invoice) => i.displayStatus === 'due';
  const paid = (i: Invoice) => i.displayStatus === 'paid';
  const billed = (i: Invoice) => i.displayStatus !== 'cancelled';
  return {
    total: sum(billed),
    overdue: sum(overdue),
    overdueN: cnt(overdue),
    due: sum(due),
    dueN: cnt(due),
    paid: sum(paid),
    paidN: cnt(paid),
  };
}

const ROW_TONE: Record<Invoice['displayStatus'], { bar: string; text: string }> = {
  overdue: { bar: 'bg-destructive', text: 'text-destructive' },
  due: { bar: 'bg-warning', text: 'text-warning-foreground dark:text-warning' },
  paid: { bar: 'bg-success', text: 'text-success' },
  refunded: { bar: 'bg-muted-foreground/40', text: 'text-muted-foreground' },
  cancelled: { bar: 'bg-muted-foreground/30', text: 'text-muted-foreground' },
};

/** Where the invoice stands, in a few words: "Overdue 12d", "Due 5 Mar", "Paid 2 Mar". */
function standing(inv: Invoice) {
  switch (inv.displayStatus) {
    case 'overdue': {
      const days = Math.max(
        1,
        Math.round((Date.parse(today()) - Date.parse(inv.dueDate)) / 86_400_000),
      );
      return `Overdue ${days}d`;
    }
    case 'due':
      return `Due ${formatShortDate(inv.dueDate)}`;
    case 'paid':
      return inv.paidAt ? `Paid ${formatShortDate(inv.paidAt.slice(0, 10))}` : 'Paid';
    case 'refunded':
      return 'Refunded';
    default:
      return 'Cancelled';
  }
}

/** One invoice, two compact lines: who and how much; month, batch, number and where it stands. */
export function InvoiceRow({ inv, onOpen }: { inv: Invoice; onOpen: () => void }) {
  const tone = ROW_TONE[inv.displayStatus];
  return (
    <button
      onClick={onOpen}
      className="group flex w-full cursor-pointer items-stretch gap-2 py-1.5 pr-2 pl-1.5 text-left transition-colors hover:bg-muted/40"
    >
      <span aria-hidden className={cn('w-1 shrink-0 rounded-full', tone.bar)} />
      <span className="min-w-0 flex-1">
        <span className="flex items-baseline justify-between gap-2">
          <span
            className={cn(
              'truncate text-[13.5px] leading-tight font-semibold',
              inv.displayStatus === 'cancelled' && 'text-muted-foreground line-through',
            )}
          >
            {inv.student.fullName}
          </span>
          <span className="tabular shrink-0 text-[13.5px] font-bold">{money(inv.totalAmount)}</span>
        </span>
        <span className="mt-0.5 flex items-center justify-between gap-2 text-[11px]">
          <span className="min-w-0 truncate text-muted-foreground">
            {formatMonth(inv.periodStart.slice(0, 7))}
            {/* A student in several batches has an invoice per batch. */}
            {inv.batchName ? ` · ${inv.batchName}` : ''} ·{' '}
            <span className="font-mono text-[10.5px]">{inv.number}</span>
          </span>
          <span className={cn('shrink-0 font-semibold', tone.text)}>{standing(inv)}</span>
        </span>
      </span>
      <ChevronRight className="size-4 shrink-0 self-center text-muted-foreground transition-transform group-hover:translate-x-0.5" />
    </button>
  );
}

export function InvoiceGroups({
  invoices,
  by,
  onOpen,
}: {
  invoices: Invoice[];
  by: InvoiceGroupBy;
  onOpen: (id: string) => void;
}) {
  const groups = groupInvoices(invoices, by);
  const [open, setOpen] = useState('');
  const value = groups.some((g) => g.id === open) ? open : '';
  const Icon = by === 'batch' ? Layers : MapPin;

  return (
    <Accordion.Root
      type="single"
      collapsible
      value={value}
      onValueChange={setOpen}
      className="space-y-1.5"
    >
      {groups.map((g) => {
        const s = insights(g.invoices);
        const collected = s.total ? (s.paid / s.total) * 100 : 0;
        const late = s.total ? (s.overdue / s.total) * 100 : 0;
        return (
          <Accordion.Item
            key={g.id}
            value={g.id}
            className="overflow-hidden rounded-xl border bg-card shadow-e1"
          >
            <Accordion.Header>
              <Accordion.Trigger className="group flex w-full cursor-pointer items-center gap-2 px-2 py-1.5 text-left hover:bg-muted/40">
                <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <Icon className="size-4" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-baseline justify-between gap-2">
                    <span className="truncate text-[14px] font-semibold">{g.name}</span>
                    <span className="tabular shrink-0 text-[13px] font-semibold">
                      {money(s.total)}
                    </span>
                  </span>
                  <span className="block truncate text-[11px] text-muted-foreground">
                    {plural(g.invoices.length, 'invoice')}
                    {s.paidN ? ` · ${s.paidN} paid` : ''}
                  </span>
                  {/* Collected (green) and overdue (red) out of the group's total. */}
                  {s.total > 0 && (
                    <span
                      className="mt-1 flex h-1 overflow-hidden rounded-full bg-muted"
                      role="img"
                      aria-label={`${Math.round(collected)}% collected`}
                    >
                      <span className="h-full bg-success" style={{ width: `${collected}%` }} />
                      <span className="h-full bg-destructive" style={{ width: `${late}%` }} />
                    </span>
                  )}
                  <span className="mt-1 flex flex-wrap items-center gap-1 text-[10px] font-semibold">
                    {s.overdueN > 0 && (
                      <span className="rounded-full bg-destructive/10 px-1.5 py-px text-destructive">
                        Overdue {money(s.overdue)} · {s.overdueN}
                      </span>
                    )}
                    {s.dueN > 0 && (
                      <span className="rounded-full bg-warning/15 px-1.5 py-px text-warning-foreground dark:text-warning">
                        Due {money(s.due)} · {s.dueN}
                      </span>
                    )}
                    {s.paidN > 0 && (
                      <span className="rounded-full bg-success/10 px-1.5 py-px text-success">
                        Paid {money(s.paid)}
                      </span>
                    )}
                  </span>
                </span>
                <ChevronDown className="size-4 shrink-0 text-muted-foreground transition-transform group-data-[state=open]:rotate-180" />
              </Accordion.Trigger>
            </Accordion.Header>
            <Accordion.Content className="divide-y border-t">
              {g.invoices.map((inv) => (
                <InvoiceRow key={inv.id} inv={inv} onOpen={() => onOpen(inv.id)} />
              ))}
            </Accordion.Content>
          </Accordion.Item>
        );
      })}
    </Accordion.Root>
  );
}
