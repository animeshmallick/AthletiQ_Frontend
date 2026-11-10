/**
 * Weekly feedback: every student's report for a week, grouped by batch. Swipe (or the arrows)
 * to move between weeks; the newest is last week, since reports follow a finished week.
 */
import { PeriodStepper } from '@/components/date-nav';
import {
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
import { SwipeDays } from '@/components/swipe-days';
import { Segmented } from '@/components/ui/controls';
import { Badge, Card } from '@/components/ui/primitives';
import { addDays, formatShortDate, startOfWeek, today } from '@/lib/format';
import { useFeedbackWeek, type FeedbackBoardItem } from '@/lib/queries';
import { cn } from '@/lib/utils';

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
  const [direction, setDirection] = useState<1 | -1 | 0>(0);
  const board = useFeedbackWeek({ weekStart });
  const thisWeek = startOfWeek(today());

  const setWeek = (w: string) => {
    setDirection(w > weekStart ? 1 : -1);
    setParams({ week: w }, { replace: true });
  };
  // Feedback is written once a week is over, so the newest week is last week.
  const step = (n: 1 | -1) => {
    if (n === 1 && weekStart >= lastWeek) return;
    setWeek(addDays(weekStart, 7 * n));
  };
  const all = board.data?.students ?? [];
  const items = all.filter((s) =>
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
  const next = all.find((s) => s.status === 'draft') ?? all.find((s) => s.status === 'pending');

  return (
    <div>
      <PageHeader
        className="mb-2 sm:mb-3"
        title="Weekly feedback"
        description={
          user.role === 'coach'
            ? 'A short progress report for every student, every week. Attendance fills in automatically.'
            : 'Track which weekly reports coaches have sent.'
        }
      />

      <Card className="mb-1.5 space-y-1 p-1">
        <PeriodStepper
          label={`${formatShortDate(weekStart)} – ${formatShortDate(addDays(weekStart, 6))}`}
          sublabel={
            weekStart === lastWeek ? 'Last week' : weekStart === thisWeek ? 'This week' : 'Week'
          }
          prevLabel="Previous week"
          nextLabel="Next week"
          onPrev={() => step(-1)}
          onNext={() => step(1)}
          nextDisabled={weekStart >= lastWeek}
          onToday={weekStart !== lastWeek ? () => setWeek(lastWeek) : undefined}
          todayLabel="Last week"
          className="shadow-none"
        />
        {sum && sum.total > 0 && (
          <div className="flex items-center gap-2 px-1 pb-0.5">
            <div className="min-w-0 flex-1">
              <Progress
                label="Feedback sent"
                value={(sum.submitted / sum.total) * 100}
                tone={sum.submitted === sum.total ? 'success' : 'primary'}
              />
            </div>
            <span className="tabular shrink-0 text-[11px] text-muted-foreground">
              <b className="font-semibold text-foreground">{sum.submitted}</b>/{sum.total} sent
              {sum.draft > 0 && ` · ${sum.draft} draft${sum.draft === 1 ? '' : 's'}`}
            </span>
          </div>
        )}
      </Card>

      <div className="mb-1.5 flex items-center gap-1.5">
        <Segmented
          ariaLabel="Filter"
          size="sm"
          value={filter}
          onChange={setFilter}
          options={[
            { value: 'open', label: `To do${sum ? ` (${sum.pending + sum.draft})` : ''}` },
            { value: 'submitted', label: `Sent${sum ? ` (${sum.submitted})` : ''}` },
            { value: 'all', label: 'All' },
          ]}
        />
        {user.role === 'coach' && next && (
          <Link
            to={`/feedback/${next.studentId}/${weekStart}`}
            className="ml-auto inline-flex h-8 min-w-0 items-center gap-1 rounded-lg bg-primary px-2.5 text-[12px] font-semibold text-primary-foreground shadow-e1 hover:bg-primary/92"
          >
            <PencilLine className="size-3.5 shrink-0" />
            <span className="truncate">
              {next.status === 'draft' ? 'Continue' : 'Next'}: {next.fullName.split(' ')[0]}
            </span>
          </Link>
        )}
      </div>

      <SwipeDays
        dayKey={weekStart}
        direction={direction}
        onStep={step}
        prevLabel="Previous week"
        nextLabel={weekStart >= lastWeek ? 'Latest week' : 'Next week'}
      >
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
          <div className="grid grid-cols-1 gap-1.5 lg:grid-cols-2">
            {Object.entries(byBatch).map(([batchName, rows]) => {
              const inBatch = all.filter((x) => x.batchName === batchName);
              const sent = inBatch.filter((x) => x.status === 'submitted').length;
              return (
                <section
                  key={batchName}
                  className="overflow-hidden rounded-xl border bg-card shadow-e1"
                >
                  <header className="flex items-center gap-2 border-b bg-muted/30 px-2 py-1">
                    <h2 className="min-w-0 flex-1 truncate text-[13px] font-semibold">
                      {batchName}
                    </h2>
                    <span
                      className={cn(
                        'tabular shrink-0 rounded-full px-1.5 py-px text-[10px] font-semibold',
                        sent === inBatch.length
                          ? 'bg-success/12 text-success'
                          : 'bg-primary/10 text-primary',
                      )}
                    >
                      {sent}/{inBatch.length} sent
                    </span>
                  </header>
                  <ul className="divide-y">
                    {rows.map((s) => {
                      const st = STATUS[s.status];
                      return (
                        <li key={s.studentId}>
                          <Link
                            to={`/feedback/${s.studentId}/${weekStart}`}
                            className="flex items-center gap-2 px-1.5 py-1 transition-colors hover:bg-muted/50"
                          >
                            <Avatar name={s.fullName} className="size-7 text-[10px]" />
                            <div className="min-w-0 flex-1 leading-tight">
                              <p className="truncate text-[13px] font-medium">{s.fullName}</p>
                              <p className="truncate text-[11px] text-muted-foreground">
                                {s.code}
                                {s.writtenBy && user.role === 'admin' && ` · by ${s.writtenBy}`}
                                {s.submittedAt &&
                                  ` · sent ${formatShortDate(s.submittedAt.slice(0, 10))}`}
                              </p>
                            </div>
                            <Badge variant={st.variant} className="px-1.5 text-[10px]">
                              <st.icon /> {st.label}
                            </Badge>
                            <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
                          </Link>
                        </li>
                      );
                    })}
                  </ul>
                </section>
              );
            })}
          </div>
        )}
      </SwipeDays>
    </div>
  );
}
