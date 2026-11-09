import {
  ArrowUp,
  Building2,
  ChevronRight,
  CornerDownRight,
  Pencil,
  RotateCcw,
  Split,
  Store,
  UserRound,
  UsersRound,
} from 'lucide-react';
import { useMemo, useState, type ReactNode } from 'react';
import { MoneyInput } from '@/components/common';
import { Button } from '@/components/ui/button';
import {
  Badge,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/primitives';
import { money, moneyCompact, plural } from '@/lib/format';
import { allocate, formatPercent, recipientLabel, SPLIT_COLORS } from '@/lib/split';
import type { FeePlan, SplitNode } from '@/lib/types';
import { byRecipient, usePeople, type People } from './split-data';
import { cn } from '@/lib/utils';

function RecipientChip({ n, people }: { n: SplitNode; people: People }) {
  const icon =
    n.recipient === 'payee' ? (
      <Store />
    ) : n.recipient === 'staff' ? (
      <UserRound />
    ) : n.recipient === 'batch_coach' ? (
      <UsersRound />
    ) : (
      <Building2 />
    );
  return (
    <span className="inline-flex max-w-full items-center gap-1 truncate rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground [&_svg]:size-3 [&_svg]:shrink-0">
      {icon}
      <span className="truncate">{recipientLabel(n, people.staff, people.payees)}</span>
    </span>
  );
}

/** How a node's amount is worked out, relative to its parent. */
function ruleText(n: SplitNode, parent: string, hasFlats: boolean) {
  if (n.kind === 'flat') return `${money(n.value)} flat from ${parent}`;
  return `${formatPercent(n.value)} of ${parent}${hasFlats ? ' after flat amounts' : ''}`;
}

interface Row {
  path: string;
  node: SplitNode;
  amount: number;
  depth: 1 | 2;
  parentPath: string | null;
  parentName: string;
  color: string;
  rule: string;
}

function buildRows(tree: SplitNode[], amount: number, planName: string): Row[] {
  const rows: Row[] = [];
  const topFlats = tree.some((n) => n.kind === 'flat');
  const parts = allocate(tree, amount);
  let leaf = 0;
  tree.forEach((n, i) => {
    const color = SPLIT_COLORS[i % SPLIT_COLORS.length]!;
    rows.push({
      path: `${i}`,
      node: n,
      amount: parts[i] ?? 0,
      depth: 1,
      parentPath: null,
      parentName: 'the fee',
      color,
      rule: ruleText(n, `the ${planName} fee`, topFlats && n.kind === 'percent'),
    });
    const childParts = allocate(n.children, parts[i] ?? 0);
    const childFlats = n.children.some((c) => c.kind === 'flat');
    n.children.forEach((c, j) => {
      rows.push({
        path: `${i}.${j}`,
        node: c,
        amount: childParts[j] ?? 0,
        depth: 2,
        parentPath: `${i}`,
        parentName: n.name,
        color: SPLIT_COLORS[(leaf + j) % SPLIT_COLORS.length]!,
        rule: ruleText(c, n.name, childFlats && c.kind === 'percent'),
      });
    });
    leaf += n.children.length || 1;
  });
  return rows;
}

function Bar({
  rows,
  total,
}: {
  rows: { key: string; amount: number; name: string }[];
  total: number;
}) {
  return (
    <div className="flex h-2.5 overflow-hidden rounded-full bg-muted">
      {rows.map((r, i) => (
        <div
          key={r.key}
          title={`${r.name}: ${money(r.amount)}`}
          className={SPLIT_COLORS[i % SPLIT_COLORS.length]}
          style={{ width: `${total ? (r.amount / total) * 100 : 0}%` }}
        />
      ))}
    </div>
  );
}

/**
 * Interactive distribution of one plan: the fee at the top, its sections, and sub-sections linked
 * to their parent. Tapping a section highlights its path; the preview amount can be changed to see
 * a discounted or custom fee.
 */
export function PlanSplitPanel({
  plan,
  onEditSplit,
  onEditPlan,
}: {
  plan: FeePlan;
  onEditSplit: () => void;
  onEditPlan: () => void;
}) {
  const people = usePeople();
  const tree = useMemo(() => plan.split ?? [], [plan.split]);
  const [amount, setAmount] = useState<number | null>(plan.monthlyFee);
  const [focus, setFocus] = useState<string | null>(null);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const fee = amount ?? 0;
  const rows = useMemo(() => buildRows(tree, fee, plan.name), [tree, fee, plan.name]);
  const recipients = useMemo(() => byRecipient(tree, fee, people), [tree, fee, people]);
  const students = plan.activeStudents ?? 0;
  const lit = (r: Row) =>
    !focus || focus === r.path || focus.startsWith(`${r.path}.`) || r.path.startsWith(`${focus}.`);

  const toggle = (path: string) =>
    setCollapsed((s) => {
      const n = new Set(s);
      if (n.has(path)) n.delete(path);
      else n.add(path);
      return n;
    });

  const header: ReactNode = (
    <CardHeader className="flex flex-row flex-wrap items-start gap-2 space-y-0">
      <div className="mr-auto min-w-0">
        <CardTitle className="flex items-center gap-2">
          {plan.name}
          {!plan.isActive && <Badge variant="muted">Retired</Badge>}
        </CardTitle>
        <CardDescription>
          {money(plan.monthlyFee)}/month · {plan.daysPerWeek}{' '}
          {plan.daysPerWeek === 1 ? 'day' : 'days'} a week · {plural(students, 'student')}
        </CardDescription>
      </div>
      <Button size="sm" variant="outline" onClick={onEditPlan}>
        <Pencil /> Plan
      </Button>
      <Button size="sm" onClick={onEditSplit}>
        <Split /> {tree.length ? 'Edit split' : 'Set up split'}
      </Button>
    </CardHeader>
  );

  if (!tree.length) {
    return (
      <Card>
        {header}
        <CardContent>
          <div className="rounded-2xl border border-dashed p-5 text-center">
            <Split className="mx-auto size-8 text-muted-foreground" />
            <p className="mt-2 font-semibold">No split yet</p>
            <p className="mx-auto mt-1 max-w-sm text-sm text-muted-foreground">
              Every rupee of this plan goes to the academy. Split it between the academy, the batch
              coach, staff and payees, with percentages or flat amounts, up to two levels deep.
            </p>
            <Button className="mt-3" onClick={onEditSplit}>
              <Split /> Set up split
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      {header}
      <CardContent className="space-y-4">
        <div className="flex flex-wrap items-end gap-3 rounded-2xl bg-muted/40 p-3">
          <div className="w-40">
            <p className="mb-1 text-[11px] font-medium text-muted-foreground">Preview a fee of</p>
            <MoneyInput
              aria-label="Preview fee"
              value={amount}
              onChange={setAmount}
              className="h-9"
            />
          </div>
          {fee !== plan.monthlyFee && (
            <Button size="sm" variant="ghost" onClick={() => setAmount(plan.monthlyFee)}>
              <RotateCcw /> List price
            </Button>
          )}
          <div className="min-w-40 flex-1">
            <Bar rows={recipients} total={fee} />
            <p className="mt-1 truncate text-[11px] text-muted-foreground">
              {recipients
                .map((r) => `${r.name} ${fee ? Math.round((r.amount / fee) * 100) : 0}%`)
                .join(' · ')}
            </p>
          </div>
        </div>

        <div role="tree" aria-label={`Distribution of ${plan.name}`} className="text-[13px]">
          <div className="flex items-center gap-2 rounded-xl bg-primary/8 px-3 py-2">
            <span className="flex size-7 items-center justify-center rounded-lg bg-primary text-primary-foreground">
              ₹
            </span>
            <span className="flex-1 font-semibold">Fee received</span>
            <span className="tabular font-bold">{money(fee)}</span>
          </div>
          <ul className="mt-1 ml-3.5 space-y-1 border-l-2 border-primary/20 pl-3">
            {rows
              .filter((r) => r.depth === 1)
              .map((r) => {
                const kids = rows.filter((c) => c.parentPath === r.path);
                const open = !collapsed.has(r.path);
                return (
                  <li
                    key={r.path}
                    role="treeitem"
                    aria-expanded={kids.length ? open : undefined}
                    aria-selected={focus === r.path}
                  >
                    <NodeRow
                      r={r}
                      fee={fee}
                      people={people}
                      dim={!lit(r)}
                      onFocus={() => setFocus((f) => (f === r.path ? null : r.path))}
                      toggle={kids.length ? () => toggle(r.path) : undefined}
                      open={open}
                    />
                    {kids.length > 0 && open && (
                      <ul
                        role="group"
                        className="mt-1 ml-5 space-y-1 border-l-2 border-dashed pl-3"
                      >
                        {kids.map((c) => (
                          <li key={c.path} role="treeitem" aria-selected={focus === c.path}>
                            <NodeRow
                              r={c}
                              fee={fee}
                              people={people}
                              dim={!lit(c)}
                              onFocus={() => setFocus((f) => (f === c.path ? null : c.path))}
                              onParent={() => setFocus(r.path)}
                            />
                          </li>
                        ))}
                      </ul>
                    )}
                  </li>
                );
              })}
          </ul>
        </div>

        <div>
          <p className="mb-2 text-[12px] font-semibold text-muted-foreground">
            Each recipient gets in total
          </p>
          <ul className="grid max-w-md gap-y-1.5">
            {recipients.map((r, i) => (
              <li key={r.key} className="flex items-center gap-2 text-[13px]">
                <span
                  className={cn(
                    'size-2.5 shrink-0 rounded-full',
                    SPLIT_COLORS[i % SPLIT_COLORS.length],
                  )}
                />
                <span className="min-w-0 flex-1 truncate">{r.name}</span>
                <span className="tabular font-semibold">{money(r.amount)}</span>
                {students > 0 && (
                  <span className="tabular w-20 text-right text-[11px] text-muted-foreground">
                    {moneyCompact(r.amount * students)}/mo
                  </span>
                )}
              </li>
            ))}
          </ul>
          {students > 0 && (
            <p className="mt-2 text-[11px] text-muted-foreground">
              “/mo” is for all {plural(students, 'student')} at this preview fee, before discounts.
            </p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function NodeRow({
  r,
  fee,
  people,
  dim,
  open,
  onFocus,
  toggle,
  onParent,
}: {
  r: Row;
  fee: number;
  people: People;
  dim: boolean;
  open?: boolean;
  onFocus: () => void;
  toggle?: () => void;
  onParent?: () => void;
}) {
  const divided = r.node.children.length > 0;
  const share = fee ? (r.amount / fee) * 100 : 0;
  return (
    <div
      className={cn(
        'group rounded-xl border bg-card px-2.5 py-2 transition-opacity',
        dim && 'opacity-40',
        r.depth === 2 && 'bg-muted/20',
      )}
    >
      <div className="flex items-center gap-2">
        {toggle ? (
          <button
            type="button"
            onClick={toggle}
            aria-label={open ? `Collapse ${r.node.name}` : `Expand ${r.node.name}`}
            className="flex size-5 shrink-0 cursor-pointer items-center justify-center rounded text-muted-foreground hover:bg-muted"
          >
            <ChevronRight className={cn('size-4 transition-transform', open && 'rotate-90')} />
          </button>
        ) : r.depth === 2 ? (
          <CornerDownRight className="size-4 shrink-0 text-muted-foreground" />
        ) : (
          <span className="size-5 shrink-0" />
        )}
        <span
          className={cn(
            'size-2.5 shrink-0 rounded-full',
            divided ? 'bg-muted-foreground/40' : r.color,
          )}
        />
        <button
          type="button"
          onClick={onFocus}
          className="min-w-0 flex-1 cursor-pointer truncate text-left font-semibold hover:underline"
        >
          {r.node.name}
        </button>
        <Badge variant="muted" className="tabular shrink-0">
          {r.node.kind === 'flat' ? `${money(r.node.value)} flat` : formatPercent(r.node.value)}
        </Badge>
        <span className="tabular w-20 shrink-0 text-right font-bold">{money(r.amount)}</span>
      </div>
      <div className="mt-1 flex flex-wrap items-center gap-1.5 pl-7">
        {divided ? (
          <span className="text-[11px] text-muted-foreground">
            Divided into {plural(r.node.children.length, 'sub-section')}
          </span>
        ) : (
          <RecipientChip n={r.node} people={people} />
        )}
        <span className="truncate text-[11px] text-muted-foreground">{r.rule}</span>
        {onParent && (
          <button
            type="button"
            onClick={onParent}
            className="inline-flex cursor-pointer items-center gap-0.5 text-[11px] font-medium text-primary hover:underline"
          >
            <ArrowUp className="size-3" /> {r.parentName}
          </button>
        )}
        <span className="tabular ml-auto text-[11px] text-muted-foreground">
          {share.toFixed(1)}% of fee
        </span>
      </div>
      {r.node.kind === 'flat' && r.amount < r.node.value && (
        <p className="mt-1 pl-7 text-[11px] font-medium text-amber-600">
          Only {money(r.amount)} of {money(r.node.value)} covered at this fee
        </p>
      )}
    </div>
  );
}

/** Where a month of list-price fees goes across all active plans. */
export function AllPlansDistribution({ plans }: { plans: FeePlan[] }) {
  const people = usePeople();
  const { rows, total, unsplit } = useMemo(() => {
    const map = new Map<string, { key: string; name: string; amount: number }>();
    let sum = 0;
    let none = 0;
    for (const p of plans) {
      const n = p.activeStudents ?? 0;
      if (!p.isActive || !n) continue;
      const tree = p.split?.length ? p.split : [];
      if (!tree.length) none++;
      const rs = tree.length
        ? byRecipient(tree, p.monthlyFee, people)
        : [{ key: 'academy', name: 'Academy', amount: p.monthlyFee }];
      for (const r of rs) {
        const row = map.get(r.key) ?? { ...r, amount: 0 };
        row.amount += r.amount * n;
        map.set(r.key, row);
      }
      sum += p.monthlyFee * n;
    }
    return {
      rows: [...map.values()].sort((a, b) => b.amount - a.amount),
      total: sum,
      unsplit: none,
    };
  }, [plans, people]);

  if (!total) return null;
  return (
    <Card className="p-3">
      <div className="flex items-baseline justify-between gap-2">
        <p className="text-[13px] font-semibold">Where a month of fees goes</p>
        <p className="tabular text-[13px] font-bold">{money(total)}</p>
      </div>
      <div className="mt-2">
        <Bar rows={rows} total={total} />
      </div>
      <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1">
        {rows.map((r, i) => (
          <li key={r.key} className="flex items-center gap-1.5 text-[12px]">
            <span className={cn('size-2 rounded-full', SPLIT_COLORS[i % SPLIT_COLORS.length])} />
            {r.name}
            <span className="tabular font-semibold">{moneyCompact(r.amount)}</span>
          </li>
        ))}
      </ul>
      {unsplit > 0 && (
        <p className="mt-1.5 text-[11px] text-amber-600">
          {plural(unsplit, 'plan')} with students {unsplit === 1 ? 'has' : 'have'} no split yet; all
          of it goes to the academy.
        </p>
      )}
    </Card>
  );
}
