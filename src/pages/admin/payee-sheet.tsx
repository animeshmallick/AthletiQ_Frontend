/**
 * One payee, everything about them: what is owed and since when, what they earned and were paid
 * (month by month), where the money comes from, which fee plans include them and what to expect
 * each month, and the full history with a running balance. Actions: pay, statement, share a
 * summary, edit, retire, open a plan's split.
 */
import {
  ArrowDownLeft,
  ArrowUpRight,
  Building2,
  ClipboardCopy,
  Download,
  ExternalLink,
  MoreHorizontal,
  Pencil,
  Power,
  Wallet,
} from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link } from 'react-router';
import { toast } from 'sonner';
import { saveFile } from '@/app/share-file';
import { EmptyState, ErrorState, Field, ListSkeleton } from '@/components/common';
import { PeriodFilter } from '@/components/filters';
import { Button } from '@/components/ui/button';
import { Segmented } from '@/components/ui/controls';
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
import { Badge, Card, Input } from '@/components/ui/primitives';
import { errorMessage, requestBlob } from '@/lib/api';
import {
  formatDate,
  formatMonth,
  formatShortDate,
  money,
  moneyCompact,
  plural,
} from '@/lib/format';
import { periodRange, type PeriodKey } from '@/lib/periods';
import {
  useFundsOverview,
  usePayeeInsights,
  useSavePayee,
  type PayeeInsights,
} from '@/lib/queries';
import type { AcademyFunds } from '@/lib/types';
import { cn } from '@/lib/utils';
import { MoneyActionDialog } from '../money/actions';

export const PAYEE_PERIODS: PeriodKey[] = ['month', 'last-month', 'quarter', 'fy'];

type Tab = 'overview' | 'history' | 'plans';

export function PayeeSheet({
  id,
  period,
  onPeriod,
  onClose,
}: {
  id: string | null;
  period: PeriodKey;
  onPeriod: (p: PeriodKey) => void;
  onClose: () => void;
}) {
  const range = periodRange(period);
  const q = usePayeeInsights(id, range);
  const [tab, setTab] = useState<Tab>('overview');
  const [paying, setPaying] = useState(false);
  const [editing, setEditing] = useState(false);
  const save = useSavePayee();
  const funds = useFundsOverview(range);
  const academy = funds.data?.scope === 'academy' ? (funds.data as AcademyFunds) : undefined;
  const d = q.data;

  async function statement() {
    if (!d) return;
    try {
      const qs = new URLSearchParams(range).toString();
      const blob = await requestBlob(`/funds/payees/${d.payee.id}/statement?${qs}`);
      const name = `Statement-${d.payee.name.replace(/[^a-z0-9]+/gi, '-')}-${range.from}-to-${range.to}.pdf`;
      await saveFile(blob, name, `Statement · ${d.payee.name}`);
    } catch (err) {
      toast.error('Could not create the statement', { description: errorMessage(err) });
    }
  }

  async function copySummary() {
    if (!d) return;
    const s = d.summary;
    const text = [
      `${d.payee.name} · ${formatDate(range.from)} – ${formatDate(range.to)}`,
      `Shares earned: ${money(s.earned)}`,
      `Paid: ${money(s.paid)}`,
      `Owed now: ${money(s.owedNow)}${s.unpaidSince ? ` (since ${formatDate(s.unpaidSince)})` : ''}`,
      s.expectedMonthly ? `Expected each month: about ${money(s.expectedMonthly)}` : null,
    ]
      .filter(Boolean)
      .join('\n');
    try {
      await navigator.clipboard.writeText(text);
      toast.success('Summary copied');
    } catch {
      toast.error('Could not copy');
    }
  }

  function toggleActive() {
    if (!d) return;
    save.mutate(
      { id: d.payee.id, isActive: !d.payee.isActive },
      {
        onSuccess: () => toast.success(d.payee.isActive ? 'Payee retired' : 'Payee restored'),
        onError: (e) => toast.error(errorMessage(e)),
      },
    );
  }

  return (
    <Dialog open={!!id} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-2xl" aria-describedby={undefined}>
        {!d ? (
          q.isError ? (
            <ErrorState error={q.error} onRetry={() => void q.refetch()} />
          ) : (
            <>
              <DialogTitle className="sr-only">Payee</DialogTitle>
              <ListSkeleton rows={5} />
            </>
          )
        ) : (
          <div className="space-y-3">
            <DialogHeader className="flex-row items-start gap-3 text-left">
              <span className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-amber-500/12 text-amber-700 dark:text-amber-300">
                <Building2 className="size-5" />
              </span>
              <div className="min-w-0 flex-1">
                <DialogTitle className="flex items-center gap-2">
                  <span className="truncate">{d.payee.name}</span>
                  {!d.payee.isActive && <Badge variant="muted">Retired</Badge>}
                </DialogTitle>
                <DialogDescription className="truncate">
                  {d.payee.note || `Payee since ${formatDate(d.payee.createdAt.slice(0, 10))}`}
                </DialogDescription>
              </div>
            </DialogHeader>

            {/* Actions */}
            <div className="flex gap-1.5">
              <Button
                size="sm"
                className="flex-1"
                disabled={d.summary.owedNow <= 0 || !academy}
                onClick={() => setPaying(true)}
              >
                <Wallet />
                {d.summary.owedNow > 0 ? `Pay ${money(d.summary.owedNow)}` : 'Nothing owed'}
              </Button>
              <Button size="sm" variant="outline" onClick={() => void statement()}>
                <Download /> Statement
              </Button>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button size="sm" variant="outline" aria-label="More actions" className="px-2">
                    <MoreHorizontal />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onSelect={() => void copySummary()}>
                    <ClipboardCopy /> Copy summary
                  </DropdownMenuItem>
                  <DropdownMenuItem onSelect={() => setEditing(true)}>
                    <Pencil /> Edit details
                  </DropdownMenuItem>
                  <DropdownMenuItem onSelect={toggleActive}>
                    <Power /> {d.payee.isActive ? 'Retire payee' : 'Restore payee'}
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>

            <PeriodFilter value={period} onChange={onPeriod} options={PAYEE_PERIODS} />

            <Segmented
              ariaLabel="Payee section"
              value={tab}
              onChange={(v) => setTab(v as Tab)}
              className="w-full"
              options={[
                { value: 'overview', label: 'Overview' },
                { value: 'history', label: `History · ${d.history.length}` },
                { value: 'plans', label: `Plans · ${d.plans.length}` },
              ]}
            />

            {tab === 'overview' && <Overview d={d} />}
            {tab === 'history' && <History d={d} />}
            {tab === 'plans' && <Plans d={d} onNavigate={onClose} />}
          </div>
        )}
      </DialogContent>
      {paying && d && (
        <MoneyActionDialog
          action="payout"
          funds={academy}
          prefill={{ payeeId: d.payee.id, amount: d.summary.owedNow }}
          onClose={() => setPaying(false)}
        />
      )}
      {editing && d && <EditPayeeDialog payee={d.payee} onClose={() => setEditing(false)} />}
    </Dialog>
  );
}

