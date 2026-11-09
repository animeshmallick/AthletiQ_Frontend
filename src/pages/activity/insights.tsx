/**
 * Activity insights for a period: how much happened, when, where, who, what needs a second look,
 * and how the app performed for those changes (from the request log).
 */
import {
  Activity,
  AlertTriangle,
  CalendarDays,
  Gauge,
  ShieldAlert,
  Timer,
  TrendingDown,
  TrendingUp,
  Users,
  Waypoints,
} from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { ErrorState, SectionDivider, StatCard } from '@/components/common';
import { Card, CardContent, CardHeader, CardTitle, Skeleton } from '@/components/ui/primitives';
import { formatLongDate, formatShortDate } from '@/lib/format';
import {
  useActivityInsights,
  useRequestInsights,
  type ActivityInsights,
  type ActivityLog,
} from '@/lib/queries';
import { cn } from '@/lib/utils';
import { Bars, HourStrip, RankList } from './charts';
import { EventDetails, EventRow, type FeedFilters } from './feed';
import { entityMeta, hourLabel, humanize, ms, num, requestLabel } from './meta';

export type Drill = Partial<Pick<FeedFilters, 'entityType' | 'actorId' | 'sensitive' | 'search'>>;

function Panel({
  title,
  hint,
  children,
  className,
}: {
  title: string;
  hint?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <Card className={cn('min-w-0', className)}>
      <CardHeader className="pb-1">
        <CardTitle className="flex items-baseline justify-between gap-2 text-[14px]">
          <span className="truncate">{title}</span>
          {hint && (
            <span className="shrink-0 text-[11px] font-normal text-muted-foreground">{hint}</span>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="pt-1">{children}</CardContent>
    </Card>
  );
}

function Change({ value }: { value: number | null }) {
  if (value === null) return <>Nothing in the period before</>;
  const Icon = value >= 0 ? TrendingUp : TrendingDown;
  return (
    <span className="inline-flex items-center gap-1">
      <Icon className="size-3.5" />
      {value > 0 ? '+' : ''}
      {value}% vs the period before
    </span>
  );
}

export function ActivityInsightsView({
  range,
  admin,
  onDrill,
}: {
  range: { from: string; to: string };
  admin: boolean;
  /** Open the Activity tab with these filters. */
  onDrill: (d: Drill) => void;
}) {
  const q = useActivityInsights(range);
  const rq = useRequestInsights(range);
  const [open, setOpen] = useState<ActivityLog | null>(null);
  const d = q.data;

  if (q.isError) return <ErrorState error={q.error} onRetry={() => void q.refetch()} />;
  if (!d)
    return (
      <div className="space-y-2.5">
        <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-20 rounded-xl" />
          ))}
        </div>
        <Skeleton className="h-48 rounded-xl" />
      </div>
    );

  const t = d.totals;
  const days = d.byDay.length;
  return (
    <div className={cn('space-y-2.5 transition-opacity', q.isPlaceholderData && 'opacity-60')}>
      <SectionDivider>Overview</SectionDivider>
      <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
        <StatCard
          label="Actions"
          value={num(t.events)}
          icon={<Activity />}
          hint={<Change value={t.change} />}
        />
        {admin ? (
          <StatCard
            label="People active"
            value={t.people}
            icon={<Users />}
            hint={`${num(t.records)} records touched`}
          />
        ) : (
          <StatCard
            label="Records touched"
            value={num(t.records)}
            icon={<Users />}
            hint={`${t.perDay} actions a day`}
          />
        )}
        <StatCard
          label="Active days"
          value={`${t.activeDays}/${days}`}
          icon={<CalendarDays />}
          hint={
            d.busiestDay
              ? `Busiest ${formatShortDate(d.busiestDay.date)} (${d.busiestDay.n})`
              : 'No activity'
          }
        />
        <button
          type="button"
          className="cursor-pointer text-left"
          onClick={() => onDrill({ sensitive: true })}
          aria-label={`${t.sensitive} sensitive actions; show them`}
        >
          <StatCard
            label="Worth a second look"
            value={t.sensitive}
            icon={<ShieldAlert />}
            tone={t.sensitive ? 'warning' : 'success'}
            hint="Refunds, reversals, deletions, access"
          />
        </button>
      </div>

      <div className="grid grid-cols-1 gap-2.5 lg:grid-cols-2">
        <Panel
          title="Actions by day"
          hint={`${formatShortDate(d.from)} – ${formatShortDate(d.to)}`}
        >
          <Bars
            unit="actions"
            data={d.byDay.map((x) => ({
              key: x.date,
              tick: formatShortDate(x.date).replace(/ \d{4}$/, ''),
              label: formatLongDate(x.date),
              value: x.n,
            }))}
          />
        </Panel>
        <Panel
          title="Time of day"
          hint={d.busiestHour !== null ? `Peak ${hourLabel(d.busiestHour)}` : undefined}
        >
          <HourStrip hours={d.byHour} unit="actions" />
        </Panel>
      </div>

      <SectionDivider>Where and who</SectionDivider>
      <div className={cn('grid grid-cols-1 gap-2.5', admin ? 'lg:grid-cols-3' : 'lg:grid-cols-2')}>
        <Panel title="By area" hint="Tap to see them">
          <RankList
            items={d.byEntity.map((e) => {
              const m = entityMeta(e.entityType);
              return {
                key: e.entityType,
                label: m.label,
                value: e.n,
                icon: (
                  <span
                    className={cn(
                      'flex size-7 shrink-0 items-center justify-center rounded-lg [&_svg]:size-3.5',
                      m.tone,
                    )}
                  >
                    <m.icon />
                  </span>
                ),
                onClick: () => onDrill({ entityType: e.entityType }),
              };
            })}
          />
        </Panel>
        <Panel title="Most common actions">
          <RankList
            items={d.byAction.map((a) => ({
              key: a.action,
              label: humanize(a.action),
              value: a.n,
              onClick: () => onDrill({ search: a.action }),
            }))}
          />
        </Panel>
        {admin && (
          <Panel title="Most active people">
            <RankList
              items={d.byActor.map((p) => ({
                key: p.id,
                label: p.name,
                value: p.n,
                hint: p.role,
                onClick: () => onDrill({ actorId: p.id }),
              }))}
            />
          </Panel>
        )}
      </div>

      <Notable d={d} onOpen={setOpen} admin={admin} onAll={() => onDrill({ sensitive: true })} />

      <SectionDivider>Every change and how fast it was</SectionDivider>
      <RequestStats q={rq} admin={admin} onPerson={(id) => onDrill({ actorId: id })} />

      <EventDetails log={open} onClose={() => setOpen(null)} />
    </div>
  );
}

