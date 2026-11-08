import { AlertTriangle, CalendarClock, Clock, IndianRupee, Percent, Wallet } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link } from 'react-router';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { useUser } from '@/app/auth';
import { EmptyState, ErrorState, ListSkeleton, PageHeader, StatCard } from '@/components/common';
import { Segmented } from '@/components/ui/controls';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Select,
} from '@/components/ui/primitives';
import {
  addMonths,
  endOfMonth,
  formatDate,
  formatMonth,
  formatShortDate,
  money,
  moneyCompact,
  PAYMENT_MODE_LABELS,
  plural,
  startOfMonth,
  today,
} from '@/lib/format';
import { useBatches, useFinance, useProjection, useUsers } from '@/lib/queries';

type Preset = 'month' | 'last-month' | 'quarter' | 'fy';

function rangeFor(preset: Preset): { from: string; to: string } {
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

const tooltipStyle = {
  background: 'var(--popover)',
  border: '1px solid var(--border)',
  borderRadius: 12,
  fontSize: 12,
  color: 'var(--popover-foreground)',
};
const PIE_COLORS = [
  'var(--chart-1)',
  'var(--chart-2)',
  'var(--chart-3)',
  'var(--chart-4)',
  'var(--chart-5)',
  '#94a3b8',
];

export function FinancePage() {
  const user = useUser();
  const isAdmin = user.role === 'admin';
  const [preset, setPreset] = useState<Preset>('month');
  const [coachId, setCoachId] = useState('');
  const [batchId, setBatchId] = useState('');
  const range = useMemo(() => rangeFor(preset), [preset]);
  const q = useFinance({ ...range, coachId: coachId || undefined, batchId: batchId || undefined });
  const projection = useProjection(30);
  const coaches = useUsers({ role: 'coach', pageSize: 100 });
  const batches = useBatches({});
  const t = q.data?.totals;

  return (
    <div>
      <PageHeader
        title="Finance"
        description={
          isAdmin
            ? 'Billing and collections across the academy.'
            : 'Billing and collections for your students.'
        }
      />

      <div className="mb-5 flex flex-col gap-3 lg:flex-row lg:items-center">
        <Segmented
          ariaLabel="Period"
          value={preset}
          onChange={setPreset}
          options={[
            { value: 'month', label: 'This month' },
            { value: 'last-month', label: 'Last month' },
            { value: 'quarter', label: '3 months' },
            { value: 'fy', label: 'This FY' },
          ]}
        />
        {isAdmin && (
          <Select
            value={coachId}
            onChange={(e) => setCoachId(e.target.value)}
            className="lg:w-56"
            aria-label="Coach"
          >
            <option value="">All coaches</option>
            {coaches.data?.data.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </Select>
        )}
        <Select
          value={batchId}
          onChange={(e) => setBatchId(e.target.value)}
          className="lg:w-56"
          aria-label="Batch"
        >
          <option value="">All batches</option>
          {batches.data?.map((b) => (
            <option key={b.id} value={b.id}>
              {b.name}
            </option>
          ))}
        </Select>
        <p className="text-sm text-muted-foreground lg:ml-auto">
          {formatDate(range.from)} – {formatDate(range.to)}
        </p>
      </div>

      {q.isError ? (
        <ErrorState error={q.error} onRetry={() => void q.refetch()} />
      ) : (
        <div className="space-y-4 sm:space-y-6">
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
            <StatCard
              label="Billed"
              icon={<IndianRupee />}
              loading={q.isPending}
              value={t ? money(t.billed) : ''}
              hint={t && plural(t.invoicesIssued, 'invoice')}
            />
            <StatCard
              label="Collected"
              icon={<Wallet />}
              tone="success"
              loading={q.isPending}
              value={t ? money(t.collected) : ''}
              hint={t && plural(t.paymentsReceived, 'payment')}
            />
            <StatCard
              label="Collection rate"
              icon={<Percent />}
              loading={q.isPending}
              value={t?.collectionRate === null || !t ? '—' : `${t.collectionRate}%`}
              hint="Collected ÷ billed in period"
            />
            <StatCard
              label="Due (not late)"
              icon={<Clock />}
              tone="warning"
              loading={q.isPending}
              value={t ? money(t.due) : ''}
              hint={t && plural(t.dueCount, 'invoice')}
            />
            <StatCard
              label="Overdue"
              icon={<AlertTriangle />}
              tone="destructive"
              loading={q.isPending}
              value={t ? money(t.overdue) : ''}
              hint={t && plural(t.overdueCount, 'invoice')}
            />
          </div>

          <div className="grid gap-6 lg:grid-cols-3">
            <Card className="lg:col-span-2">
              <CardHeader>
                <CardTitle>Billed vs collected</CardTitle>
                <CardDescription>Last 12 months</CardDescription>
              </CardHeader>
              <CardContent className="h-80">
                {q.isPending ? (
                  <ListSkeleton rows={1} className="[&>*]:h-72" />
                ) : (
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                      data={q.data.trend.map((r) => ({
                        ...r,
                        label: formatMonth(r.month),
                        billedR: r.billed / 100,
                        collectedR: r.collected / 100,
                      }))}
                      margin={{ left: 0, right: 8 }}
                    >
                      <CartesianGrid
                        strokeDasharray="3 3"
                        stroke="var(--border)"
                        vertical={false}
                      />
                      <XAxis
                        dataKey="label"
                        tick={{ fontSize: 12, fill: 'var(--muted-foreground)' }}
                        tickLine={false}
                        axisLine={false}
                      />
                      <YAxis
                        tickFormatter={(v: number) => moneyCompact(v * 100)}
                        tick={{ fontSize: 12, fill: 'var(--muted-foreground)' }}
                        tickLine={false}
                        axisLine={false}
                        width={64}
                      />
                      <Tooltip
                        contentStyle={tooltipStyle}
                        cursor={{ fill: 'var(--muted)' }}
                        formatter={(v) => money(Number(v) * 100)}
                      />
                      <Legend wrapperStyle={{ fontSize: 12 }} />
                      <Bar
                        dataKey="billedR"
                        name="Billed"
                        fill="var(--chart-1)"
                        radius={[6, 6, 0, 0]}
                        maxBarSize={28}
                      />
                      <Bar
                        dataKey="collectedR"
                        name="Collected"
                        fill="var(--chart-2)"
                        radius={[6, 6, 0, 0]}
                        maxBarSize={28}
                      />
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Payment modes</CardTitle>
                <CardDescription>Collections in this period</CardDescription>
              </CardHeader>
              <CardContent className="h-80">
                {q.isPending ? (
                  <ListSkeleton rows={1} className="[&>*]:h-72" />
                ) : q.data.byPaymentMode.length === 0 ? (
                  <EmptyState title="No payments yet" className="h-full" />
                ) : (
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={q.data.byPaymentMode.map((m) => ({
                          name: PAYMENT_MODE_LABELS[m.mode],
                          value: m.amount / 100,
                        }))}
                        dataKey="value"
                        nameKey="name"
                        innerRadius="55%"
                        outerRadius="80%"
                        paddingAngle={2}
                        stroke="var(--card)"
                      >
                        {q.data.byPaymentMode.map((m, i) => (
                          <Cell key={m.mode} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip
                        contentStyle={tooltipStyle}
                        formatter={(v) => money(Number(v) * 100)}
                      />
                      <Legend wrapperStyle={{ fontSize: 12 }} />
                    </PieChart>
                  </ResponsiveContainer>
                )}
              </CardContent>
            </Card>
          </div>

          <div className="grid gap-6 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>By batch</CardTitle>
                <CardDescription>Billed in period, and everything currently unpaid</CardDescription>
              </CardHeader>
              <CardContent className="overflow-x-auto px-0">
                {q.isPending ? (
                  <ListSkeleton rows={3} className="px-5" />
                ) : q.data.byBatch.length === 0 ? (
                  <p className="px-5 text-sm text-muted-foreground">No billing data yet.</p>
                ) : (
                  <table className="w-full text-sm">
                    <thead className="border-y bg-muted/40 text-left text-xs text-muted-foreground">
                      <tr>
                        <th className="px-5 py-2 font-medium">Batch</th>
                        <th className="px-3 py-2 text-right font-medium">Billed</th>
                        <th className="px-3 py-2 text-right font-medium">Unpaid</th>
                        <th className="px-5 py-2 text-right font-medium">Overdue</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {q.data.byBatch.map((b) => (
                        <tr key={`${b.batchId}-${b.coachId}`}>
                          <td className="px-5 py-2.5">
                            <p className="font-medium">{b.batchName ?? 'Unassigned'}</p>
                            {isAdmin && (
                              <p className="text-xs text-muted-foreground">{b.coachName ?? '—'}</p>
                            )}
                          </td>
                          <td className="tabular px-3 py-2.5 text-right">{money(b.billed)}</td>
                          <td className="tabular px-3 py-2.5 text-right">{money(b.outstanding)}</td>
                          <td className="tabular px-5 py-2.5 text-right font-medium text-destructive">
                            {b.overdue ? money(b.overdue) : '—'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <CalendarClock className="size-4 text-primary" /> Next 30 days
                </CardTitle>
                <CardDescription>
                  {projection.data
                    ? `${plural(projection.data.invoices.length, 'invoice')} · ${money(projection.data.totalAmount)} expected`
                    : 'Upcoming invoices'}
                </CardDescription>
              </CardHeader>
              <CardContent>
                {projection.isPending ? (
                  <ListSkeleton rows={3} />
                ) : !projection.data?.invoices.length ? (
                  <p className="text-sm text-muted-foreground">
                    No invoices due in the next 30 days.
                  </p>
                ) : (
                  <ul className="max-h-80 divide-y overflow-y-auto">
                    {projection.data.invoices.map((i) => (
                      <li
                        key={i.studentId}
                        className="flex items-center justify-between gap-3 py-2 text-sm"
                      >
                        <div className="min-w-0">
                          <Link
                            to={`/students/${i.studentId}`}
                            className="block truncate font-medium hover:underline"
                          >
                            {i.fullName}
                          </Link>
                          <p className="text-xs text-muted-foreground">
                            {formatShortDate(i.issueDate)} · {i.batchName ?? '—'}
                          </p>
                        </div>
                        <span className="tabular">{money(i.amount)}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      )}
    </div>
  );
}
