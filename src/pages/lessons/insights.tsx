import {
  CalendarCheck2,
  CalendarRange,
  CalendarX2,
  ChevronRight,
  Flame,
  Layers3,
  ListChecks,
  Sparkles,
  Target,
} from 'lucide-react';
import { useState } from 'react';
import { EmptyState, ErrorState, ListSkeleton, StatCard } from '@/components/common';
import { Tooltip } from '@/components/ui/overlays';
import {
  Badge,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Select,
} from '@/components/ui/primitives';
import { formatShortDate, formatTimeRange, plural } from '@/lib/format';
import { useLessonInsights } from '@/lib/queries';
import type { LessonInsights } from '@/lib/types';
import { cn } from '@/lib/utils';
import {
  daysAgo,
  pct,
  whenLabel,
  RANGE_OPTIONS,
  rangeDates,
  STATUS_META,
  type InsightRange,
} from './meta';

/** Planning health across the coach's batches (or the chosen batch, for admins). */
export function LessonInsightsView({
  batchId,
  onOpen,
}: {
  batchId?: string;
  onOpen: (batchId: string, date: string) => void;
}) {
  const [range, setRange] = useState<InsightRange>('4w');
  const { from, to } = rangeDates(range);
  const q = useLessonInsights({ from, to, batchId: batchId || undefined });

  return (
    <div className="space-y-2.5">
      <div className="flex items-center gap-2">
        <p className="flex min-w-0 flex-1 items-center gap-1.5 text-[12px] text-muted-foreground">
          <CalendarRange aria-hidden className="size-3.5 shrink-0" />
          <span className="truncate">
            {formatShortDate(from)} – {formatShortDate(to)}
            {q.data && ` · ${plural(q.data.totals.sessions, 'session')}`}
          </span>
        </p>
        <Select
          aria-label="Period"
          className="h-8 w-40 shrink-0 text-[13px]"
          value={range}
          onChange={(e) => setRange(e.target.value as InsightRange)}
        >
          {RANGE_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </Select>
      </div>
      {q.isPending ? (
        <ListSkeleton rows={5} />
      ) : q.isError ? (
        <ErrorState error={q.error} onRetry={() => void q.refetch()} />
      ) : q.data.batches.length === 0 ? (
        <EmptyState
          icon={<Layers3 />}
          title="No active batches"
          description="Insights appear once you have a batch to plan for."
        />
      ) : (
        <Body d={q.data} onOpen={onOpen} />
      )}
    </div>
  );
}

function Body({ d, onOpen }: { d: LessonInsights; onOpen: (b: string, date: string) => void }) {
  const t = d.totals;
  const coverage = t.sessions ? t.planned / t.sessions : null;
  const multiCoach = new Set(d.batches.map((b) => b.coach.id)).size > 1;
  return (
    <>
      <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
        <StatCard
          label="Sessions planned"
          value={
            <span className="tabular">
              {t.planned}
              <span className="text-[0.6em] font-medium text-muted-foreground">/{t.sessions}</span>
            </span>
          }
          hint={`${pct(coverage)} coverage${t.cancelled ? ` · ${t.cancelled} cancelled` : ''}`}
          icon={<CalendarCheck2 />}
          tone={coverage === null ? 'default' : coverage >= 0.9 ? 'success' : 'warning'}
        />
        <StatCard
          label="Grid filled"
          value={pct(t.fillRate)}
          hint={`${plural(t.complete, 'plan')} fully filled`}
          icon={<ListChecks />}
          tone={t.fillRate !== null && t.fillRate >= 0.8 ? 'success' : 'default'}
        />
        <StatCard
          label="Missed"
          value={<span className="tabular">{t.missed}</span>}
          hint={
            t.upcomingUnplanned
              ? `${t.upcomingUnplanned} upcoming unplanned`
              : 'Next 2 weeks covered'
          }
          icon={<CalendarX2 />}
          tone={t.missed ? 'destructive' : 'success'}
        />
        <StatCard
          label="Planning streak"
          value={<span className="tabular">{t.streak}</span>}
          hint={`${t.planned ? pct(t.plannedAhead / t.planned) : '—'} planned ahead`}
          icon={<Flame />}
          tone={t.streak >= 5 ? 'success' : 'default'}
        />
      </div>

      <div className="grid grid-cols-1 gap-3 *:min-w-0 lg:grid-cols-2">
        <WeeklyCoverage weeks={d.weeks} />
        <BatchTable d={d} multiCoach={multiCoach} onOpen={onOpen} />
      </div>
      <div className="grid grid-cols-1 gap-3 *:min-w-0 lg:grid-cols-2">
        <DrillUsage d={d} />
        <StageBalance stages={d.stages} />
      </div>
    </>
  );
}

/** One stacked bar per week: fully planned, partly planned, and not planned. */
function WeeklyCoverage({ weeks }: { weeks: LessonInsights['weeks'] }) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-[15px]">Week by week</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {weeks.length === 0 ? (
          <p className="text-[13px] text-muted-foreground">No sessions in this period.</p>
        ) : (
          <ul className="space-y-1.5">
            {weeks.map((w) => {
              const partial = w.planned - w.complete;
              const none = w.sessions - w.planned;
              const seg = (n: number) => `${(n / w.sessions) * 100}%`;
              return (
                <li key={w.start} className="flex items-center gap-2 text-[12px]">
                  <span className="w-14 shrink-0 text-muted-foreground">
                    {formatShortDate(w.start)}
                  </span>
                  <Tooltip
                    content={`${w.complete} fully planned · ${partial} partly · ${none} not planned`}
                  >
                    <span
                      className="flex h-3.5 min-w-0 flex-1 gap-0.5 overflow-hidden rounded"
                      role="img"
                      aria-label={`Week of ${formatShortDate(w.start)}: ${w.planned} of ${w.sessions} planned`}
                    >
                      {w.complete > 0 && (
                        <span
                          className="h-full rounded-sm bg-success"
                          style={{ width: seg(w.complete) }}
                        />
                      )}
                      {partial > 0 && (
                        <span
                          className="h-full rounded-sm bg-warning"
                          style={{ width: seg(partial) }}
                        />
                      )}
                      {none > 0 && (
                        <span className="h-full rounded-sm bg-muted" style={{ width: seg(none) }} />
                      )}
                    </span>
                  </Tooltip>
                  <span className="tabular w-10 shrink-0 text-right font-medium">
                    {w.planned}/{w.sessions}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
        <ul className="flex flex-wrap gap-x-3 gap-y-0.5 pt-1 text-[11px] text-muted-foreground">
          <li className="inline-flex items-center gap-1">
            <span className="size-2 rounded-sm bg-success" /> Fully planned
          </li>
          <li className="inline-flex items-center gap-1">
            <span className="size-2 rounded-sm bg-warning" /> Partly
          </li>
          <li className="inline-flex items-center gap-1">
            <span className="size-2 rounded-sm bg-muted ring-1 ring-border" /> Not planned
          </li>
        </ul>
      </CardContent>
    </Card>
  );
}

function BatchTable({
  d,
  multiCoach,
  onOpen,
}: {
  d: LessonInsights;
  multiCoach: boolean;
  onOpen: (b: string, date: string) => void;
}) {
  return (
    <Card>
      <CardHeader className="pb-1">
        <CardTitle className="text-[15px]">By batch</CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        <ul className="divide-y">
          {d.batches.map((b) => {
            const cov = b.sessions ? b.planned / b.sessions : null;
            return (
              <li key={b.id}>
                <button
                  type="button"
                  onClick={() => onOpen(b.id, b.next?.date ?? d.today)}
                  className="flex w-full cursor-pointer items-center gap-3 px-4 py-2.5 text-left hover:bg-muted/50"
                >
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[14px] font-medium">{b.name}</span>
                    <span className="block truncate text-[12px] text-muted-foreground">
                      {formatTimeRange(b.startTime, b.endTime)}
                      {multiCoach ? ` · ${b.coach.name}` : ` · ${b.location.name}`}
                    </span>
                    {b.next && (
                      <span className="mt-0.5 inline-flex items-center gap-1 text-[11px]">
                        <span
                          className={cn('size-1.5 rounded-full', STATUS_META[b.next.status].dot)}
                        />
                        Next {whenLabel(b.next.date, d.today)}:{' '}
                        {STATUS_META[b.next.status].label.toLowerCase()}
                      </span>
                    )}
                  </span>
                  <span className="flex shrink-0 flex-col items-end gap-0.5">
                    <span className="tabular text-[14px] font-semibold">
                      {b.planned}/{b.sessions}
                    </span>
                    <span className="flex gap-1">
                      {b.missed > 0 && <Badge variant="destructive">{b.missed} missed</Badge>}
                      <Badge variant={cov !== null && cov >= 0.9 ? 'success' : 'muted'}>
                        {pct(cov)}
                      </Badge>
                    </span>
                  </span>
                  <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
                </button>
              </li>
            );
          })}
        </ul>
      </CardContent>
    </Card>
  );
}

function DrillUsage({ d }: { d: LessonInsights }) {
  const [all, setAll] = useState(false);
  const max = Math.max(1, ...d.events.map((e) => e.plans));
  const list = all ? d.events : d.events.slice(0, 8);
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-[15px]">
          <Target className="size-4 text-muted-foreground" /> Drills you run most
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {d.events.length === 0 ? (
          <p className="text-[13px] text-muted-foreground">No plans in this period yet.</p>
        ) : (
          <ul className="space-y-1.5">
            {list.map((e) => (
              <li key={e.id} className="text-[12px]">
                <div className="mb-0.5 flex items-baseline gap-2">
                  <span className="min-w-0 flex-1 truncate text-[13px] font-medium">{e.name}</span>
                  <span className="tabular shrink-0 text-muted-foreground">
                    {plural(e.plans, 'session')} · last {whenLabel(e.lastUsed, d.today)}
                  </span>
                </div>
                <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full rounded-full bg-primary"
                    style={{ width: `${(e.plans / max) * 100}%` }}
                  />
                </div>
              </li>
            ))}
          </ul>
        )}
        {d.events.length > 8 && (
          <button
            type="button"
            className="cursor-pointer text-[12px] font-medium text-primary hover:underline"
            onClick={() => setAll((a) => !a)}
          >
            {all ? 'Show fewer' : `Show all ${d.events.length}`}
          </button>
        )}
        {d.unusedEvents && d.unusedEvents.length > 0 && (
          <div className="rounded-lg bg-muted/50 p-2.5">
            <p className="mb-1.5 flex items-center gap-1.5 text-[12px] font-medium">
              <Sparkles className="size-3.5 text-primary" />
              Not used in this period
            </p>
            <ul className="flex flex-wrap gap-1">
              {d.unusedEvents.map((e) => (
                <li key={e.id}>
                  <Badge variant="outline" className="bg-card font-normal">
                    {e.name}
                    <span className="text-muted-foreground">
                      · {e.lastUsed ? daysAgo(e.lastUsed, d.today) : 'never'}
                    </span>
                  </Badge>
                </li>
              ))}
            </ul>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

/** How the filled cells spread over the session's stages, in the coach's own stage colours. */
function StageBalance({ stages }: { stages: LessonInsights['stages'] }) {
  const total = stages.reduce((n, s) => n + s.cells, 0);
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-[15px]">
          <Layers3 className="size-4 text-muted-foreground" /> Time across stages
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2.5">
        {total === 0 ? (
          <p className="text-[13px] text-muted-foreground">
            Fill in some plans to see the balance.
          </p>
        ) : (
          <>
            <div
              className="flex h-3 gap-0.5 overflow-hidden rounded"
              role="img"
              aria-label={stages
                .map((s) => `${s.name} ${Math.round((s.cells / total) * 100)}%`)
                .join(', ')}
            >
              {stages
                .filter((s) => s.cells > 0)
                .map((s) => (
                  <span
                    key={s.id}
                    className="h-full rounded-sm"
                    style={{
                      width: `${(s.cells / total) * 100}%`,
                      background: s.color ?? '#94a3b8',
                    }}
                  />
                ))}
            </div>
            <ul className="space-y-1">
              {stages.map((s) => (
                <li key={s.id} className="flex items-center gap-2 text-[13px]">
                  <span
                    className="size-2.5 shrink-0 rounded-full"
                    style={{ background: s.color ?? '#94a3b8' }}
                  />
                  <span className="min-w-0 flex-1 truncate">{s.name}</span>
                  <span className="tabular text-[12px] text-muted-foreground">
                    {plural(s.cells, 'item')} · {plural(s.plans, 'plan')}
                  </span>
                  <span className="tabular w-9 text-right font-medium">
                    {Math.round((s.cells / total) * 100)}%
                  </span>
                </li>
              ))}
            </ul>
          </>
        )}
      </CardContent>
    </Card>
  );
}
