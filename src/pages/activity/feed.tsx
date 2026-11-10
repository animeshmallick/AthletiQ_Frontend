/**
 * The activity feed, grouped by day:
 *  - Key events: the audit trail (what changed, by whom, with details).
 *  - Every change: every write and failed request, as recorded by the request log.
 */
import { AlertTriangle, ChevronRight, ScrollText, X } from 'lucide-react';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Link } from 'react-router';
import { relativeTime } from '@/app/deployments';
import { EmptyState, ErrorState, ListSkeleton, SectionDivider } from '@/components/common';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/overlays';
import { Badge, Card } from '@/components/ui/primitives';
import { formatInstant } from '@/lib/format';
import { useActivityLogs, useApiRequests, type ActivityLog, type ApiRequest } from '@/lib/queries';
import { cn } from '@/lib/utils';
import {
  clock,
  dayLabel,
  display,
  entityMeta,
  humanize,
  isSensitive,
  label,
  ms,
  requestLabel,
  shortRoute,
  statusTone,
  summaryLine,
} from './meta';

export type FeedFilters = {
  from?: string;
  to?: string;
  /** Exact start for hour windows (e.g. the last 3 hours). */
  since?: string;
  entityType?: string;
  actorId?: string;
  entityId?: string;
  sensitive?: boolean;
  search?: string;
};

/** Infinite list helper: loads the next page well before the end is reached. */
function useAutoLoad(
  q: {
    hasNextPage: boolean;
    isFetchingNextPage: boolean;
    fetchNextPage: () => unknown;
  },
  size: number,
) {
  const { hasNextPage, isFetchingNextPage, fetchNextPage } = q;
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el || !hasNextPage || typeof IntersectionObserver === 'undefined') return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting) && !isFetchingNextPage) void fetchNextPage();
      },
      { rootMargin: '800px 0px' },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [hasNextPage, isFetchingNextPage, fetchNextPage, size]);
  return ref;
}

function byDay<T extends { createdAt: string }>(rows: T[]) {
  const out: { day: string; items: T[] }[] = [];
  for (const r of rows) {
    const day = dayLabel(r.createdAt);
    if (out.at(-1)?.day !== day) out.push({ day, items: [] });
    out.at(-1)!.items.push(r);
  }
  return out;
}

function Footer({
  sentinel,
  loading,
  more,
  onMore,
  shown,
  total,
  noun,
}: {
  sentinel: React.RefObject<HTMLDivElement | null>;
  loading: boolean;
  more: boolean;
  onMore: () => void;
  shown: number;
  total: number;
  noun: string;
}) {
  return (
    <div ref={sentinel} className="flex flex-col items-center gap-2 py-2">
      {loading ? (
        <ListSkeleton rows={2} />
      ) : more ? (
        <Button variant="outline" size="sm" onClick={onMore}>
          Load more
        </Button>
      ) : null}
      <p className="text-[11px] text-muted-foreground">
        Showing {shown.toLocaleString('en-IN')} of {total.toLocaleString('en-IN')} {noun}
      </p>
    </div>
  );
}

// ─── Key events ──────────────────────────────────────────────────────────────

