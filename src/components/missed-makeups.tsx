/**
 * Making up a missed session student by student: who still needs it, the sessions each could
 * attend instead (another batch, same location and sport), and marking a student as not needing it.
 */
import { ChevronLeft, Repeat, RotateCcw, UserX, X } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { useUser } from '@/app/auth';
import {
  ATTENDANCE_META,
  Avatar,
  ConfirmDialog,
  EmptyState,
  ErrorState,
  ListSkeleton,
  Progress,
} from '@/components/common';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/overlays';
import { Badge } from '@/components/ui/primitives';
import { ApiError, errorMessage } from '@/lib/api';
import {
  useMakeupAction,
  useMakeupOptions,
  useMissedStudents,
  type MakeupOption,
  type MissedSession,
  type MissedStudent,
} from '@/lib/cycles';
import { formatLongDate, formatShortDate, formatTimeRange, plural } from '@/lib/format';
import { cn } from '@/lib/utils';

const BADGE = {
  pending: { label: 'To make up', variant: 'warning' },
  booked: { label: 'Booked', variant: 'default' },
  'made-up': { label: 'Made up', variant: 'success' },
  excused: { label: 'Not needed', variant: 'muted' },
} as const;

function detail(s: MissedStudent): string {
  if (s.state === 'excused') return s.reason ?? '';
  const m = s.makeup;
  if (!m) return 'No session chosen yet';
  const where = `${m.batchName} · ${formatShortDate(m.date)}`;
  if (s.lapsed) return `${where} wasn’t held: choose another`;
  if (s.state === 'booked')
    return m.startTime && m.endTime
      ? `${where}, ${formatTimeRange(m.startTime, m.endTime)}`
      : where;
  return `${where} · ${m.mark ? ATTENDANCE_META[m.mark].label : 'not marked'}`;
}

