import { CheckCircle2, Clock, MapPin, ShieldAlert, ShieldCheck, Timer } from 'lucide-react';
import { lateLabel, lateMinutes } from '@/lib/session-status';
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
  SectionDivider,
} from '@/components/common';
import { StaticMap } from '@/components/map';
import { periodRange, type PeriodKey } from '@/lib/periods';
import { FilterBar, FilterField, FilterMenu, PeriodFilter } from '@/components/filters';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/overlays';
import { Badge, Card, Select, Textarea } from '@/components/ui/primitives';
import { errorMessage } from '@/lib/api';
import { formatClock, formatDate, formatDuration, formatTimeRange } from '@/lib/format';
import {
  type CoachSessionRow,
  useCoachSessions,
  useLocations,
  useReviewSession,
  useUsers,
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
            reading={{ latitude: session.checkInLat, longitude: session.checkInLng }}
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
            <p className="text-xs text-muted-foreground">Session</p>
            <p className="font-medium">
              {formatTimeRange(session.batch.startTime, session.batch.endTime)}
            </p>
            <p className="text-muted-foreground">{formatDuration(session.durationMinutes)}</p>
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
  const [period, setPeriod] = useState<PeriodKey>('4w');
  const { from, to } = periodRange(period);
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
  // Checked in over 10 minutes after the start.
  const lateCount = (q.data?.sessions ?? []).filter((r) =>
    lateMinutes({ startTime: r.batch.startTime, checkInAt: r.checkInAt }),
  ).length;

  return (
    <div>
      <PageHeader
        title="Coach check-ins"
        description="GPS-verified session attendance. Readings outside the location radius are flagged for review."
      />

      <FilterBar>
        <PeriodFilter
          value={period}
          onChange={setPeriod}
          options={['week', '4w', 'month', 'last-month', 'quarter']}
        />
        <FilterMenu
          active={Number(Boolean(coachId)) + Number(flagged)}
          onReset={() => {
            setCoachId('');
            setParams({}, { replace: true });
          }}
        >
          {isAdmin && (
            <FilterField label="Coach">
              <Select
                aria-label="Coach"
                className="h-9"
                value={coachId}
                onChange={(e) => setCoachId(e.target.value)}
              >
                <option value="">All coaches</option>
                {coaches.data?.data.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </Select>
            </FilterField>
          )}
          <FilterField label="Show">
            <Select
              aria-label="Show"
              className="h-9"
              value={flagged ? 'flagged' : 'all'}
              onChange={(e) =>
                setParams(e.target.value === 'flagged' ? { flagged: 'true' } : {}, {
                  replace: true,
                })
              }
            >
              <option value="all">All check-ins</option>
              <option value="flagged">Flagged only</option>
            </Select>
          </FilterField>
        </FilterMenu>
      </FilterBar>

      <div className="mb-2.5 grid grid-cols-2 gap-3 lg:grid-cols-4">
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
          label="Late check-ins"
          icon={<Clock />}
          loading={q.isPending}
          value={lateCount}
          tone={lateCount ? 'warning' : 'success'}
          hint="Over 10 min after the start"
        />
      </div>

      <SectionDivider className="mb-1.5">Check-ins</SectionDivider>
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
                      <ShieldAlert /> {r.checkInDistanceM} m away
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
                  In {formatClock(r.checkInAt)}
                  {(({ late }) =>
                    late ? (
                      <span className="text-warning-foreground dark:text-warning">
                        {' '}
                        · {lateLabel(late)}
                      </span>
                    ) : null)({
                    late: lateMinutes({ startTime: r.batch.startTime, checkInAt: r.checkInAt }),
                  })}
                </span>
                <span aria-hidden className="sm:hidden">
                  ·
                </span>
                <span className="sm:block">{formatDuration(r.durationMinutes)}</span>
              </p>
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
    </div>
  );
}
