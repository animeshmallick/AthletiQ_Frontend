/** One invoice as a page (/invoices/:id): amount, period, payments and every action. */
import { useParams } from 'react-router';
import { ErrorState, ListSkeleton, PageHeader } from '@/components/common';
import { useInvoice } from '@/lib/queries';
import { InvoiceBody } from './sheet';

export function InvoiceDetailPage() {
  const { id = '' } = useParams();
  const q = useInvoice(id);
  return (
    <div className="mx-auto max-w-2xl">
      {/* Phones: the top bar already says "Invoice" with a back arrow. */}
      <PageHeader className="mb-3 hidden lg:flex" title="Invoice" />
      {q.isPending ? (
        <ListSkeleton rows={5} />
      ) : q.isError ? (
        <ErrorState error={q.error} onRetry={() => void q.refetch()} />
      ) : (
        <InvoiceBody inv={q.data} />
      )}
    </div>
  );
}
