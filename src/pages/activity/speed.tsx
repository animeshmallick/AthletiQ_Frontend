/**
 * App speed (admins, on the audit log dashboard): how long calls take, how many database trips
 * they make, how often memory answers, and which screens are worth making faster.
 */
import { Database, Gauge, MemoryStick, Timer } from 'lucide-react';
import { useState } from 'react';
import { EmptyState, ErrorState, SectionDivider, StatCard } from '@/components/common';
import { Segmented } from '@/components/ui/controls';
import { Card, CardContent, CardHeader, CardTitle, Skeleton } from '@/components/ui/primitives';
import { formatShortDate } from '@/lib/format';
import { useAppSpeed, type SpeedRoute } from '@/lib/queries';
import { cn } from '@/lib/utils';
import { Bars, RankList } from './charts';
import { hourLabel, ms, num, requestLabel } from './meta';

type View = 'slowest' | 'mostTime' | 'mostTrips';
const VIEWS: Record<
  View,
  { hint: string; value: (r: SpeedRoute) => number; text: (r: SpeedRoute) => string }
> = {
  slowest: {
    hint: '95% of calls finish within this many ms',
    value: (r) => r.p95Ms,
    text: (r) => `typical ${ms(r.p50Ms)} · ${num(r.n)} calls`,
  },
  mostTime: {
    hint: 'How often × how long, in seconds: where a fix helps most',
    value: (r) => Math.round(r.totalMs / 1000),
    text: (r) => `${num(r.n)} calls · avg ${ms(r.avgMs)}`,
  },
  mostTrips: {
    hint: 'Database trips per call',
    value: (r) => r.queries,
    text: (r) => `avg ${ms(r.avgMs)}`,
  },
};

const when = (at: string, by: 'day' | 'hour') =>
  by === 'day'
    ? formatShortDate(at)
    : `${formatShortDate(at.slice(0, 10))}, ${hourLabel(Number(at.slice(11, 13)))}`;

export function AppSpeed({ range }: { range: { from: string; to: string; since?: string } }) {
  const q = useAppSpeed(range);
  const [view, setView] = useState<View>('slowest');
  const d = q.data;
  return (
    <section className="space-y-2.5" aria-label="App speed">
      <SectionDivider>App speed</SectionDivider>
      {q.isError ? (
        <ErrorState error={q.error} onRetry={() => void q.refetch()} />
      ) : !d ? (
        <Skeleton className="h-40 rounded-xl" />
      ) : !d.totals.n ? (
        <EmptyState
          icon={<Gauge />}
          title="No speed figures yet"
          description="They are saved every minute while the app is used."
        />
      ) : (
        <div className={cn('space-y-2.5', q.isPlaceholderData && 'opacity-60')}>
          <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
            <StatCard
              label="Typical call"
              value={ms(d.totals.p50Ms)}
              icon={<Timer />}
              hint={`${num(d.totals.n)} calls${d.totals.errors ? ` · ${d.totals.errors} server errors` : ''}`}
            />
            <StatCard
              label="Slowest 5%"
              value={`${ms(d.totals.p95Ms)}+`}
              icon={<Gauge />}
              tone={d.totals.p95Ms > 1000 ? 'warning' : 'success'}
              hint={`Longest ${ms(d.totals.maxMs)}`}
            />
            <StatCard
              label="Database trips"
              value={d.totals.queries}
              icon={<Database />}
              hint={
                d.totals.queryMs === null ? 'Per call' : `Per call · ${ms(d.totals.queryMs)} each`
              }
            />
            <StatCard
              label="Answered from memory"
              value={d.totals.cacheRate === null ? '—' : `${d.totals.cacheRate}%`}
              icon={<MemoryStick />}
              hint={
                d.totals.cacheable
                  ? `Of ${num(d.totals.cacheable)} list calls`
                  : 'No list calls yet'
              }
            />
          </div>
          <div className="grid grid-cols-1 gap-2.5 lg:grid-cols-2">
            <Card className="min-w-0">
              <CardHeader className="pb-1">
                <CardTitle className="text-[14px]">
                  Average response by {d.by === 'day' ? 'day' : 'hour'}
                </CardTitle>
              </CardHeader>
              <CardContent className="pt-1">
                <Bars
                  unit="ms"
                  summary={`${ms(d.totals.avgMs)} on average`}
                  data={d.series.map((x) => ({
                    key: x.at,
                    tick:
                      d.by === 'day'
                        ? formatShortDate(x.at).replace(/ \d{4}$/, '')
                        : hourLabel(Number(x.at.slice(11, 13))),
                    label: `${when(x.at, d.by)} (${num(x.n)} calls)`,
                    value: x.avgMs,
                  }))}
                />
              </CardContent>
            </Card>
            <Card className="min-w-0">
              <CardHeader className="pb-1">
                <CardTitle className="text-[14px]">How long calls take</CardTitle>
              </CardHeader>
              <CardContent className="pt-1">
                <Bars
                  unit="calls"
                  tone={d.totals.p95Ms > 1000 ? 'warning' : 'primary'}
                  data={d.spread.map((b, i) => ({
                    key: String(i),
                    tick: b.upTo === null ? 'More' : ms(b.upTo),
                    label: b.upTo === null ? 'Over 3.2 s' : `Up to ${ms(b.upTo)}`,
                    value: b.n,
                  }))}
                />
              </CardContent>
            </Card>
          </div>
          <Card className="min-w-0">
            <CardHeader className="space-y-1.5 pb-1">
              <CardTitle className="text-[14px]">Worth making faster</CardTitle>
              <Segmented
                ariaLabel="Rank calls by"
                size="sm"
                className="w-full sm:w-auto"
                value={view}
                onChange={setView}
                options={[
                  { value: 'slowest', label: 'Slowest' },
                  { value: 'mostTime', label: 'Most time' },
                  { value: 'mostTrips', label: 'Most trips' },
                ]}
              />
              <p className="text-[11px] text-muted-foreground">{VIEWS[view].hint}</p>
            </CardHeader>
            <CardContent className="pt-1">
              <RankList
                items={d[view].map((r) => ({
                  key: `${r.method} ${r.route}`,
                  label: requestLabel(r.method, r.route),
                  value: VIEWS[view].value(r),
                  hint: VIEWS[view].text(r),
                }))}
              />
            </CardContent>
          </Card>
        </div>
      )}
    </section>
  );
}
