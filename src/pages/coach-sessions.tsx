import { CheckCircle2, Clock, LogOut, MapPin, ShieldAlert, ShieldCheck, Timer } from 'lucide-react';
import { useState } from 'react';
import { useSearchParams } from 'react-router';
import { toast } from 'sonner';
import { useUser } from '@/app/auth';
import {
  EmptyState,
  ErrorState,
  Field,
  ListSkeleton,
  PageHeader,
  StatCard,
} from '@/components/common';
import { StaticMap } from '@/components/map';
import { Button } from '@/components/ui/button';
import { Segmented } from '@/components/ui/controls';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/overlays';
import { Badge, Card, Input, Select, Textarea } from '@/components/ui/primitives';
import { errorMessage } from '@/lib/api';
import {
  addDays,
  formatClock,
  formatDate,
  formatDuration,
  formatTimeRange,
  today,
} from '@/lib/format';
import {
  type CoachSessionRow,
  useAdminCheckOut,
  useCoachSessions,
  useLocations,
  useReviewSession,
  useUsers,
} from '@/lib/queries';

/** "2026-03-09T11:30" in IST for a datetime-local input. */
function istLocal(d: Date) {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Asia/Kolkata',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    })
      .formatToParts(d)
      .map((x) => [x.type, x.value]),
  );
  return `${p.year}-${p.month}-${p.day}T${p.hour === '24' ? '00' : p.hour}:${p.minute}`;
}

