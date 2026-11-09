/**
 * Substitute coaches: someone covers a batch's sessions for a few days. Admins assign directly
 * and review coaches' requests; coaches ask for cover and see what they cover. Fees and income
 * never move — a substitute only runs the sessions.
 */
import {
  ArrowRight,
  CalendarClock,
  CalendarRange,
  Check,
  Clock3,
  MoreHorizontal,
  Repeat,
  UserCheck,
  UserRoundPlus,
  X,
} from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { useUser } from '@/app/auth';
import {
  ConfirmDialog,
  EmptyState,
  ErrorState,
  Field,
  ListSkeleton,
  PageHeader,
  StatCard,
  SectionDivider,
} from '@/components/common';
import { FilterBar, FilterField, FilterMenu, PeriodFilter } from '@/components/filters';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/overlays';
import {
  Badge,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Input,
  Select,
  Textarea,
} from '@/components/ui/primitives';
import { errorMessage } from '@/lib/api';
import { eachDay, formatShortDate, isoWeekday, plural, today, WEEKDAYS } from '@/lib/format';
import { periodRange, type PeriodKey } from '@/lib/periods';
import {
  useBatches,
  useCreateSubstitution,
  useReviewSubstitution,
  useSubstituteCoaches,
  useSubstitutionInsights,
  useSubstitutions,
} from '@/lib/queries';
import type { Substitution, SubstitutionStatus } from '@/lib/types';
import { cn } from '@/lib/utils';
import { timeLabel } from '@/lib/batch-times';

const STATUS: Record<
  SubstitutionStatus,
  { label: string; badge: 'success' | 'warning' | 'muted' | 'destructive' }
> = {
  pending: { label: 'Awaiting approval', badge: 'warning' },
  approved: { label: 'Approved', badge: 'success' },
  rejected: { label: 'Declined', badge: 'destructive' },
  cancelled: { label: 'Cancelled', badge: 'muted' },
};

const PERIODS: PeriodKey[] = ['month', 'last-month', 'quarter', 'fy'];

const day = (d: string) => `${WEEKDAYS[isoWeekday(d) - 1]?.short} ${formatShortDate(d)}`;
const span = (s: { fromDate: string; toDate: string }) =>
  s.fromDate === s.toDate ? day(s.fromDate) : `${day(s.fromDate)} – ${day(s.toDate)}`;

/** Where a substitution stands in time (for approved ones). */
function phase(s: Substitution, now: string) {
  if (s.status !== 'approved') return null;
  if (s.toDate < now) return 'Done';
  if (s.fromDate <= now) return 'Covering now';
  return 'Upcoming';
}

// ─── Assign / request ────────────────────────────────────────────────────────

