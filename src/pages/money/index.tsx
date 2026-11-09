import {
  ArrowDownLeft,
  ArrowRightLeft,
  Building2,
  ChevronDown,
  HandCoins,
  Landmark,
  PiggyBank,
  Plus,
  Scale,
  ShoppingBag,
  Split,
  Users,
  Wallet,
} from 'lucide-react';
import { useMemo, useState, type ReactNode } from 'react';
import { Link } from 'react-router';
import { useUser } from '@/app/auth';
import { financeRange, type FinancePreset } from '@/components/collected-by';
import { Avatar, ErrorState, ListSkeleton, PageHeader, StatCard } from '@/components/common';
import { Button } from '@/components/ui/button';
import { Segmented } from '@/components/ui/controls';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/overlays';
import {
  Badge,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/primitives';
import { money, moneyCompact, plural } from '@/lib/format';
import { useFundsOverview, useUsers } from '@/lib/queries';
import { SPLIT_COLORS } from '@/lib/split';
import type { AcademyFunds, MyFunds } from '@/lib/types';
import { cn } from '@/lib/utils';
import { MoneyActionDialog, type ActionPrefill, type MoneyAction } from './actions';
import { categoryLabel } from './meta';
import { Ledger } from './ledger';

type Open = { action: MoneyAction; prefill?: ActionPrefill } | null;

function PeriodPicker({
  value,
  onChange,
}: {
  value: FinancePreset;
  onChange: (v: FinancePreset) => void;
}) {
  return (
    <Segmented
      ariaLabel="Period"
      value={value}
      onChange={onChange}
      options={[
        { value: 'month', label: 'This month' },
        { value: 'last-month', label: 'Last month' },
        { value: 'quarter', label: '3 months' },
        { value: 'fy', label: 'This FY' },
      ]}
    />
  );
}

/** A row with a name, a proportional bar and an amount, plus an optional action. */
function AmountRow({
  name,
  sub,
  amount,
  max,
  tone = 'bg-primary',
  icon,
  action,
}: {
  name: string;
  sub?: ReactNode;
  amount: number;
  max: number;
  tone?: string;
  icon?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <li className="flex items-center gap-3 py-2">
      {icon ?? <Avatar name={name} className="size-8 text-xs" />}
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-2">
          <p className="min-w-0 flex-1 truncate text-[14px] font-medium">{name}</p>
          <p
            className={cn(
              'tabular shrink-0 text-[14px] font-semibold',
              amount < 0 && 'text-destructive',
            )}
          >
            {money(amount)}
          </p>
        </div>
        <div className="mt-1 flex items-center gap-2">
          <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
            <div
              className={cn('h-full rounded-full', tone)}
              style={{ width: `${max > 0 ? Math.max(2, (Math.max(amount, 0) / max) * 100) : 0}%` }}
            />
          </div>
          {sub && <span className="shrink-0 text-[11px] text-muted-foreground">{sub}</span>}
        </div>
      </div>
      {action}
    </li>
  );
}

const academyIcon = (
  <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary/12 text-primary">
    <Building2 className="size-4" />
  </span>
);

function Stage({
  icon,
  label,
  amount,
  hint,
  tone,
}: {
  icon: ReactNode;
  label: string;
  amount: number;
  hint?: ReactNode;
  tone: string;
}) {
  return (
    <li className="relative flex items-center gap-3 py-2 pl-1">
      <span
        className={cn(
          'z-10 flex size-8 shrink-0 items-center justify-center rounded-full [&_svg]:size-4',
          tone,
        )}
      >
        {icon}
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-[13px] font-medium">{label}</p>
        {hint && <p className="truncate text-[11px] text-muted-foreground">{hint}</p>}
      </div>
      <span className="tabular shrink-0 text-[14px] font-semibold">{money(amount)}</span>
    </li>
  );
}

/** Stacked bar + legend of where fees went. */
function Distribution({
  rows,
}: {
  rows: { key: string; name: string; sub?: string; amount: number }[];
}) {
  const total = rows.reduce((s, r) => s + r.amount, 0);
  if (!total)
    return (
      <p className="py-6 text-center text-sm text-muted-foreground">
        No fees received in this period.
      </p>
    );
  return (
    <div>
      <div className="flex h-3 overflow-hidden rounded-full bg-muted">
        {rows.map((r, i) => (
          <div
            key={r.key}
            title={`${r.name}: ${money(r.amount)}`}
            className={SPLIT_COLORS[i % SPLIT_COLORS.length]}
            style={{ width: `${(r.amount / total) * 100}%` }}
          />
        ))}
      </div>
      <ul className="mt-3 space-y-1.5">
        {rows.map((r, i) => (
          <li key={r.key} className="flex items-center gap-2 text-[13px]">
            <span
              className={cn(
                'size-2.5 shrink-0 rounded-full',
                SPLIT_COLORS[i % SPLIT_COLORS.length],
              )}
            />
            <span className="min-w-0 flex-1 truncate">
              {r.name}
              {r.sub && <span className="text-muted-foreground"> · {r.sub}</span>}
            </span>
            <span className="tabular shrink-0 text-muted-foreground">
              {Math.round((r.amount / total) * 100)}%
            </span>
            <span className="tabular w-24 shrink-0 text-right font-semibold">
              {money(r.amount)}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

// ─── Admin ───────────────────────────────────────────────────────────────────

function AdminMoney({
  data,
  range,
  onOpen,
}: {
  data: AcademyFunds;
  range: { from: string; to: string };
  onOpen: (o: Open) => void;
}) {
  const b = data.balances;
  const p = data.period;
  const inHand = b.academyCash + b.withStaff;
  const [view, setView] = useState<'recipient' | 'section'>('recipient');
  const staffQ = useUsers({ pageSize: 100 });
  const people = (staffQ.data?.data ?? []).map((u) => ({ id: u.id, name: u.name }));
  const holdMax = Math.max(b.academyCash, ...b.holders.map((h) => h.amount), 1);
  const owedMax = Math.max(
    ...b.staffDue.map((s) => s.amount),
    ...b.payeeDue.map((s) => s.amount),
    1,
  );
  const categoriesMax = Math.max(...p.expensesByCategory.map((c) => c.amount), 1);

  return (
    <div className="space-y-3">
      <section aria-label="Right now">
        <div className="grid grid-cols-2 gap-2.5 lg:grid-cols-4">
          <StatCard
            label="Total in hand"
            icon={<Wallet />}
            value={money(inHand)}
            hint="Academy + with staff"
          />
          <StatCard
            label="With the academy"
            icon={<Building2 />}
            value={money(b.academyCash)}
            tone="success"
            hint="Cash / bank"
          />
          <StatCard
            label="With staff"
            icon={<Users />}
            value={money(b.withStaff)}
            tone={b.withStaff > 0 ? 'warning' : 'default'}
            hint={
              b.holders.length
                ? `${plural(b.holders.length, 'person', 'people')} to hand over`
                : 'Nothing pending'
            }
          />
          <StatCard
            label="Owed to others"
            icon={<Scale />}
            value={money(b.owedToStaff + b.owedToPayees)}
            tone={b.owedToStaff + b.owedToPayees > 0 ? 'destructive' : 'default'}
            hint={`Staff ${moneyCompact(b.owedToStaff)} · payees ${moneyCompact(b.owedToPayees)}`}
          />
        </div>
        <Card className="mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-1 px-3.5 py-2.5 text-[12px] text-muted-foreground">
          <PiggyBank className="size-4 text-primary" />
          <span>
            <b className="tabular text-foreground">{money(inHand)}</b> in hand ={' '}
            <b className="tabular text-foreground">{money(b.academyFund)}</b> academy’s own money +{' '}
            <b className="tabular text-foreground">{money(b.owedToStaff)}</b> owed to staff +{' '}
            <b className="tabular text-foreground">{money(b.owedToPayees)}</b> owed to payees
          </span>
        </Card>
      </section>

      <div className="grid gap-3 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Who holds the cash</CardTitle>
            <CardDescription>
              Money physically with the academy and with each staff member.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="divide-y">
              <AmountRow
                name="Academy"
                icon={academyIcon}
                amount={b.academyCash}
                max={holdMax}
                tone="bg-emerald-500"
              />
              {b.holders.map((h) => (
                <AmountRow
                  key={h.userId}
                  name={h.name}
                  sub={h.role === 'admin' ? 'Admin' : 'Coach'}
                  amount={h.amount}
                  max={holdMax}
                  tone="bg-amber-500"
                  action={
                    h.amount > 0 && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() =>
                          onOpen({
                            action: 'handover',
                            prefill: { userId: h.userId, amount: h.amount },
                          })
                        }
                      >
                        Received
                      </Button>
                    )
                  }
                />
              ))}
            </ul>
            {b.holders.length === 0 && (
              <p className="pt-1 text-[12px] text-muted-foreground">
                No staff member is holding cash.
              </p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Who is owed</CardTitle>
            <CardDescription>
              Shares and reimbursements the academy still has to pay.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {b.staffDue.length + b.payeeDue.length === 0 ? (
              <p className="py-4 text-center text-sm text-muted-foreground">
                Everyone is settled. 🎉
              </p>
            ) : (
              <ul className="divide-y">
                {b.staffDue.map((s) => (
                  <AmountRow
                    key={s.userId}
                    name={s.name}
                    sub={s.role === 'admin' ? 'Admin' : 'Coach'}
                    amount={s.amount}
                    max={owedMax}
                    tone="bg-violet-500"
                    action={
                      s.amount > 0 && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() =>
                            onOpen({
                              action: 'payout',
                              prefill: { userId: s.userId, amount: s.amount },
                            })
                          }
                        >
                          Pay
                        </Button>
                      )
                    }
                  />
                ))}
                {b.payeeDue.map((s) => (
                  <AmountRow
                    key={s.payeeId}
                    name={s.name}
                    sub="Payee"
                    amount={s.amount}
                    max={owedMax}
                    tone="bg-rose-500"
                    action={
                      s.amount > 0 && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() =>
                            onOpen({
                              action: 'payout',
                              prefill: { payeeId: s.payeeId, amount: s.amount },
                            })
                          }
                        >
                          Pay
                        </Button>
                      )
                    }
                  />
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-3 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Money flow</CardTitle>
            <CardDescription>
              What happened to money in this period, stage by stage.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ol className="relative before:absolute before:top-4 before:bottom-4 before:left-[19px] before:w-px before:bg-border">
              <Stage
                icon={<ArrowDownLeft />}
                tone="bg-emerald-500/14 text-emerald-700 dark:text-emerald-300"
                label="Fees received"
                amount={p.collected}
                hint={plural(p.payments, 'payment')}
              />
              <Stage
                icon={<HandCoins />}
                tone="bg-violet-500/14 text-violet-700 dark:text-violet-300"
                label="Kept by coaches as their share"
                amount={p.keptByStaff}
                hint={
                  p.keptBy.map((k) => `${k.name} ${moneyCompact(k.amount)}`).join(' · ') ||
                  undefined
                }
              />
              <Stage
                icon={<ArrowRightLeft />}
                tone="bg-sky-500/14 text-sky-700 dark:text-sky-300"
                label="Cash handed over to the academy"
                amount={p.handedOver}
              />
              <Stage
                icon={<ShoppingBag />}
                tone="bg-amber-500/16 text-amber-800 dark:text-amber-300"
                label="Spent on purchases"
                amount={p.spent}
              />
              <Stage
                icon={<HandCoins />}
                tone="bg-rose-500/14 text-rose-700 dark:text-rose-300"
                label="Paid out to staff & payees"
                amount={p.paidOut}
              />
              <Stage
                icon={<Plus />}
                tone="bg-teal-500/14 text-teal-700 dark:text-teal-300"
                label="Other income"
                amount={p.income}
              />
            </ol>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-start gap-2 space-y-0">
            <div className="mr-auto">
              <CardTitle>Where fees went</CardTitle>
              <CardDescription>
                {money(p.collected)} split by each plan’s{' '}
                <Link to="/fee-plans" className="font-medium text-primary hover:underline">
                  fee split
                </Link>
                .
              </CardDescription>
            </div>
            <Segmented
              size="sm"
              ariaLabel="Group by"
              value={view}
              onChange={setView}
              options={[
                { value: 'recipient', label: 'Who' },
                { value: 'section', label: 'Section' },
              ]}
            />
          </CardHeader>
          <CardContent>
            <Distribution
              rows={
                view === 'recipient'
                  ? p.byRecipient.map((r) => ({
                      key: r.key,
                      name: r.name,
                      sub:
                        r.kind === 'academy' ? undefined : r.kind === 'payee' ? 'payee' : 'staff',
                      amount: r.amount,
                    }))
                  : p.distribution.map((d, i) => ({
                      key: `${d.label}-${d.name}-${i}`,
                      name: d.label,
                      sub: d.name,
                      amount: d.amount,
                    }))
              }
            />
          </CardContent>
        </Card>
      </div>

      {p.expensesByCategory.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Spending by category</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="grid gap-x-6 sm:grid-cols-2">
              {p.expensesByCategory.map((c) => (
                <AmountRow
                  key={c.category}
                  name={categoryLabel(c.category)}
                  sub={plural(c.count, 'purchase')}
                  amount={c.amount}
                  max={categoriesMax}
                  tone="bg-amber-500"
                  icon={
                    <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-amber-500/15 text-amber-700">
                      <ShoppingBag className="size-4" />
                    </span>
                  }
                />
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      <Ledger range={range} people={people} />
    </div>
  );
}

// ─── Coach ───────────────────────────────────────────────────────────────────

function CoachMoney({ data, range }: { data: MyFunds; range: { from: string; to: string } }) {
  const p = data.period;
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-2.5 lg:grid-cols-4">
        <StatCard
          label="Cash with me"
          icon={<Wallet />}
          value={money(data.cash)}
          tone={data.cash > 0 ? 'warning' : 'default'}
          hint={data.cash > 0 ? 'Belongs to the academy' : 'Nothing to hand over'}
        />
        <StatCard
          label="Academy owes me"
          icon={<Landmark />}
          value={money(data.due)}
          tone={data.due > 0 ? 'success' : 'default'}
          hint="Shares & reimbursements"
        />
        <StatCard
          label="My share"
          icon={<Split />}
          value={money(p.earned)}
          hint={`Kept ${moneyCompact(p.kept)} from cash`}
        />
        <StatCard
          label="Spent"
          icon={<ShoppingBag />}
          value={money(p.spent)}
          hint="Purchases this period"
        />
      </div>

      <div className="grid gap-3 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>My money flow</CardTitle>
            <CardDescription>Fees you received and what happened to the cash.</CardDescription>
          </CardHeader>
          <CardContent>
            <ol className="relative before:absolute before:top-4 before:bottom-4 before:left-[19px] before:w-px before:bg-border">
              <Stage
                icon={<ArrowDownLeft />}
                tone="bg-emerald-500/14 text-emerald-700 dark:text-emerald-300"
                label="Fees I received"
                amount={p.collected}
              />
              <Stage
                icon={<HandCoins />}
                tone="bg-violet-500/14 text-violet-700 dark:text-violet-300"
                label="My share kept from that cash"
                amount={p.kept}
              />
              <Stage
                icon={<ArrowRightLeft />}
                tone="bg-sky-500/14 text-sky-700 dark:text-sky-300"
                label="Handed over to the academy"
                amount={p.handedOver}
              />
              <Stage
                icon={<ShoppingBag />}
                tone="bg-amber-500/16 text-amber-800 dark:text-amber-300"
                label="Spent on purchases"
                amount={p.spent}
              />
              <Stage
                icon={<Landmark />}
                tone="bg-rose-500/14 text-rose-700 dark:text-rose-300"
                label="Paid to me by the academy"
                amount={p.paidToMe}
              />
            </ol>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>My share by section</CardTitle>
            <CardDescription>What you earned from fees in this period.</CardDescription>
          </CardHeader>
          <CardContent>
            <Distribution
              rows={p.earnedBy.map((r, i) => ({
                key: `${r.label}-${i}`,
                name: r.label ?? 'Share',
                amount: r.amount,
              }))}
            />
          </CardContent>
        </Card>
      </div>
      <Ledger range={range} />
    </div>
  );
}

// ─── Page ────────────────────────────────────────────────────────────────────

export function MoneyPage() {
  const user = useUser();
  const admin = user.role === 'admin';
  const [preset, setPreset] = useState<FinancePreset>('month');
  const range = useMemo(() => financeRange(preset), [preset]);
  const q = useFundsOverview(range);
  const [open, setOpen] = useState<Open>(null);
  const funds = q.data?.scope === 'academy' ? q.data : undefined;
  const mine = q.data?.scope === 'self' ? q.data : undefined;

  const actions = admin ? (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button>
          <Plus /> Record <ChevronDown />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onSelect={() => setOpen({ action: 'expense' })}>
          <ShoppingBag /> Purchase / expense
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => setOpen({ action: 'handover' })}>
          <ArrowRightLeft /> Cash received from staff
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => setOpen({ action: 'payout' })}>
          <HandCoins /> Pay staff or payee
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => setOpen({ action: 'income' })}>
          <ArrowDownLeft /> Other income
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  ) : (
    <div className="flex gap-2">
      <Button variant="outline" onClick={() => setOpen({ action: 'expense' })}>
        <ShoppingBag /> Purchase
      </Button>
      <Button
        onClick={() =>
          setOpen({ action: 'handover', prefill: { amount: mine?.cash || undefined } })
        }
        disabled={!mine?.cash}
      >
        <ArrowRightLeft /> Hand over cash
      </Button>
    </div>
  );

  return (
    <div>
      <PageHeader
        title={admin ? 'Money' : 'My money'}
        description={
          admin
            ? 'Who holds the money, who is owed, where fees went, and every movement.'
            : 'Cash you hold for the academy, what you are owed, and your purchases.'
        }
        actions={actions}
      />
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <PeriodPicker value={preset} onChange={setPreset} />
        {q.isFetching && !q.isPending && <Badge variant="muted">Updating…</Badge>}
      </div>
      {q.isPending ? (
        <ListSkeleton rows={5} />
      ) : q.isError ? (
        <ErrorState error={q.error} onRetry={() => void q.refetch()} />
      ) : funds ? (
        <AdminMoney data={funds} range={range} onOpen={setOpen} />
      ) : mine ? (
        <CoachMoney data={mine} range={range} />
      ) : null}
      {open && (
        <MoneyActionDialog
          action={open.action}
          prefill={open.prefill}
          funds={funds}
          myCash={mine?.cash}
          onClose={() => setOpen(null)}
        />
      )}
    </div>
  );
}
