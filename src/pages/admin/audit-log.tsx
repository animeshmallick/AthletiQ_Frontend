/**
 * Audit log: compact activity tiles grouped by day; tap one for the full details in a popup.
 */
import {
  Building2,
  CalendarClock,
  ChevronRight,
  Cog,
  IndianRupee,
  LayoutGrid,
  MapPin,
  ScrollText,
  ShieldCheck,
  Tags,
  UserPlus,
  UserRound,
  type LucideIcon,
} from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link } from 'react-router';
import { relativeTime } from '@/app/deployments';
import { EmptyState, ErrorState, ListSkeleton, PageHeader, Pagination } from '@/components/common';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/overlays';
import { Card, Select } from '@/components/ui/primitives';
import { formatInstant, formatLongDate, money, today, addDays } from '@/lib/format';
import { useAuditLogs, type AuditLog } from '@/lib/queries';
import { cn } from '@/lib/utils';

const ENTITY: Record<string, { label: string; icon: LucideIcon; tone: string; link?: string }> = {
  invoice: {
    label: 'Invoice',
    icon: IndianRupee,
    tone: 'bg-emerald-500/14 text-emerald-700 dark:text-emerald-300',
    link: '/invoices?status=all&invoice=',
  },
  student: {
    label: 'Student',
    icon: UserRound,
    tone: 'bg-indigo-500/12 text-indigo-700 dark:text-indigo-300',
    link: '/students/',
  },
  user: {
    label: 'User',
    icon: ShieldCheck,
    tone: 'bg-violet-500/12 text-violet-700 dark:text-violet-300',
  },
  batch: {
    label: 'Batch',
    icon: LayoutGrid,
    tone: 'bg-sky-500/14 text-sky-800 dark:text-sky-300',
    link: '/batches/',
  },
  fee_plan: {
    label: 'Fee plan',
    icon: Tags,
    tone: 'bg-amber-500/18 text-amber-800 dark:text-amber-300',
  },
  location: {
    label: 'Location',
    icon: MapPin,
    tone: 'bg-rose-500/12 text-rose-700 dark:text-rose-300',
  },
  registration: {
    label: 'Registration',
    icon: UserPlus,
    tone: 'bg-teal-500/14 text-teal-800 dark:text-teal-300',
  },
  coach_session: {
    label: 'Check-in',
    icon: CalendarClock,
    tone: 'bg-orange-500/14 text-orange-800 dark:text-orange-300',
  },
  academy_settings: { label: 'Settings', icon: Building2, tone: 'bg-muted text-foreground' },
  job: { label: 'Automation', icon: Cog, tone: 'bg-muted text-foreground' },
};
const entityMeta = (t: string) =>
  ENTITY[t] ?? { label: humanize(t), icon: ScrollText, tone: 'bg-muted text-foreground' };

/** "invoice.payment_reverted" → "Invoice payment reverted" */
function humanize(action: string) {
  const text = action.replace(/[._]/g, ' ');
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/** "monthlyDiscount" → "Monthly discount" */
const label = (key: string) =>
  key
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/_/g, ' ')
    .toLowerCase()
    .replace(/^./, (c) => c.toUpperCase());

/** Readable value for a metadata field (money in paise, dates, lists, nested objects). */
function display(key: string, value: unknown): string {
  if (value === null || value === undefined || value === '') return '—';
  if (typeof value === 'number' && /amount|fee|discount|total|paise/i.test(key))
    return money(value);
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  if (Array.isArray(value)) return value.length ? value.map(String).join(', ') : '—';
  if (typeof value === 'object') return JSON.stringify(value);
  const s = String(value);
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return formatLongDate(s);
  return s;
}

/** One-line summary under the title, from the most telling fields. */
function summary(l: AuditLog): string {
  const m = l.metadata ?? {};
  const parts: string[] = [];
  for (const k of ['amount', 'mode', 'reason', 'date', 'effectiveFrom', 'code', 'name', 'note']) {
    if (m[k] !== undefined && m[k] !== null && m[k] !== '') parts.push(display(k, m[k]));
    if (parts.length === 2) break;
  }
  return parts.join(' · ');
}