function Kpi({
  label,
  value,
  hint,
  tone,
}: {
  label: string;
  value: string;
  hint?: string;
  tone?: 'warn' | 'good';
}) {
  return (
    <div className="min-w-0 rounded-xl bg-muted/40 px-2.5 py-2">
      <p className="truncate text-[11px] font-medium text-muted-foreground">{label}</p>
      <p
        className={cn(
          'tabular truncate text-[16px] leading-tight font-bold',
          tone === 'warn' && 'text-warning-foreground dark:text-warning',
          tone === 'good' && 'text-success',
        )}
      >
        {value}
      </p>
      {hint && <p className="truncate text-[11px] text-muted-foreground">{hint}</p>}
    </div>
  );
}

function Overview({ d }: { d: PayeeInsights }) {
  const s = d.summary;
  const hasActivity = s.lifetimeEarned > 0 || s.lifetimePaid > 0;
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-4">
        <Kpi
          label="Owed now"
          value={money(s.owedNow)}
          tone={s.owedNow > 0 ? 'warn' : undefined}
          hint={
            s.unpaidSince
              ? `Unpaid ${plural(s.unpaidDays, 'day')} · since ${formatShortDate(s.unpaidSince)}`
              : 'All settled'
          }
        />
        <Kpi label="Earned" value={money(s.earned)} hint={plural(s.shares, 'fee share')} />
        <Kpi label="Paid" value={money(s.paid)} hint={plural(s.payouts, 'payment')} tone="good" />
        <Kpi
          label="Expected / month"
          value={money(s.expectedMonthly)}
          hint="From current students"
        />
        <Kpi label="Average / month" value={money(s.avgMonthly)} hint="In this period" />
        <Kpi
          label="Paid out so far"
          value={s.payoutRate === null ? '—' : `${s.payoutRate}%`}
          hint={`${moneyCompact(s.lifetimePaid)} of ${moneyCompact(s.lifetimeEarned)}`}
        />
        <Kpi
          label="Last payment"
          value={s.lastPayout ? money(s.lastPayout.amount) : '—'}
          hint={s.lastPayout ? formatDate(s.lastPayout.date) : 'Never paid'}
        />
        <Kpi label="Students" value={String(s.students)} hint="Whose fees paid a share" />
      </div>

      {!hasActivity ? (
        <EmptyState
          icon={<Building2 />}
          title="No money activity yet"
          description="Shares appear here when fees are received for a plan whose split includes this payee."
        />
      ) : (
        <>
          <MonthlyChart data={d.monthly} />
          <div className="grid gap-3 sm:grid-cols-2">
            <SourceList title="By batch" rows={d.sources.byBatch} />
            <SourceList title="Top students" rows={d.sources.byStudent} />
          </div>
        </>
      )}
    </div>
  );
}

