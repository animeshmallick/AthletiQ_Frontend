/**
 * "Collected by": who received the fee money (the person who confirmed "I have received the
 * payment"). A donut plus a ranked list. Admins see everyone; coaches see only themselves.
 */
import { HandCoins } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts';
import { Segmented } from '@/components/ui/controls';
import {
  Badge,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Skeleton,
} from '@/components/ui/primitives';
import { addMonths, endOfMonth, money, plural, startOfMonth, today } from '@/lib/format';
import { useFinance } from '@/lib/queries';
import type { FinanceSummary } from '@/lib/types';

export type FinancePreset = 'month' | 'last-month' | 'quarter' | 'fy';

export function financeRange(preset: FinancePreset): { from: string; to: string } {
  const t = today();
  switch (preset) {
    case 'month':
      return { from: startOfMonth(t), to: t };
    case 'last-month': {
      const s = addMonths(t, -1);
      return { from: s, to: endOfMonth(s) };
    }
    case 'quarter':
      return { from: addMonths(t, -2), to: t };
    case 'fy': {
      const [y, m] = t.split('-').map(Number) as [number, number];
      return { from: `${m >= 4 ? y : y - 1}-04-01`, to: t };
    }
  }
}

export const PIE_COLORS = [
  'var(--chart-1)',
  'var(--chart-2)',
  'var(--chart-3)',
  'var(--chart-4)',
  'var(--chart-5)',
  '#94a3b8',
];

export const chartTooltipStyle = {
  background: 'var(--popover)',
  border: '1px solid var(--border)',
  borderRadius: 12,
  fontSize: 12,
  color: 'var(--popover-foreground)',
};

type Row = FinanceSummary['byReceiver'][number];

/** Donut + list for the given rows. */
export function CollectedByChart({ rows }: { rows: Row[] }) {
  const total = rows.reduce((n, r) => n + r.amount, 0);
  if (!rows.length) {
    return (
      <p className="py-6 text-center text-[13px] text-muted-foreground">
        No payments received in this period.
      </p>
    );
  }
  return (
    <div className="flex flex-col items-center gap-4 sm:flex-row sm:items-center">
      <div
        className="relative size-40 shrink-0"
        role="img"
        aria-label={`Fees collected by person, ${money(total)} in total`}
      >
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={rows.map((r) => ({ name: r.name, value: r.amount / 100 }))}
              dataKey="value"
              nameKey="name"
              innerRadius="62%"
              outerRadius="96%"
              paddingAngle={rows.length > 1 ? 2 : 0}
              stroke="var(--card)"
              isAnimationActive={false}
            >
              {rows.map((r, i) => (
                <Cell key={r.userId} fill={PIE_COLORS[i % PIE_COLORS.length]} />
              ))}
            </Pie>
            <Tooltip contentStyle={chartTooltipStyle} formatter={(v) => money(Number(v) * 100)} />
          </PieChart>
        </ResponsiveContainer>
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-[10px] font-medium tracking-wide text-muted-foreground uppercase">
            Total
          </span>
          <span className="tabular text-[15px] font-bold">{money(total)}</span>
        </div>
      </div>
      <ul className="w-full min-w-0 flex-1 space-y-2">
        {rows.map((r, i) => (
          <li key={r.userId} className="flex items-center gap-2.5 text-[13px]">
            <span
              aria-hidden
              className="size-2.5 shrink-0 rounded-full"
              style={{ background: PIE_COLORS[i % PIE_COLORS.length] }}
            />
            <span className="min-w-0 flex-1">
              <span className="flex items-center gap-1.5">
                <span className="truncate font-semibold">{r.name}</span>
                <Badge variant={r.role === 'admin' ? 'default' : 'muted'} className="capitalize">
                  {r.role}
                </Badge>
              </span>
              <span className="block text-[11px] text-muted-foreground">
                {plural(r.count, 'payment')} · {total ? Math.round((r.amount / total) * 100) : 0}%
              </span>
            </span>
            <span className="tabular shrink-0 font-semibold">{money(r.amount)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Dashboard card with its own period switch. */
export function CollectedByCard({ admin }: { admin: boolean }) {
  const [preset, setPreset] = useState<FinancePreset>('month');
  const range = useMemo(() => financeRange(preset), [preset]);
  const q = useFinance(range);
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <HandCoins className="size-4 text-primary" />
          {admin ? 'Fees collected by' : 'Fees I received'}
        </CardTitle>
        <CardDescription>
          {admin ? 'Money received by each coach and admin' : 'Payments you confirmed as received'}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <Segmented
          size="sm"
          ariaLabel="Collection period"
          value={preset}
          onChange={setPreset}
          options={[
            { value: 'month', label: 'This month' },
            { value: 'last-month', label: 'Last month' },
            { value: 'fy', label: 'This FY' },
          ]}
        />
        {q.isPending ? (
          <Skeleton className="h-40 rounded-2xl" />
        ) : q.isError ? (
          <p className="text-[13px] text-muted-foreground">Could not load collections.</p>
        ) : (
          <CollectedByChart rows={q.data.byReceiver} />
        )}
      </CardContent>
    </Card>
  );
}
