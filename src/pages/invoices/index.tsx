import { ChevronRight, IndianRupee, Play } from 'lucide-react';
import { useSearchParams } from 'react-router';
import { toast } from 'sonner';
import { useUser } from '@/app/auth';
import {
  EmptyState,
  ErrorState,
  InvoiceStatusBadge,
  ListSkeleton,
  PageHeader,
  Pagination,
  SearchInput,
} from '@/components/common';
import { Button } from '@/components/ui/button';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/controls';
import { Card } from '@/components/ui/primitives';
import { errorMessage } from '@/lib/api';
import { formatDate, formatShortDate, money, plural } from '@/lib/format';
import { useInvoices, useRunInvoiceJob } from '@/lib/queries';
import { cn } from '@/lib/utils';
import { InvoiceSheet } from './sheet';

const TABS = [
  { value: 'open', label: 'Unpaid' },
  { value: 'overdue', label: 'Overdue' },
  { value: 'paid', label: 'Paid' },
  { value: 'all', label: 'All' },
] as const;

export function InvoicesPage() {
  const user = useUser();
  const [params, setParams] = useSearchParams();
  const status = params.get('status') ?? 'open';
  const search = params.get('q') ?? '';
  const page = Number(params.get('page') ?? 1);
  const openId = params.get('invoice');
  const runJob = useRunInvoiceJob();

  const q = useInvoices({
    status: status === 'all' ? undefined : status,
    search: search || undefined,
    sort: status === 'open' || status === 'overdue' ? 'dueDateAsc' : 'issueDateDesc',
    page,
    pageSize: 25,
  });

  const set = (patch: Record<string, string | null>) => {
    const p = new URLSearchParams(params);
    for (const [k, v] of Object.entries(patch)) {
      if (v) p.set(k, v);
      else p.delete(k);
    }
    if (!('page' in patch) && !('invoice' in patch)) p.delete('page');
    setParams(p, { replace: !('invoice' in patch) });
  };

  return (
    <div>
      <PageHeader
        title="Invoices"
        description="Prepaid: the first invoice is created when a student is accepted, then automatically at the start of each month."
        actions={
          user.role === 'admin' && (
            <Button
              variant="outline"
              loading={runJob.isPending}
              onClick={() =>
                runJob.mutate(undefined, {
                  onSuccess: (r) =>
                    r.ran
                      ? toast.success(
                          `Billing run complete — ${r.stats?.invoicesCreated ?? 0} new invoice(s)`,
                        )
                      : toast.info(r.reason ?? 'Billing is already running'),
                  onError: (e) => toast.error(errorMessage(e)),
                })
              }
            >
              <Play /> Run billing now
            </Button>
          )
        }
      />

      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <Tabs value={status} onValueChange={(v) => set({ status: v === 'open' ? null : v })}>
          <TabsList>
            {TABS.map((t) => (
              <TabsTrigger key={t.value} value={t.value}>
                {t.label}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
        <SearchInput
          value={search}
          onChange={(v) => set({ q: v || null })}
          placeholder="Invoice no. or student…"
          className="sm:w-72"
        />
      </div>

      {q.data?.meta && q.data.meta.total > 0 && (
        <p className="mb-3 text-sm text-muted-foreground">
          <span className="tabular font-medium text-foreground">
            {plural(q.data.meta.total, 'invoice')}
          </span>{' '}
          ·{' '}
          <span className="tabular font-medium text-foreground">
            {money(q.data.meta.totalAmount)}
          </span>
        </p>
      )}

      {q.isPending ? (
        <ListSkeleton rows={8} />
      ) : q.isError ? (
        <ErrorState error={q.error} onRetry={() => void q.refetch()} />
      ) : q.data.data.length === 0 ? (
        <EmptyState
          icon={<IndianRupee />}
          title={
            status === 'overdue'
              ? 'Nothing overdue 🎉'
              : status === 'open'
                ? 'All invoices are paid'
                : 'No invoices found'
          }
          description={search ? 'Try another search.' : undefined}
        />
      ) : (
        <>
          <Card className="divide-y">
            {q.data.data.map((inv) => (
              <button
                key={inv.id}
                onClick={() => set({ invoice: inv.id })}
                className="flex w-full cursor-pointer items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-muted/40"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">{inv.student.fullName}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    <span className="font-mono">{inv.number}</span> ·{' '}
                    {formatShortDate(inv.periodStart)} – {formatShortDate(inv.periodEnd)}
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
                <span className="tabular w-24 text-right font-semibold">
                  {money(inv.totalAmount)}
                </span>
                <InvoiceStatusBadge status={inv.displayStatus} />
                <ChevronRight className="hidden size-4 text-muted-foreground sm:block" />
              </button>
            ))}
          </Card>
          {q.data.meta && (
            <Pagination
              page={q.data.meta.page}
              totalPages={q.data.meta.totalPages}
              total={q.data.meta.total}
              onPage={(p) => set({ page: String(p) })}
            />
          )}
        </>
      )}

      <InvoiceSheet id={openId} onOpenChange={(o) => !o && set({ invoice: null })} />
    </div>
  );
}
