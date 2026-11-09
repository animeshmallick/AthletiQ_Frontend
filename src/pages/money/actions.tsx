import { useState } from 'react';
import { toast } from 'sonner';
import { useUser } from '@/app/auth';
import { Field, MoneyInput } from '@/components/common';
import { Button } from '@/components/ui/button';
import { Segmented } from '@/components/ui/controls';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/overlays';
import { Input, Select, Textarea } from '@/components/ui/primitives';
import { errorMessage } from '@/lib/api';
import { money, today } from '@/lib/format';
import { useFundAction, useUsers } from '@/lib/queries';
import type { AcademyFunds } from '@/lib/types';
import { EXPENSE_CATEGORIES } from './meta';

export type MoneyAction = 'handover' | 'expense' | 'payout' | 'income';

const COPY: Record<MoneyAction, { title: string; admin: string; coach: string; cta: string }> = {
  handover: {
    title: 'Cash handed over',
    admin:
      'Record cash a staff member gave to the academy. It moves from their hands to the academy.',
    coach: 'Record cash you gave to the academy. It is taken off what you hold.',
    cta: 'Record handover',
  },
  expense: {
    title: 'Record a purchase',
    admin: 'Equipment and other spending. It is always charged to the academy’s own money.',
    coach:
      'Equipment and other things bought for the academy. Pay from the academy cash you hold, or from your own money to be reimbursed.',
    cta: 'Record purchase',
  },
  payout: {
    title: 'Pay what is owed',
    admin: 'Settle a staff member’s share or reimbursement, or pay a payee such as the society.',
    coach: '',
    cta: 'Record payment',
  },
  income: {
    title: 'Other income',
    admin: 'Money the academy receives outside fees: opening balance, sponsorship, events…',
    coach: '',
    cta: 'Record income',
  },
};

export interface ActionPrefill {
  userId?: string;
  payeeId?: string;
  amount?: number;
}

/**
 * One dialog for every money movement. `funds` (admins) supplies who holds cash and who is
 * owed, so choices show live balances and payouts default to the full amount owed.
 */
