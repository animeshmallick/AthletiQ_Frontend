/**
 * Invoices grouped by batch or by place: collapsed cards (one open at a time), each header summing
 * up its invoices — total, overdue, due and paid, with a bar of how much of it is collected.
 */
import { Accordion } from 'radix-ui';
import { ChevronDown, ChevronRight, Layers, MapPin } from 'lucide-react';
import { useState } from 'react';
import { InvoiceStatusBadge } from '@/components/common';
import { formatDate, formatShortDate, money, plural } from '@/lib/format';
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
    const id = (by === 'batch' ? inv.batchId : inv.location?.id) ?? NONE;
    const name =
      (by === 'batch' ? inv.batchName : inv.location?.name) ??
      (by === 'batch' ? 'No batch' : 'No place');
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

export function InvoiceRow({ inv, onOpen }: { inv: Invoice; onOpen: () => void }) {
  return (
    <button
      onClick={onOpen}
      className="flex w-full cursor-pointer items-center gap-2 px-3 py-2 text-left transition-colors hover:bg-muted/40"
    >
      <div className="min-w-0 flex-1">
        <p className="truncate text-[14px] leading-tight font-medium">{inv.student.fullName}</p>
        <p className="truncate text-[11px] text-muted-foreground">
          <span className="font-mono">{inv.number}</span> · {formatShortDate(inv.periodStart)} –{' '}
          {formatShortDate(inv.periodEnd)}
          {/* A student in several batches has an invoice per batch. */}
          {inv.batchName ? ` · ${inv.batchName}` : ''}
        </p>
      </div>
      <div className="hidden text-right text-xs text-muted-foreground sm:block">
        <p>Due</p>
        <p
          className={cn(
            'font-medium',
            inv.displayStatus === 'overdue' ? 'text-destructive' : 'text-foreground',
          )}
        >
          {formatDate(inv.dueDate)}
        </p>
      </div>
      <span className="tabular w-20 text-right text-[14px] font-semibold">
        {money(inv.totalAmount)}
      </span>
      <InvoiceStatusBadge status={inv.displayStatus} />
      <ChevronRight className="hidden size-4 text-muted-foreground sm:block" />
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
