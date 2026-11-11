import { IndianRupee, Layers, List, MapPin, Play } from 'lucide-react';
import { useSearchParams } from 'react-router';
import { toast } from 'sonner';
import { useUser } from '@/app/auth';
import { EmptyState, ErrorState, ListSkeleton, PageHeader, Pagination } from '@/components/common';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/primitives';
import { errorMessage } from '@/lib/api';
import { money, plural } from '@/lib/format';
import { useInvoices, useRunInvoiceJob } from '@/lib/queries';
import { Segmented } from '@/components/ui/controls';
import { InvoiceGroups, InvoiceRow, type InvoiceGroupBy } from './grouped';
import { InvoiceSheet } from './sheet';
import { defaultSort, filterQuery, InvoiceFilters, INVOICE_FILTERS } from './filters';

export function InvoicesPage({ embedded = false }: { embedded?: boolean } = {}) {
  const user = useUser();
  const [params, setParams] = useSearchParams();
  const status = params.get('status') ?? 'open';
  const search = params.get('q') ?? '';
  const page = Number(params.get('page') ?? 1);
  const openId = params.get('invoice');
  // Grouped by batch or place, or one flat list. Coaches start grouped by batch, admins on the list.
  const defaultGroup = user.role === 'admin' ? 'none' : 'batch';
  const group = (params.get('group') ?? defaultGroup) as InvoiceGroupBy | 'none';
  const runJob = useRunInvoiceJob();

  const q = useInvoices({
    status: status === 'all' ? undefined : status,
    search: search || undefined,
    sort: params.get('sort') ?? defaultSort(status),
    ...filterQuery(params),
    page,
    // Grouped: the whole lot (up to 100) so each group's totals are complete.
    pageSize: group === 'none' ? 25 : 100,
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
        actions={
          <Segmented
            ariaLabel="Show invoices"
            size="sm"
            value={group}
            onChange={(v) => set({ group: v === defaultGroup ? null : v })}
            options={[
              { value: 'batch', label: <Layers className="size-3.5" aria-label="By batch" /> },
              { value: 'location', label: <MapPin className="size-3.5" aria-label="By place" /> },
              { value: 'none', label: <List className="size-3.5" aria-label="As a list" /> },
            ]}
            className="h-9 shrink-0 items-center"
          />
        }
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
          {group === 'none' ? (
            <Card className="divide-y">
              {q.data.data.map((inv) => (
                <InvoiceRow key={inv.id} inv={inv} onOpen={() => set({ invoice: inv.id })} />
              ))}
            </Card>
          ) : (
            <InvoiceGroups
              invoices={q.data.data}
              by={group}
              onOpen={(id) => set({ invoice: id })}
            />
          )}
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