export function MoneyActionDialog({
  action,
  funds,
  myCash,
  prefill = {},
  onClose,
}: {
  action: MoneyAction;
  funds?: AcademyFunds;
  /** Coaches: cash they hold, shown as the limit. */
  myCash?: number;
  prefill?: ActionPrefill;
  onClose: () => void;
}) {
  const user = useUser();
  const admin = user.role === 'admin';
  const mutation = useFundAction(
    action === 'handover'
      ? 'handovers'
      : action === 'expense'
        ? 'expenses'
        : action === 'payout'
          ? 'payouts'
          : 'income',
  );
  const staffQ = useUsers({ status: 'active', pageSize: 100 });
  const staff = admin ? (staffQ.data?.data ?? []) : [];

  const [amount, setAmount] = useState<number | null>(prefill.amount ?? null);
  const [date, setDate] = useState(today());
  const [title, setTitle] = useState('');
  const [category, setCategory] = useState('equipment');
  const [note, setNote] = useState('');
  const [reference, setReference] = useState('');
  const [paidFrom, setPaidFrom] = useState<'academy' | 'cash' | 'own'>(admin ? 'academy' : 'cash');
  const [userId, setUserId] = useState(prefill.userId ?? (admin ? '' : user.id));
  // Payouts: "staff:<id>" or "payee:<id>".
  const [payTo, setPayTo] = useState(
    prefill.payeeId ? `payee:${prefill.payeeId}` : prefill.userId ? `staff:${prefill.userId}` : '',
  );
  const [fromUserId, setFromUserId] = useState('');

  const b = funds?.balances;
  const holding = (id: string) =>
    id ? (b?.holders.find((h) => h.userId === id)?.amount ?? 0) : (b?.academyCash ?? 0);
  const owedTo = (key: string) => {
    const [kind, id] = key.split(':');
    return kind === 'payee'
      ? (b?.payeeDue.find((p) => p.payeeId === id)?.amount ?? 0)
      : (b?.staffDue.find((s) => s.userId === id)?.amount ?? 0);
  };

  // The most that can move, for a hint and an early check.
  const limit =
    action === 'handover'
      ? admin
        ? userId
          ? holding(userId)
          : undefined
        : myCash
      : action === 'expense' && paidFrom !== 'own'
        ? admin
          ? paidFrom === 'academy'
            ? holding('')
            : userId
              ? holding(userId)
              : undefined
          : myCash
        : action === 'payout' && payTo
          ? Math.min(owedTo(payTo), holding(fromUserId))
          : undefined;

  const copy = COPY[action];

  async function submit() {
    if (!amount) return toast.error('Enter an amount');
    if (limit !== undefined && amount > limit)
      return toast.error(`That is more than the ${money(Math.max(limit, 0))} available`);
    const body: Record<string, unknown> = { amount, occurredOn: date, note: note.trim() || null };
    if (action === 'handover') {
      if (admin && !userId) return toast.error('Choose who handed over the cash');
      if (admin) body.userId = userId;
    } else if (action === 'expense') {
      if (title.trim().length < 2) return toast.error('Say what was bought');
      Object.assign(body, {
        title: title.trim(),
        category,
        paidFrom,
        reference: reference || null,
      });
      if (admin && paidFrom !== 'academy') {
        if (!userId) return toast.error('Choose the staff member');
        body.userId = userId;
      }
    } else if (action === 'payout') {
      if (!payTo) return toast.error('Choose who is being paid');
      const [kind, id] = payTo.split(':');
      Object.assign(body, {
        [kind === 'payee' ? 'payeeId' : 'userId']: id,
        fromUserId: fromUserId || null,
        reference: reference || null,
      });
    } else {
      if (title.trim().length < 2) return toast.error('Describe the income');
      Object.assign(body, { title: title.trim(), reference: reference || null });
    }
    try {
      await mutation.mutateAsync(body);
      toast.success(`${copy.title} · ${money(amount)}`);
      onClose();
    } catch (err) {
      toast.error('Could not record it', { description: errorMessage(err) });
    }
  }

  const staffOption = (id: string, name: string, extra?: number) => (
    <option key={id} value={id}>
      {name}
      {extra !== undefined ? ` · ${money(extra)}` : ''}
    </option>
  );

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{copy.title}</DialogTitle>
          <DialogDescription>{admin ? copy.admin : copy.coach}</DialogDescription>
        </DialogHeader>
        <div className="grid gap-3.5 sm:grid-cols-2">
          {action === 'payout' && (
            <Field label="Pay to" required className="sm:col-span-2">
              <Select
                value={payTo}
                onChange={(e) => {
                  setPayTo(e.target.value);
                  setAmount(owedTo(e.target.value) || null);
                }}
              >
                <option value="">Choose…</option>
                {(b?.staffDue.length ?? 0) > 0 && (
                  <optgroup label="Staff (owed)">
                    {b!.staffDue
                      .filter((s) => s.amount > 0)
                      .map((s) => (
                        <option key={s.userId} value={`staff:${s.userId}`}>
                          {s.name} · {money(s.amount)} owed
                        </option>
                      ))}
                  </optgroup>
                )}
                {(b?.payeeDue.length ?? 0) > 0 && (
                  <optgroup label="Payees (owed)">
                    {b!.payeeDue
                      .filter((p) => p.amount > 0)
                      .map((p) => (
                        <option key={p.payeeId} value={`payee:${p.payeeId}`}>
                          {p.name} · {money(p.amount)} owed
                        </option>
                      ))}
                  </optgroup>
                )}
              </Select>
            </Field>
          )}

          {(action === 'expense' || action === 'income') && (
            <Field
              label={action === 'expense' ? 'What was bought' : 'Description'}
              required
              className="sm:col-span-2"
            >
              <Input
                value={title}
                maxLength={120}
                onChange={(e) => setTitle(e.target.value)}
                placeholder={action === 'expense' ? 'e.g. 10 footballs' : 'e.g. Opening balance'}
                autoFocus
              />
            </Field>
          )}

          {action === 'handover' && admin && (
            <Field label="Handed over by" required className="sm:col-span-2">
              <Select value={userId} onChange={(e) => setUserId(e.target.value)}>
                <option value="">Choose…</option>
                {(b?.holders ?? []).map((h) => staffOption(h.userId, h.name, h.amount))}
              </Select>
            </Field>
          )}

          {action === 'expense' && (
            <Field label="Paid from" required className="sm:col-span-2">
              <Segmented
                ariaLabel="Paid from"
                value={paidFrom}
                onChange={setPaidFrom}
                className="w-full"
                options={
                  admin
                    ? [
                        { value: 'academy', label: 'Academy cash' },
                        { value: 'cash', label: 'Staff’s cash' },
                        { value: 'own', label: 'Own money' },
                      ]
                    : [
                        { value: 'cash', label: 'Academy cash I hold' },
                        { value: 'own', label: 'My own money' },
                      ]
                }
              />
            </Field>
          )}

          {action === 'expense' && admin && paidFrom !== 'academy' && (
            <Field
              label={paidFrom === 'cash' ? 'Whose cash' : 'Who paid (to reimburse)'}
              required
              className="sm:col-span-2"
            >
              <Select value={userId} onChange={(e) => setUserId(e.target.value)}>
                <option value="">Choose…</option>
                {paidFrom === 'cash'
                  ? (b?.holders ?? []).map((h) => staffOption(h.userId, h.name, h.amount))
                  : staff.map((u) =>
                      staffOption(u.id, u.id === user.id ? `${u.name} (me)` : u.name),
                    )}
              </Select>
            </Field>
          )}

          {action === 'payout' && (
            <Field label="Paid from" className="sm:col-span-2">
              <Select value={fromUserId} onChange={(e) => setFromUserId(e.target.value)}>
                <option value="">Academy cash · {money(b?.academyCash ?? 0)}</option>
                {(b?.holders ?? []).map((h) => staffOption(h.userId, `${h.name}’s cash`, h.amount))}
              </Select>
            </Field>
          )}

          <Field
            label="Amount"
            required
            hint={limit !== undefined ? `Up to ${money(Math.max(limit, 0))}` : undefined}
          >
            <MoneyInput value={amount} onChange={setAmount} />
          </Field>
          <Field label="Date" required>
            <Input
              type="date"
              value={date}
              max={today()}
              onChange={(e) => setDate(e.target.value)}
            />
          </Field>

          {action === 'expense' && (
            <Field label="Category">
              <Select value={category} onChange={(e) => setCategory(e.target.value)}>
                {EXPENSE_CATEGORIES.map((c) => (
                  <option key={c.value} value={c.value}>
                    {c.label}
                  </option>
                ))}
              </Select>
            </Field>
          )}
          {action !== 'handover' && (
            <Field label="Bill / reference no.">
              <Input
                value={reference}
                maxLength={120}
                onChange={(e) => setReference(e.target.value)}
              />
            </Field>
          )}
          <Field label="Note" className="sm:col-span-2">
            <Textarea
              rows={2}
              value={note}
              maxLength={500}
              onChange={(e) => setNote(e.target.value)}
            />
          </Field>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button loading={mutation.isPending} onClick={() => void submit()}>
            {copy.cta}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
