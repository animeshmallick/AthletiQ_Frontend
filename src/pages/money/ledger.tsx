import { ChevronDown, Landmark, Undo2 } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router';
import { toast } from 'sonner';
import { useUser } from '@/app/auth';
import {
  ConfirmDialog,
  EmptyState,
  ErrorState,
  ListSkeleton,
  Pagination,
} from '@/components/common';
import { FilterField, FilterMenu } from '@/components/filters';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/controls';
import {
  Badge,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Select,
} from '@/components/ui/primitives';
import { errorMessage } from '@/lib/api';
import { formatDate, money } from '@/lib/format';
import { useFundTxns, useReverseFundTxn } from '@/lib/queries';
import type { FundTxn, FundTxnType } from '@/lib/types';
import { cn } from '@/lib/utils';
import { categoryLabel, TXN_META } from './meta';

/** Plain-language name of a ledger entry's account. */
function entryLabel(e: FundTxn['entries'][number], myId: string) {
  const who = e.userId === myId ? 'You' : (e.name ?? 'Unknown');
  switch (e.account) {
    case 'cash':
      return e.userId ? `Cash with ${who === 'You' ? 'you' : who}` : 'Academy cash';
    case 'academy_fund':
      return e.share ? `${e.label ?? 'Academy'} → Academy fund` : 'Academy fund';
    case 'staff_due':
      return e.label === 'Kept by coach'
        ? `${who === 'You' ? 'Your' : `${who}’s`} share kept from cash`
        : e.share
          ? `${e.label} → ${who === 'You' ? 'your share' : who}`
          : `Owed to ${who === 'You' ? 'you' : who}${e.label ? ` (${e.label.toLowerCase()})` : ''}`;
    case 'payee_due':
      return e.share ? `${e.label} → ${who}` : `Owed to ${who}`;
  }
}

function TxnRow({ t, onReverse }: { t: FundTxn; onReverse?: () => void }) {
  const me = useUser();
  const [open, setOpen] = useState(false);
  const meta = TXN_META[t.type];
  const Icon = meta.icon;
  const reversed = Boolean(t.reversedAt);
  const sub = [
    formatDate(t.occurredOn),
    t.type === 'expense' ? categoryLabel(t.category) : null,
    t.createdBy.name ? `by ${t.createdBy.id === me.id ? 'you' : t.createdBy.name}` : null,
  ]
    .filter(Boolean)
    .join(' · ');

  return (
    <li className={cn('px-3 py-2.5 sm:px-4', reversed && 'opacity-60')}>
      <button
        type="button"
        className="flex w-full cursor-pointer items-center gap-3 text-left"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      >
        <span
          className={cn(
            'flex size-9 shrink-0 items-center justify-center rounded-xl [&_svg]:size-4',
            meta.tone,
          )}
        >
          <Icon />
        </span>
        <span className="min-w-0 flex-1">
          <span
            className={cn('block truncate text-[14px] font-medium', reversed && 'line-through')}
          >
            {t.title}
          </span>
          <span className="block truncate text-[12px] text-muted-foreground">{sub}</span>
        </span>
        <span className="flex shrink-0 flex-col items-end gap-0.5">
          <span className="tabular text-[14px] font-semibold">{money(t.amount)}</span>
          {reversed ? (
            <Badge variant="muted">Reversed</Badge>
          ) : (
            <span className="text-[11px] text-muted-foreground">{meta.label}</span>
          )}
        </span>
        <ChevronDown
          className={cn(
            'size-4 shrink-0 text-muted-foreground transition-transform',
            open && 'rotate-180',
          )}
        />
      </button>
      {open && (
        <div className="mt-2 ml-12 space-y-2 rounded-xl bg-muted/40 p-2.5 text-[12px]">
          <ul className="space-y-1">
            {t.entries.map((e, i) => (
              <li key={i} className="flex items-center gap-2">
                <span className="min-w-0 flex-1 truncate">{entryLabel(e, me.id)}</span>
                <span
                  className={cn(
                    'tabular shrink-0 font-semibold',
                    e.amount < 0 ? 'text-destructive' : 'text-emerald-700 dark:text-emerald-400',
                  )}
                >
                  {e.amount > 0 ? '+' : '−'}
                  {money(Math.abs(e.amount))}
                </span>
              </li>
            ))}
          </ul>
          {(t.note || t.reference || t.invoice) && (
            <p className="text-muted-foreground">
              {t.invoice && (
                <Link
                  className="font-medium text-primary hover:underline"
                  to={`/finance?tab=invoices&invoice=${t.invoice.id}`}
                >
                  {t.invoice.number}
                </Link>
              )}
              {t.invoice && (t.reference || t.note) ? ' · ' : ''}
              {t.reference ? `Ref ${t.reference}` : ''}
              {t.reference && t.note ? ' · ' : ''}
              {t.note}
            </p>
          )}
          {reversed && (
            <p className="text-muted-foreground">
              Reversed {t.reversedBy?.name ? `by ${t.reversedBy.name}` : ''}: {t.reversalReason}
            </p>
          )}
          {onReverse && !reversed && t.type !== 'fee_split' && (
            <Button size="sm" variant="outline" onClick={onReverse}>
              <Undo2 /> Reverse entry
            </Button>
          )}
          {onReverse && !reversed && t.type === 'fee_split' && (
            <p className="text-muted-foreground">
              To undo a fee, revert the payment on its invoice.
            </p>
          )}
        </div>
      )}
    </li>
  );
}

