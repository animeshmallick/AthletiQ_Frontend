/**
 * Moved and extra sessions. Admins approve or decline requests made at short notice (under 24
 * hours); coaches see their batches' changes and can withdraw a request or undo a change before
 * the session starts.
 */
import { ArrowRight, CalendarClock, CalendarPlus, Check, Undo2, X } from 'lucide-react';
import { useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { toast } from 'sonner';
import { useUser } from '@/app/auth';
import { relativeTime } from '@/app/deployments';
import {
  ConfirmDialog,
  EmptyState,
  ErrorState,
  ListSkeleton,
  PageHeader,
} from '@/components/common';
import { notStarted } from '@/components/session-change';
import { Button } from '@/components/ui/button';
import { Segmented } from '@/components/ui/controls';
import { Badge, Card } from '@/components/ui/primitives';
import { ApiError, errorMessage } from '@/lib/api';
import {
  useReviewChange,
  useSessionChanges,
  type ChangeWarning,
  type SessionChange,
  type SessionChangeStatus,
} from '@/lib/courses';
import { formatLongDate, formatShortDate, formatTimeRange } from '@/lib/format';

const STATUS: Record<
  SessionChangeStatus,
  { label: string; badge: 'success' | 'warning' | 'muted' | 'destructive' }
> = {
  pending: { label: 'Awaiting approval', badge: 'warning' },
  approved: { label: 'In effect', badge: 'success' },
  rejected: { label: 'Declined', badge: 'destructive' },
  cancelled: { label: 'Withdrawn / undone', badge: 'muted' },
  expired: { label: 'Expired', badge: 'muted' },
};

type Tab = 'pending' | 'approved' | 'all';

export function SessionChangesPage() {
  const me = useUser();
  const admin = me.role === 'admin';
  const [params, setParams] = useSearchParams();
  const tab = (params.get('status') as Tab | null) ?? 'pending';
  const q = useSessionChanges(tab === 'all' ? {} : { status: tab });
  const review = useReviewChange();
  const [declining, setDeclining] = useState<SessionChange | null>(null);
  const [confirming, setConfirming] = useState<{
    c: SessionChange;
    warnings: ChangeWarning[];
  } | null>(null);

  const approve = (c: SessionChange, confirm = false) =>
    review.mutate(
      { id: c.id, action: 'approve', confirm },
      {
        onSuccess: () => {
          setConfirming(null);
          toast.success('Approved', { description: `${c.batch.name} · ${formatLongDate(c.date)}` });
        },
        onError: (e) => {
          const warnings =
            e instanceof ApiError && e.status === 409
              ? (e.details as { warnings?: ChangeWarning[] } | undefined)?.warnings
              : undefined;
          if (warnings?.length) setConfirming({ c, warnings });
          else toast.error('Could not approve', { description: errorMessage(e) });
        },
      },
    );
  const undo = (c: SessionChange) =>
    review.mutate(
      { id: c.id, action: 'cancel' },
      {
        onSuccess: () =>
          toast.success(c.status === 'pending' ? 'Request withdrawn' : 'Change undone'),
        onError: (e) => toast.error('Could not undo', { description: errorMessage(e) }),
      },
    );

  return (
    <div>
      <PageHeader
        title="Session changes"
        description={
          admin
            ? 'Moved and extra sessions. Coaches with 24 hours’ notice change sessions straight away; shorter notice waits for you.'
            : 'Moved and extra sessions of your batches. With less than 24 hours’ notice an admin approves them.'
        }
      />
      <Segmented
        ariaLabel="Status"
        value={tab}
        onChange={(v) => setParams(v === 'pending' ? {} : { status: v }, { replace: true })}
        className="mb-2 w-full sm:w-auto"
        options={[
          { value: 'pending', label: 'Awaiting approval' },
          { value: 'approved', label: 'In effect' },
          { value: 'all', label: 'All' },
        ]}
      />
      {q.isPending ? (
        <ListSkeleton rows={4} />
      ) : q.isError ? (
        <ErrorState error={q.error} onRetry={() => void q.refetch()} />
      ) : q.data.length === 0 ? (
        <EmptyState
          icon={<CalendarClock />}
          title={tab === 'pending' ? 'Nothing waiting' : 'No session changes'}
          description="Move a session or add an extra one from the calendar or the batch page."
        />
      ) : (
        <div className="grid gap-2.5 lg:grid-cols-2">
          {q.data.map((c) => {
            const st = STATUS[c.status];
            const open =
              ['pending', 'approved'].includes(c.status) && notStarted(c.date, c.startTime);
            const mine = admin || c.requestedBy.id === me.id || c.coach.id === me.id;
            return (
              <Card key={c.id} className="p-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <Link
                      to={`/batches/${c.batch.id}`}
                      className="block truncate text-[15px] font-semibold hover:underline"
                    >
                      {c.batch.name}
                    </Link>
                    <p className="flex flex-wrap items-center gap-1 text-[13px] text-muted-foreground">
                      {c.kind === 'extra' ? (
                        <>
                          <CalendarPlus className="size-3.5" /> Extra · {formatLongDate(c.date)} ·{' '}
                          {formatTimeRange(c.startTime, c.endTime)}
                        </>
                      ) : (
                        <>
                          {c.from
                            ? `${formatShortDate(c.from.date)} ${formatTimeRange(c.from.startTime, c.from.endTime)}`
                            : ''}
                          <ArrowRight className="size-3.5" />
                          <b className="font-medium text-foreground">
                            {formatShortDate(c.date)} {formatTimeRange(c.startTime, c.endTime)}
                          </b>
                        </>
                      )}
                    </p>
                  </div>
                  <Badge variant={st.badge}>{st.label}</Badge>
                </div>
                <dl className="mt-2 grid grid-cols-[6.5rem_1fr] gap-x-2 gap-y-1 text-[12px]">
                  <dt className="text-muted-foreground">Asked by</dt>
                  <dd className="min-w-0 truncate">
                    {c.requestedBy.name} · {relativeTime(c.createdAt)}
                  </dd>
                  <dt className="text-muted-foreground">Coach · place</dt>
                  <dd className="min-w-0 truncate">
                    {c.coach.name} · {c.location.name}
                  </dd>
                  {c.reason && (
                    <>
                      <dt className="text-muted-foreground">Reason</dt>
                      <dd className="min-w-0 break-words">{c.reason}</dd>
                    </>
                  )}
                  {c.reviewNote && (
                    <>
                      <dt className="text-muted-foreground">Note</dt>
                      <dd className="min-w-0 break-words">{c.reviewNote}</dd>
                    </>
                  )}
                </dl>
                {c.status === 'pending' && admin && (
                  <div className="mt-2.5 grid grid-cols-2 gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                      onClick={() => setDeclining(c)}
                    >
                      <X /> Decline
                    </Button>
                    <Button
                      size="sm"
                      variant="success"
                      loading={review.isPending && review.variables?.id === c.id}
                      onClick={() => approve(c)}
                    >
                      <Check /> Approve
                    </Button>
                  </div>
                )}
                {open && mine && !(c.status === 'pending' && admin) && (
                  <div className="mt-2 flex justify-end">
                    <Button
                      size="sm"
                      variant="ghost"
                      className="text-muted-foreground"
                      loading={review.isPending && review.variables?.id === c.id}
                      onClick={() => undo(c)}
                    >
                      <Undo2 />
                      {c.status === 'pending'
                        ? 'Withdraw'
                        : c.kind === 'extra'
                          ? 'Remove extra session'
                          : 'Undo move'}
                    </Button>
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      )}
      <ConfirmDialog
        open={!!declining}
        onOpenChange={(o) => !o && setDeclining(null)}
        title="Decline this request?"
        description={
          declining ? `${declining.batch.name} stays as it is. The coach is told why.` : ''
        }
        confirmLabel="Decline"
        destructive
        requireReason
        loading={review.isPending}
        onConfirm={(note) =>
          declining &&
          review.mutate(
            { id: declining.id, action: 'reject', note },
            {
              onSuccess: () => {
                toast.success('Request declined');
                setDeclining(null);
              },
              onError: (e) => toast.error(errorMessage(e)),
            },
          )
        }
      />
      <ConfirmDialog
        open={!!confirming}
        onOpenChange={(o) => !o && setConfirming(null)}
        title="Approve anyway?"
        description={confirming?.warnings.map((w) => w.message).join(' ')}
        confirmLabel="Approve anyway"
        loading={review.isPending}
        onConfirm={() => confirming && approve(confirming.c, true)}
      />
    </div>
  );
}
