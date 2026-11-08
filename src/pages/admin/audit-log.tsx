import { ScrollText } from 'lucide-react';
import { useState } from 'react';
import { EmptyState, ErrorState, ListSkeleton, PageHeader, Pagination } from '@/components/common';
import { Card, Select } from '@/components/ui/primitives';
import { formatInstant } from '@/lib/format';
import { useAuditLogs } from '@/lib/queries';

const ENTITY_TYPES = [
  'invoice',
  'student',
  'user',
  'batch',
  'fee_plan',
  'location',
  'registration',
  'coach_session',
  'academy_settings',
  'job',
];

/** "invoice.payment_reverted" → "Invoice payment reverted" */
function humanize(action: string) {
  const text = action.replace(/[._]/g, ' ');
  return text.charAt(0).toUpperCase() + text.slice(1);
}

export function AuditLogPage() {
  const [entityType, setEntityType] = useState('');
  const [page, setPage] = useState(1);
  const q = useAuditLogs({ entityType: entityType || undefined, page, pageSize: 50 });

  return (
    <div>
      <PageHeader
        title="Audit log"
        description="Every sensitive change — payments, fee changes, transfers and access — with who did it and when."
      />
      <Select
        value={entityType}
        onChange={(e) => (setEntityType(e.target.value), setPage(1))}
        className="mb-4 sm:w-64"
        aria-label="Filter by type"
      >
        <option value="">All activity</option>
        {ENTITY_TYPES.map((t) => (
          <option key={t} value={t}>
            {humanize(t)}
          </option>
        ))}
      </Select>
      {q.isPending ? (
        <ListSkeleton rows={8} />
      ) : q.isError ? (
        <ErrorState error={q.error} onRetry={() => void q.refetch()} />
      ) : q.data.data.length === 0 ? (
        <EmptyState icon={<ScrollText />} title="No activity yet" />
      ) : (
        <>
          <Card className="divide-y">
            {q.data.data.map((l) => (
              <details key={l.id} className="group px-4 py-3 text-sm">
                <summary className="flex cursor-pointer list-none items-center gap-3">
                  <span className="w-36 shrink-0 text-xs text-muted-foreground">
                    {formatInstant(l.createdAt)}
                  </span>
                  <span className="flex-1 font-medium">{humanize(l.action)}</span>
                  <span className="text-muted-foreground">{l.actor?.name ?? 'System'}</span>
                </summary>
                {l.metadata && (
                  <pre className="mt-2 overflow-x-auto rounded-lg bg-muted p-3 font-mono text-xs">
                    {JSON.stringify(l.metadata, null, 2)}
                  </pre>
                )}
              </details>
            ))}
          </Card>
          {q.data.meta && (
            <Pagination
              page={page}
              totalPages={(q.data.meta as { totalPages: number }).totalPages}
              total={(q.data.meta as { total: number }).total}
              onPage={setPage}
            />
          )}
        </>
      )}
    </div>
  );
}
