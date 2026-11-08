import { CheckCircle2, Clock, MapPin, ShieldAlert, ShieldCheck, Timer } from 'lucide-react';
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
  useCoachSessions,
  useLocations,
  useReviewSession,
  useUsers,
  type CoachSessionRow,
} from '@/lib/queries';

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

      <div className="mb-5 flex flex-col gap-3 lg:flex-row lg:items-end">
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

      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
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
              className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3 text-sm"
            >
              <div className="min-w-0 flex-1">
                <p className="font-medium">
                  {formatDate(r.date)} · {r.batch.name}
                </p>
                <p className="text-xs text-muted-foreground">
                  {isAdmin && `${r.coach.name} · `}
                  {formatTimeRange(r.batch.startTime, r.batch.endTime)} · {r.location.name}
                </p>
              </div>
              <div className="tabular text-right text-xs">
                <p>
                  {formatClock(r.checkInAt)} –{' '}
                  {r.checkOutAt ? (
                    formatClock(r.checkOutAt)
                  ) : (
                    <span className="text-destructive">no check-out</span>
                  )}
                </p>
                <p className="text-muted-foreground">{formatDuration(r.durationMinutes)}</p>
              </div>
              {r.flagged ? (
                r.reviewedAt ? (
                  <Badge variant="secondary">
                    <ShieldCheck /> Reviewed
                  </Badge>
                ) : (
                  <Badge variant="warning">
                    <ShieldAlert /> {Math.max(r.checkInDistanceM, r.checkOutDistanceM ?? 0)} m away
                  </Badge>
                )
              ) : (
                <Badge variant="success">
                  <MapPin /> On site
                </Badge>
              )}
              {isAdmin && r.flagged && !r.reviewedAt && (
                <Button size="sm" variant="outline" onClick={() => setReviewing(r)}>
                  Review
                </Button>
              )}
            </div>
          ))}
        </Card>
      )}
      {reviewing && <ReviewDialog session={reviewing} onClose={() => setReviewing(null)} />}
    </div>
  );
}
