/**
 * Admin: makeup sessions requested by coaches — approve or reject (with a reason).
 */
import { AlertTriangle, CalendarPlus, Check, X } from 'lucide-react';
import { useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { toast } from 'sonner';
import { relativeTime } from '@/app/deployments';
import {
  ConfirmDialog,
  EmptyState,
  ErrorState,
  ListSkeleton,
  PageHeader,
} from '@/components/common';
import { Button } from '@/components/ui/button';
import { Segmented } from '@/components/ui/controls';
import { Badge, Card } from '@/components/ui/primitives';
import { errorMessage } from '@/lib/api';
import { formatLongDate, formatTimeRange } from '@/lib/format';
import { useMakeupRequests, useReviewMakeup, type MakeupRequest } from '@/lib/queries';

type Status = 'pending' | 'approved' | 'rejected';

export function MakeupsPage() {
  const [params, setParams] = useSearchParams();
  const status = (params.get('status') as Status | null) ?? 'pending';
  const q = useMakeupRequests(status);
  const review = useReviewMakeup();
  const [rejecting, setRejecting] = useState<MakeupRequest | null>(null);

  const approve = (m: MakeupRequest) =>
    review.mutate(
      { id: m.id, action: 'approve' },
      {
        onSuccess: () =>
          toast.success(`Approved · ${m.student.fullName} on ${formatLongDate(m.date)}`),
        onError: (e) => toast.error(errorMessage(e)),
      },
    );

  return (
    <div>
      <PageHeader
        title="Makeup requests"
        description="Coaches ask to add a student to one of their sessions. Approved makeups show on that day's attendance."
      />
      <Segmented
        ariaLabel="Request status"
        value={status}
        onChange={(v) => setParams(v === 'pending' ? {} : { status: v }, { replace: true })}
        className="mb-2 w-full sm:w-auto"
        options={[
          { value: 'pending', label: 'Pending' },
          { value: 'approved', label: 'Approved' },
          { value: 'rejected', label: 'Rejected' },
        ]}
      />
      {q.isPending ? (
        <ListSkeleton rows={4} />
      ) : q.isError ? (
        <ErrorState error={q.error} onRetry={() => void q.refetch()} />
      ) : q.data.length === 0 ? (
        <EmptyState
          icon={<CalendarPlus />}
          title={status === 'pending' ? 'No requests waiting' : `No ${status} requests`}
          description={
            status === 'pending' ? 'New makeup requests from coaches appear here.' : undefined
          }
        />
      ) : (
        <div className="grid gap-2.5 lg:grid-cols-2">
          {q.data.map((m) => (
            <Card key={m.id} className="p-3">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <Link
                    to={`/students/${m.student.id}`}
                    className="block truncate text-[15px] font-semibold hover:underline"
                  >
                    {m.student.fullName}
                  </Link>
                  <p className="text-[13px] text-muted-foreground">
                    {formatLongDate(m.date)} · {m.batch.name} ·{' '}
                    {formatTimeRange(m.batch.startTime, m.batch.endTime)}
                  </p>
                </div>
                {m.status !== 'pending' && (
                  <Badge
                    variant={m.status === 'approved' ? 'success' : 'muted'}
                    className="capitalize"
                  >
                    {m.status}
                  </Badge>
                )}
              </div>
              <dl className="mt-2 grid grid-cols-[6.5rem_1fr] gap-x-2 gap-y-1 text-[12px]">
                <dt className="text-muted-foreground">Requested by</dt>
                <dd className="min-w-0 truncate">
                  {m.requestedBy?.name ?? '—'} · {relativeTime(m.createdAt)}
                </dd>
                <dt className="text-muted-foreground">Session coach</dt>
                <dd className="min-w-0 truncate">{m.batchCoach.name}</dd>
                {m.homeBatch?.name && (
                  <>
                    <dt className="text-muted-foreground">Usual batch</dt>
                    <dd className="min-w-0 truncate">
                      {m.homeBatch.name}
                      {m.homeCoach?.name ? ` · ${m.homeCoach.name}` : ''}
                    </dd>
                  </>
                )}
                {m.missedDate && (
                  <>
                    <dt className="text-muted-foreground">Makes up for</dt>
                    <dd>{formatLongDate(m.missedDate)}</dd>
                  </>
                )}
                {m.reason && (
                  <>
                    <dt className="text-muted-foreground">Reason</dt>
                    <dd className="min-w-0 break-words">{m.reason}</dd>
                  </>
                )}
                {m.reviewNote && (
                  <>
                    <dt className="text-muted-foreground">Admin note</dt>
                    <dd className="min-w-0 break-words">{m.reviewNote}</dd>
                  </>
                )}
              </dl>
              {m.otherCoach && (
                <p className="mt-2 flex items-start gap-1.5 rounded-lg bg-warning/12 px-2 py-1.5 text-[12px] leading-snug">
                  <AlertTriangle className="mt-px size-3.5 shrink-0 text-warning-foreground dark:text-warning" />
                  Different coach from the student’s usual batch.
                </p>
              )}
              {m.status === 'pending' && (
                <div className="mt-2.5 grid grid-cols-2 gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                    onClick={() => setRejecting(m)}
                  >
                    <X /> Reject
                  </Button>
                  <Button
                    size="sm"
                    variant="success"
                    loading={review.isPending && review.variables?.id === m.id}
                    onClick={() => approve(m)}
                  >
                    <Check /> Approve
                  </Button>
                </div>
              )}
            </Card>
          ))}
        </div>
      )}
      <ConfirmDialog
        open={!!rejecting}
        onOpenChange={(o) => !o && setRejecting(null)}
        title="Reject this makeup?"
        description={
          rejecting
            ? `${rejecting.student.fullName} won’t be added to ${rejecting.batch.name} on ${formatLongDate(rejecting.date)}. The coach is told why.`
            : ''
        }
        confirmLabel="Reject request"
        destructive
        requireReason
        loading={review.isPending}
        onConfirm={(reason) =>
          rejecting &&
          review.mutate(
            { id: rejecting.id, action: 'reject', reason },
            {
              onSuccess: () => {
                toast.success('Request rejected');
                setRejecting(null);
              },
              onError: (e) => toast.error(errorMessage(e)),
            },
          )
        }
      />
    </div>
  );
}
