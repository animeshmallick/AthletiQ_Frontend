/**
 * App errors: what went wrong on people's devices (client-side logs). Totals, the problems grouped
 * by cause (most frequent first, with a sample stack and the trail of screens and taps), and the
 * latest events. Admins see everyone; coaches see their own devices. Kept 30 days.
 */
import {
  CheckCircle2,
  ChevronDown,
  Cloud,
  Gauge,
  RefreshCw,
  ServerCrash,
  Snowflake,
  Users,
} from 'lucide-react';
import { useState } from 'react';
import { relativeTime } from '@/app/deployments';
import { EmptyState, ErrorState, SectionDivider, StatCard } from '@/components/common';
import { Card, Skeleton } from '@/components/ui/primitives';
import { addDays } from '@/lib/format';
import {
  useClientErrorInsights,
  type ClientErrorInsights,
  type ClientEventKind,
} from '@/lib/queries';
import { cn } from '@/lib/utils';
import { FilterChip } from './feed';

/** What each kind means, and how it looks. */
export const CLIENT_KIND: Record<ClientEventKind, { label: string; tone: string }> = {
  crash: { label: 'Crash', tone: 'bg-destructive/10 text-destructive' },
  error: { label: 'Script error', tone: 'bg-destructive/10 text-destructive' },
  update: { label: 'Old version', tone: 'bg-warning/15 text-warning-foreground dark:text-warning' },
  freeze: { label: 'Froze', tone: 'bg-warning/15 text-warning-foreground dark:text-warning' },
  stuck: {
    label: 'Stuck loading',
    tone: 'bg-warning/15 text-warning-foreground dark:text-warning',
  },
  api: { label: 'API failed', tone: 'bg-destructive/10 text-destructive' },
  network: {
    label: 'Load failed',
    tone: 'bg-warning/15 text-warning-foreground dark:text-warning',
  },
  console: { label: 'Console', tone: 'bg-muted text-muted-foreground' },
  reload: { label: 'Reload', tone: 'bg-primary/10 text-primary' },
  slow: { label: 'Slow call', tone: 'bg-warning/15 text-warning-foreground dark:text-warning' },
  offline: { label: 'Offline', tone: 'bg-muted text-muted-foreground' },
  shown: { label: 'Error shown', tone: 'bg-primary/10 text-primary' },
  device: { label: 'Device', tone: 'bg-muted text-muted-foreground' },
};

const PLATFORM: Record<string, string> = {
  web: 'Browser',
  pwa: 'Installed web app',
  android: 'Android app',
  ios: 'iPhone app',
};

/** Logs are kept 30 days: longer periods show the last 30. */
export function clampToKept(range: { from: string; to: string }) {
  const earliest = addDays(range.to, -29);
  return { from: range.from < earliest ? earliest : range.from, to: range.to };
}

function KindChip({ kind }: { kind: ClientEventKind }) {
  const k = CLIENT_KIND[kind] ?? { label: kind, tone: 'bg-muted text-muted-foreground' };
  return (
    <span className={cn('shrink-0 rounded-full px-1.5 py-px text-[10px] font-semibold', k.tone)}>
      {k.label}
    </span>
  );
}

