/**
 * A student's skills: current level and score, each area now vs last time, the score over
 * months, and every assessment with the coach's remarks.
 */
import { EmptyState, ErrorState, ListSkeleton, SectionDivider } from '@/components/common';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/primitives';
import {
  RATING_LABELS,
  ratingLabel,
  score,
  useStudentSkills,
  type StudentSkills,
} from '@/lib/skills';
import { cn } from '@/lib/utils';
import { heat, monthName, monthShort } from '../skills/meta';
import { Change, LevelBadge } from '../skills/ui';

export function ProgressTab({ id }: { id: string }) {
  const q = useStudentSkills(id);
  if (q.isPending) return <ListSkeleton rows={4} />;
  if (q.isError) return <ErrorState error={q.error} onRetry={() => void q.refetch()} />;
  if (!q.data.length)
    return (
      <EmptyState
        title="No skill assessments yet"
        description="The batch’s coach rates each skill once a month under Skills."
      />
    );
  return (
    <div className="space-y-4">
      {q.data.map((p) => (
        <SportProgress key={p.assessments[0]!.batchId} p={p} showBatch={q.data.length > 1} />
      ))}
    </div>
  );
}

function SportProgress({ p, showBatch }: { p: StudentSkills; showBatch: boolean }) {
  const latest = p.assessments.at(-1)!;
  const history = [...p.assessments].reverse();
  const skills = p.framework.areas.flatMap((a) => a.skills.map((k) => ({ ...k, area: a.name })));
  return (
    <div className="space-y-2.5">
      {showBatch && <SectionDivider>{latest.batchName}</SectionDivider>}
      <Card className="flex flex-wrap items-center gap-3 p-3">
        <div className="min-w-0 flex-1">
          <p className="text-[12px] text-muted-foreground">
            {p.framework.sport.name} · {monthName(p.current.month)} · by {latest.coachName}
          </p>
          <p className="flex items-center gap-2 text-2xl font-bold">
            {score(p.current.average)}
            <span className="text-sm font-medium text-muted-foreground">
              / 5 · {ratingLabel(p.current.average)}
            </span>
            <Change value={p.current.change} />
          </p>
        </div>
        {p.current.levelName && (
          <LevelBadge
            name={p.current.levelName}
            code={p.current.levelCode}
            className="text-[13px]"
          />
        )}
      </Card>

      <div className="grid grid-cols-1 gap-2.5 *:min-w-0 lg:grid-cols-2">
        <Card>
          <CardHeader className="pb-1">
            <CardTitle className="text-[14px]">Areas</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1.5 pt-1">
            {p.areas.map((a) => (
              <div key={a.id}>
                <div className="flex items-center justify-between gap-2 text-[13px]">
                  <span className="truncate font-medium">{a.name}</span>
                  <span className="flex items-center gap-1.5">
                    <Change value={a.before !== null && a.now !== null ? a.now - a.before : null} />
                    <span className="font-semibold tabular-nums">{score(a.now!)}</span>
                  </span>
                </div>
                <div className="relative mt-1 h-1.5 overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full rounded-full bg-primary"
                    style={{ width: `${(a.now! / 500) * 100}%` }}
                  />
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-1">
            <CardTitle className="text-[14px]">Score by month</CardTitle>
          </CardHeader>
          <CardContent className="pt-1">
            <div className="flex h-32 items-end gap-1.5">
              {p.assessments.slice(-12).map((a) => (
                <div key={a.month} className="flex min-w-0 flex-1 flex-col items-center gap-1">
                  <span className="text-[10px] font-semibold tabular-nums">{score(a.average)}</span>
                  <span
                    className="w-full rounded-t-[4px] bg-primary/75"
                    style={{ height: `${(a.average / 500) * 88}px` }}
                    title={`${monthName(a.month)}${a.levelName ? ` · ${a.levelName}` : ''}`}
                  />
                  <span className="text-[10px] text-muted-foreground">{monthShort(a.month)}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="pb-1">
          <CardTitle className="text-[14px]">Latest ratings</CardTitle>
        </CardHeader>
        <CardContent className="pt-1">
          <ul className="grid gap-x-6 gap-y-1 sm:grid-cols-2">
            {skills
              .filter((k) => latest.ratings[k.id] !== undefined)
              .map((k) => {
                const v = latest.ratings[k.id]!;
                return (
                  <li key={k.id} className="flex items-center justify-between gap-2 text-[13px]">
                    <span className="min-w-0 truncate">
                      {k.name}
                      <span className="text-muted-foreground"> · {k.area}</span>
                    </span>
                    <span
                      className={cn(
                        'shrink-0 rounded-md px-1.5 py-0.5 text-[11px] font-semibold',
                        heat(v * 100),
                      )}
                      title={RATING_LABELS[v - 1]}
                    >
                      {v} · {RATING_LABELS[v - 1]}
                    </span>
                  </li>
                );
              })}
          </ul>
        </CardContent>
      </Card>

      {history.some((a) => a.comment || a.goals) && (
        <Card>
          <CardHeader className="pb-1">
            <CardTitle className="text-[14px]">Coach remarks</CardTitle>
          </CardHeader>
          <CardContent className="divide-y pt-1">
            {history
              .filter((a) => a.comment || a.goals)
              .slice(0, 6)
              .map((a) => (
                <div key={a.id} className="py-2 text-[13px]">
                  <p className="text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">
                    {monthName(a.month)} · {a.coachName}
                  </p>
                  {a.comment && <p className="mt-0.5">{a.comment}</p>}
                  {a.goals && (
                    <p className="mt-0.5 text-muted-foreground">
                      <b className="font-medium text-foreground">Goals:</b> {a.goals}
                    </p>
                  )}
                </div>
              ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
