/**
 * Errors (admins): every failed request in a period, what kind, where, and the latest message,
 * then the individual failures with their request ID for tracing in the server logs.
 */
import { Bug, CheckCircle2, ServerCrash, Users, Waypoints } from 'lucide-react';
import { useMemo, useState } from 'react';
import { relativeTime } from '@/app/deployments';
import {
  EmptyState,
  ErrorState,
  ListSkeleton,
  SectionDivider,
  StatCard,
} from '@/components/common';
import { Segmented } from '@/components/ui/controls';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, Skeleton } from '@/components/ui/primitives';
import { formatLongDate, formatShortDate } from '@/lib/format';
import { useApiErrors, useErrorInsights, type ApiRequest } from '@/lib/queries';
import { cn } from '@/lib/utils';
import { Bars, RankList } from './charts';
import { FilterChip, RequestDetails, RequestRow, StatusChip } from './feed';
import { num, requestLabel } from './meta';

type Kind = 'all' | 'client' | 'server';

export function ErrorsView({ range }: { range: { from: string; to: string } }) {
  const ins = useErrorInsights(range);
  const [kind, setKind] = useState<Kind>('all');
  const [route, setRoute] = useState<string | null>(null);
  const [open, setOpen] = useState<ApiRequest | null>(null);
  const list = useApiErrors({
    ...range,
    kind: kind === 'all' ? undefined : kind,
    route: route ?? undefined,
  });
  const rows = useMemo(() => list.data?.pages.flatMap((p) => p.data) ?? [], [list.data]);
  const total = list.data?.pages[0]?.meta?.total ?? 0;

  if (ins.isError) return <ErrorState error={ins.error} onRetry={() => void ins.refetch()} />;
  const d = ins.data;
  if (!d)
    return (
      <div className="space-y-2.5">
        <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-20 rounded-xl" />
          ))}
        </div>
        <Skeleton className="h-40 rounded-xl" />
      </div>
    );
  const t = d.totals;

  if (!t.total)
    return (
      <EmptyState
        icon={<CheckCircle2 />}
        title="No failed requests"
        description="Nothing went wrong for anyone in this period."
      />
    );

  return (
    <div className={cn('space-y-2.5', ins.isPlaceholderData && 'opacity-60')}>
      <SectionDivider>Overview</SectionDivider>
      <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
        <StatCard
          label="Server errors"
          value={num(t.server)}
          icon={<ServerCrash />}
          tone={t.server ? 'destructive' : 'success'}
          hint={t.server ? 'Bugs or outages: fix these' : 'None'}
        />
        <StatCard
          label="Rejected requests"
          value={num(t.client)}
          icon={<Bug />}
          tone={t.client ? 'warning' : 'success'}
          hint="Invalid input, no access, not found"
        />
        <StatCard label="Endpoints" value={t.routes} icon={<Waypoints />} hint="With failures" />
        <StatCard label="People affected" value={t.users} icon={<Users />} hint="Signed in" />
      </div>

      <div className="grid grid-cols-1 gap-2.5 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <Card className="min-w-0">
          <CardHeader className="pb-1">
            <CardTitle className="text-[14px]">Failures by day</CardTitle>
          </CardHeader>
          <CardContent className="pt-1">
            <Bars
              unit="failed"
              tone="warning"
              partLabel="server errors"
              restLabel="Rejected"
              data={d.byDay.map((x) => ({
                key: x.date,
                tick: formatShortDate(x.date).replace(/ \d{4}$/, ''),
                label: formatLongDate(x.date),
                value: x.n,
                part: x.server,
              }))}
            />
          </CardContent>
        </Card>
        <Card className="min-w-0">
          <CardHeader className="pb-1">
            <CardTitle className="text-[14px]">By status and code</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 pt-1">
            <div className="flex flex-wrap gap-1.5">
              {d.byStatus.map((s) => (
                <span key={s.status} className="inline-flex items-center gap-1 text-[12px]">
                  <StatusChip status={s.status} />
                  <span className="tabular text-muted-foreground">×{s.n}</span>
                </span>
              ))}
            </div>
            <RankList
              items={d.byCode.map((c) => ({
                key: c.code ?? 'none',
                label: c.code ?? 'No code',
                value: c.n,
              }))}
            />
          </CardContent>
        </Card>
      </div>

      <Card className="min-w-0">
        <CardHeader className="pb-1">
          <CardTitle className="flex items-baseline justify-between text-[14px]">
            Failing endpoints
            <span className="text-[11px] font-normal text-muted-foreground">Tap to filter</span>
          </CardTitle>
        </CardHeader>
        <CardContent className="-mx-1 divide-y pt-1">
          {d.byRoute.map((r) => (
            <button
              key={r.method + r.route}
              type="button"
              onClick={() => setRoute(route === r.route ? null : r.route)}
              className={cn(
                'flex w-full min-w-0 cursor-pointer items-start gap-2 px-1 py-1.5 text-left transition-colors hover:bg-muted/50',
                route === r.route && 'bg-primary/6',
              )}
            >
              <span
                className={cn(
                  'tabular mt-0.5 inline-flex h-6 min-w-8 shrink-0 items-center justify-center rounded-md px-1 text-[11px] font-semibold',
                  r.server
                    ? 'bg-destructive/12 text-destructive'
                    : 'bg-warning/22 text-warning-foreground dark:text-warning',
                )}
              >
                {r.n}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[13px] font-semibold">
                  {requestLabel(r.method, r.route)}
                </span>
                <span className="block truncate text-[12px] text-muted-foreground">
                  {r.sample ?? `${r.method} ${r.route}`}
                </span>
              </span>
              <span className="shrink-0 text-[11px] text-muted-foreground">
                {relativeTime(r.last)}
              </span>
            </button>
          ))}
        </CardContent>
      </Card>

      <SectionDivider>Failed requests</SectionDivider>
      <div className="flex flex-wrap items-center gap-1.5">
        <Segmented
          ariaLabel="Kind of failure"
          size="sm"
          value={kind}
          onChange={setKind}
          options={[
            { value: 'all', label: 'All' },
            { value: 'server', label: 'Server' },
            { value: 'client', label: 'Rejected' },
          ]}
        />
        {route && <FilterChip onClear={() => setRoute(null)}>{route}</FilterChip>}
      </div>
      {list.isPending ? (
        <ListSkeleton rows={6} />
      ) : list.isError ? (
        <ErrorState error={list.error} onRetry={() => void list.refetch()} />
      ) : rows.length === 0 ? (
        <p className="py-4 text-center text-[13px] text-muted-foreground">None match.</p>
      ) : (
        <>
          <Card className="divide-y overflow-hidden">
            {rows.map((r) => (
              <RequestRow key={r.id} r={r} showActor onOpen={() => setOpen(r)} />
            ))}
          </Card>
          <div className="flex flex-col items-center gap-1.5 py-1">
            {list.hasNextPage && (
              <Button
                variant="outline"
                size="sm"
                disabled={list.isFetchingNextPage}
                onClick={() => void list.fetchNextPage()}
              >
                {list.isFetchingNextPage ? 'Loading…' : 'Load more'}
              </Button>
            )}
            <p className="text-[11px] text-muted-foreground">
              Showing {num(rows.length)} of {num(total)}, newest first
            </p>
          </div>
        </>
      )}
      <RequestDetails r={open} onClose={() => setOpen(null)} />
    </div>
  );
}
