/**
 * Fee-split maths, identical to the server's (src/modules/funds/split.ts) so the editor can
 * preview exactly what will be recorded. Amounts are paise; percentages basis points.
 */
import type { Payee, SplitNode, User } from './types';

export const FULL = 10_000;
export const MAX_SECTIONS = 12;

/** Flats first (in order, until the money runs out); percentages divide the rest. */
export function allocate(nodes: Pick<SplitNode, 'kind' | 'value'>[], amount: number): number[] {
  const out = nodes.map(() => 0);
  let left = amount;
  nodes.forEach((n, i) => {
    if (n.kind !== 'flat') return;
    out[i] = Math.min(n.value, left);
    left -= out[i];
  });
  const pct = nodes.map((n, i) => ({ n, i })).filter((x) => x.n.kind === 'percent');
  if (pct.length === 0) return out;
  let given = 0;
  for (const { n, i } of pct) {
    out[i] = Math.floor((left * n.value) / FULL);
    given += out[i];
  }
  const top = pct.reduce((a, b) => (b.n.value > a.n.value ? b : a));
  out[top.i]! += left - given;
  return out;
}

export interface PreviewLine {
  label: string;
  node: SplitNode;
  amount: number;
}

/** Leaf sections with their amount for a fee (zero lines kept so the editor can show them). */
export function previewShares(tree: SplitNode[], amount: number): PreviewLine[] {
  const lines: PreviewLine[] = [];
  const walk = (nodes: SplitNode[], money: number, prefix: string) => {
    const parts = allocate(nodes, money);
    nodes.forEach((n, i) => {
      const label = prefix ? `${prefix} › ${n.name || 'Untitled'}` : n.name || 'Untitled';
      if (n.children.length) walk(n.children, parts[i] ?? 0, label);
      else lines.push({ label, node: n, amount: parts[i] ?? 0 });
    });
  };
  walk(tree, amount, '');
  return lines;
}

/** Amount each node receives (top-level and children), keyed by "i" / "i.j". */
export function nodeAmounts(tree: SplitNode[], amount: number): Record<string, number> {
  const out: Record<string, number> = {};
  allocate(tree, amount).forEach((part, i) => {
    out[`${i}`] = part;
    allocate(tree[i]!.children, part).forEach((c, j) => (out[`${i}.${j}`] = c));
  });
  return out;
}

export interface TreeError {
  path: string;
  message: string;
}

export function validateTree(tree: SplitNode[]): TreeError[] {
  const errors: TreeError[] = [];
  const level = (nodes: SplitNode[], path: string, depth: number) => {
    if (nodes.length === 0) return errors.push({ path, message: 'Add at least one section' });
    if (nodes.length > MAX_SECTIONS)
      errors.push({ path, message: `At most ${MAX_SECTIONS} sections` });
    const pct = nodes.filter((n) => n.kind === 'percent');
    const total = pct.reduce((s, n) => s + n.value, 0);
    if (pct.length === 0)
      errors.push({ path, message: 'Add a percentage section to receive what is left' });
    else if (total !== FULL)
      errors.push({ path, message: `Percentages add up to ${total / 100}%, not 100%` });
    const names = new Set<string>();
    nodes.forEach((n, i) => {
      const at = path ? `${path}.${i}` : `${i}`;
      const key = n.name.trim().toLowerCase();
      if (!key) errors.push({ path: at, message: 'Give every section a name' });
      else if (names.has(key)) errors.push({ path: at, message: `“${n.name}” is used twice` });
      names.add(key);
      if (n.value <= 0) errors.push({ path: at, message: 'Enter a value above zero' });
      if (n.kind === 'percent' && n.value > FULL)
        errors.push({ path: at, message: 'A percentage cannot exceed 100%' });
      if (n.children.length) {
        if (depth < 2) level(n.children, `${at}.children`, depth + 1);
      } else if (!n.recipient) {
        errors.push({ path: at, message: 'Choose who receives this section' });
      } else if (n.recipient === 'staff' && !n.userId) {
        errors.push({ path: at, message: 'Choose a staff member' });
      } else if (n.recipient === 'payee' && !n.payeeId) {
        errors.push({ path: at, message: 'Choose a payee' });
      }
    });
  };
  level(tree, '', 1);
  return errors;
}

/** Sum of percentages on one level, in basis points. */
export const percentTotal = (nodes: SplitNode[]) =>
  nodes.filter((n) => n.kind === 'percent').reduce((s, n) => s + n.value, 0);

/** "50%" / "33.33%" from basis points. */
export const formatPercent = (bps: number) => `${Number((bps / 100).toFixed(2))}%`;

/** Colours shared by the bar, the legend and the preview. */
export const SPLIT_COLORS = [
  'bg-indigo-500',
  'bg-amber-500',
  'bg-emerald-500',
  'bg-sky-500',
  'bg-rose-500',
  'bg-violet-500',
  'bg-teal-500',
  'bg-orange-500',
];

export function recipientLabel(
  n: SplitNode,
  staff: Pick<User, 'id' | 'name'>[] = [],
  payees: Pick<Payee, 'id' | 'name'>[] = [],
) {
  if (n.children.length) return 'Divided';
  switch (n.recipient) {
    case 'batch_coach':
      return 'Batch coach';
    case 'staff':
      return staff.find((u) => u.id === n.userId)?.name ?? 'Staff member';
    case 'payee':
      return payees.find((p) => p.id === n.payeeId)?.name ?? 'Payee';
    default:
      return 'Academy';
  }
}

/**
 * Names every section after where its money goes ("Academy", "Batch coach", a staff member or
 * payee); a divided section is named after its parts ("Academy & Society"). Repeats on a level
 * get a number ("Academy 2"), so names stay unique as the server requires.
 */
export function autoName<T extends SplitNode & { children: T[] }>(
  nodes: T[],
  staff: Pick<User, 'id' | 'name'>[] = [],
  payees: Pick<Payee, 'id' | 'name'>[] = [],
): T[] {
  const seen = new Map<string, number>();
  return nodes.map((n) => {
    const children = autoName(n.children, staff, payees);
    const base = children.length
      ? [...new Set(children.map((c) => recipientLabel(c, staff, payees)))].join(' & ')
      : recipientLabel(n, staff, payees);
    const key = base.toLowerCase();
    const count = (seen.get(key) ?? 0) + 1;
    seen.set(key, count);
    const name = (count > 1 ? `${base} ${count}` : base).slice(0, 60);
    return { ...n, name, children };
  });
}
