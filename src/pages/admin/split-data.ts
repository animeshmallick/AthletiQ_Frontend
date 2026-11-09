import { usePayees, useUsers } from '@/lib/queries';
import { previewShares, recipientLabel } from '@/lib/split';
import type { Payee, SplitNode, User } from '@/lib/types';

export type People = { staff: Pick<User, 'id' | 'name'>[]; payees: Pick<Payee, 'id' | 'name'>[] };

/** Staff and payee names for labelling recipients (admin only). */
export function usePeople(): People {
  const users = useUsers({ pageSize: 100 });
  const payees = usePayees();
  return { staff: users.data?.data ?? [], payees: payees.data ?? [] };
}

/** Totals per recipient across the whole tree (the academy may appear in several places). */
export function byRecipient(tree: SplitNode[], amount: number, people: People) {
  const out = new Map<string, { key: string; name: string; amount: number }>();
  for (const l of previewShares(tree, amount)) {
    const n = l.node;
    const key =
      n.recipient === 'staff'
        ? `staff:${n.userId}`
        : n.recipient === 'payee'
          ? `payee:${n.payeeId}`
          : (n.recipient ?? 'academy');
    const row = out.get(key) ?? {
      key,
      name: recipientLabel(n, people.staff, people.payees),
      amount: 0,
    };
    row.amount += l.amount;
    out.set(key, row);
  }
  return [...out.values()].sort((a, b) => b.amount - a.amount);
}
