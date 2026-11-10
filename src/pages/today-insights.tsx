/**
 * Homepage money pieces: where the money is right now (admin) and fees collected, by who, with
 * its own period filter (charts load on demand).
 */
import { Building2, Landmark, Scale, Users } from 'lucide-react';
import { lazy } from 'react';
import { Link } from 'react-router';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Skeleton,
} from '@/components/ui/primitives';
import { money, startOfMonth, today } from '@/lib/format';
import { useFundsOverview } from '@/lib/queries';

// Charts (recharts) load on demand so the homepage stays light.
export const CollectedByCard = lazy(() =>
  import('@/components/collected-by').then((m) => ({ default: m.CollectedByCard })),
);

const monthRange = () => ({ from: startOfMonth(today()), to: today() });

/** Admin: where the money is right now, linking to the Money page. */
export function MoneySnapshot() {
  const q = useFundsOverview(monthRange());
  const f = q.data?.scope === 'academy' ? q.data : undefined;
  if (q.isPending) return <Skeleton className="h-56 rounded-2xl" />;
  if (!f) return null;
  const b = f.balances;
  const owed = b.owedToStaff + b.owedToPayees;
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Landmark className="size-4 text-muted-foreground" /> Money right now
        </CardTitle>
        <CardDescription>
          <Link to="/finance?tab=money" className="font-medium text-primary hover:underline">
            Open Money
          </Link>{' '}
          for the full ledger.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid grid-cols-3 gap-2 text-center">
          {[
            { label: 'Academy', value: b.academyCash, icon: <Building2 className="size-3.5" /> },
            { label: 'With staff', value: b.withStaff, icon: <Users className="size-3.5" /> },
            { label: 'Owed', value: owed, icon: <Scale className="size-3.5" /> },
          ].map((x) => (
            <div key={x.label} className="rounded-xl bg-muted/50 px-1 py-2">
              <p className="tabular truncate text-[15px] font-bold">{money(x.value)}</p>
              <p className="flex items-center justify-center gap-1 text-[11px] text-muted-foreground">
                {x.icon} {x.label}
              </p>
            </div>
          ))}
        </div>
        {b.holders.length > 0 && (
          <ul className="space-y-1 text-[13px]">
            {b.holders.slice(0, 4).map((h) => (
              <li key={h.userId} className="flex justify-between gap-2">
                <span className="truncate">{h.name} holds</span>
                <span className="tabular font-semibold">{money(h.amount)}</span>
              </li>
            ))}
          </ul>
        )}
        <p className="text-[12px] text-muted-foreground">
          This month: {money(f.period.collected)} received · {money(f.period.spent)} spent ·{' '}
          {money(f.period.paidOut)} paid out
        </p>
      </CardContent>
    </Card>
  );
}
