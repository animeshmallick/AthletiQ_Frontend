/**
 * Admin: students who completed their course (paused, seat held) waiting for a decision —
 * re-admit, move to another batch, or leave — and the credit ledger (unused course months,
 * shortfall discounts): what is owed back, and settling it.
 */
import { GraduationCap, HandCoins, Wallet } from 'lucide-react';
import { useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { toast } from 'sonner';
import {
  ConfirmDialog,
  EmptyState,
  ErrorState,
  Field,
  ListSkeleton,
  MoneyInput,
  PageHeader,
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
import { Badge, Card, Input, Select, Textarea } from '@/components/ui/primitives';
import { errorMessage } from '@/lib/api';
import {
  CREDIT_STATUS,
  useCourseDecisions,
  useCredits,
  useDecide,
  useSettleCredit,
  type CourseDecision,
  type Credit,
  type CreditStatus,
  type DecisionInput,
} from '@/lib/courses';
import { addDays, formatDate, formatLongDate, money, plural, today } from '@/lib/format';
import { useBatches } from '@/lib/queries';

export function CoursesPage() {
  const [params, setParams] = useSearchParams();
  const tab = params.get('tab') === 'credits' ? 'credits' : 'decisions';
  return (
    <div>
      <PageHeader
        title="Courses"
        description="Completed courses waiting for your decision, and credit owed to students."
      />
      <Segmented
        ariaLabel="Section"
        value={tab}
        onChange={(v) => setParams(v === 'decisions' ? {} : { tab: v }, { replace: true })}
        className="mb-3 w-full sm:w-auto"
        options={[
          { value: 'decisions', label: 'Decisions' },
          { value: 'credits', label: 'Credit & refunds' },
        ]}
      />
      {tab === 'decisions' ? <Decisions /> : <Credits />}
    </div>
  );
}

// ─── Decisions ───────────────────────────────────────────────────────────────

function Decisions() {
  const q = useCourseDecisions();
  const [deciding, setDeciding] = useState<CourseDecision | null>(null);
  if (q.isPending) return <ListSkeleton rows={3} />;
  if (q.isError) return <ErrorState error={q.error} onRetry={() => void q.refetch()} />;
  if (!q.data.length)
    return (
      <EmptyState
        icon={<GraduationCap />}
        title="No decisions waiting"
        description="When a student completes their course they appear here, paused from the roster with their seat held."
      />
    );
  return (
    <>
      <div className="grid gap-2.5 lg:grid-cols-2">
        {q.data.map((d) => (
          <Card key={d.id} className="p-3">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <Link
                  to={`/students/${d.student.id}`}
                  className="block truncate text-[15px] font-semibold hover:underline"
                >
                  {d.student.fullName}
                </Link>
                <p className="text-[13px] text-muted-foreground">
                  {d.batch.name} · round {d.roundNo} · {d.attended}/{d.target} sessions
                </p>
              </div>
              <Badge variant="success">Completed {formatDate(d.completedOn)}</Badge>
            </div>
            <dl className="mt-2 grid grid-cols-[7.5rem_1fr] gap-x-2 gap-y-1 text-[12px]">
              <dt className="text-muted-foreground">Unpaid</dt>
              <dd className={d.dues.amount ? 'font-medium text-destructive' : ''}>
                {d.dues.amount
                  ? `${money(d.dues.amount)} (${plural(d.dues.count, 'invoice')})`
                  : 'Nothing'}
              </dd>
              <dt className="text-muted-foreground">Credit waiting</dt>
              <dd>{d.credit ? money(d.credit) : 'None'}</dd>
              <dt className="text-muted-foreground">Leaves on its own</dt>
              <dd>{formatDate(d.autoLeaveOn)} if undecided</dd>
            </dl>
            <Button size="sm" className="mt-2.5 w-full" onClick={() => setDeciding(d)}>
              Decide
            </Button>
          </Card>
        ))}
      </div>
      {deciding && <DecisionDialog d={deciding} onClose={() => setDeciding(null)} />}
    </>
  );
}

export function DecisionDialog({ d, onClose }: { d: CourseDecision; onClose: () => void }) {
  const decide = useDecide();
  const batches = useBatches({ active: 'true' });
  const firstDay = addDays(d.completedOn!, 1);
  const earliest = firstDay > today() ? firstDay : today();
  const [action, setAction] = useState<DecisionInput['action']>('readmit');
  const [startsOn, setStartsOn] = useState(earliest);
  const [batchId, setBatchId] = useState('');
  const [customFee, setCustomFee] = useState<number | null>(d.fee.customMonthlyFee);
  const [discount, setDiscount] = useState<number | null>(d.fee.monthlyDiscount);
  const [credit, setCredit] = useState<'refund' | 'forfeit' | ''>('');
  const [confirmDues, setConfirmDues] = useState(false);
  const [note, setNote] = useState('');
  const continuing = action !== 'leave';
  const others = (batches.data ?? []).filter((b) => b.id !== d.batch.id);
  const ready =
    (!d.dues.amount || confirmDues) &&
    (action !== 'move' || !!batchId) &&
    (action !== 'leave' || !d.credit || !!credit);

  async function save() {
    try {
      const out = await decide.mutateAsync({
        roundId: d.id,
        action,
        ...(continuing
          ? {
              startsOn,
              batchId: action === 'move' ? batchId : undefined,
              customMonthlyFee: customFee,
              monthlyDiscount: discount ?? 0,
            }
          : { credit: credit || undefined }),
        confirmDues: d.dues.amount ? confirmDues : undefined,
        note: note.trim() || null,
      });
      toast.success(
        action === 'leave'
          ? out.leftAcademy
            ? `${d.student.fullName} has left the academy`
            : `${d.student.fullName} left ${d.batch.name}`
          : action === 'readmit'
            ? `Re-admitted from ${formatLongDate(startsOn)}`
            : `Moved from ${formatLongDate(startsOn)}`,
        {
          description: continuing
            ? `Billing restarts that day${d.credit ? `; ${money(d.credit)} credit comes off the first invoice` : ''}.`
            : undefined,
        },
      );
      onClose();
    } catch (err) {
      toast.error('Could not save the decision', { description: errorMessage(err) });
    }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{d.student.fullName}: what next?</DialogTitle>
          <DialogDescription>
            Completed round {d.roundNo} of {d.batch.name} on {formatLongDate(d.completedOn!)}.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <Segmented
            ariaLabel="Decision"
            className="w-full"
            value={action}
            onChange={(v) => setAction(v as DecisionInput['action'])}
            options={[
              { value: 'readmit', label: 'Re-admit' },
              { value: 'move', label: 'Move batch' },
              { value: 'leave', label: 'Leave' },
            ]}
          />
          {continuing && (
            <>
              {action === 'move' && (
                <Field label="New batch" required>
                  <Select
                    aria-label="New batch"
                    value={batchId}
                    onChange={(e) => setBatchId(e.target.value)}
                  >
                    <option value="">Select a batch…</option>
                    {others.map((b) => (
                      <option key={b.id} value={b.id}>
                        {b.name} · {money(b.feePlan.monthlyFee)}/month
                        {b.capacity && b.memberCount >= b.capacity ? ' · full' : ''}
                      </option>
                    ))}
                  </Select>
                </Field>
              )}
              <Field
                label="Starts on"
                hint="Billing restarts this day (a new billing date, first invoice then)."
              >
                <Input
                  type="date"
                  aria-label="Starts on"
                  value={startsOn}
                  min={earliest}
                  max={addDays(today(), 30)}
                  onChange={(e) => e.target.value && setStartsOn(e.target.value)}
                />
              </Field>
              <div className="grid grid-cols-2 gap-2">
                <Field label="Custom monthly fee" hint="Empty: the batch’s plan.">
                  <MoneyInput
                    aria-label="Custom monthly fee"
                    value={customFee}
                    onChange={setCustomFee}
                  />
                </Field>
                <Field label="Monthly discount">
                  <MoneyInput
                    aria-label="Monthly discount"
                    value={discount}
                    onChange={setDiscount}
                  />
                </Field>
              </div>
              {d.credit > 0 && (
                <p className="rounded-lg bg-success/10 px-2.5 py-1.5 text-[12.5px]">
                  {money(d.credit)} credit comes off the first invoice.
                </p>
              )}
            </>
          )}
          {action === 'leave' && (
            <>
              {d.credit > 0 && (
                <Field label={`What happens to the ${money(d.credit)} credit?`} required>
                  <Segmented
                    ariaLabel="Credit"
                    className="w-full"
                    value={credit || 'none'}
                    onChange={(v) => setCredit(v as 'refund' | 'forfeit')}
                    options={[
                      { value: 'refund', label: 'Refund it' },
                      { value: 'forfeit', label: 'Keep it (forfeit)' },
                    ]}
                  />
                </Field>
              )}
              <p className="text-[12.5px] text-muted-foreground">
                Nothing more is billed. If this was their only batch, they’re marked as left from{' '}
                {formatLongDate(d.completedOn!)}.
              </p>
            </>
          )}
          {d.dues.amount > 0 && (
            <label className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/6 px-2.5 py-2 text-[12.5px]">
              <Checkbox
                className="mt-0.5"
                checked={confirmDues}
                onCheckedChange={(v) => setConfirmDues(v === true)}
                aria-label="Go ahead with unpaid fees"
              />
              <span>
                <b className="font-semibold">{money(d.dues.amount)} unpaid</b> (
                {plural(d.dues.count, 'invoice')}). Go ahead anyway.
              </span>
            </label>
          )}
          <Field label="Note (optional)">
            <Textarea
              aria-label="Note"
              rows={2}
              maxLength={500}
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
          </Field>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            loading={decide.isPending}
            disabled={!ready}
            variant={action === 'leave' ? 'destructive' : 'default'}
            onClick={() => void save()}
          >
            {action === 'readmit' ? 'Re-admit' : action === 'move' ? 'Move' : 'Leave'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Credits ─────────────────────────────────────────────────────────────────

const CREDIT_TABS: { value: CreditStatus | 'all'; label: string }[] = [
  { value: 'refund_due', label: 'Refunds owed' },
  { value: 'held', label: 'Waiting' },
  { value: 'assigned', label: 'Off next invoice' },
  { value: 'all', label: 'All' },
];

function Credits() {
  const [status, setStatus] = useState<CreditStatus | 'all'>('refund_due');
  const q = useCredits(status === 'all' ? {} : { status });
  const settle = useSettleCredit();
  const [acting, setActing] = useState<{ c: Credit; action: 'refunded' | 'forfeited' } | null>(
    null,
  );
  return (
    <>
      <Segmented
        ariaLabel="Credit status"
        value={status}
        onChange={(v) => setStatus(v as CreditStatus | 'all')}
        className="mb-2 w-full sm:w-auto"
        options={CREDIT_TABS}
      />
      {q.isPending ? (
        <ListSkeleton rows={3} />
      ) : q.isError ? (
        <ErrorState error={q.error} onRetry={() => void q.refetch()} />
      ) : !q.data.length ? (
        <EmptyState
          icon={<Wallet />}
          title={status === 'refund_due' ? 'No refunds owed' : 'No credit here'}
          description="Credit comes from unused course months and discounts for sessions not held."
        />
      ) : (
        <Card className="divide-y overflow-hidden">
          {q.data.map((c) => (
            <div key={c.id} className="flex flex-wrap items-center gap-2 px-3 py-2.5 text-[13px]">
              <span className="tabular w-24 shrink-0 font-semibold">{money(c.amount)}</span>
              <span className="min-w-0 flex-1">
                {c.student && (
                  <Link to={`/students/${c.student.id}`} className="font-medium hover:underline">
                    {c.student.fullName}
                  </Link>
                )}
                <span className="block text-[12px] text-muted-foreground">
                  {c.reason}
                  {c.sourceInvoice ? ` · from ${c.sourceInvoice.number}` : ''}
                </span>
              </span>
              <Badge variant={CREDIT_STATUS[c.status].badge}>{CREDIT_STATUS[c.status].label}</Badge>
              {c.status === 'refund_due' && (
                <span className="flex gap-1.5">
                  <Button
                    size="sm"
                    variant="success"
                    onClick={() => setActing({ c, action: 'refunded' })}
                  >
                    <HandCoins /> Refunded
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setActing({ c, action: 'forfeited' })}
                  >
                    Forfeit
                  </Button>
                </span>
              )}
            </div>
          ))}
        </Card>
      )}
      <ConfirmDialog
        open={!!acting}
        onOpenChange={(o) => !o && setActing(null)}
        title={acting?.action === 'refunded' ? 'Record the refund?' : 'Forfeit this credit?'}
        description={
          acting
            ? acting.action === 'refunded'
              ? `${money(acting.c.amount)} paid back to ${acting.c.student?.fullName ?? 'the family'}. Add how it was paid.`
              : `${money(acting.c.amount)} won’t be paid back.`
            : ''
        }
        confirmLabel={acting?.action === 'refunded' ? 'Record refund' : 'Forfeit'}
        destructive={acting?.action === 'forfeited'}
        requireReason={acting?.action === 'refunded'}
        reasonLabel="How it was paid (e.g. UPI ref)"
        loading={settle.isPending}
        onConfirm={(note) =>
          acting &&
          settle.mutate(
            { id: acting.c.id, action: acting.action, note: note || null },
            {
              onSuccess: () => {
                toast.success(
                  acting.action === 'refunded' ? 'Refund recorded' : 'Credit forfeited',
                );
                setActing(null);
              },
              onError: (e) => toast.error(errorMessage(e)),
            },
          )
        }
      />
    </>
  );
}
