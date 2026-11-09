/**
 * Admin-only "Deployments" panel: what's live right now (API + web + Android app), when it was
 * deployed and whether the last API deploy was a rollback. Reads the API's public /ready endpoint.
 */
import { useQuery } from '@tanstack/react-query';
import { Globe, Server, Smartphone } from 'lucide-react';
import { useEffect, useState, type ReactNode } from 'react';
import { API_URL } from '@/lib/env';
import { cn } from '@/lib/utils';
import { isNativeApp } from './native';

/** Everything optional: an older or unreachable API must never break the menu. */
interface Ready {
  status?: string;
  database?: boolean;
  push?: 'enabled' | 'disabled' | 'misconfigured';
  version?: { commit?: string | null; commitMessage?: string | null; builtAt?: string | null };
  deployment?: { deployedAt?: string | null; kind?: string | null; rollback?: boolean };
  server?: { uptime?: string; startedAt?: string };
}

const rtf = new Intl.RelativeTimeFormat('en-IN', { numeric: 'auto' });
/** "3 hours ago", "yesterday"… */
export function relativeTime(iso: string | null | undefined, now = Date.now()): string {
  if (!iso) return 'unknown';
  const sec = Math.round((new Date(iso).getTime() - now) / 1000);
  const steps: [Intl.RelativeTimeFormatUnit, number][] = [
    ['year', 31_536_000],
    ['month', 2_592_000],
    ['week', 604_800],
    ['day', 86_400],
    ['hour', 3_600],
    ['minute', 60],
  ];
  for (const [unit, s] of steps)
    if (Math.abs(sec) >= s) return rtf.format(Math.round(sec / s), unit);
  return 'just now';
}

const stamp = (iso: string | null | undefined) =>
  iso
    ? new Date(iso).toLocaleString('en-IN', {
        timeZone: 'Asia/Kolkata',
        day: 'numeric',
        month: 'short',
        hour: 'numeric',
        minute: '2-digit',
      })
    : '—';

function Row({
  icon,
  label,
  status,
  children,
}: {
  icon: ReactNode;
  label: string;
  status: 'ok' | 'warn' | 'down' | 'unknown';
  children: ReactNode;
}) {
  return (
    <div className="flex gap-2.5 py-2">
      <span className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-lg bg-sidebar-accent text-sidebar-foreground [&_svg]:size-3.5">
        {icon}
      </span>
      <div className="min-w-0 flex-1 text-[12px] leading-snug">
        <p className="flex items-center gap-1.5 font-semibold text-sidebar-foreground">
          <span
            aria-hidden
            className={cn(
              'size-1.5 rounded-full',
              status === 'ok' && 'bg-emerald-400',
              status === 'warn' && 'bg-amber-400',
              status === 'down' && 'bg-red-400',
              status === 'unknown' && 'bg-sidebar-muted',
            )}
          />
          {label}
        </p>
        <div className="text-sidebar-muted">{children}</div>
      </div>
    </div>
  );
}

export function DeploymentsInfo({ className }: { className?: string }) {
  const ready = useQuery({
    queryKey: ['deployments', 'ready'],
    queryFn: async (): Promise<Ready> => {
      const res = await fetch(`${API_URL}/ready`, { cache: 'no-store' });
      return (await res.json()) as Ready;
    },
    refetchInterval: 60_000,
    retry: 1,
  });
  const [app, setApp] = useState<{ version: string; build: string } | null>(null);
  useEffect(() => {
    if (!isNativeApp()) return;
    void import('@capacitor/app')
      .then(({ App }) => App.getInfo())
      .then((i) => setApp({ version: i.version, build: i.build }))
      .catch(() => {});
  }, []);

  const r = ready.data;
  const web = typeof __BUILD__ !== 'undefined' ? __BUILD__ : null;
  const apiStatus = ready.isError
    ? 'down'
    : !r
      ? 'unknown'
      : r.status !== 'ready' || r.deployment?.rollback || r.push === 'misconfigured'
        ? 'warn'
        : 'ok';

  return (
    <section
      aria-label="Deployments"
      className={cn('rounded-2xl border border-sidebar-border px-3 py-1', className)}
    >
      <p className="pt-2 text-[11px] font-semibold tracking-wider text-sidebar-muted uppercase">
        Deployments
      </p>
      <Row icon={<Server />} label="Backend server" status={apiStatus}>
        {ready.isError ? (
          'Not reachable right now'
        ) : !r ? (
          'Checking…'
        ) : (
          <>
            <span className="block truncate">
              {r.version?.commit ?? 'dev'}
              {r.version?.commitMessage ? ` · ${r.version.commitMessage}` : ''}
            </span>
            <span className="block">
              {r.deployment?.rollback ? 'Rolled back ' : 'Deployed '}
              {relativeTime(r.deployment?.deployedAt ?? r.server?.startedAt)} (
              {stamp(r.deployment?.deployedAt ?? r.server?.startedAt)}){' '}
              {r.server?.uptime ? ` · up ${r.server.uptime}` : ''}
            </span>
            {r.push && r.push !== 'enabled' && (
              <span className="block text-amber-500">Push notifications {r.push}</span>
            )}
          </>
        )}
      </Row>
      <Row icon={<Globe />} label="Frontend server" status={web ? 'ok' : 'unknown'}>
        <span className="block">
          {web?.commit ?? 'dev'} · built {relativeTime(web?.builtAt)} ({stamp(web?.builtAt)})
        </span>
      </Row>
      {app && (
        <Row icon={<Smartphone />} label="Android app" status="ok">
          Version {app.version} (build {app.build})
        </Row>
      )}
    </section>
  );
}
