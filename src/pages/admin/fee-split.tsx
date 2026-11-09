import {
  AlertTriangle,
  CheckCircle2,
  CornerDownRight,
  Plus,
  Split,
  Trash2,
  UsersRound,
} from 'lucide-react';
import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Field, MoneyInput } from '@/components/common';
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
import { Badge, Input, Select } from '@/components/ui/primitives';
import { errorMessage } from '@/lib/api';
import { money, startOfMonth, today } from '@/lib/format';
import { usePayees, useResplit, useSavePayee, useSaveSplit, useUsers } from '@/lib/queries';
import {
  FULL,
  MAX_SECTIONS,
  formatPercent,
  nodeAmounts,
  percentTotal,
  previewShares,
  recipientLabel,
  SPLIT_COLORS,
  validateTree,
} from '@/lib/split';
import type { FeePlan, Payee, SplitNode, User } from '@/lib/types';
import { cn } from '@/lib/utils';

/** Editor rows carry a client-only key so inputs stay attached to the right row. */
type EditNode = Omit<SplitNode, 'children'> & { key: string; children: EditNode[] };

let seq = 0;
const nextKey = () => `s${++seq}`;
const withKeys = (nodes: SplitNode[]): EditNode[] =>
  nodes.map((n) => ({ ...n, key: nextKey(), children: withKeys(n.children) }));

const blank = (over: Partial<SplitNode> = {}): EditNode => ({
  key: nextKey(),
  name: '',
  kind: 'percent',
  value: 0,
  recipient: 'academy',
  userId: null,
  payeeId: null,
  ...over,
  children: [],
});

const TEMPLATE: SplitNode[] = [
  blank({ name: 'Academy', value: 5000 }),
  blank({ name: 'Coach', value: 5000, recipient: 'batch_coach' }),
];

const stripKeys = (nodes: EditNode[]): SplitNode[] =>
  nodes.map(({ key: _k, children, ...n }) => ({ ...n, children: stripKeys(children) }));

/** Compact stacked bar of where a plan's monthly fee goes, used on plan cards. */
export function SplitBar({ plan, onEdit }: { plan: FeePlan; onEdit: () => void }) {
  const tree = plan.split ?? [];
  const lines = previewShares(tree.length ? tree : TEMPLATE.slice(0, 1), plan.monthlyFee);
  const total = Math.max(plan.monthlyFee, 1);
  return (
    <button
      type="button"
      onClick={onEdit}
      aria-label={`Fee split for ${plan.name}`}
      className="mt-2 block w-full cursor-pointer rounded-lg text-left focus-visible:outline-2"
    >
      <div className="flex h-1.5 overflow-hidden rounded-full bg-muted">
        {tree.length ? (
          lines.map((l, i) => (
            <div
              key={l.label}
              className={SPLIT_COLORS[i % SPLIT_COLORS.length]}
              style={{ width: `${(l.amount / total) * 100}%` }}
            />
          ))
        ) : (
          <div className="w-full bg-muted-foreground/25" />
        )}
      </div>
      <p className="mt-1 flex items-center gap-1 truncate text-[11px] text-muted-foreground">
        <Split className="size-3 shrink-0" />
        {tree.length
          ? lines.map((l) => `${l.label.split(' › ').at(-1)} ${money(l.amount)}`).join(' · ')
          : 'No split set · all to the academy'}
      </p>
    </button>
  );
}

/** Text field for a percentage (shown as %, stored as basis points) or a rupee amount (paise). */
function ValueInput({ node, onChange }: { node: SplitNode; onChange: (value: number) => void }) {
  if (node.kind === 'flat')
    return (
      <MoneyInput
        aria-label="Amount"
        value={node.value || null}
        onChange={(v) => onChange(v ?? 0)}
        className="tabular h-9"
      />
    );
  return (
    <Input
      aria-label="Percentage"
      inputMode="decimal"
      className="tabular h-9"
      trailing="%"
      defaultValue={node.value ? String(node.value / 100) : ''}
      onChange={(e) => {
        const n = Number(e.target.value.replace(/[^\d.]/g, ''));
        onChange(Number.isFinite(n) ? Math.round(n * 100) : 0);
      }}
    />
  );
}