function CheckOutDialog({ session, onClose }: { session: CoachSessionRow; onClose: () => void }) {
  const checkOut = useAdminCheckOut();
  const [at, setAt] = useState(() => istLocal(new Date()));
  const [reason, setReason] = useState('');
  const min = istLocal(new Date(session.checkInAt));
  const submit = () =>
    checkOut.mutate(
      {
        id: session.id,
        at: new Date(`${at}:00+05:30`).toISOString(),
        reason: reason.trim() || null,
      },
      {
        onSuccess: () => {
          toast.success(`${session.coach.name} checked out`);
          onClose();
        },
        onError: (e) => toast.error(errorMessage(e)),
      },
    );
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Check out {session.coach.name}</DialogTitle>
          <DialogDescription>
            {session.batch.name} · checked in at {formatClock(session.checkInAt)}. Use this when the
            coach forgot to check out.
          </DialogDescription>
        </DialogHeader>
        <Field label="Check-out time (IST)" required>
          <Input
            type="datetime-local"
            value={at}
            min={min}
            max={istLocal(new Date())}
            onChange={(e) => e.target.value && setAt(e.target.value)}
          />
        </Field>
        <Field label="Reason" hint="Shown on the session and to the coach.">
          <Input
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="e.g. Forgot to check out after the session"
          />
        </Field>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button loading={checkOut.isPending} onClick={submit}>
            <LogOut /> Check out
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ReviewDialog({ session, onClose }: { session: CoachSessionRow; onClose: () => void }) {
  const review = useReviewSession();
  const locations = useLocations();
  const [note, setNote] = useState('');
  const loc = locations.data?.find((l) => l.id === session.location.id);

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Review check-in</DialogTitle>
          <DialogDescription>
            {session.coach.name} · {session.batch.name} · {formatDate(session.date)}
          </DialogDescription>
        </DialogHeader>
        {loc && (
          <StaticMap
            center={{ latitude: loc.latitude, longitude: loc.longitude }}
            radiusMeters={loc.radiusMeters}
            reading={
              session.checkInWithinFence &&
              session.checkOutLat !== null &&
              session.checkOutLng !== null &&
              session.checkOutWithinFence === false
                ? { latitude: session.checkOutLat, longitude: session.checkOutLng }
                : { latitude: session.checkInLat, longitude: session.checkInLng }
            }
          />
        )}
        <div className="grid grid-cols-2 gap-3 text-sm">
          <div className="rounded-lg border p-3">
            <p className="text-xs text-muted-foreground">Check-in</p>
            <p className="font-medium">{formatClock(session.checkInAt)}</p>
            <p className={session.checkInWithinFence ? 'text-success' : 'text-destructive'}>
              {session.checkInDistanceM} m away
            </p>
          </div>
          <div className="rounded-lg border p-3">
            <p className="text-xs text-muted-foreground">Check-out</p>
            <p className="font-medium">
              {session.checkOutAt ? formatClock(session.checkOutAt) : '—'}
            </p>
            {session.checkOutDistanceM !== null && (
              <p className={session.checkOutWithinFence ? 'text-success' : 'text-destructive'}>
                {session.checkOutDistanceM} m away
              </p>
            )}
          </div>
        </div>
        <p className="text-xs text-muted-foreground">
          Allowed radius: {session.location.radiusMeters} m. <span className="text-primary">●</span>{' '}
          location · <span className="text-destructive">●</span> coach’s reading
        </p>
        {session.note && (
          <p className="rounded-lg bg-muted px-3 py-2 text-sm">Coach note: {session.note}</p>
        )}
        <Field label="Review note">
          <Textarea
            rows={2}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="e.g. Confirmed by phone — GPS drift"
          />
        </Field>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Close
          </Button>
          <Button
            loading={review.isPending}
            onClick={() =>
              review.mutate(
                { id: session.id, note: note.trim() || null },
                {
                  onSuccess: () => (toast.success('Marked as reviewed'), onClose()),
                  onError: (e) => toast.error(errorMessage(e)),
                },
              )
            }
          >
            <ShieldCheck /> Mark reviewed
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function CoachSessionsPage() {
  const user = useUser();
  const isAdmin = user.role === 'admin';
  const [params, setParams] = useSearchParams();
  const flagged = params.get('flagged') === 'true';
  const [from, setFrom] = useState(addDays(today(), -29));
  const [to, setTo] = useState(today());
  const [coachId, setCoachId] = useState('');
  const [reviewing, setReviewing] = useState<CoachSessionRow | null>(null);
  const [closing, setClosing] = useState<CoachSessionRow | null>(null);
  const coaches = useUsers({ role: 'coach', pageSize: 100 });
  const q = useCoachSessions({
    from,
    to,
    coachId: coachId || undefined,
    flagged: flagged ? 'true' : undefined,
  });
  const s = q.data?.summary;

  return (
    <div>
      <PageHeader
        title="Coach check-ins"
        description="GPS-verified session attendance. Readings outside the location radius are flagged for review."
      />

      <div className="mb-3 flex flex-col gap-3 lg:flex-row lg:items-end">
        <Field label="From">
          <Input
            type="date"
            value={from}
            max={to}
            onChange={(e) => e.target.value && setFrom(e.target.value)}
          />
        </Field>
        <Field label="To">
          <Input
            type="date"
            value={to}
            min={from}
            max={today()}
            onChange={(e) => e.target.value && setTo(e.target.value)}
          />
        </Field>
        {isAdmin && (
          <Field label="Coach">
            <Select
              value={coachId}
              onChange={(e) => setCoachId(e.target.value)}
              className="lg:w-56"
            >
              <option value="">All coaches</option>
              {coaches.data?.data.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </Select>
          </Field>
        )}
        <Segmented
          ariaLabel="Filter"
          value={flagged ? 'flagged' : 'all'}
          onChange={(v) => setParams(v === 'flagged' ? { flagged: 'true' } : {}, { replace: true })}
          options={[
            { value: 'all', label: 'All' },
            { value: 'flagged', label: 'Flagged' },
          ]}
        />
      </div>

      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard
          label="Sessions"
          icon={<CheckCircle2 />}
          loading={q.isPending}
          value={s?.sessions ?? 0}
        />
        <StatCard
          label="Hours coached"
          icon={<Timer />}
          loading={q.isPending}
          value={s?.totalHours ?? 0}
          tone="success"
        />
        <StatCard
          label="Flagged"
          icon={<ShieldAlert />}
          loading={q.isPending}
          value={s?.flagged ?? 0}
          tone="warning"
          hint={s ? `${s.unreviewedFlagged} awaiting review` : undefined}
        />
        <StatCard
          label="Missing check-out"
          icon={<Clock />}
          loading={q.isPending}
          value={s?.missingCheckOut ?? 0}
          tone="destructive"
        />
      </div>

      {q.isPending ? (
        <ListSkeleton rows={6} />
      ) : q.isError ? (
        <ErrorState error={q.error} onRetry={() => void q.refetch()} />
      ) : q.data.sessions.length === 0 ? (
        <EmptyState
          icon={<MapPin />}
          title={flagged ? 'No flagged check-ins' : 'No check-ins in this period'}
        />
      ) : (
        <Card className="divide-y">
          {q.data.sessions.map((r) => (
            <div
              key={r.id}
              className="grid grid-cols-[1fr_auto] items-start gap-x-3 gap-y-1.5 px-3.5 py-3 text-sm sm:flex sm:flex-wrap sm:items-center sm:gap-x-4 sm:px-4"
            >
              <div className="min-w-0 flex-1">
                <p className="font-semibold">
                  {r.batch.name}
                  <span className="font-normal text-muted-foreground"> · {formatDate(r.date)}</span>
                </p>
                <p className="mt-0.5 text-xs leading-snug text-muted-foreground">
                  {isAdmin && `${r.coach.name} · `}
                  {formatTimeRange(r.batch.startTime, r.batch.endTime)} · {r.location.name}
                </p>
              </div>
              <div className="justify-self-end sm:order-last">
                {r.flagged ? (
                  r.reviewedAt ? (
                    <Badge variant="secondary">
                      <ShieldCheck /> Reviewed
                    </Badge>
                  ) : (
                    <Badge variant="warning">
                      <ShieldAlert /> {Math.max(r.checkInDistanceM, r.checkOutDistanceM ?? 0)} m
                      away
                    </Badge>
                  )
                ) : (
                  <Badge variant="success">
                    <MapPin /> On site
                  </Badge>
                )}
              </div>
              <p className="tabular col-span-2 flex items-center gap-1.5 text-xs text-muted-foreground sm:block sm:text-right">
                <span className="font-medium text-foreground">
                  {formatClock(r.checkInAt)} –{' '}
                  {r.checkOutAt ? (
                    formatClock(r.checkOutAt)
                  ) : (
                    <span className="text-destructive">no check-out</span>
                  )}
                </span>
                <span aria-hidden className="sm:hidden">
                  ·
                </span>
                <span className="sm:block">{formatDuration(r.durationMinutes)}</span>
              </p>
              {isAdmin && !r.checkOutAt && (
                <Button
                  size="sm"
                  variant="outline"
                  className="col-span-2 sm:order-last"
                  onClick={() => setClosing(r)}
                >
                  <LogOut /> Check out
                </Button>
              )}
              {isAdmin && r.flagged && !r.reviewedAt && (
                <Button
                  size="sm"
                  variant="tonal"
                  className="col-span-2 sm:order-last"
                  onClick={() => setReviewing(r)}
                >
                  Review
                </Button>
              )}
            </div>
          ))}
        </Card>
      )}
      {reviewing && <ReviewDialog session={reviewing} onClose={() => setReviewing(null)} />}
      {closing && <CheckOutDialog session={closing} onClose={() => setClosing(null)} />}
    </div>
  );
}
