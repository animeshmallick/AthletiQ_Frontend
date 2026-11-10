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
} from '@/components/common';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/primitives';
import { errorMessage } from '@/lib/api';
import { formatDate, formatShortDate, money, plural } from '@/lib/format';
import { useInvoices, useRunInvoiceJob } from '@/lib/queries';
import { cn } from '@/lib/utils';
import { InvoiceSheet } from './sheet';
import { defaultSort, filterQuery, InvoiceFilters, INVOICE_FILTERS } from './filters';

export function InvoicesPage({ embedded = false }: { embedded?: boolean } = {}) {
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
    sort: params.get('sort') ?? defaultSort(status),
    ...filterQuery(params),
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
      {!embedded && (
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
      )}

      <InvoiceFilters
        params={params}
        status={status}
        search={search}
        set={set}
        summary={
          q.data?.meta && q.data.meta.total > 0 ? (
            <>
              <span className="tabular font-medium text-foreground">
                {plural(q.data.meta.total, 'invoice')}
              </span>{' '}
              ·{' '}
              <span className="tabular font-medium text-foreground">
                {money(q.data.meta.totalAmount)}
              </span>
            </>
          ) : null
        }
      />

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
          description={
            search || Object.keys(INVOICE_FILTERS).some((k) => params.get(k))
              ? 'Try another search or clear the filters.'
              : undefined
          }
        />
      ) : (
        <>
          <Card className="divide-y">
            {q.data.data.map((inv) => (
              <button
                key={inv.id}
                onClick={() => set({ invoice: inv.id })}
                className="flex w-full cursor-pointer items-center gap-2 px-3 py-2 text-left transition-colors hover:bg-muted/40"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[14px] leading-tight font-medium">
                    {inv.student.fullName}
                  </p>
                  <p className="truncate text-[11px] text-muted-foreground">
                    <span className="font-mono">{inv.number}</span> ·{' '}
                    {formatShortDate(inv.periodStart)} – {formatShortDate(inv.periodEnd)}
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