function SectionRow({
  node,
  amount,
  depth,
  color,
  staff,
  payees,
  error,
  onChange,
  onRemove,
}: {
  node: EditNode;
  amount: number;
  depth: 1 | 2;
  color: string;
  staff: User[];
  payees: Payee[];
  error?: string;
  onChange: (n: EditNode) => void;
  onRemove: () => void;
}) {
  const divided = node.children.length > 0;
  const recipientValue = divided
    ? 'divide'
    : node.recipient === 'staff'
      ? `staff:${node.userId ?? ''}`
      : node.recipient === 'payee'
        ? `payee:${node.payeeId ?? ''}`
        : (node.recipient ?? '');

  function setRecipient(v: string) {
    if (v === 'divide')
      return onChange({
        ...node,
        recipient: null,
        userId: null,
        payeeId: null,
        children: [blank({ name: node.name || 'Academy', value: FULL })],
      });
    const [kind, id] = v.split(':');
    onChange({
      ...node,
      recipient: kind as SplitNode['recipient'],
      userId: kind === 'staff' ? (id ?? null) : null,
      payeeId: kind === 'payee' ? (id ?? null) : null,
      children: [],
    });
  }

  return (
    <div className={cn('rounded-xl border bg-card p-2', error && 'border-destructive/60')}>
      <div className="flex items-center gap-2">
        {depth === 2 ? (
          <CornerDownRight className="size-4 shrink-0 text-muted-foreground" />
        ) : (
          <span className={cn('size-2.5 shrink-0 rounded-full', color)} />
        )}
        <Input
          aria-label="Section name"
          className="h-9 min-w-0 flex-1"
          placeholder={depth === 1 ? 'e.g. Academy' : 'e.g. Society'}
          value={node.name}
          maxLength={60}
          onChange={(e) => onChange({ ...node, name: e.target.value })}
        />
        <span className="tabular w-20 shrink-0 text-right text-[13px] font-semibold">
          {money(amount)}
        </span>
        <Button
          variant="ghost"
          size="icon"
          className="size-8 shrink-0"
          aria-label={`Remove ${node.name || 'section'}`}
          onClick={onRemove}
        >
          <Trash2 />
        </Button>
      </div>
      <div className="mt-2 grid grid-cols-[auto_minmax(0,6.5rem)_minmax(0,1fr)] items-center gap-2">
        <Segmented
          size="sm"
          ariaLabel="Type"
          value={node.kind}
          onChange={(kind) => onChange({ ...node, kind, value: 0 })}
          options={[
            { value: 'percent', label: '%' },
            { value: 'flat', label: '₹' },
          ]}
        />
        <ValueInput
          key={node.kind}
          node={node}
          onChange={(value) => onChange({ ...node, value })}
        />
        <Select
          aria-label="Goes to"
          pickerTitle="Goes to"
          className="h-9"
          value={recipientValue}
          onChange={(e) => setRecipient(e.target.value)}
        >
          <option value="academy">Academy</option>
          <option value="batch_coach">Batch coach</option>
          {staff.length > 0 && (
            <optgroup label="Staff member">
              {staff.map((u) => (
                <option key={u.id} value={`staff:${u.id}`}>
                  {u.name}
                </option>
              ))}
            </optgroup>
          )}
          {payees.length > 0 && (
            <optgroup label="Payee">
              {payees.map((p) => (
                <option key={p.id} value={`payee:${p.id}`}>
                  {p.name}
                </option>
              ))}
            </optgroup>
          )}
          {depth === 1 && <option value="divide">Divide into sub-sections…</option>}
        </Select>
      </div>
      {error && <p className="mt-1.5 text-xs font-medium text-destructive">{error}</p>}
    </div>
  );
}

function LevelTotal({ nodes }: { nodes: SplitNode[] }) {
  const total = percentTotal(nodes);
  const okay = total === FULL;
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 text-[11px] font-semibold',
        okay ? 'text-emerald-600 dark:text-emerald-400' : 'text-amber-600 dark:text-amber-400',
      )}
    >
      {okay ? <CheckCircle2 className="size-3.5" /> : <AlertTriangle className="size-3.5" />}
      {formatPercent(total)} of 100%
    </span>
  );
}