/** Earned vs paid per month: two thin bars per month, a legend, values on hover. */
function MonthlyChart({ data: all }: { data: PayeeInsights['monthly'] }) {
  // Start at the first month with any money (no empty months before the payee began).
  const first = all.findIndex((m) => m.earned || m.paid);
  const data = first > 0 ? all.slice(first) : all;
  const max = Math.max(1, ...data.flatMap((m) => [m.earned, m.paid]));
  const H = 96;
  return (
    <Card className="p-3">
      <div className="mb-2 flex items-center justify-between">
        <p className="text-[13px] font-semibold">Month by month</p>
        <div className="flex items-center gap-3 text-[11px] text-muted-foreground">
          <span className="flex items-center gap-1">
            <span className="size-2 rounded-sm bg-primary" /> Earned
          </span>
          <span className="flex items-center gap-1">
            <span className="size-2 rounded-sm bg-teal-500" /> Paid
          </span>
        </div>
      </div>
      <div
        className="flex items-end gap-1 overflow-x-auto"
        role="img"
        aria-label={data
          .map((m) => `${formatMonth(m.month)}: earned ${money(m.earned)}, paid ${money(m.paid)}`)
          .join('; ')}
      >
        {data.map((m) => (
          <div
            key={m.month}
            className="flex min-w-9 flex-1 flex-col items-center gap-1"
            title={`${formatMonth(m.month)} · earned ${money(m.earned)} · paid ${money(m.paid)}`}
          >
            <div className="flex items-end gap-[2px]" style={{ height: H }}>
              <span
                className="w-2 rounded-t bg-primary"
                style={{ height: Math.max(m.earned ? 2 : 0, (m.earned / max) * H) }}
              />
              <span
                className="w-2 rounded-t bg-teal-500"
                style={{ height: Math.max(m.paid ? 2 : 0, (m.paid / max) * H) }}
              />
            </div>
            <span className="text-[10px] text-muted-foreground">
              {formatMonth(m.month).split(' ')[0]}
            </span>
          </div>
        ))}
      </div>
    </Card>
  );
}