export function EventFeed({
  filters,
  showActor,
  onRecord,
}: {
  filters: FeedFilters;
  showActor: boolean;
  /** Show every event on one record. */
  onRecord: (entityType: string, entityId: string) => void;
}) {
  const [open, setOpen] = useState<ActivityLog | null>(null);
  const q = useActivityLogs({
    from: filters.from,
    to: filters.to,
    since: filters.since,
    entityType: filters.entityType || undefined,
    actorId: filters.actorId || undefined,
    entityId: filters.entityId || undefined,
    sensitive: filters.sensitive ? 'true' : undefined,
    search: filters.search || undefined,
  });
  const logs = useMemo(() => q.data?.pages.flatMap((p) => p.data) ?? [], [q.data]);
  const total = q.data?.pages[0]?.meta?.total ?? 0;
  const sentinel = useAutoLoad(q, logs.length);
  const groups = useMemo(() => byDay(logs), [logs]);

  if (q.isPending) return <ListSkeleton rows={8} />;
  if (q.isError) return <ErrorState error={q.error} onRetry={() => void q.refetch()} />;
  if (!logs.length)
    return (
      <EmptyState
        icon={<ScrollText />}
        title="No activity found"
        description="Try a longer period or clear the filters."
      />
    );
  return (
    <div className="space-y-3">
      {groups.map((g) => (
        <section key={g.day} aria-label={g.day}>
          <SectionDivider className="mb-1.5">{g.day}</SectionDivider>
          <Card className="divide-y overflow-hidden">
            {g.items.map((l) => (
              <EventRow key={l.id} log={l} showActor={showActor} onOpen={() => setOpen(l)} />
            ))}
          </Card>
        </section>
      ))}
      <Footer
        sentinel={sentinel}
        loading={q.isFetchingNextPage}
        more={q.hasNextPage}
        onMore={() => void q.fetchNextPage()}
        shown={logs.length}
        total={total}
        noun="events"
      />
      <EventDetails
        log={open}
        onClose={() => setOpen(null)}
        onRecord={(t, id) => {
          setOpen(null);
          onRecord(t, id);
        }}
      />
    </div>
  );
}

export function EventRow({
  log: l,
  showActor,
  onOpen,
}: {
  log: ActivityLog;
  showActor: boolean;
  onOpen: () => void;
}) {
  const e = entityMeta(l.entityType);
  const sub = summaryLine(l);
  const who = showActor ? (l.actor?.name ?? 'System') : e.label;
  return (
    <button
      type="button"
      onClick={onOpen}
      className="flex w-full min-w-0 cursor-pointer items-center gap-2 px-1 py-0.5 text-left transition-colors hover:bg-muted/50 active:bg-muted"
    >
      <span
        className={cn(
          'flex size-9 shrink-0 items-center justify-center rounded-xl [&_svg]:size-4',
          e.tone,
        )}
      >
        <e.icon />
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex min-w-0 items-center gap-1.5">
          <span className="truncate text-[13px] font-semibold">{humanize(l.action)}</span>
          {isSensitive(l.action) && (
            <AlertTriangle
              aria-label="Worth a second look"
              className="size-3.5 shrink-0 text-warning-foreground dark:text-warning"
            />
          )}
        </span>
        <span className="block truncate text-[12px] text-muted-foreground">
          {who}
          {sub ? ` · ${sub}` : ''}
        </span>
      </span>
      <span className="tabular shrink-0 text-[11px] text-muted-foreground">
        {clock(l.createdAt)}
      </span>
      <ChevronRight className="size-4 shrink-0 text-muted-foreground/60" />
    </button>
  );
}

function Facts({ children }: { children: ReactNode }) {
  return (
    <dl className="grid grid-cols-[7rem_1fr] gap-x-3 gap-y-2 rounded-xl bg-muted/50 p-3 text-[13px]">
      {children}
    </dl>
  );
}

function Fact({ term, children, mono }: { term: string; children: ReactNode; mono?: boolean }) {
  return (
    <>
      <dt className="text-muted-foreground">{term}</dt>
      <dd className={cn('min-w-0 break-words', mono && 'tabular break-all')}>{children}</dd>
    </>
  );
}