const TYPES: { value: '' | FundTxnType; label: string }[] = [
  { value: '', label: 'All movements' },
  { value: 'fee_split', label: 'Fees received' },
  { value: 'handover', label: 'Handovers' },
  { value: 'expense', label: 'Purchases' },
  { value: 'payout', label: 'Payouts' },
  { value: 'income', label: 'Other income' },
];

/** Every money movement, newest first. Admins can filter by person and reverse entries. */
export function Ledger({
  range,
  people = [],
}: {
  range: { from: string; to: string };
  people?: { id: string; name: string }[];
}) {
  const user = useUser();
  const admin = user.role === 'admin';
  const [type, setType] = useState<'' | FundTxnType>('');
  const [userId, setUserId] = useState('');
  const [withReversed, setWithReversed] = useState(false);
  const [page, setPage] = useState(1);
  const [reversing, setReversing] = useState<FundTxn | null>(null);
  const q = useFundTxns({
    ...range,
    type: type || undefined,
    userId: userId || undefined,
    includeReversed: withReversed || undefined,
    page,
    pageSize: 20,
  });
  const reverse = useReverseFundTxn();

  return (
    <Card>
      <CardHeader className="flex flex-row flex-wrap items-center gap-2 space-y-0">
        <CardTitle className="mr-auto flex items-center gap-2">
          <Landmark className="size-4 text-muted-foreground" /> Ledger
        </CardTitle>
        <FilterMenu
          active={Number(Boolean(type)) + Number(Boolean(userId)) + Number(withReversed)}
          onReset={() => {
            setType('');
            setUserId('');
            setWithReversed(false);
            setPage(1);
          }}
        >
          <FilterField label="Movement">
            <Select
              aria-label="Movement type"
              className="h-9"
              value={type}
              onChange={(e) => {
                setType(e.target.value as '' | FundTxnType);
                setPage(1);
              }}
            >
              {TYPES.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </Select>
          </FilterField>
          {admin && people.length > 0 && (
            <FilterField label="Person">
              <Select
                aria-label="Person"
                className="h-9"
                value={userId}
                onChange={(e) => {
                  setUserId(e.target.value);
                  setPage(1);
                }}
              >
                <option value="">Everyone</option>
                {people.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </Select>
            </FilterField>
          )}
          <div className="flex items-center justify-between gap-2 text-[13px]">
            <span>Show reversed entries</span>
            <Switch
              aria-label="Show reversed entries"
              checked={withReversed}
              onCheckedChange={(v) => {
                setWithReversed(v);
                setPage(1);
              }}
            />
          </div>
        </FilterMenu>
      </CardHeader>
      <CardContent className="p-0">
        {q.isPending ? (
          <ListSkeleton rows={4} className="p-3" />
        ) : q.isError ? (
          <ErrorState error={q.error} onRetry={() => void q.refetch()} />
        ) : q.data.data.length === 0 ? (
          <EmptyState icon={<Landmark />} title="No money movements in this period" />
        ) : (
          <ul className="divide-y">
            {q.data.data.map((t) => (
              <TxnRow key={t.id} t={t} onReverse={admin ? () => setReversing(t) : undefined} />
            ))}
          </ul>
        )}
        {q.data?.meta && (
          <div className="px-3 pb-3">
            <Pagination
              page={page}
              totalPages={q.data.meta.totalPages}
              total={q.data.meta.total}
              onPage={setPage}
            />
          </div>
        )}
      </CardContent>
      <ConfirmDialog
        open={Boolean(reversing)}
        onOpenChange={(o) => !o && setReversing(null)}
        title="Reverse this entry?"
        description={
          reversing
            ? `“${reversing.title}” (${money(reversing.amount)}) will no longer count in any balance. The entry stays in the ledger, marked as reversed.`
            : undefined
        }
        confirmLabel="Reverse"
        destructive
        requireReason
        loading={reverse.isPending}
        onConfirm={(reason) =>
          reverse.mutate(
            { id: reversing!.id, reason },
            {
              onSuccess: () => {
                toast.success('Entry reversed');
                setReversing(null);
              },
              onError: (err) =>
                toast.error('Could not reverse', { description: errorMessage(err) }),
            },
          )
        }
      />
    </Card>
  );
}