function SubstituteDialog({ onClose }: { onClose: () => void }) {
  const me = useUser();
  const admin = me.role === 'admin';
  const batches = useBatches({ active: 'true' });
  const coaches = useSubstituteCoaches();
  const create = useCreateSubstitution();
  const own = (batches.data ?? []).filter((b) => admin || b.coach.id === me.id);
  const [batchId, setBatchId] = useState('');
  const [substituteId, setSubstituteId] = useState('');
  const [from, setFrom] = useState(today());
  const [to, setTo] = useState(today());
  const [reason, setReason] = useState('');
  const batch = own.find((b) => b.id === (batchId || own[0]?.id));
  const choices = (coaches.data ?? []).filter((c) => c.id !== batch?.coach.id);
  const days =
    batch && to >= from
      ? eachDay(from, to).filter((d) => batch.weekdays.includes(isoWeekday(d))).length
      : 0;

  async function submit() {
    if (!batch || !substituteId) return;
    try {
      await create.mutateAsync({
        batchId: batch.id,
        substituteCoachId: substituteId,
        fromDate: from,
        toDate: to,
        reason: reason.trim() || null,
      });
      toast.success(admin ? 'Substitute assigned' : 'Request sent', {
        description: admin
          ? 'They can run the sessions on those days.'
          : 'An admin will review it; you’ll be notified.',
      });
      onClose();
    } catch (err) {
      toast.error(admin ? 'Could not assign' : 'Could not send request', {
        description: errorMessage(err),
      });
    }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{admin ? 'Assign a substitute' : 'Request a substitute'}</DialogTitle>
          <DialogDescription>
            The substitute runs this batch’s sessions on the chosen days — check-in, attendance and
            lesson plans. Fees and income stay with the batch’s coach.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2.5">
          <Field label="Batch">
            <Select
              aria-label="Batch"
              value={batch?.id ?? ''}
              onChange={(e) => (setBatchId(e.target.value), setSubstituteId(''))}
            >
              {own.length === 0 && <option value="">No batches</option>}
              {own.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name} · {timeLabel(b)}
                  {admin ? ` · ${b.coach.name}` : ''}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Substitute coach">
            <Select
              aria-label="Substitute coach"
              value={substituteId}
              onChange={(e) => setSubstituteId(e.target.value)}
            >
              <option value="">Choose a coach…</option>
              {choices.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </Select>
          </Field>
          <div className="grid grid-cols-2 gap-2">
            <Field label="From">
              <Input
                type="date"
                aria-label="From"
                value={from}
                min={today()}
                onChange={(e) => {
                  const v = e.target.value;
                  if (!v) return;
                  setFrom(v);
                  if (to < v) setTo(v);
                }}
              />
            </Field>
            <Field label="To">
              <Input
                type="date"
                aria-label="To"
                value={to}
                min={from}
                onChange={(e) => e.target.value && setTo(e.target.value)}
              />
            </Field>
          </div>
          <p className="flex items-center gap-1.5 text-[12px] text-muted-foreground">
            <CalendarRange className="size-3.5" />
            {batch
              ? days
                ? `${plural(days, 'session')} of ${batch.name} in these dates`
                : `${batch.name} has no sessions in these dates`
              : 'Pick a batch'}
          </p>
          <Field label="Reason (optional)">
            <Textarea
              aria-label="Reason"
              rows={2}
              maxLength={300}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="e.g. Away for a tournament"
            />
          </Field>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            loading={create.isPending}
            disabled={!batch || !substituteId || !days}
            onClick={() => void submit()}
          >
            {admin ? 'Assign' : 'Send request'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Rows ────────────────────────────────────────────────────────────────────

function SubstitutionRow({
  s,
  onAct,
}: {
  s: Substitution;
  onAct: (s: Substitution, action: 'approve' | 'reject' | 'cancel') => void;
}) {
  const me = useUser();
  const admin = me.role === 'admin';
  const now = today();
  const when = phase(s, now);
  const canCancel =
    ['pending', 'approved'].includes(s.status) &&
    s.toDate >= now &&
    (admin || s.requestedBy.id === me.id || s.coach.id === me.id);
  const role =
    s.substitute.id === me.id ? 'You cover' : s.coach.id === me.id ? 'Covering you' : null;
  return (
    <li className="flex items-center gap-2.5 px-2 py-2 sm:px-3">
      <span
        className={cn(
          'flex size-10 shrink-0 flex-col items-center justify-center rounded-lg text-center leading-none',
          s.status === 'approved' ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground',
        )}
        aria-hidden
      >
        <span className="text-[9px] font-semibold uppercase">
          {WEEKDAYS[isoWeekday(s.fromDate) - 1]?.short}
        </span>
        <span className="tabular text-[15px] font-bold">{Number(s.fromDate.slice(8))}</span>
      </span>
      <div className="min-w-0 flex-1">
        <p className="flex min-w-0 items-center gap-1.5">
          <span className="truncate text-[14px] font-semibold">{s.batch.name}</span>
          {role && (
            <Badge variant="default" className="shrink-0">
              {role}
            </Badge>
          )}
        </p>
        <p className="flex min-w-0 items-center gap-1 text-[12px] text-muted-foreground">
          <span className="truncate">{s.coach.name}</span>
          <ArrowRight className="size-3 shrink-0" />
          <span className="truncate font-medium text-foreground">{s.substitute.name}</span>
        </p>
        <p className="truncate text-[11px] text-muted-foreground">
          {span(s)} · {timeLabel(s.batch)} · {plural(s.sessions, 'session')}
          {s.reason ? ` · ${s.reason}` : ''}
          {s.reviewNote ? ` · Note: ${s.reviewNote}` : ''}
        </p>
      </div>
      <span className="flex shrink-0 flex-col items-end gap-1">
        <Badge variant={STATUS[s.status].badge}>{when ?? STATUS[s.status].label}</Badge>
        {admin && s.status === 'pending' && (
          <span className="flex gap-1">
            <Button
              size="icon-sm"
              variant="outline"
              aria-label={`Decline ${s.substitute.name} for ${s.batch.name}`}
              onClick={() => onAct(s, 'reject')}
            >
              <X />
            </Button>
            <Button
              size="icon-sm"
              aria-label={`Approve ${s.substitute.name} for ${s.batch.name}`}
              onClick={() => onAct(s, 'approve')}
            >
              <Check />
            </Button>
          </span>
        )}
      </span>
      {canCancel && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon-sm" aria-label={`More for ${s.batch.name}`}>
              <MoreHorizontal />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent>
            <DropdownMenuItem destructive onSelect={() => onAct(s, 'cancel')}>
              <X /> {s.status === 'pending' ? 'Withdraw request' : 'Cancel substitution'}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      )}
    </li>
  );
}

function Leaders({
  title,
  rows,
}: {
  title: string;
  rows: { id: string; name: string; sessions: number }[];
}) {
  const max = Math.max(1, ...rows.map((r) => r.sessions));
  return (
    <Card>
      <CardHeader className="pb-1">
        <CardTitle className="text-[14px]">{title}</CardTitle>
      </CardHeader>
      <CardContent>
        {rows.length === 0 ? (
          <p className="text-[12px] text-muted-foreground">None in this period.</p>
        ) : (
          <ul className="space-y-1.5">
            {rows.slice(0, 6).map((r) => (
              <li key={r.id} className="text-[12px]">
                <div className="mb-0.5 flex items-baseline gap-2">
                  <span className="min-w-0 flex-1 truncate text-[13px] font-medium">{r.name}</span>
                  <span className="tabular text-muted-foreground">
                    {plural(r.sessions, 'session')}
                  </span>
                </div>
                <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full rounded-full bg-primary"
                    style={{ width: `${(r.sessions / max) * 100}%` }}
                  />
                </div>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

// ─── Page ────────────────────────────────────────────────────────────────────

export function SubstitutionsPage() {
  const me = useUser();
  const admin = me.role === 'admin';
  const [period, setPeriod] = useState<PeriodKey>('month');
  const [status, setStatus] = useState<'' | SubstitutionStatus>('');
  const [creating, setCreating] = useState(false);
  const [acting, setActing] = useState<{
    s: Substitution;
    action: 'approve' | 'reject' | 'cancel';
  } | null>(null);
  const range = periodRange(period);
  const insights = useSubstitutionInsights(range);
  const list = useSubstitutions(status ? { status } : {});
  const review = useReviewSubstitution();
  const t = insights.data?.totals;
  const pending = (list.data ?? []).filter((s) => s.status === 'pending');
  const rest = (list.data ?? []).filter((s) => !(admin && s.status === 'pending' && !status));

  function act(note: string) {
    if (!acting) return;
    const { s, action } = acting;
    review.mutate(
      { id: s.id, action, note: note || null },
      {
        onSuccess: () => {
          toast.success(
            { approve: 'Substitute approved', reject: 'Request declined', cancel: 'Cancelled' }[
              action
            ],
          );
          setActing(null);
        },
        onError: (e) => toast.error('Could not update', { description: errorMessage(e) }),
      },
    );
  }

  return (
    <div>
      <PageHeader
        title="Substitute coaches"
        description={
          admin
            ? 'Cover a batch’s sessions for a few days. Fees and income stay with the batch’s coach.'
            : 'Ask for cover, and see the batches you cover for others.'
        }
        actions={
          <Button size="sm" onClick={() => setCreating(true)}>
            <UserRoundPlus /> {admin ? 'Assign' : 'Request'}
          </Button>
        }
      />

      <FilterBar>
        <PeriodFilter value={period} onChange={setPeriod} options={PERIODS} />
        <FilterMenu active={Number(Boolean(status))} onReset={() => setStatus('')}>
          <FilterField label="Status">
            <Select
              aria-label="Status"
              value={status}
              onChange={(e) => setStatus(e.target.value as '' | SubstitutionStatus)}
            >
              <option value="">All</option>
              {(Object.keys(STATUS) as SubstitutionStatus[]).map((k) => (
                <option key={k} value={k}>
                  {STATUS[k].label}
                </option>
              ))}
            </Select>
          </FilterField>
        </FilterMenu>
      </FilterBar>

      <SectionDivider className="mb-1.5">Overview</SectionDivider>
      <div className="mb-3 grid grid-cols-2 gap-2 lg:grid-cols-4">
        {admin ? (
          <>
            <StatCard
              label="Sessions covered"
              icon={<Repeat />}
              loading={insights.isPending}
              value={<span className="tabular">{t?.sessions ?? 0}</span>}
              hint={t ? plural(t.substitutions, 'substitution') : undefined}
            />
            <StatCard
              label="Covering now"
              icon={<UserCheck />}
              loading={insights.isPending}
              value={<span className="tabular">{t?.active ?? 0}</span>}
              tone="success"
            />
          </>
        ) : (
          <>
            <StatCard
              label="Covered by me"
              icon={<Repeat />}
              loading={insights.isPending}
              value={<span className="tabular">{t?.coveredByMe ?? 0}</span>}
              hint="sessions this period"
              tone="success"
            />
            <StatCard
              label="Covered for me"
              icon={<UserCheck />}
              loading={insights.isPending}
              value={<span className="tabular">{t?.coveredForMe ?? 0}</span>}
              hint="sessions this period"
            />
          </>
        )}
        <StatCard
          label="Upcoming"
          icon={<CalendarClock />}
          loading={insights.isPending}
          value={<span className="tabular">{t?.upcoming ?? 0}</span>}
        />
        <StatCard
          label="Awaiting approval"
          icon={<Clock3 />}
          loading={insights.isPending}
          value={<span className="tabular">{t?.pending ?? 0}</span>}
          tone={t?.pending ? 'warning' : 'default'}
        />
      </div>

      {admin && !status && pending.length > 0 && (
        <Card className="mb-3 border-warning/40">
          <CardHeader className="pb-1">
            <CardTitle className="flex items-center gap-2 text-[14px]">
              <Clock3 className="size-4 text-warning-foreground dark:text-warning" />
              {plural(pending.length, 'request')} to review
            </CardTitle>
          </CardHeader>
          <ul className="divide-y">
            {pending.map((s) => (
              <SubstitutionRow key={s.id} s={s} onAct={(x, a) => setActing({ s: x, action: a })} />
            ))}
          </ul>
        </Card>
      )}

      <SectionDivider className="mb-1.5">Substitutions</SectionDivider>
      <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_18rem]">
        <Card className="min-w-0 overflow-hidden">
          <CardHeader className="pb-1">
            <CardTitle className="text-[14px]">
              {status ? STATUS[status].label : admin ? 'All substitutions' : 'Your substitutions'}
            </CardTitle>
          </CardHeader>
          {list.isPending ? (
            <ListSkeleton rows={3} className="p-3" />
          ) : list.isError ? (
            <ErrorState error={list.error} onRetry={() => void list.refetch()} />
          ) : rest.length === 0 ? (
            <EmptyState
              icon={<Repeat />}
              title="No substitutions yet"
              description={
                admin
                  ? 'Assign a substitute when a coach is away.'
                  : 'Request cover when you can’t take a session.'
              }
            />
          ) : (
            <ul className="divide-y">
              {rest.map((s) => (
                <SubstitutionRow
                  key={s.id}
                  s={s}
                  onAct={(x, a) => setActing({ s: x, action: a })}
                />
              ))}
            </ul>
          )}
        </Card>
        {admin && insights.data && (
          <div className="space-y-3">
            <Leaders title="Who covered most" rows={insights.data.bySubstitute} />
            <Leaders title="Batches covered" rows={insights.data.byBatch} />
          </div>
        )}
      </div>

      {creating && <SubstituteDialog onClose={() => setCreating(false)} />}
      <ConfirmDialog
        open={Boolean(acting)}
        onOpenChange={(o) => !o && setActing(null)}
        title={
          acting
            ? {
                approve: `Approve ${acting.s.substitute.name}?`,
                reject: 'Decline this request?',
                cancel:
                  acting.s.status === 'pending'
                    ? 'Withdraw this request?'
                    : 'Cancel this substitution?',
              }[acting.action]
            : ''
        }
        description={
          acting
            ? `${acting.s.batch.name} · ${span(acting.s)} · ${plural(acting.s.sessions, 'session')}`
            : undefined
        }
        confirmLabel={
          acting
            ? { approve: 'Approve', reject: 'Decline', cancel: 'Yes, cancel' }[acting.action]
            : 'Confirm'
        }
        destructive={acting?.action !== 'approve'}
        requireReason={acting?.action === 'reject'}
        loading={review.isPending}
        onConfirm={act}
      />
    </div>
  );
}