export function MakeupDialog({
  session,
  onClose,
}: {
  session: MissedSession;
  onClose: () => void;
}) {
  const at = { batchId: session.batch.id, originalDate: session.originalDate };
  const q = useMissedStudents(at);
  const act = useMakeupAction();
  const [choosing, setChoosing] = useState<MissedStudent | null>(null);
  const [excusing, setExcusing] = useState<MissedStudent | null>(null);
  const list = q.data?.students ?? [];
  const settled = list.filter((s) => s.state === 'made-up' || s.state === 'excused').length;
  const fail = (title: string) => (e: unknown) =>
    toast.error(title, { description: errorMessage(e) });

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {choosing ? `A session for ${choosing.fullName}` : 'Make up student by student'}
          </DialogTitle>
          <DialogDescription>
            {session.batch.name} · missed {formatLongDate(session.originalDate)}
            {choosing ? '' : '. Free of charge; it counts in this batch.'}
          </DialogDescription>
        </DialogHeader>
        {choosing ? (
          <Options
            at={at}
            student={choosing}
            onBack={() => setChoosing(null)}
            onBooked={() => setChoosing(null)}
          />
        ) : q.isPending ? (
          <ListSkeleton rows={4} />
        ) : q.isError ? (
          <ErrorState error={q.error} onRetry={() => void q.refetch()} />
        ) : !list.length ? (
          <EmptyState title="No students to make it up" />
        ) : (
          <div className="space-y-2">
            <div className="space-y-1">
              <Progress
                value={(settled / list.length) * 100}
                tone={settled === list.length ? 'success' : 'primary'}
                label={`${settled} of ${list.length} done`}
              />
              <p className="text-[12px] text-muted-foreground">
                {settled} of {list.length} done. It leaves the list when everyone’s makeup has been
                held.
              </p>
            </div>
            <ul className="divide-y rounded-xl border">
              {list.map((s) => (
                <li key={s.id} className="space-y-1.5 px-2.5 py-2">
                  <div className="flex items-center gap-2">
                    <Avatar name={s.fullName} className="size-8 text-[11px]" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[13.5px] font-medium">{s.fullName}</span>
                      <span
                        className={cn(
                          'block text-[12px] break-words text-muted-foreground',
                          s.lapsed && 'text-destructive',
                        )}
                      >
                        {detail(s)}
                      </span>
                    </span>
                    <Badge variant={BADGE[s.state].variant} className="shrink-0">
                      {BADGE[s.state].label}
                    </Badge>
                  </div>
                  {s.state === 'pending' && (
                    <div className="flex gap-1.5 pl-10">
                      <Button size="sm" onClick={() => setChoosing(s)}>
                        <Repeat /> Choose a session
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => setExcusing(s)}>
                        <UserX /> Not needed
                      </Button>
                    </div>
                  )}
                  {s.state === 'booked' && s.makeup && (
                    <div className="pl-10">
                      <Button
                        size="sm"
                        variant="ghost"
                        className="text-destructive"
                        aria-label={`Cancel ${s.fullName}’s booking`}
                        loading={act.isPending}
                        onClick={() =>
                          act.mutate(
                            { action: 'cancel', id: s.makeup!.id },
                            {
                              onSuccess: () => toast.success('Booking cancelled'),
                              onError: fail('Could not cancel'),
                            },
                          )
                        }
                      >
                        <X /> Cancel booking
                      </Button>
                    </div>
                  )}
                  {s.state === 'excused' && (
                    <div className="pl-10">
                      <Button
                        size="sm"
                        variant="ghost"
                        aria-label={`${s.fullName} needs it after all`}
                        loading={act.isPending}
                        onClick={() =>
                          act.mutate(
                            { action: 'unexcuse', ...at, studentId: s.id },
                            { onError: fail('Could not undo') },
                          )
                        }
                      >
                        <RotateCcw /> Undo
                      </Button>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          </div>
        )}
      </DialogContent>
      <ConfirmDialog
        open={!!excusing}
        onOpenChange={(o) => !o && setExcusing(null)}
        title={`${excusing?.fullName ?? ''} doesn’t need it?`}
        description="They won’t be expected to make this session up, and nothing is refunded."
        confirmLabel="Not needed"
        requireReason
        loading={act.isPending}
        onConfirm={(reason) =>
          excusing &&
          act.mutate(
            { action: 'excuse', ...at, studentId: excusing.id, reason },
            {
              onSuccess: () => {
                toast.success(`${excusing.fullName} marked as not needing it`);
                setExcusing(null);
              },
              onError: fail('Could not save'),
            },
          )
        }
      />
    </Dialog>
  );
}

function Options({
  at,
  student,
  onBack,
  onBooked,
}: {
  at: { batchId: string; originalDate: string };
  student: MissedStudent;
  onBack: () => void;
  onBooked: () => void;
}) {
  const isAdmin = useUser().role === 'admin';
  const q = useMakeupOptions(at, student.id);
  const act = useMakeupAction();
  /** A full session, to be confirmed. */
  const [full, setFull] = useState<{ option: MakeupOption; message: string } | null>(null);

  function book(o: MakeupOption, confirm = false) {
    act.mutate(
      {
        action: 'book',
        ...at,
        studentId: student.id,
        toBatchId: o.batch.id,
        toDate: o.date,
        ...(confirm ? { confirm } : {}),
      },
      {
        onSuccess: () => {
          toast.success(`${student.fullName} booked`, {
            description: `${o.batch.name} · ${formatLongDate(o.date)}`,
          });
          setFull(null);
          onBooked();
        },
        onError: (e) => {
          const asks =
            e instanceof ApiError && (e.details as { warnings?: unknown[] } | undefined)?.warnings;
          if (asks) setFull({ option: o, message: errorMessage(e) });
          else {
            setFull(null);
            toast.error('Could not book', { description: errorMessage(e) });
            void q.refetch();
          }
        },
      },
    );
  }

  return (
    <div className="space-y-2">
      <Button size="sm" variant="ghost" className="-ml-2" onClick={onBack}>
        <ChevronLeft /> All students
      </Button>
      {q.isPending ? (
        <ListSkeleton rows={4} />
      ) : q.isError ? (
        <ErrorState error={q.error} onRetry={() => void q.refetch()} />
      ) : !q.data.length ? (
        <EmptyState
          title="No session to choose"
          description={
            isAdmin
              ? 'No other batch of this sport runs at this location in the next 90 days. Reschedule the session instead.'
              : 'You run no other batch of this sport at this location within 30 days. Reschedule the session, or ask an admin.'
          }
        />
      ) : (
        <ul className="divide-y rounded-xl border">
          {q.data.map((o) => (
            <li
              key={`${o.batch.id}:${o.date}`}
              className={cn('flex items-center gap-2 px-2.5 py-2', o.blocked && 'opacity-60')}
            >
              <span className="min-w-0 flex-1">
                <span className="block text-[13.5px] font-medium">
                  {formatLongDate(o.date)} · {formatTimeRange(o.startTime, o.endTime)}
                </span>
                <span className="block text-[12px] text-muted-foreground">
                  {o.batch.name}
                  {isAdmin ? ` · ${o.batch.coachName}` : ''} ·{' '}
                  {o.full
                    ? `full (${o.expected}/${o.capacity})`
                    : plural(Math.max(0, o.capacity - o.expected), 'seat')}
                </span>
                {o.blocked && (
                  <span className="block text-[12px] text-destructive">{o.blocked}</span>
                )}
              </span>
              <Button
                size="sm"
                variant={o.full ? 'outline' : 'default'}
                disabled={!!o.blocked || act.isPending}
                aria-label={`Book ${o.batch.name} on ${formatLongDate(o.date)}`}
                onClick={() => book(o)}
              >
                Book
              </Button>
            </li>
          ))}
        </ul>
      )}
      <ConfirmDialog
        open={!!full}
        onOpenChange={(o) => !o && setFull(null)}
        title="This session is full"
        description={full?.message ?? ''}
        confirmLabel="Add anyway"
        loading={act.isPending}
        onConfirm={() => full && book(full.option, true)}
      />
    </div>
  );
}