function Notable({
  d,
  admin,
  onOpen,
  onAll,
}: {
  d: ActivityInsights;
  admin: boolean;
  onOpen: (l: ActivityLog) => void;
  onAll: () => void;
}) {
  return (
    <Panel
      title="Needs a second look"
      hint={
        d.totals.sensitive > d.notable.length ? (
          <button
            type="button"
            className="cursor-pointer text-primary hover:underline"
            onClick={onAll}
          >
            See all {d.totals.sensitive}
          </button>
        ) : undefined
      }
    >
      {d.notable.length ? (
        <div className="-mx-1 divide-y">
          {d.notable.map((l) => (
            <EventRow key={l.id} log={l} showActor={admin} onOpen={() => onOpen(l)} />
          ))}
        </div>
      ) : (
        <p className="flex items-center justify-center gap-1.5 py-3 text-[13px] text-muted-foreground">
          <AlertTriangle className="size-4" /> No refunds, reversals, deletions or access changes in
          this period.
        </p>
      )}
    </Panel>
  );
}

function RequestStats({
  q,
  admin,
  onPerson,
}: {
  q: ReturnType<typeof useRequestInsights>;
  admin: boolean;
  onPerson: (id: string) => void;
}) {
  if (q.isError) return <ErrorState error={q.error} onRetry={() => void q.refetch()} />;
  const r = q.data;
  if (!r) return <Skeleton className="h-40 rounded-xl" />;
  const t = r.totals;
  const failRate = t.total ? Math.round((t.failed / t.total) * 1000) / 10 : 0;
  return (
    <>
      <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
        <StatCard
          label="Changes saved"
          value={num(t.writes)}
          icon={<Waypoints />}
          hint={`${num(t.total)} requests recorded`}
        />
        <StatCard
          label="Failed"
          value={num(t.failed)}
          icon={<AlertTriangle />}
          tone={t.failed ? 'warning' : 'success'}
          hint={`${failRate}% of requests`}
        />
        <StatCard label="Typical response" value={ms(t.avgMs)} icon={<Timer />} hint="Average" />
        <StatCard
          label="Slowest 5%"
          value={ms(t.p95Ms)}
          icon={<Gauge />}
          tone={t.p95Ms > 2000 ? 'warning' : 'default'}
          hint="95% finish faster"
        />
      </div>
      <div className={cn('grid grid-cols-1 gap-2.5', admin ? 'lg:grid-cols-3' : 'lg:grid-cols-2')}>
        <Panel title="Busiest screens">
          <RankList
            empty="No changes recorded"
            items={r.byRoute.map((x) => ({
              key: x.method + x.route,
              label: requestLabel(x.method, x.route),
              value: x.n,
              hint: x.failed ? `${x.failed} failed` : undefined,
            }))}
          />
        </Panel>
        <Panel title="Slowest" hint="Average, in ms">
          <RankList
            empty="No changes recorded"
            items={r.slowest.map((x) => ({
              key: x.method + x.route,
              label: requestLabel(x.method, x.route),
              value: x.avgMs,
              hint: `max ${ms(x.maxMs)}`,
            }))}
          />
        </Panel>
        {admin && (
          <Panel title="Changes by person">
            <RankList
              empty="No changes recorded"
              items={r.byPerson.map((p) => ({
                key: p.id,
                label: p.name,
                value: p.n,
                hint: p.failed ? `${p.failed} failed` : p.role,
                onClick: () => onPerson(p.id),
              }))}
            />
          </Panel>
        )}
      </div>
    </>
  );
}
