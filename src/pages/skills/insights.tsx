/**
 * Skill insights for a month: coverage, batch heatmap, movers, levels, strongest/weakest skills,
 * trend and (admins) how each coach rates.
 */
import { Award, ClipboardCheck, Gauge, TrendingUp } from 'lucide-react';
import { Link } from 'react-router';
import { EmptyState, ErrorState, SectionDivider, StatCard } from '@/components/common';
import { Card, CardContent, CardHeader, CardTitle, Skeleton } from '@/components/ui/primitives';
import { score, useSkillInsights, type SkillInsights } from '@/lib/skills';
import { cn } from '@/lib/utils';
import { Change, LevelBadge } from './ui';
import { heat, monthName, monthShort } from './meta';

function Panel({
  title,
  hint,
  children,
}: {
  title: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <Card className="min-w-0">
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

export function InsightsTab({
  month,
  batchId,
  admin,
}: {
  month: string;
  batchId?: string;
  admin: boolean;
}) {
  const q = useSkillInsights(month, batchId);
  if (q.isError) return <ErrorState error={q.error} onRetry={() => void q.refetch()} />;
  if (!q.data)
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
  const d = q.data;
  const t = d.totals;
  if (!t.students)
    return (
      <EmptyState
        title="No students yet"
        description="Insights appear once batches have students."
      />
    );

  return (
    <div className={cn('space-y-2.5', q.isPlaceholderData && 'opacity-60')}>
      <SectionDivider>{monthName(d.month)}</SectionDivider>
      <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
        <StatCard
          label="Assessed"
          value={`${t.assessed}/${t.students}`}
          icon={<ClipboardCheck />}
          tone={
            t.coverage === 100
              ? 'success'
              : t.coverage !== null && t.coverage < 50
                ? 'warning'
                : 'default'
          }
          hint={t.coverage !== null ? `${t.coverage}% coverage` : undefined}
        />
        <StatCard
          label="Average score"
          value={t.average !== null ? `${score(t.average)} / 5` : '—'}
          icon={<Gauge />}
          hint="This month’s assessments"
        />
        <StatCard
          label="Improved"
          value={`${t.improved}`}
          icon={<TrendingUp />}
          tone="success"
          hint={`${t.declined} declined`}
        />
        <StatCard
          label="Moved up a level"
          value={`${t.promoted}`}
          icon={<Award />}
          hint={`${t.demoted} moved down`}
        />
      </div>

      <div className="grid grid-cols-1 gap-2.5 *:min-w-0 lg:grid-cols-2">
        <Coverage d={d} />
        <Panel title="Levels" hint="From each student’s latest assessment">
          {d.levels.map((s) => {
            const max = Math.max(1, ...s.levels.map((l) => l.n), s.unranked);
            return (
              <div key={s.sportId} className="mb-2 last:mb-0">
                {d.levels.length > 1 && (
                  <p className="mb-1 text-[12px] font-semibold text-muted-foreground">
                    {s.sportName}
                  </p>
                )}
                <ul className="space-y-1">
                  {s.levels.map((l) => (
                    <li key={l.name} className="flex items-center gap-2 text-[13px]">
                      <LevelBadge
                        name={l.name}
                        code={l.code}
                        short
                        className="w-12 justify-center"
                      />
                      <span className="w-40 truncate text-[12px] text-muted-foreground">
                        {l.name}
                      </span>
                      <span className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
                        <span
                          className="block h-full rounded-full bg-primary/70"
                          style={{ width: `${(l.n / max) * 100}%` }}
                        />
                      </span>
                      <span className="w-6 text-right font-semibold tabular-nums">{l.n}</span>
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
        </Panel>
      </div>

      <Heatmap d={d} />

      <div className="grid grid-cols-1 gap-2.5 *:min-w-0 lg:grid-cols-2">
        <Movers
          title="Most improved"
          list={d.improved}
          empty="No improvements recorded this month yet"
        />
        <Movers title="Needs support" list={d.atRisk} empty="Nobody’s score dropped this month" />
      </div>

      <div className="grid grid-cols-1 gap-2.5 *:min-w-0 lg:grid-cols-3">
        <SkillList title="Strongest skills" list={d.strongest} />
        <SkillList title="Skills to work on" list={d.weakest} />
        <Panel title="Average over 6 months">
          <div className="flex h-28 items-end gap-1.5">
            {d.trend.map((m) => (
              <div key={m.month} className="flex min-w-0 flex-1 flex-col items-center gap-1">
                <span className="text-[10px] font-semibold tabular-nums">
                  {m.average !== null ? score(m.average) : ''}
                </span>
                <span
                  className="w-full rounded-t-[4px] bg-primary/70"
                  style={{ height: `${m.average !== null ? (m.average / 500) * 80 : 2}px` }}
                  title={`${monthName(m.month)}: ${m.assessed} assessed`}
                />
                <span className="text-[10px] text-muted-foreground">{monthShort(m.month)}</span>
              </div>
            ))}
          </div>
        </Panel>
      </div>

      {admin && d.coaches.length > 0 && (
        <Panel title="Coaches" hint="Assessed this month · average rating given">
          <ul className="divide-y text-[13px]">
            {d.coaches.map((c) => (
              <li key={c.coachId} className="flex items-center gap-2 py-1.5">
                <span className="min-w-0 flex-1 truncate font-medium">{c.name}</span>
                <span className="text-muted-foreground tabular-nums">
                  {c.assessed}/{c.students}
                </span>
                <span className="w-14 text-right font-semibold tabular-nums">
                  {c.averageGiven !== null ? score(c.averageGiven) : '—'}
                </span>
              </li>
            ))}
          </ul>
        </Panel>
      )}

      {d.staleCount > 0 && (
        <Panel
          title="Not assessed recently"
          hint={`${d.staleCount} students · none this or last month`}
        >
          <ul className="flex flex-wrap gap-1.5">
            {d.stale.map((s) => (
              <li key={s.studentId + s.batchName}>
                <Link
                  to={`/students/${s.studentId}`}
                  className="inline-flex rounded-full bg-muted px-2 py-0.5 text-[12px] hover:bg-muted/70"
                >
                  {s.fullName}
                  <span className="ml-1 text-muted-foreground">· {s.batchName}</span>
                </Link>
              </li>
            ))}
          </ul>
        </Panel>
      )}
    </div>
  );
}

function Coverage({ d }: { d: SkillInsights }) {
  return (
    <Panel title="Coverage" hint="Students still to assess this month">
      <ul className="space-y-2">
        {d.coverage.map((c) => {
          const pct = c.students ? Math.round((c.assessed / c.students) * 100) : 0;
          return (
            <li key={c.batchId}>
              <div className="flex items-baseline justify-between gap-2 text-[13px]">
                <span className="min-w-0 truncate font-medium">
                  {c.batchName}
                  <span className="font-normal text-muted-foreground"> · {c.coachName}</span>
                </span>
                <span className="shrink-0 tabular-nums">
                  {c.assessed}/{c.students}
                </span>
              </div>
              <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-muted">
                <div
                  className={cn('h-full rounded-full', pct === 100 ? 'bg-success' : 'bg-primary')}
                  style={{ width: `${pct}%` }}
                />
              </div>
              {c.pending.length > 0 && c.pending.length <= 8 && (
                <p className="mt-0.5 truncate text-[11px] text-muted-foreground">
                  Pending: {c.pending.map((p) => p.fullName).join(', ')}
                </p>
              )}
            </li>
          );
        })}
      </ul>
    </Panel>
  );
}

function Heatmap({ d }: { d: SkillInsights }) {
  const areas = [...new Set(d.heatmap.flatMap((b) => b.areas.map((a) => a.name)))];
  if (!areas.length || d.heatmap.every((b) => b.assessed === 0)) return null;
  return (
    <Panel title="Batch skill map" hint="Average per area, latest assessments">
      <div className="-mx-1 overflow-x-auto px-1">
        <table className="w-full min-w-[28rem] border-separate border-spacing-1 text-[12px]">
          <thead>
            <tr>
              <th className="text-left font-medium text-muted-foreground">Batch</th>
              {areas.map((a) => (
                <th key={a} className="px-1 font-medium text-muted-foreground">
                  {a}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {d.heatmap.map((b) => (
              <tr key={b.batchId}>
                <td className="max-w-36 truncate pr-2 font-medium">{b.batchName}</td>
                {areas.map((name) => {
                  const cell = b.areas.find((a) => a.name === name);
                  const v = cell?.average ?? null;
                  return (
                    <td
                      key={name}
                      className={cn(
                        'rounded-md px-1 py-1.5 text-center font-semibold tabular-nums',
                        heat(v),
                      )}
                    >
                      {v !== null ? score(v) : '—'}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Panel>
  );
}

function Movers({
  title,
  list,
  empty,
}: {
  title: string;
  list: SkillInsights['improved'];
  empty: string;
}) {
  return (
    <Panel title={title}>
      {list.length ? (
        <ul className="divide-y">
          {list.map((m) => (
            <li key={m.studentId}>
              <Link
                to={`/students/${m.studentId}`}
                className="flex items-center gap-2 py-1.5 text-[13px] hover:text-primary"
              >
                <span className="min-w-0 flex-1 truncate">
                  <span className="font-medium">{m.fullName}</span>
                  <span className="text-muted-foreground"> · {m.batchName}</span>
                </span>
                {m.levelChange !== 0 && m.levelName && (
                  <LevelBadge name={m.levelName} code={m.levelCode} short />
                )}
                <span className="tabular-nums">{score(m.average)}</span>
                <Change value={m.change} />
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <p className="py-3 text-center text-[13px] text-muted-foreground">{empty}</p>
      )}
    </Panel>
  );
}

function SkillList({ title, list }: { title: string; list: SkillInsights['strongest'] }) {
  return (
    <Panel title={title}>
      {list.length ? (
        <ul className="space-y-1">
          {list.map((k) => (
            <li key={k.skillId} className="flex items-center gap-2 text-[13px]">
              <span className="min-w-0 flex-1 truncate">
                {k.name}
                <span className="text-muted-foreground"> · {k.area}</span>
              </span>
              <span
                className={cn(
                  'rounded-md px-1.5 py-0.5 text-[12px] font-semibold tabular-nums',
                  heat(k.average),
                )}
              >
                {score(k.average)}
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="py-3 text-center text-[13px] text-muted-foreground">No ratings yet</p>
      )}
    </Panel>
  );
}