export function PayeesDialog({ onClose }: { onClose: () => void }) {
  const q = usePayees();
  const save = useSavePayee();
  const [name, setName] = useState('');

  async function add() {
    if (!name.trim()) return;
    try {
      await save.mutateAsync({ name: name.trim() });
      setName('');
    } catch (err) {
      toast.error('Could not add payee', { description: errorMessage(err) });
    }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Payees</DialogTitle>
          <DialogDescription>
            Outside parties that get a share of fees, such as a society, ground owner or federation.
          </DialogDescription>
        </DialogHeader>
        <div className="flex gap-2">
          <Input
            aria-label="New payee name"
            placeholder="e.g. Residents’ society"
            value={name}
            maxLength={80}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && void add()}
          />
          <Button onClick={() => void add()} loading={save.isPending} disabled={!name.trim()}>
            <Plus /> Add
          </Button>
        </div>
        <div className="divide-y rounded-xl border">
          {(q.data ?? []).map((p) => (
            <div key={p.id} className="flex items-center gap-2 px-3 py-2">
              <span
                className={cn(
                  'min-w-0 flex-1 truncate text-sm',
                  !p.isActive && 'line-through opacity-60',
                )}
              >
                {p.name}
              </span>
              <Button
                size="sm"
                variant="ghost"
                onClick={() =>
                  save.mutate(
                    { id: p.id, isActive: !p.isActive },
                    { onError: (err) => toast.error(errorMessage(err)) },
                  )
                }
              >
                {p.isActive ? 'Retire' : 'Restore'}
              </Button>
            </div>
          ))}
          {q.data?.length === 0 && (
            <p className="px-3 py-4 text-center text-sm text-muted-foreground">No payees yet.</p>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function SplitDialog({ plan, onClose }: { plan: FeePlan; onClose: () => void }) {
  const save = useSaveSplit();
  const resplit = useResplit();
  const users = useUsers({ status: 'active', pageSize: 100 });
  const payeesQ = usePayees();
  const [tree, setTree] = useState<EditNode[]>(() =>
    withKeys(plan.split?.length ? plan.split : TEMPLATE),
  );
  const [example, setExample] = useState<number | null>(plan.monthlyFee);
  const [recalc, setRecalc] = useState(false);
  const [recalcFrom, setRecalcFrom] = useState(startOfMonth(today()));
  const [payeesOpen, setPayeesOpen] = useState(false);

  const staff = users.data?.data ?? [];
  const allPayees = payeesQ.data ?? [];
  const payees = allPayees.filter(
    (p) => p.isActive || tree.some((n) => [n, ...n.children].some((c) => c.payeeId === p.id)),
  );
  const amount = example ?? 0;
  const amounts = useMemo(() => nodeAmounts(tree, amount), [tree, amount]);
  const lines = useMemo(() => previewShares(tree, amount), [tree, amount]);
  const errors = useMemo(() => validateTree(tree), [tree]);
  const errorAt = (path: string) => errors.find((e) => e.path === path)?.message;
  const levelError = errorAt;

  const update = (i: number, n: EditNode) => setTree((t) => t.map((x, k) => (k === i ? n : x)));
  const updateChild = (i: number, j: number, c: EditNode) =>
    setTree((t) =>
      t.map((x, k) =>
        k === i ? { ...x, children: x.children.map((y, m) => (m === j ? c : y)) } : x,
      ),
    );
  const removeChild = (i: number, j: number) =>
    setTree((t) =>
      t.map((x, k) => {
        if (k !== i) return x;
        const children = x.children.filter((_, m) => m !== j);
        // Removing the last sub-section turns the section back into a direct share.
        return children.length ? { ...x, children } : { ...x, recipient: 'academy', children };
      }),
    );

  async function submit() {
    if (errors.length) return toast.error(errors[0]!.message);
    try {
      await save.mutateAsync({ planId: plan.id, sections: stripKeys(tree) });
      let note = 'Applies to fees received from now on.';
      if (recalc) {
        const r = await resplit.mutateAsync({ feePlanId: plan.id, from: recalcFrom, to: today() });
        note = `Recalculated ${r.updated} past payment${r.updated === 1 ? '' : 's'} too.`;
      }
      toast.success('Fee split saved', { description: note });
      onClose();
    } catch (err) {
      toast.error('Could not save the split', { description: errorMessage(err) });
    }
  }

  async function clearSplit() {
    try {
      await save.mutateAsync({ planId: plan.id, sections: [] });
      toast.success('Split removed', { description: 'Fees on this plan now go to the academy.' });
      onClose();
    } catch (err) {
      toast.error('Could not remove the split', { description: errorMessage(err) });
    }
  }

  const total = Math.max(amount, 1);

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Fee split · {plan.name}</DialogTitle>
          <DialogDescription>
            On each level, flat amounts come off first and percentages share what is left (they must
            add up to 100%). A section can be divided once more into sub-sections.
          </DialogDescription>
        </DialogHeader>

        <div className="rounded-2xl border bg-muted/30 p-3">
          <div className="flex items-end gap-3">
            <Field label="Preview for a fee of" className="w-40 shrink-0">
              <MoneyInput value={example} onChange={setExample} className="tabular h-9" />
            </Field>
            <div className="min-w-0 flex-1 pb-1">
              <div className="flex h-3 overflow-hidden rounded-full bg-muted">
                {lines.map((l, i) => (
                  <div
                    key={`${l.label}-${i}`}
                    title={`${l.label}: ${money(l.amount)}`}
                    className={cn('transition-all', SPLIT_COLORS[i % SPLIT_COLORS.length])}
                    style={{ width: `${(l.amount / total) * 100}%` }}
                  />
                ))}
              </div>
            </div>
          </div>
          <ul className="mt-2.5 grid gap-x-4 gap-y-1 sm:grid-cols-2">
            {lines.map((l, i) => (
              <li key={`${l.label}-${i}`} className="flex min-w-0 items-center gap-2 text-[12px]">
                <span
                  className={cn(
                    'size-2 shrink-0 rounded-full',
                    SPLIT_COLORS[i % SPLIT_COLORS.length],
                  )}
                />
                <span className="min-w-0 flex-1 truncate">
                  {l.label}
                  <span className="text-muted-foreground">
                    {' '}
                    → {recipientLabel(l.node, staff, allPayees)}
                  </span>
                </span>
                <span className="tabular shrink-0 font-semibold">{money(l.amount)}</span>
              </li>
            ))}
          </ul>
        </div>

        <div className="flex items-center justify-between">
          <p className="text-sm font-semibold">Sections</p>
          <LevelTotal nodes={tree} />
        </div>
        {levelError('') && (
          <p className="-mt-2 text-xs font-medium text-destructive">{levelError('')}</p>
        )}

        <div className="space-y-2">
          {tree.map((n, i) => (
            <div key={n.key} className="space-y-1.5">
              <SectionRow
                node={n}
                depth={1}
                amount={amounts[`${i}`] ?? 0}
                color={SPLIT_COLORS[i % SPLIT_COLORS.length]!}
                staff={staff}
                payees={payees}
                error={errorAt(`${i}`)}
                onChange={(x) => update(i, x)}
                onRemove={() => setTree((t) => t.filter((_, k) => k !== i))}
              />
              {n.children.length > 0 && (
                <div className="ml-4 space-y-1.5 border-l-2 border-dashed pl-3">
                  <div className="flex items-center justify-between">
                    <p className="text-[11px] font-medium text-muted-foreground">
                      {n.name || 'This section'}’s {money(amounts[`${i}`] ?? 0)} is divided into
                    </p>
                    <LevelTotal nodes={n.children} />
                  </div>
                  {levelError(`${i}.children`) && (
                    <p className="text-xs font-medium text-destructive">
                      {levelError(`${i}.children`)}
                    </p>
                  )}
                  {n.children.map((c, j) => (
                    <SectionRow
                      key={c.key}
                      node={c}
                      depth={2}
                      amount={amounts[`${i}.${j}`] ?? 0}
                      color=""
                      staff={staff}
                      payees={payees}
                      error={errorAt(`${i}.children.${j}`)}
                      onChange={(x) => updateChild(i, j, x)}
                      onRemove={() => removeChild(i, j)}
                    />
                  ))}
                  {n.children.length < MAX_SECTIONS && (
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => update(i, { ...n, children: [...n.children, blank()] })}
                    >
                      <Plus /> Add sub-section
                    </Button>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {tree.length < MAX_SECTIONS && (
            <Button size="sm" variant="outline" onClick={() => setTree((t) => [...t, blank()])}>
              <Plus /> Add section
            </Button>
          )}
          <Button size="sm" variant="ghost" onClick={() => setPayeesOpen(true)}>
            <UsersRound /> Payees
            {allPayees.length > 0 && <Badge variant="muted">{allPayees.length}</Badge>}
          </Button>
        </div>

        <div className="rounded-xl border p-3">
          <label className="flex items-start gap-2.5 text-sm">
            <Checkbox
              checked={recalc}
              onCheckedChange={(v) => setRecalc(v === true)}
              className="mt-0.5"
            />
            <span>
              Also recalculate fees already received on this plan
              <span className="block text-xs text-muted-foreground">
                Otherwise the new split applies to fees received from now on. Cash stays with
                whoever holds it.
              </span>
            </span>
          </label>
          {recalc && (
            <Field label="Received on or after" className="mt-2 w-48">
              <Input
                type="date"
                value={recalcFrom}
                max={today()}
                onChange={(e) => setRecalcFrom(e.target.value)}
              />
            </Field>
          )}
        </div>

        <DialogFooter className="sm:justify-between">
          {plan.split?.length ? (
            <Button variant="ghost" className="text-destructive" onClick={() => void clearSplit()}>
              Remove split
            </Button>
          ) : (
            <span />
          )}
          <div className="flex flex-col-reverse gap-2 sm:flex-row">
            <Button variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button
              loading={save.isPending || resplit.isPending}
              disabled={errors.length > 0}
              onClick={() => void submit()}
            >
              Save split
            </Button>
          </div>
        </DialogFooter>
        {payeesOpen && <PayeesDialog onClose={() => setPayeesOpen(false)} />}
      </DialogContent>
    </Dialog>
  );
}
