/**
 * Session delivery: billing months in which students get (or got) fewer sessions than they pay
 * for, and students behind course pace. Coaches add extra sessions to make it up; admins can
 * instead give a pro-rata discount or dismiss with a reason. Nothing happens automatically.
 */
import { BadgePercent, CalendarPlus, CheckCircle2, Gauge, TrendingDown, X } from 'lucide-react';
import { useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { toast } from 'sonner';
import { useUser } from '@/app/auth';
import {
  ConfirmDialog,
  EmptyState,
  ErrorState,
  ListSkeleton,
  PageHeader,
} from '@/components/common';
import { SessionChangeDialog } from '@/components/session-change';
import { Button } from '@/components/ui/button';
import { Segmented } from '@/components/ui/controls';
import { Badge, Card } from '@/components/ui/primitives';
import { errorMessage } from '@/lib/api';
import {
  usePace,
  useResolveShortfall,
  useShortfalls,
  type Shortfall,
  type ShortfallStatus,
} from '@/lib/courses';
import { formatDate, formatShortDate, money, plural, today } from '@/lib/format';
import { useBatches } from '@/lib/queries';

const STATUS: Record<
  ShortfallStatus,
  { label: string; badge: 'warning' | 'destructive' | 'success' | 'muted' }
> = {
  at_risk: { label: 'At risk', badge: 'warning' },
  short: { label: 'Ended short', badge: 'destructive' },
  recovered: { label: 'Made up', badge: 'success' },
  discounted: { label: 'Discounted', badge: 'success' },
  extra_added: { label: 'Extra session added', badge: 'success' },
  dismissed: { label: 'Dismissed', badge: 'muted' },
};

type View = 'open' | 'resolved' | 'pace';

export function DeliveryPage() {
  const [params, setParams] = useSearchParams();
  const view: View =
    params.get('tab') === 'pace' ? 'pace' : params.get('tab') === 'resolved' ? 'resolved' : 'open';
  const batchId = params.get('batch') ?? undefined;
  return (
    <div>
      <PageHeader
        title="Session delivery"
        description="Each student is owed their sessions every billing month (days a week × 4). Make up missed sessions, or give a discount."
      />
      <Segmented
        ariaLabel="View"
        value={view}
        onChange={(v) => {
          const p = new URLSearchParams(params);
          if (v === 'open') p.delete('tab');
          else p.set('tab', v);
          setParams(p, { replace: true });
        }}
        className="mb-3 w-full sm:w-auto"
        options={[
          { value: 'open', label: 'Needs action' },
          { value: 'resolved', label: 'Resolved' },
          { value: 'pace', label: 'Behind pace' },
        ]}
      />
      {view === 'pace' ? <Pace batchId={batchId} /> : <Shortfalls view={view} batchId={batchId} />}
    </div>
  );
}

function Shortfalls({ view, batchId }: { view: 'open' | 'resolved'; batchId?: string }) {
  const me = useUser();
  const admin = me.role === 'admin';
  const open = useShortfalls({ status: 'open', batchId });
  const resolvedKinds: ShortfallStatus[] = ['recovered', 'discounted', 'extra_added', 'dismissed'];
  const [resolvedKind, setResolvedKind] = useState<ShortfallStatus>('discounted');
  const resolved = useShortfalls({ status: resolvedKind, batchId });
  const q = view === 'open' ? open : resolved;
  const resolve = useResolveShortfall();
  const batches = useBatches({ active: 'true' });
  const [discounting, setDiscounting] = useState<Shortfall | null>(null);
  const [dismissing, setDismissing] = useState<Shortfall | null>(null);
  const [extraFor, setExtraFor] = useState<Shortfall | null>(null);
  const extraBatch = extraFor && batches.data?.find((b) => b.id === extraFor.batch.id);

  const done = (msg: string) => ({
    onSuccess: () => {
      toast.success(msg);
      setDiscounting(null);
      setDismissing(null);
    },
    onError: (e: unknown) => toast.error(errorMessage(e)),
  });

  return (
    <>
      {view === 'resolved' && (
        <Segmented
          ariaLabel="How it was resolved"
          value={resolvedKind}
          onChange={(v) => setResolvedKind(v as ShortfallStatus)}
          className="mb-2 w-full sm:w-auto"
          options={resolvedKinds.map((k) => ({ value: k, label: STATUS[k].label }))}
        />
      )}
      {q.isPending ? (
        <ListSkeleton rows={3} />
      ) : q.isError ? (
        <ErrorState error={q.error} onRetry={() => void q.refetch()} />
      ) : !q.data.length ? (
        <EmptyState
          icon={<CheckCircle2 />}
          title={view === 'open' ? 'Every student is getting their sessions' : 'Nothing here'}
          description={
            view === 'open'
              ? 'Months at risk (too many cancellations) show here as soon as they can’t reach the full count.'
              : undefined
          }
        />
      ) : (
        <div className="grid gap-2.5 lg:grid-cols-2">
          {q.data.map((sf) => (
            <Card key={sf.id} className="p-3">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <Link
                    to={`/students/${sf.student.id}`}
                    className="block truncate text-[15px] font-semibold hover:underline"
                  >
                    {sf.student.fullName}
                  </Link>
                  <p className="text-[13px] text-muted-foreground">
                    {sf.batch.name} · {formatShortDate(sf.periodStart)} –{' '}
                    {formatShortDate(sf.periodEnd)}
                  </p>
                </div>
                <Badge variant={STATUS[sf.status].badge}>{STATUS[sf.status].label}</Badge>
              </div>
              <p className="mt-2 flex items-center gap-1.5 text-[13px]">
                <TrendingDown className="size-4 text-destructive" />
                <b className="font-semibold">
                  {sf.held + sf.remaining} of {sf.target}
                </b>{' '}
                sessions{sf.status === 'at_risk' ? ' possible' : ' held'} ·{' '}
                {plural(sf.missing, 'session')} short
              </p>
              {sf.note && <p className="mt-1 text-[12px] text-muted-foreground">{sf.note}</p>}
              {sf.amount !== null && sf.status === 'discounted' && (
                <p className="mt-1 text-[12px] text-muted-foreground">
                  {money(sf.amount)} credited{' '}
                  {sf.resolvedAt ? formatDate(sf.resolvedAt.slice(0, 10)) : ''}
                </p>
              )}
              {['at_risk', 'short'].includes(sf.status) && (
                <div className="mt-2.5 flex flex-wrap gap-2">
                  <Button size="sm" variant="tonal" onClick={() => setExtraFor(sf)}>
                    <CalendarPlus /> Extra session
                  </Button>
                  {admin && sf.status === 'short' && (sf.discountValue ?? 0) > 0 && (
                    <Button size="sm" variant="outline" onClick={() => setDiscounting(sf)}>
                      <BadgePercent /> Discount {money(sf.discountValue!)}
                    </Button>
                  )}
                  {admin && (
                    <Button
                      size="sm"
                      variant="ghost"
                      className="text-muted-foreground"
                      onClick={() => setDismissing(sf)}
                    >
                      <X /> Dismiss
                    </Button>
                  )}
                </div>
              )}
            </Card>
          ))}
        </div>
      )}
      {extraFor && extraBatch && (
        <SessionChangeDialog
          batch={extraBatch}
          defaultDate={extraFor.periodEnd >= today() ? today() : undefined}
          onClose={() => setExtraFor(null)}
          onSaved={(change) =>
            resolve.mutate(
              { id: extraFor.id, action: 'extra', sessionChangeId: change.id },
              { onError: (e) => toast.error(errorMessage(e)) },
            )
          }
        />
      )}
      <ConfirmDialog
        open={!!discounting}
        onOpenChange={(o) => !o && setDiscounting(null)}
        title={discounting ? `Give ${money(discounting.discountValue ?? 0)} off?` : ''}
        description={
          discounting
            ? `${discounting.student.fullName} got ${plural(discounting.missing, 'session')} fewer than paid for. It comes off their oldest unpaid invoice now, or the next one.`
            : ''
        }
        confirmLabel="Give discount"
        loading={resolve.isPending}
        onConfirm={() =>
          discounting &&
          resolve.mutate({ id: discounting.id, action: 'discount' }, done('Discount credited'))
        }
      />
      <ConfirmDialog
        open={!!dismissing}
        onOpenChange={(o) => !o && setDismissing(null)}
        title="Dismiss this shortfall?"
        description="No discount or extra session. Say why (e.g. agreed with the parent)."
        confirmLabel="Dismiss"
        requireReason
        loading={resolve.isPending}
        onConfirm={(reason) =>
          dismissing &&
          resolve.mutate({ id: dismissing.id, action: 'dismiss', reason }, done('Dismissed'))
        }
      />
    </>
  );
}

function Pace({ batchId }: { batchId?: string }) {
  const q = usePace(batchId);
  if (q.isPending) return <ListSkeleton rows={3} />;
  if (q.isError) return <ErrorState error={q.error} onRetry={() => void q.refetch()} />;
  if (!q.data.length)
    return (
      <EmptyState
        icon={<Gauge />}
        title="Everyone is on pace"
        description="Students who can’t finish their course on time (without makeups) show here."
      />
    );
  return (
    <Card className="divide-y overflow-hidden">
      {q.data.map((r) => (
        <div
          key={r.roundId}
          className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2.5 text-[13px]"
        >
          <Link
            to={`/students/${r.student.id}`}
            className="min-w-0 flex-1 truncate font-medium hover:underline"
          >
            {r.student.fullName}
            <span className="block text-[12px] font-normal text-muted-foreground">
              {r.batch.name}
            </span>
          </Link>
          <span className="tabular">
            {r.attended}/{r.target}
          </span>
          {r.inExtension ? (
            <Badge variant="warning">Extension month</Badge>
          ) : (
            <Badge variant="destructive">
              {r.short} short by {formatShortDate(r.courseEndsOn)}
            </Badge>
          )}
        </div>
      ))}
    </Card>
  );
}