export function EventDetails({
  log,
  onClose,
  onRecord,
}: {
  log: ActivityLog | null;
  onClose: () => void;
  onRecord?: (entityType: string, entityId: string) => void;
}) {
  const e = log ? entityMeta(log.entityType) : null;
  const meta = Object.entries(log?.metadata ?? {});
  return (
    <Dialog open={!!log} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-lg">
        {log && e && (
          <>
            <DialogHeader>
              <div className="flex items-center gap-3">
                <span
                  className={cn(
                    'flex size-10 shrink-0 items-center justify-center rounded-xl [&_svg]:size-5',
                    e.tone,
                  )}
                >
                  <e.icon />
                </span>
                <div className="min-w-0">
                  <DialogTitle className="truncate text-base">{humanize(log.action)}</DialogTitle>
                  <DialogDescription className="text-[13px]">
                    {formatInstant(log.createdAt)} · {relativeTime(log.createdAt)}
                  </DialogDescription>
                </div>
              </div>
            </DialogHeader>
            {isSensitive(log.action) && (
              <Badge variant="warning" className="-mt-1">
                <AlertTriangle /> Worth a second look
              </Badge>
            )}
            <Facts>
              <Fact term="Done by">
                <span className="font-medium">{log.actor?.name ?? 'System'}</span>
                {log.actor?.role ? (
                  <span className="text-muted-foreground"> · {log.actor.role}</span>
                ) : null}
              </Fact>
              <Fact term="Record">
                {e.label}
                {log.entityId && e.link ? (
                  <>
                    {' · '}
                    <Link
                      to={`${e.link}${log.entityId}`}
                      onClick={onClose}
                      className="font-medium text-primary hover:underline"
                    >
                      Open
                    </Link>
                  </>
                ) : null}
              </Fact>
              {log.ipAddress && (
                <Fact term="IP address" mono>
                  {log.ipAddress}
                </Fact>
              )}
            </Facts>
            {meta.length > 0 && (
              <div>
                <p className="mb-1.5 text-[11px] font-semibold tracking-wider text-muted-foreground uppercase">
                  Details
                </p>
                <dl className="divide-y rounded-xl border text-[13px]">
                  {meta.map(([k, v]) => (
                    <div key={k} className="grid grid-cols-[7rem_1fr] gap-x-3 px-3 py-2">
                      <dt className="text-muted-foreground">{label(k)}</dt>
                      <dd className="min-w-0 break-words">{display(k, v)}</dd>
                    </div>
                  ))}
                </dl>
              </div>
            )}
            {log.entityId && onRecord && (
              <Button
                variant="outline"
                size="sm"
                className="w-full"
                onClick={() => onRecord(log.entityType, log.entityId!)}
              >
                <ScrollText /> Full history of this {e.label.toLowerCase()}
              </Button>
            )}
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

// ─── Every change (request log) ──────────────────────────────────────────────

export function RequestFeed({
  filters,
  showActor,
}: {
  filters: { from: string; to: string; since?: string; actorId?: string };
  showActor: boolean;
}) {
  const [open, setOpen] = useState<ApiRequest | null>(null);
  const q = useApiRequests({
    from: filters.from,
    to: filters.to,
    since: filters.since,
    userId: filters.actorId || undefined,
  });
  const rows = useMemo(() => q.data?.pages.flatMap((p) => p.data) ?? [], [q.data]);
  const total = q.data?.pages[0]?.meta?.total ?? 0;
  const sentinel = useAutoLoad(q, rows.length);
  const groups = useMemo(() => byDay(rows), [rows]);

  if (q.isPending) return <ListSkeleton rows={8} />;
  if (q.isError) return <ErrorState error={q.error} onRetry={() => void q.refetch()} />;
  if (!rows.length)
    return (
      <EmptyState
        icon={<ScrollText />}
        title="No changes recorded"
        description="Every save, update and failed request shows up here."
      />
    );
  return (
    <div className="space-y-3">
      {groups.map((g) => (
        <section key={g.day} aria-label={g.day}>
          <SectionDivider className="mb-1.5">{g.day}</SectionDivider>
          <Card className="divide-y overflow-hidden">
            {g.items.map((r) => (
              <RequestRow key={r.id} r={r} showActor={showActor} onOpen={() => setOpen(r)} />
            ))}
          </Card>
        </section>
      ))}
      <Footer
        sentinel={sentinel}
        loading={q.isFetchingNextPage}
        more={q.hasNextPage}
        onMore={() => void q.fetchNextPage()}
        shown={rows.length}
        total={total}
        noun="changes"
      />
      <RequestDetails r={open} onClose={() => setOpen(null)} />
    </div>
  );
}

const STATUS_CHIP: Record<ReturnType<typeof statusTone>, string> = {
  success: 'bg-success/12 text-success',
  warning: 'bg-warning/22 text-warning-foreground dark:text-warning',
  destructive: 'bg-destructive/12 text-destructive',
  muted: 'bg-muted text-muted-foreground',
};

export function StatusChip({ status }: { status: number }) {
  return (
    <span
      className={cn(
        'tabular inline-flex h-6 min-w-10 shrink-0 items-center justify-center rounded-md px-1 text-[11px] font-semibold',
        STATUS_CHIP[statusTone(status)],
      )}
    >
      {status}
    </span>
  );
}

export function RequestRow({
  r,
  showActor,
  onOpen,
}: {
  r: ApiRequest;
  showActor: boolean;
  onOpen: () => void;
}) {
  const failed = r.status >= 400;
  return (
    <button
      type="button"
      onClick={onOpen}
      className="flex w-full min-w-0 cursor-pointer items-center gap-2 px-1.5 py-1 text-left transition-colors hover:bg-muted/50 active:bg-muted"
    >
      <StatusChip status={r.status} />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[13px] font-semibold">
          {requestLabel(r.method, r.route)}
        </span>
        <span className="block truncate text-[12px] text-muted-foreground">
          {showActor ? `${r.user?.name ?? 'Signed out'} · ` : ''}
          {failed && r.message ? r.message : `${r.method} ${shortRoute(r.route)}`}
        </span>
      </span>
      <span className="tabular shrink-0 text-right text-[11px] text-muted-foreground">
        {clock(r.createdAt)}
        <span className="block">{ms(r.durationMs)}</span>
      </span>
    </button>
  );
}

export function RequestDetails({ r, onClose }: { r: ApiRequest | null; onClose: () => void }) {
  return (
    <Dialog open={!!r} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-lg">
        {r && (
          <>
            <DialogHeader>
              <div className="flex items-center gap-3">
                <StatusChip status={r.status} />
                <div className="min-w-0">
                  <DialogTitle className="truncate text-base">
                    {requestLabel(r.method, r.route)}
                  </DialogTitle>
                  <DialogDescription className="text-[13px]">
                    {formatInstant(r.createdAt)} · {relativeTime(r.createdAt)}
                  </DialogDescription>
                </div>
              </div>
            </DialogHeader>
            {r.status >= 400 && (
              <div className="rounded-xl border border-destructive/25 bg-destructive/6 p-3 text-[13px]">
                <p className="font-semibold text-destructive">{r.code ?? 'Error'}</p>
                <p className="mt-0.5 break-words">{r.message ?? 'No message recorded.'}</p>
              </div>
            )}
            <Facts>
              <Fact term="Request" mono>
                {r.method} {r.route}
              </Fact>
              <Fact term="Status" mono>
                {r.status}
              </Fact>
              <Fact term="Took" mono>
                {ms(r.durationMs)}
              </Fact>
              <Fact term="By">{r.user?.name ?? 'Signed out'}</Fact>
              {r.requestId && (
                <Fact term="Request ID" mono>
                  {r.requestId}
                </Fact>
              )}
              {r.ipAddress && (
                <Fact term="IP address" mono>
                  {r.ipAddress}
                </Fact>
              )}
              {r.userAgent && <Fact term="Device">{r.userAgent}</Fact>}
            </Facts>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

/** A removable chip for an active filter. */
export function FilterChip({ children, onClear }: { children: ReactNode; onClear: () => void }) {
  return (
    <span className="inline-flex max-w-full items-center gap-1 rounded-full bg-primary/10 py-0.5 pr-0.5 pl-2 text-[12px] font-medium text-primary">
      <span className="truncate">{children}</span>
      <button
        type="button"
        onClick={onClear}
        aria-label="Remove filter"
        className="flex size-5 cursor-pointer items-center justify-center rounded-full hover:bg-primary/15"
      >
        <X className="size-3" />
      </button>
    </span>
  );
}
