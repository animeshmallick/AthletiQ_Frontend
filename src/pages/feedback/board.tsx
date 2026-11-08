import {
  ChevronLeft,
  ChevronRight,
  CircleCheck,
  CircleDashed,
  MessageSquareText,
  PencilLine,
} from 'lucide-react';
import { useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { useUser } from '@/app/auth';
import {
  Avatar,
  EmptyState,
  ErrorState,
  ListSkeleton,
  PageHeader,
  Progress,
} from '@/components/common';
import { Button } from '@/components/ui/button';
import { Segmented } from '@/components/ui/controls';
import { Badge, Card } from '@/components/ui/primitives';
import { addDays, formatShortDate, startOfWeek, today } from '@/lib/format';
import { useFeedbackWeek, type FeedbackBoardItem } from '@/lib/queries';

const STATUS = {
  pending: { label: 'To do', variant: 'muted' as const, icon: CircleDashed },
  draft: { label: 'Draft', variant: 'warning' as const, icon: PencilLine },
  submitted: { label: 'Sent', variant: 'success' as const, icon: CircleCheck },
};

export function FeedbackPage() {
  const user = useUser();
  const [params, setParams] = useSearchParams();
  const lastWeek = startOfWeek(addDays(today(), -7));
  const weekStart = params.get('week') ?? lastWeek;
  const [filter, setFilter] = useState<'all' | 'open' | 'submitted'>('open');
  const board = useFeedbackWeek({ weekStart });
  const thisWeek = startOfWeek(today());

  const setWeek = (w: string) => setParams({ week: w }, { replace: true });
  const items = (board.data?.students ?? []).filter((s) =>
    filter === 'all'
      ? true
      : filter === 'open'
        ? s.status !== 'submitted'
        : s.status === 'submitted',
  );
  const byBatch = items.reduce<Record<string, FeedbackBoardItem[]>>((acc, s) => {
    (acc[s.batchName] ??= []).push(s);
    return acc;
  }, {});
  const sum = board.data?.summary;

  return (
    <div>
      <PageHeader
        title="Weekly feedback"
        description={
          user.role === 'coach'
            ? 'A short progress report for every student, every week. Attendance fills in automatically.'
            : 'Track which weekly reports coaches have sent.'
        }
      />

      <Card className="mb-5 p-4">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="icon-sm"
              aria-label="Previous week"
              onClick={() => setWeek(addDays(weekStart, -7))}
            >
              <ChevronLeft />
            </Button>
            <div className="min-w-44 text-center">
              <p className="text-sm font-semibold">
                {formatShortDate(weekStart)} – {formatShortDate(addDays(weekStart, 6))}
              </p>
              <p className="text-xs text-muted-foreground">
                {weekStart === lastWeek
                  ? 'Last week'
                  : weekStart === thisWeek
                    ? 'This week'
                    : 'Week'}
              </p>
            </div>
            <Button
              variant="outline"
              size="icon-sm"
              aria-label="Next week"
              disabled={weekStart >= thisWeek}
              onClick={() => setWeek(addDays(weekStart, 7))}
            >
              <ChevronRight />
            </Button>
          </div>
          {sum && (
            <div className="flex-1 sm:max-w-xs">
              <div className="mb-1.5 flex justify-between text-xs text-muted-foreground">
                <span>
                  {sum.submitted} of {sum.total} sent
                </span>
                <span className="tabular">
                  {sum.total ? Math.round((sum.submitted / sum.total) * 100) : 0}%
                </span>
              </div>
              <Progress
                value={sum.total ? (sum.submitted / sum.total) * 100 : 0}
                tone={sum.submitted === sum.total ? 'success' : 'primary'}
              />
            </div>
          )}
        </div>
      </Card>

      <Segmented
        ariaLabel="Filter"
        className="mb-4"
        size="sm"
        value={filter}
        onChange={setFilter}
        options={[
          { value: 'open', label: `To do${sum ? ` (${sum.pending + sum.draft})` : ''}` },
          { value: 'submitted', label: `Sent${sum ? ` (${sum.submitted})` : ''}` },
          { value: 'all', label: 'All' },
        ]}
      />

      {board.isPending ? (
        <ListSkeleton rows={6} />
      ) : board.isError ? (
        <ErrorState error={board.error} onRetry={() => void board.refetch()} />
      ) : items.length === 0 ? (
        <EmptyState
          icon={<MessageSquareText />}
          title={filter === 'open' && sum?.total ? 'All caught up!' : 'No students this week'}
          description={
            filter === 'open' && sum?.total
              ? 'Every report for this week has been sent.'
              : undefined
          }
        />
      ) : (
        <div className="space-y-4 sm:space-y-6">
          {Object.entries(byBatch).map(([batchName, rows]) => (
            <section key={batchName}>
              <h2 className="mb-2 text-sm font-semibold text-muted-foreground">{batchName}</h2>
              <Card className="divide-y">
                {rows.map((s) => {
                  const st = STATUS[s.status];
                  return (
                    <Link
                      key={s.studentId}
                      to={`/feedback/${s.studentId}/${weekStart}`}
                      className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-muted/50"
                    >
                      <Avatar name={s.fullName} />
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-medium">{s.fullName}</p>
                        <p className="text-xs text-muted-foreground">
                          {s.code}
                          {s.writtenBy && user.role === 'admin' && ` · by ${s.writtenBy}`}
                        </p>
                      </div>
                      <Badge variant={st.variant}>
                        <st.icon /> {st.label}
                      </Badge>
                      <ChevronRight className="size-4 text-muted-foreground" />
                    </Link>
                  );
                })}
              </Card>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