export function ClientErrorsView({ range }: { range: { from: string; to: string } }) {
  const kept = clampToKept(range);
  const [kind, setKind] = useState<ClientEventKind | null>(null);
  const [platform, setPlatform] = useState<string | null>(null);
  const q = useClientErrorInsights({
    ...kept,
    kind: kind ?? undefined,
    platform: platform ?? undefined,
  });

  if (q.isError) return <ErrorState error={q.error} onRetry={() => void q.refetch()} />;
  const d = q.data;
  if (!d)
    return (
      <div className="space-y-2">
        <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-20 rounded-xl" />
          ))}
        </div>
        <Skeleton className="h-40 rounded-xl" />
      </div>
    );
  const t = d.totals;
  const filtered = kind || platform;

  return (
    <div className={cn('space-y-2.5', q.isPlaceholderData && 'opacity-60')}>
      {kept.from !== range.from && (
        <p className="text-[12px] text-muted-foreground">
          App logs are kept 30 days, so this shows the last 30.
        </p>
      )}
      <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
        <StatCard
          label="Crashes"
          value={t.crashes}
          icon={<ServerCrash />}
          tone={t.crashes ? 'destructive' : 'success'}
          hint="Screens that failed or old versions"
        />
        <StatCard
          label="Freezes"
          value={t.freezes}
          icon={<Snowflake />}
          tone={t.freezes ? 'warning' : 'success'}
          hint="Froze or stuck loading"
        />
        <StatCard
          label="Failed calls"
          value={t.api}
          icon={<Cloud />}
          tone={t.api ? 'warning' : 'success'}
          hint={`${t.offline} while offline`}
        />
        <StatCard
          label={d.scope === 'academy' ? 'People affected' : 'Reloads'}
          value={d.scope === 'academy' ? t.users : t.reloads}
          icon={d.scope === 'academy' ? <Users /> : <RefreshCw />}
          hint={
            d.scope === 'academy'
              ? `${t.events} events · ${t.reloads} reloads`
              : `${t.events} events on your devices`
          }
        />
      </div>

      {/* Filter by kind and platform. */}
      {(d.byKind.length > 0 || filtered) && (
        <div className="flex flex-wrap gap-1">
          {d.byKind.map((k) => (
            <button
              key={k.kind}
              type="button"
              onClick={() => setKind(kind === k.kind ? null : k.kind)}
              aria-pressed={kind === k.kind}
              className={cn(
                'inline-flex h-7 cursor-pointer items-center gap-1 rounded-full border px-2 text-[12px] transition-colors',
                kind === k.kind
                  ? 'border-primary bg-primary/10 text-primary'
                  : 'bg-card hover:bg-muted',
              )}
            >
              {CLIENT_KIND[k.kind]?.label ?? k.kind}
              <span className="tabular text-muted-foreground">{k.n}</span>
            </button>
          ))}
          {d.byPlatform.length > 1 &&
            d.byPlatform.map((p) => (
              <button
                key={p.platform}
                type="button"
                onClick={() => setPlatform(platform === p.platform ? null : p.platform)}
                aria-pressed={platform === p.platform}
                className={cn(
                  'inline-flex h-7 cursor-pointer items-center gap-1 rounded-full border border-dashed px-2 text-[12px] transition-colors',
                  platform === p.platform
                    ? 'border-primary bg-primary/10 text-primary'
                    : 'bg-card hover:bg-muted',
                )}
              >
                {PLATFORM[p.platform] ?? p.platform}
                <span className="tabular text-muted-foreground">{p.n}</span>
              </button>
            ))}
          {kind && <FilterChip onClear={() => setKind(null)}>{CLIENT_KIND[kind].label}</FilterChip>}
        </div>
      )}

      {t.events === 0 ? (
        <EmptyState
          icon={<CheckCircle2 />}
          title={filtered ? 'Nothing matches' : 'No app problems'}
          description={
            filtered
              ? 'Clear the filters to see everything.'
              : d.scope === 'academy'
                ? 'No crashes, freezes or failed calls on anyone’s device in this period.'
                : 'Nothing went wrong on your devices in this period.'
          }
        />
      ) : (
        <>
          <SectionDivider>Problems · {d.groups.length}</SectionDivider>
          <ul className="space-y-1.5">
            {d.groups.map((g) => (
              <ProblemRow key={g.fingerprint} g={g} showUsers={d.scope === 'academy'} />
            ))}
          </ul>

          <SectionDivider>Latest</SectionDivider>
          <Card className="divide-y p-0">
            {d.recent.map((e) => (
              <div key={e.id} className="flex items-start gap-2 px-2 py-1.5 text-[12px]">
                <KindChip kind={e.kind} />
                <div className="min-w-0 flex-1">
                  <p className="line-clamp-2 leading-snug">{e.message}</p>
                  <p className="truncate text-[11px] text-muted-foreground">
                    {[
                      relativeTime(e.at),
                      d.scope === 'academy' ? (e.user?.name ?? 'Signed out') : null,
                      e.screen,
                      PLATFORM[e.platform] ?? e.platform,
                      e.online === false ? 'offline' : null,
                      e.count > 1 ? `${e.count}×` : null,
                    ]
                      .filter(Boolean)
                      .join(' · ')}
                  </p>
                </div>
              </div>
            ))}
          </Card>
        </>
      )}
    </div>
  );
}

function ProblemRow({
  g,
  showUsers,
}: {
  g: ClientErrorInsights['groups'][number];
  showUsers: boolean;
}) {
  const [open, setOpen] = useState(false);
  const trail = Array.isArray(g.details?.trail) ? (g.details.trail as string[]) : null;
  const facts = g.details
    ? Object.entries(g.details).filter(([k, v]) => k !== 'trail' && v !== null && v !== '')
    : [];
  return (
    <li className="overflow-hidden rounded-xl border bg-card shadow-e1">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex w-full cursor-pointer items-start gap-2 px-2 py-1.5 text-left hover:bg-muted/40"
      >
        <KindChip kind={g.kind} />
        <span className="min-w-0 flex-1">
          <span className="line-clamp-2 text-[13px] leading-snug font-medium">{g.message}</span>
          <span className="block truncate text-[11px] text-muted-foreground">
            {[
              `${g.n}×`,
              showUsers ? `${g.users} ${g.users === 1 ? 'person' : 'people'}` : null,
              `last ${relativeTime(g.lastSeen)}`,
              g.screens?.join(', '),
            ]
              .filter(Boolean)
              .join(' · ')}
          </span>
        </span>
        <ChevronDown
          className={cn(
            'mt-0.5 size-4 shrink-0 text-muted-foreground transition-transform',
            open && 'rotate-180',
          )}
        />
      </button>
      {open && (
        <div className="space-y-1.5 border-t bg-muted/20 px-2 py-1.5 text-[12px]">
          <p className="text-muted-foreground">
            First seen {relativeTime(g.firstSeen)} ·{' '}
            {g.platforms.map((p) => PLATFORM[p] ?? p).join(', ')}
            {g.versions?.length ? ` · version ${g.versions.join(', ')}` : ''}
          </p>
          {facts.length > 0 && (
            <dl className="grid grid-cols-[auto_1fr] gap-x-2 gap-y-0.5">
              {facts.map(([k, v]) => (
                <div key={k} className="contents">
                  <dt className="text-muted-foreground">{k}</dt>
                  <dd className="tabular min-w-0 truncate">
                    {typeof v === 'object' ? JSON.stringify(v) : String(v as string | number)}
                  </dd>
                </div>
              ))}
            </dl>
          )}
          {trail && (
            <div>
              <p className="mb-0.5 flex items-center gap-1 font-medium">
                <Gauge className="size-3.5" /> Just before
              </p>
              <ol className="flex flex-wrap gap-1">
                {trail.map((c, i) => (
                  <li key={i} className="rounded-md bg-card px-1.5 py-px text-[11px] shadow-e1">
                    {c}
                  </li>
                ))}
              </ol>
            </div>
          )}
          {g.stack && (
            <pre className="max-h-48 overflow-auto rounded-lg bg-card p-1.5 font-mono text-[10.5px] leading-snug whitespace-pre-wrap">
              {g.stack}
            </pre>
          )}
        </div>
      )}
    </li>
  );
}
