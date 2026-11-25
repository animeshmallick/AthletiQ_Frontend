import { CalendarCheck2, CloudRain } from 'lucide-react';
import { useState } from 'react';
import { RestoreSessionButton } from '@/components/cancel-session';
import { ATTENDANCE_META, EmptyState, ErrorState, ListSkeleton } from '@/components/common';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/primitives';
import {
  addMonths,
  endOfMonth,
  formatShortDate,
  isoWeekday,
  startOfMonth,
  today,
  WEEKDAYS,
} from '@/lib/format';
import { useRegister } from '@/lib/queries';
import { cn } from '@/lib/utils';

export function CancelledBanner({
  batchId,
  date,
  reason,
}: {
  batchId: string;
  date: string;
  reason: string;
}) {
  return (
    <EmptyState
      icon={<CloudRain />}
      title="Session cancelled"
      description={reason}
      action={<RestoreSessionButton batchId={batchId} date={date} />}
    />
  );
}

export function MonthlyRegister({ batchId }: { batchId: string }) {
  const [month, setMonth] = useState(startOfMonth(today()));
  const from = month;
  const to = endOfMonth(month);
  const reg = useRegister({ batchId, from, to });

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <Button variant="outline" size="sm" onClick={() => setMonth(addMonths(month, -1))}>
          ‹ Prev
        </Button>
        <p className="w-36 text-center font-medium">
          {new Intl.DateTimeFormat('en-IN', {
            month: 'long',
            year: 'numeric',
            timeZone: 'UTC',
          }).format(new Date(`${month}T00:00:00Z`))}
        </p>
        <Button
          variant="outline"
          size="sm"
          disabled={addMonths(month, 1) > today()}
          onClick={() => setMonth(addMonths(month, 1))}
        >
          Next ›
        </Button>
      </div>
      {reg.isPending ? (
        <ListSkeleton rows={4} />
      ) : reg.isError ? (
        <ErrorState error={reg.error} onRetry={() => void reg.refetch()} />
      ) : reg.data.students.length === 0 ? (
        <EmptyState icon={<CalendarCheck2 />} title="No attendance recorded this month" />
      ) : (
        <Card className="overflow-x-auto">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b bg-muted/50">
                <th className="sticky left-0 z-10 min-w-44 bg-muted/95 px-3 py-2 text-left font-medium">
                  Student
                </th>
                {reg.data.dates.map((d) => (
                  <th
                    key={d}
                    className="min-w-9 px-1 py-2 text-center text-xs font-medium text-muted-foreground"
                  >
                    <div>{WEEKDAYS[isoWeekday(d) - 1]?.min}</div>
                    <div className="tabular">{Number(d.slice(8))}</div>
                  </th>
                ))}
                <th className="px-3 py-2 text-right font-medium">Rate</th>
              </tr>
            </thead>
            <tbody>
              {reg.data.students.map((s) => {
                const marks = Object.values(s.marks);
                const attended = marks.filter((m) => m === 'present' || m === 'late').length;
                const countable = marks.filter((m) => m !== 'excused').length;
                return (
                  <tr key={s.studentId} className="border-b last:border-0">
                    <td className="sticky left-0 z-10 bg-card px-3 py-2 font-medium">
                      {s.fullName}
                    </td>
                    {reg.data.dates.map((d) => {
                      const m = s.marks[d];
                      return (
                        <td key={d} className="px-1 py-2 text-center">
                          {m ? (
                            <span
                              title={`${formatShortDate(d)}: ${ATTENDANCE_META[m].label}`}
                              className={cn('text-xs font-bold', ATTENDANCE_META[m].className)}
                            >
                              {ATTENDANCE_META[m].short}
                            </span>
                          ) : reg.data.cancelled[d] ? (
                            <span
                              title={`${formatShortDate(d)}: cancelled — ${reg.data.cancelled[d]}`}
                              className="text-xs text-muted-foreground"
                            >
                              ✕
                            </span>
                          ) : (
                            <span className="text-muted-foreground/40">·</span>
                          )}
                        </td>
                      );
                    })}
                    <td className="tabular px-3 py-2 text-right">
                      {countable ? `${Math.round((attended / countable) * 100)}%` : '—'}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </Card>
      )}
    </div>
  );
}