function dayLabel(iso: string) {
  const d = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date(iso));
  if (d === today()) return 'Today';
  if (d === addDays(today(), -1)) return 'Yesterday';
  return formatLongDate(d);
}

const time = (iso: string) =>
  new Date(iso).toLocaleTimeString('en-IN', {
    timeZone: 'Asia/Kolkata',
    hour: 'numeric',
    minute: '2-digit',
  });

export function AuditLogPage() {
  const [entityType, setEntityType] = useState('');
  const [page, setPage] = useState(1);
  const [open, setOpen] = useState<AuditLog | null>(null);
  const q = useAuditLogs({ entityType: entityType || undefined, page, pageSize: 50 });

  const groups = useMemo(() => {
    const out: { day: string; items: AuditLog[] }[] = [];
    for (const l of q.data?.data ?? []) {
      const day = dayLabel(l.createdAt);
      if (out.at(-1)?.day !== day) out.push({ day, items: [] });
      out.at(-1)!.items.push(l);
    }
    return out;
  }, [q.data]);

  return (
    <div>
      <PageHeader
        title="Audit log"
        description="Every sensitive change, with who did it and when. Tap an entry for details."
      />
      <Select
        value={entityType}
        onChange={(e) => (setEntityType(e.target.value), setPage(1))}
        className="mb-3 sm:w-64"
        aria-label="Filter by type"
      >
        <option value="">All activity</option>
        {Object.entries(ENTITY).map(([k, v]) => (
          <option key={k} value={k}>
            {v.label}
          </option>
        ))}
      </Select>
      {q.isPending ? (
        <ListSkeleton rows={8} />
      ) : q.isError ? (
        <ErrorState error={q.error} onRetry={() => void q.refetch()} />
      ) : q.data.data.length === 0 ? (
        <EmptyState icon={<ScrollText />} title="No activity yet" />
      ) : (
        <div className="space-y-4">
          {groups.map((g) => (
            <section key={g.day} aria-label={g.day}>
              <h2 className="mb-1.5 px-1 text-[11px] font-semibold tracking-wider text-muted-foreground uppercase">
                {g.day}
              </h2>
              <Card className="divide-y overflow-hidden">
                {g.items.map((l) => {
                  const e = entityMeta(l.entityType);
                  const sub = summary(l);
                  return (
                    <button
                      key={l.id}
                      type="button"
                      onClick={() => setOpen(l)}
                      className="flex w-full min-w-0 cursor-pointer items-center gap-3 px-3 py-2.5 text-left transition-colors hover:bg-muted/50 active:bg-muted"
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
                        <span className="block truncate text-[13px] font-semibold">
                          {humanize(l.action)}
                        </span>
                        <span className="block truncate text-[12px] text-muted-foreground">
                          {l.actor?.name ?? 'System'}
                          {sub ? ` · ${sub}` : ''}
                        </span>
                      </span>
                      <span className="tabular shrink-0 text-[11px] text-muted-foreground">
                        {time(l.createdAt)}
                      </span>
                      <ChevronRight className="size-4 shrink-0 text-muted-foreground/60" />
                    </button>
                  );
                })}
              </Card>
            </section>
          ))}
          {q.data.meta && (
            <Pagination
              page={page}
              totalPages={(q.data.meta as { totalPages: number }).totalPages}
              total={(q.data.meta as { total: number }).total}
              onPage={setPage}
            />
          )}
        </div>
      )}
      <AuditDetails log={open} onClose={() => setOpen(null)} />
    </div>
  );
}

function AuditDetails({ log, onClose }: { log: AuditLog | null; onClose: () => void }) {
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
            <dl className="grid grid-cols-[7rem_1fr] gap-x-3 gap-y-2 rounded-xl bg-muted/50 p-3 text-[13px]">
              <dt className="text-muted-foreground">Done by</dt>
              <dd className="min-w-0 font-medium break-words">{log.actor?.name ?? 'System'}</dd>
              <dt className="text-muted-foreground">Record</dt>
              <dd className="min-w-0 break-words">
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
              </dd>
              {log.ipAddress && (
                <>
                  <dt className="text-muted-foreground">IP address</dt>
                  <dd className="tabular min-w-0 break-all">{log.ipAddress}</dd>
                </>
              )}
            </dl>
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
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