function SourceList({ title, rows }: { title: string; rows: PayeeInsights['sources']['byBatch'] }) {
  const max = Math.max(1, ...rows.map((r) => r.amount));
  return (
    <Card className="p-3">
      <p className="mb-2 text-[13px] font-semibold">{title}</p>
      {rows.length === 0 ? (
        <p className="text-[12px] text-muted-foreground">Nothing in this period.</p>
      ) : (
        <ul className="space-y-1.5">
          {rows.slice(0, 6).map((r) => (
            <li key={r.id} className="text-[12px]">
              <div className="flex justify-between gap-2">
                <span className="truncate">{r.name}</span>
                <span className="tabular shrink-0 font-semibold">{money(r.amount)}</span>
              </div>
              <div className="mt-0.5 h-1 overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full rounded-full bg-primary/70"
                  style={{ width: `${(r.amount / max) * 100}%` }}
                />
              </div>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

function History({ d }: { d: PayeeInsights }) {
  const [kind, setKind] = useState<'all' | 'share' | 'payout'>('all');
  const rows = useMemo(
    () => d.history.filter((h) => kind === 'all' || h.kind === kind),
    [d.history, kind],
  );
  const s = d.summary;
  return (
    <div className="space-y-2">
      <div className="space-y-1.5">
        <Segmented
          ariaLabel="History type"
          className="w-full"
          value={kind}
          onChange={(v) => setKind(v as typeof kind)}
          options={[
            { value: 'all', label: 'All' },
            { value: 'share', label: 'Shares' },
            { value: 'payout', label: 'Payments' },
          ]}
        />
        <p className="text-right text-[11px] text-muted-foreground">
          Opening {money(s.opening)} · Closing {money(s.closing)}
        </p>
      </div>
      {rows.length === 0 ? (
        <p className="py-6 text-center text-[13px] text-muted-foreground">
          Nothing in this period.
        </p>
      ) : (
        <Card className="divide-y overflow-hidden">
          {rows.map((h) => (
            <div key={h.id} className={cn('flex gap-2.5 px-3 py-2', h.reversed && 'opacity-55')}>
              <span
                className={cn(
                  'mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full',
                  h.kind === 'share'
                    ? 'bg-primary/10 text-primary'
                    : 'bg-teal-500/12 text-teal-600',
                )}
              >
                {h.kind === 'share' ? (
                  <ArrowDownLeft className="size-3.5" />
                ) : (
                  <ArrowUpRight className="size-3.5" />
                )}
              </span>
              <div className="min-w-0 flex-1">
                <p className={cn('truncate text-[13px] font-medium', h.reversed && 'line-through')}>
                  {h.title}
                </p>
                <p className="truncate text-[11px] text-muted-foreground">
                  {formatDate(h.date)}
                  {h.detail ? ` · ${h.detail}` : ''}
                </p>
                {h.reversed && (
                  <Badge variant="muted" className="mt-0.5">
                    Reversed{h.reversalReason ? ` · ${h.reversalReason}` : ''}
                  </Badge>
                )}
              </div>
              <div className="shrink-0 text-right">
                <p
                  className={cn(
                    'tabular text-[13px] font-semibold',
                    h.amount < 0 ? 'text-teal-600' : 'text-foreground',
                  )}
                >
                  {h.amount < 0 ? '−' : '+'}
                  {money(Math.abs(h.amount))}
                </p>
                {!h.reversed && (
                  <p className="tabular text-[11px] text-muted-foreground">
                    Owed {money(h.balance)}
                  </p>
                )}
              </div>
            </div>
          ))}
        </Card>
      )}
    </div>
  );
}

function Plans({ d, onNavigate }: { d: PayeeInsights; onNavigate: () => void }) {
  if (!d.plans.length)
    return (
      <EmptyState
        icon={<Building2 />}
        title="Not in any fee plan’s split"
        description="Add this payee to a fee plan’s split to give them a share of its fees."
        action={
          <Button size="sm" variant="outline" asChild>
            <Link to="/fee-plans" onClick={onNavigate}>
              Open fee plans
            </Link>
          </Button>
        }
      />
    );
  return (
    <div className="space-y-2">
      {d.plans.map((p) => (
        <Card key={p.id} className="p-3">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="truncate text-[14px] font-semibold">
                {p.name} {!p.isActive && <Badge variant="muted">Inactive</Badge>}
              </p>
              <p className="text-[12px] text-muted-foreground">
                {money(p.perStudent)} of each {money(p.monthlyFee)} fee ·{' '}
                {plural(p.students, 'student')}
              </p>
            </div>
            <div className="shrink-0 text-right">
              <p className="tabular text-[14px] font-bold">{money(p.expectedMonthly)}</p>
              <p className="text-[11px] text-muted-foreground">expected / month</p>
            </div>
          </div>
          {p.batches.length > 0 && (
            <ul className="mt-2 space-y-1 border-t pt-2 text-[12px]">
              {p.batches.map((b) => (
                <li key={b.id} className="flex justify-between gap-2">
                  <Link
                    to={`/batches/${b.id}`}
                    onClick={onNavigate}
                    className="truncate text-primary hover:underline"
                  >
                    {b.name}
                  </Link>
                  <span className="tabular shrink-0 text-muted-foreground">
                    {plural(b.students, 'student')} · {money(b.expected)}
                  </span>
                </li>
              ))}
            </ul>
          )}
          <Button size="sm" variant="ghost" className="mt-1 -ml-2" asChild>
            <Link to={`/fee-plans?split=${p.id}`} onClick={onNavigate}>
              <ExternalLink /> Open split
            </Link>
          </Button>
        </Card>
      ))}
    </div>
  );
}

export function EditPayeeDialog({
  payee,
  onClose,
}: {
  payee?: { id: string; name: string; note: string | null };
  onClose: () => void;
}) {
  const save = useSavePayee();
  const [name, setName] = useState(payee?.name ?? '');
  const [note, setNote] = useState(payee?.note ?? '');
  async function submit() {
    if (name.trim().length < 2) return toast.error('Enter a name');
    try {
      await save.mutateAsync({ id: payee?.id, name: name.trim(), note: note.trim() || null });
      toast.success(payee ? 'Payee updated' : 'Payee added');
      onClose();
    } catch (err) {
      toast.error('Could not save', { description: errorMessage(err) });
    }
  }
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{payee ? 'Edit payee' : 'New payee'}</DialogTitle>
          <DialogDescription>
            An outside party that receives a share of fees: a society, ground owner, federation…
          </DialogDescription>
        </DialogHeader>
        <form
          id="payee-form"
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            void submit();
          }}
        >
          <Field label="Name" required>
            <Input
              value={name}
              maxLength={80}
              autoFocus
              placeholder="e.g. Residents’ society"
              onChange={(e) => setName(e.target.value)}
            />
          </Field>
          <Field label="Note" hint="Contact, account details or anything useful.">
            <Input value={note} maxLength={500} onChange={(e) => setNote(e.target.value)} />
          </Field>
        </form>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" form="payee-form" loading={save.isPending}>
            {payee ? 'Save' : 'Add payee'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
