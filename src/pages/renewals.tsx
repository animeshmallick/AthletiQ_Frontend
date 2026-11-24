/**
 * Renewals: every running cycle renews on its own when it ends. Coaches (their batches) and admins
 * can stop or restore a renewal; admins can also choose the next batch, exit a student today and
 * decide which unpaid invoices are lost.
 */
import { LogOut, RefreshCw, RotateCcw, Square } from 'lucide-react';
import { useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { toast } from 'sonner';
import { useUser } from '@/app/auth';
import {
  EmptyState,
  ErrorState,
  Field,
  ListSkeleton,
  PageHeader,
  Progress,
  SearchInput,
} from '@/components/common';
import { Button } from '@/components/ui/button';
import { Checkbox, Segmented } from '@/components/ui/controls';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/overlays';
import { Badge, Card, Select, Textarea } from '@/components/ui/primitives';
import { errorMessage } from '@/lib/api';
import { useExitPreview, useRenewalAction, useRenewals, type Renewal } from '@/lib/cycles';
import {
  addDays,
  formatDate,
  formatLongDate,
  formatShortDate,
  money,
  plural,
  today,
} from '@/lib/format';
import { useBatches } from '@/lib/queries';

type State = 'all' | 'soon' | 'stopped' | 'dues';
const SOON_DAYS = 7;

export function RenewalsPage() {
  const isAdmin = useUser().role === 'admin';
  const [params, setParams] = useSearchParams();
  const state: State =
    isAdmin && params.get('dues') === '1' ? 'dues' : ((params.get('state') as State) ?? 'all');
  const [search, setSearch] = useState('');
  const [stopping, setStopping] = useState<Renewal | null>(null);
  const [exiting, setExiting] = useState<Renewal | null>(null);
  const q = useRenewals();
  const act = useRenewalAction();
  const soon = addDays(today(), SOON_DAYS);
  const term = search.trim().toLowerCase();
  const list = (q.data ?? []).filter(
    (r) =>
      (state !== 'soon' || r.endsOn <= soon) &&
      (state !== 'stopped' || r.stopped) &&
      (state !== 'dues' || (r.dues?.amount ?? 0) > 0) &&
      (!term || `${r.student.fullName} ${r.batch.name}`.toLowerCase().includes(term)),
  );
  const restore = (r: Renewal) =>
    act.mutate(
      { id: r.enrollmentId, action: 'restore' },
      {
        onSuccess: () => toast.success(`${r.student.fullName} will renew`),
        onError: (e) => toast.error(errorMessage(e)),
      },
    );

  return (
    <div>
      <PageHeader
        title="Renewals"
        description="Cycles renew on their own when they end. Stop a renewal when a student won’t continue."
      />
      <div className="mb-3 flex flex-col gap-2 sm:flex-row">
        <Segmented
          ariaLabel="Show"
          value={state}
          onChange={(v) =>
            setParams(v === 'all' ? {} : v === 'dues' ? { dues: '1' } : { state: v }, {
              replace: true,
            })
          }
          className="w-full sm:w-auto"
          options={[
            { value: 'all', label: 'All' },
            { value: 'soon', label: 'Ending soon' },
            { value: 'stopped', label: 'Stopped' },
            ...(isAdmin ? [{ value: 'dues' as const, label: 'Unpaid' }] : []),
          ]}
        />
        <SearchInput value={search} onChange={setSearch} placeholder="Student or batch" />
      </div>
      {q.isPending ? (
        <ListSkeleton rows={5} />
      ) : q.isError ? (
        <ErrorState error={q.error} onRetry={() => void q.refetch()} />
      ) : !list.length ? (
        <EmptyState icon={<RefreshCw />} title="No renewals here" />
      ) : (
        <div className="grid gap-2.5 lg:grid-cols-2">
          {list.map((r) => {
            const p = r.progress;
            return (
              <Card key={r.cycleId} className="space-y-2 p-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <Link
                      to={`/students/${r.student.id}?tab=batches`}
                      className="block truncate text-[15px] font-semibold hover:underline"
                    >
                      {r.student.fullName}
                    </Link>
                    <p className="truncate text-[13px] text-muted-foreground">
                      {r.batch.name} · round {r.roundNo}
                      {isAdmin ? ` · ${r.coach.name}` : ''}
                    </p>
                  </div>
                  <Badge variant={r.stopped ? 'destructive' : 'success'}>
                    {r.stopped
                      ? `${r.stopped.moveTo ? 'Moves' : 'Ends'} ${formatShortDate(r.stopped.on)}`
                      : `Renews ${formatShortDate(r.renewsOn)}`}
                  </Badge>
                </div>
                <div className="space-y-1">
                  <Progress
                    value={p.target ? (p.conducted / p.target) * 100 : 0}
                    label={`${p.conducted} of ${p.target} sessions conducted`}
                  />
                  <p className="text-[12px] text-muted-foreground">
                    {p.conducted} of {p.target} conducted · attended {p.attended}
                    {p.missed ? ` · ${plural(p.missed, 'missed session')}` : ''} ·{' '}
                    {formatShortDate(r.startsOn)} – {formatDate(r.endsOn)}
                  </p>
                </div>
                {r.stopped && (
                  <p className="text-[12.5px]">
                    {r.stopped.moveTo ? `To ${r.stopped.moveTo.name}. ` : ''}
                    <span className="text-muted-foreground">
                      {r.stopped.reason}
                      {r.stopped.by ? ` · ${r.stopped.by}` : ''}
                    </span>
                  </p>
                )}
                {!!r.dues?.amount && (
                  <p className="text-[12.5px] font-medium text-destructive">
                    {money(r.dues.amount)} unpaid ({plural(r.dues.count, 'invoice')})
                  </p>
                )}
                <div className="flex flex-wrap gap-2">
                  {r.stopped ? (
                    <Button
                      size="sm"
                      variant="outline"
                      loading={act.isPending && act.variables?.id === r.enrollmentId}
                      onClick={() => restore(r)}
                    >
                      <RotateCcw /> Restore renewal
                    </Button>
                  ) : (
                    <Button size="sm" variant="outline" onClick={() => setStopping(r)}>
                      <Square /> Stop renewal
                    </Button>
                  )}
                  {isAdmin && (
                    <Button
                      size="sm"
                      variant="ghost"
                      className="text-destructive"
                      onClick={() => setExiting(r)}
                    >
                      <LogOut /> Exit now
                    </Button>
                  )}
                </div>
              </Card>
            );
          })}
        </div>
      )}
      {stopping && <StopDialog r={stopping} onClose={() => setStopping(null)} />}
      {exiting && <ExitDialog r={exiting} onClose={() => setExiting(null)} />}
    </div>
  );
}

/** Reason, and (admins) which batch they continue in. */
function NextFields({
  r,
  reason,
  setReason,
  moveTo,
  setMoveTo,
}: {
  r: Renewal;
  reason: string;
  setReason: (v: string) => void;
  moveTo: string;
  setMoveTo: (v: string) => void;
}) {
  const isAdmin = useUser().role === 'admin';
  const batches = useBatches({ active: 'true' });
  return (
    <>
      {isAdmin && (
        <Field label="Then" hint="A batch is billed from its next billing date.">
          <Select aria-label="Then" value={moveTo} onChange={(e) => setMoveTo(e.target.value)}>
            <option value="">Leaves this batch</option>
            {(batches.data ?? [])
              .filter((b) => b.id !== r.batch.id)
              .map((b) => (
                <option key={b.id} value={b.id}>
                  Moves to {b.name}
                  {b.memberCount >= b.capacity ? ' (full)' : ''}
                </option>
              ))}
          </Select>
        </Field>
      )}
      <Field label="Reason" required hint="Recorded in the audit log.">
        <Textarea
          aria-label="Reason"
          rows={2}
          maxLength={300}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
        />
      </Field>
    </>
  );
}

function StopDialog({ r, onClose }: { r: Renewal; onClose: () => void }) {
  const act = useRenewalAction();
  const [reason, setReason] = useState('');
  const [moveTo, setMoveTo] = useState('');
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Stop {r.student.fullName}’s renewal?</DialogTitle>
          <DialogDescription>
            They finish this cycle (billed as usual) on {formatLongDate(r.endsOn)} and get their
            certificate. You can restore it until then.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <NextFields {...{ r, reason, setReason, moveTo, setMoveTo }} />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            loading={act.isPending}
            disabled={reason.trim().length < 3}
            onClick={() =>
              act.mutate(
                {
                  id: r.enrollmentId,
                  action: 'stop',
                  reason: reason.trim(),
                  moveToBatchId: moveTo || null,
                },
                {
                  onSuccess: () => {
                    toast.success('Renewal stopped');
                    onClose();
                  },
                  onError: (e) => toast.error('Could not stop', { description: errorMessage(e) }),
                },
              )
            }
          >
            Stop renewal
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ExitDialog({ r, onClose }: { r: Renewal; onClose: () => void }) {
  const act = useRenewalAction();
  const q = useExitPreview(r.enrollmentId);
  const [reason, setReason] = useState('');
  const [moveTo, setMoveTo] = useState('');
  /** Null until the admin changes something: the suggestions apply. */
  const [picked, setPicked] = useState<string[] | null>(null);
  const invoices = q.data?.invoices ?? [];
  const lost = picked ?? invoices.filter((i) => i.suggestion === 'lost').map((i) => i.id);
  const total = invoices.filter((i) => lost.includes(i.id)).reduce((n, i) => n + i.amount, 0);
  const toggle = (id: string, on: boolean) =>
    setPicked(on ? [...lost, id] : lost.filter((x) => x !== id));

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Exit {r.student.fullName} today?</DialogTitle>
          <DialogDescription>
            Their last day is today. Nothing is refunded or credited, later months aren’t billed,
            and there is no certificate for this round.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <NextFields {...{ r, reason, setReason, moveTo, setMoveTo }} />
          {q.isPending ? (
            <ListSkeleton rows={2} />
          ) : q.isError ? (
            <ErrorState error={q.error} onRetry={() => void q.refetch()} />
          ) : (
            <section aria-label="Unpaid invoices" className="space-y-1.5">
              <p className="text-[13px] font-semibold">
                {invoices.length
                  ? 'Unpaid invoices: tick the ones that are lost'
                  : 'Nothing unpaid'}
              </p>
              {invoices.map((i) => (
                <label
                  key={i.id}
                  className="flex items-center gap-2.5 rounded-xl border px-3 py-2 text-[13px]"
                >
                  <Checkbox
                    aria-label={`${i.number} is lost`}
                    disabled={i.suggestion === 'cancel'}
                    checked={lost.includes(i.id)}
                    onCheckedChange={(v) => toggle(i.id, v === true)}
                  />
                  <span className="min-w-0 flex-1">
                    {i.number}
                    <span className="block text-[12px] text-muted-foreground">
                      {formatShortDate(i.periodStart)} – {formatShortDate(i.periodEnd)} ·{' '}
                      {i.suggestion === 'cancel'
                        ? 'nothing attended, cancelled'
                        : `attended ${i.attended}${lost.includes(i.id) ? '' : ' · stays due'}`}
                    </span>
                  </span>
                  <span className="tabular font-medium">{money(i.amount)}</span>
                </label>
              ))}
              {total > 0 && (
                <p className="text-[12.5px] text-destructive">
                  {money(total)} will be written off as lost and noted on the student.
                </p>
              )}
            </section>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="destructive"
            loading={act.isPending}
            disabled={!q.isSuccess || q.isFetching || reason.trim().length < 3}
            onClick={() =>
              act.mutate(
                {
                  id: r.enrollmentId,
                  action: 'exit',
                  reason: reason.trim(),
                  moveToBatchId: moveTo || null,
                  lostInvoiceIds: lost,
                },
                {
                  onSuccess: () => {
                    toast.success(moveTo ? 'Student moved' : 'Student exited');
                    onClose();
                  },
                  onError: (e) => {
                    toast.error('Could not exit', { description: errorMessage(e) });
                    setPicked(null);
                    void q.refetch();
                  },
                },
              )
            }
          >
            {moveTo ? 'Exit and move' : 'Exit now'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
