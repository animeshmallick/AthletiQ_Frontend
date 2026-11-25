/**
 * Missed sessions: reschedule the whole session, or make it up student by student in other batches
 * (free either way); it stays listed until every student has had it. And, for admins, sessions that
 * ended with no check-in and no attendance, to be confirmed as missed or marked as held.
 */
import { CalendarCheck2, CalendarClock, CheckCircle2, Users, X } from 'lucide-react';
import { useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { toast } from 'sonner';
import { useUser } from '@/app/auth';
import {
  ConfirmDialog,
  EmptyState,
  ErrorState,
  ListSkeleton,
  PageHeader,
} from '@/components/common';
import { MakeupDialog } from '@/components/missed-makeups';
import { SessionChangeDialog } from '@/components/session-change';
import { Button } from '@/components/ui/button';
import { Segmented } from '@/components/ui/controls';
import { Badge, Card } from '@/components/ui/primitives';
import { errorMessage } from '@/lib/api';
import { useMissedSessions, useResolveMissed, type MissedSession } from '@/lib/cycles';
import { formatLongDate, formatShortDate, formatTimeRange, plural } from '@/lib/format';

const label = (m: MissedSession) => `${m.batch.name} on ${formatShortDate(m.date)}`;

export function MissedSessionsPage() {
  const isAdmin = useUser().role === 'admin';
  const [params, setParams] = useSearchParams();
  const tab = isAdmin && params.get('tab') === 'unconfirmed' ? 'unconfirmed' : 'open';
  const q = useMissedSessions();
  const resolve = useResolveMissed();
  const [makingUp, setMakingUp] = useState<MissedSession | null>(null);
  const [moving, setMoving] = useState<MissedSession | null>(null);
  const [closing, setClosing] = useState<MissedSession | null>(null);
  const [confirming, setConfirming] = useState<MissedSession | null>(null);
  const list = q.data?.[tab] ?? [];
  const done = (msg: string, reset: () => void) => ({
    onSuccess: () => {
      toast.success(msg);
      reset();
    },
    onError: (e: unknown) => toast.error(errorMessage(e)),
  });

  /** Where each student stands, e.g. "2 to make up · 1 booked · 3 done". */
  const progressOf = (m: MissedSession) => {
    const done = (m.madeUp ?? 0) + (m.excused ?? 0);
    const pending = m.pending ?? m.students;
    return [
      pending ? `${plural(pending, 'student')} to make up` : null,
      m.booked ? `${m.booked} booked` : null,
      done ? `${done} done` : null,
    ]
      .filter(Boolean)
      .join(' · ');
  };

  return (
    <div>
      <PageHeader
        title="Missed sessions"
        description="Reschedule the whole session, or book each student into another batch. Free of charge; nothing is refunded."
      />
      {isAdmin && (
        <Segmented
          ariaLabel="Show"
          value={tab}
          onChange={(v) => setParams(v === 'open' ? {} : { tab: v }, { replace: true })}
          className="mb-3 w-full sm:w-auto"
          options={[
            { value: 'open', label: `To make up${q.data ? ` · ${q.data.open.length}` : ''}` },
            {
              value: 'unconfirmed',
              label: `Unconfirmed${q.data ? ` · ${q.data.unconfirmed.length}` : ''}`,
            },
          ]}
        />
      )}
      {q.isPending ? (
        <ListSkeleton rows={4} />
      ) : q.isError ? (
        <ErrorState error={q.error} onRetry={() => void q.refetch()} />
      ) : !list.length ? (
        <EmptyState
          icon={<CheckCircle2 />}
          title={tab === 'open' ? 'Nothing to make up' : 'Every session is accounted for'}
        />
      ) : (
        <div className="grid gap-2.5 lg:grid-cols-2">
          {list.map((m) => (
            <Card key={`${m.batch.id}:${m.date}`} className="space-y-2 p-3">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <Link
                    to={`/batches/${m.batch.id}`}
                    className="block truncate text-[15px] font-semibold hover:underline"
                  >
                    {m.batch.name}
                  </Link>
                  <p className="text-[13px] text-muted-foreground">
                    {formatLongDate(m.date)} · {formatTimeRange(m.startTime, m.endTime)}
                  </p>
                </div>
                {tab === 'open' && (
                  <Badge
                    variant={m.overdue ? 'destructive' : m.pending === 0 ? 'default' : 'warning'}
                  >
                    {m.overdue
                      ? 'Past 30 days'
                      : m.pending === 0
                        ? 'Makeups booked'
                        : `By ${formatShortDate(m.coachUntil)}`}
                  </Badge>
                )}
              </div>
              <p className="text-[12.5px] text-muted-foreground">
                {isAdmin ? `${m.batch.coach.name} · ` : ''}
                {tab === 'open' ? progressOf(m) : plural(m.students, 'student')}
                {m.reason ? ` · ${m.reason}` : ''}
                {m.makeupOnly ? ' · rescheduled and held; their makeup fell through' : ''}
                {m.optional ? ' · optional: everyone gets the full count' : ''}
                {m.originalDate !== m.date
                  ? ` · originally ${formatShortDate(m.originalDate)}`
                  : ''}
              </p>
              {tab === 'open' ? (
                m.overdue && !isAdmin ? (
                  <p className="text-[12.5px] text-destructive">
                    Past 30 days: ask an admin to reschedule it or book makeups.
                  </p>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    {!m.makeupOnly && (
                      <Button
                        size="sm"
                        variant={m.pending === 0 ? 'outline' : 'default'}
                        onClick={() => setMoving(m)}
                      >
                        <CalendarClock /> Reschedule all
                      </Button>
                    )}
                    <Button size="sm" variant="outline" onClick={() => setMakingUp(m)}>
                      <Users /> Student by student
                    </Button>
                    {isAdmin && !m.makeupOnly && (
                      <Button size="sm" variant="ghost" onClick={() => setClosing(m)}>
                        <X /> Close
                      </Button>
                    )}
                  </div>
                )
              ) : (
                <div className="flex flex-wrap gap-2">
                  <Button size="sm" variant="outline" asChild>
                    <Link to={`/attendance?batch=${m.batch.id}&date=${m.date}`}>
                      <CalendarCheck2 /> Held: mark attendance
                    </Link>
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => setConfirming(m)}>
                    <X /> Missed
                  </Button>
                </div>
              )}
            </Card>
          ))}
        </div>
      )}
      {makingUp && <MakeupDialog session={makingUp} onClose={() => setMakingUp(null)} />}
      {moving && (
        <SessionChangeDialog
          batch={{ ...moving.batch, startTime: moving.startTime, endTime: moving.endTime }}
          session={moving}
          missed
          onClose={() => setMoving(null)}
        />
      )}
      <ConfirmDialog
        open={!!confirming}
        onOpenChange={(o) => !o && setConfirming(null)}
        title="Was this session missed?"
        description={confirming ? `${label(confirming)}. The coach is asked to reschedule it.` : ''}
        confirmLabel="Yes, missed"
        loading={resolve.isPending}
        onConfirm={() =>
          confirming &&
          resolve.mutate(
            { action: 'confirm', batchId: confirming.batch.id, date: confirming.date },
            done('Marked as missed', () => setConfirming(null)),
          )
        }
      />
      <ConfirmDialog
        open={!!closing}
        onOpenChange={(o) => !o && setClosing(null)}
        title="Close without rescheduling?"
        description={closing ? `${label(closing)} won’t be held for its students.` : ''}
        confirmLabel="Close session"
        destructive
        requireReason
        loading={resolve.isPending}
        onConfirm={(reason) =>
          closing &&
          resolve.mutate(
            { action: 'close', batchId: closing.batch.id, date: closing.date, reason },
            done('Closed', () => setClosing(null)),
          )
        }
      />
    </div>
  );
}
