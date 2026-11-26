/**
 * Audit log → Server (admins): how the machine and the app are doing now, what that means, how it
 * has been over the period, when it is busiest, and when it was down.
 */
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  Clock,
  Cpu,
  Database,
  HardDrive,
  Lightbulb,
  MemoryStick,
  Server,
  XCircle,
  type LucideIcon,
} from 'lucide-react';
import { useId, useState, type PointerEvent } from 'react';
import { relativeTime } from '@/app/deployments';
import { EmptyState, ErrorState, SectionDivider } from '@/components/common';
import { Badge, Card, Skeleton } from '@/components/ui/primitives';
import { formatInstant, formatShortDate, istDate, plural } from '@/lib/format';
import { useServerHealth, type ServerHealth } from '@/lib/queries';
import { cn } from '@/lib/utils';
import { clockAt, hourLabel, ms } from './meta';

type Level = 'good' | 'warning' | 'critical';

const LEVEL: Record<
  Level,
  { icon: LucideIcon; word: string; text: string; bar: string; ring: string; soft: string }
> = {
  good: {
    icon: CheckCircle2,
    word: 'Healthy',
    text: 'text-success',
    bar: 'bg-success',
    ring: 'stroke-success',
    soft: 'from-success/12',
  },
  warning: {
    icon: AlertTriangle,
    word: 'Needs a look',
    text: 'text-warning-foreground dark:text-warning',
    bar: 'bg-warning',
    ring: 'stroke-warning',
    soft: 'from-warning/18',
  },
  critical: {
    icon: XCircle,
    word: 'Act now',
    text: 'text-destructive',
    bar: 'bg-destructive',
    ring: 'stroke-destructive',
    soft: 'from-destructive/12',
  },
};

const share = (used: number, total: number | null) =>
  total ? Math.round((used * 100) / total) : 0;
const gb = (mb: number) => (mb >= 1024 ? `${(mb / 1024).toFixed(1)} GB` : `${Math.round(mb)} MB`);
const levelOf = (pct: number, warn: number, bad: number): Level =>
  pct >= bad ? 'critical' : pct >= warn ? 'warning' : 'good';

function uptime(seconds: number) {
  const d = Math.floor(seconds / 86_400);
  const h = Math.floor((seconds % 86_400) / 3600);
  return d ? `${plural(d, 'day')} ${h} h` : h ? `${h} h` : `${Math.floor(seconds / 60)} min`;
}

const at = (iso: string) => `${formatShortDate(istDate(iso))}, ${clockAt(iso)}`;

// ─── Score ───────────────────────────────────────────────────────────────────

function ScoreRing({ score, level }: { score: number; level: Level }) {
  const r = 42;
  const around = 2 * Math.PI * r;
  return (
    <span
      className="relative inline-flex size-28 shrink-0 items-center justify-center"
      role="img"
      aria-label={`Health score ${score} of 100`}
    >
      <svg viewBox="0 0 100 100" className="absolute inset-0 size-full -rotate-90">
        <circle cx="50" cy="50" r={r} fill="none" strokeWidth="8" className="stroke-muted" />
        <circle
          cx="50"
          cy="50"
          r={r}
          fill="none"
          strokeWidth="8"
          strokeLinecap="round"
          strokeDasharray={`${(score / 100) * around} ${around}`}
          className={cn('transition-[stroke-dasharray] duration-700', LEVEL[level].ring)}
        />
      </svg>
      <span className="text-center">
        <span className="tabular block text-[30px] leading-none font-bold">{score}</span>
        <span className="text-[10px] text-muted-foreground">of 100</span>
      </span>
    </span>
  );
}

function Hero({ d }: { d: ServerHealth }) {
  const level: Level = d.problems.some((p) => p.level === 'critical')
    ? 'critical'
    : d.problems.length || d.score < 80
      ? 'warning'
      : 'good';
  const L = LEVEL[level];
  return (
    <Card className={cn('overflow-hidden bg-gradient-to-br to-transparent p-4', L.soft)}>
      <div className="flex flex-wrap items-center gap-4">
        <ScoreRing score={d.score} level={level} />
        <div className="min-w-0 flex-1 basis-56 space-y-1.5">
          <p className={cn('flex items-center gap-1.5 text-[18px] font-bold', L.text)}>
            <L.icon className="size-5 shrink-0" /> {L.word}
          </p>
          {d.problems.length ? (
            <ul className="space-y-1" role="alert">
              {d.problems.map((p) => (
                <li key={p.key} className="text-[13px]">
                  <b className="font-semibold">{p.title}.</b>{' '}
                  <span className="text-muted-foreground">{p.detail}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-[13px] text-muted-foreground">
              CPU, memory, disk and the database are all within limits.
            </p>
          )}
          <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] text-muted-foreground">
            <span className="inline-flex items-center gap-1.5">
              <span className="relative flex size-2" aria-hidden>
                <span className="absolute inline-flex size-full animate-ping rounded-full bg-success opacity-60" />
                <span className="relative inline-flex size-2 rounded-full bg-success" />
              </span>
              Live · refreshes every minute
            </span>
            <span className="inline-flex items-center gap-1">
              <Clock className="size-3.5" /> Up {uptime(d.now.uptime)}
            </span>
            {d.availability !== null && (
              <span className="inline-flex items-center gap-1">
                <Activity className="size-3.5" /> {d.availability}% available this period
              </span>
            )}
          </p>
        </div>
      </div>
    </Card>
  );
}

// ─── Resources ───────────────────────────────────────────────────────────────

function Spark({ values, max }: { values: number[]; max: number }) {
  if (values.length < 2) return <span className="block h-8" />;
  const W = 100;
  const pts = values.map(
    (v, i) => `${(i / (values.length - 1)) * W},${30 - (Math.min(v, max) / max) * 28}`,
  );
  return (
    <svg viewBox="0 0 100 30" preserveAspectRatio="none" className="block h-8 w-full" aria-hidden>
      <polygon points={`0,30 ${pts.join(' ')} 100,30`} className="fill-primary/10" />
      <polyline
        points={pts.join(' ')}
        fill="none"
        className="stroke-primary"
        strokeWidth="2"
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}

function Resource({
  icon: Icon,
  label,
  value,
  unit,
  pct,
  level,
  hint,
  spark,
  sparkMax,
}: {
  icon: LucideIcon;
  label: string;
  value: string;
  unit?: string;
  pct: number;
  level: Level;
  hint: string;
  spark: number[];
  sparkMax: number;
}) {
  const L = LEVEL[level];
  return (
    <Card className="flex min-w-0 flex-col gap-2 p-3">
      <p className="flex items-center gap-2 text-[12.5px] font-medium text-muted-foreground">
        <span className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <Icon className="size-4" />
        </span>
        <span className="min-w-0 flex-1 truncate">{label}</span>
        {level !== 'good' && (
          <L.icon className={cn('size-4 shrink-0', L.text)} aria-label={L.word} />
        )}
      </p>
      <p className="tabular text-[26px] leading-none font-bold">
        {value}
        {unit && (
          <span className="ml-0.5 text-[13px] font-medium text-muted-foreground">{unit}</span>
        )}
      </p>
      <Spark values={spark} max={sparkMax} />
      <span
        className="block h-1.5 overflow-hidden rounded-full bg-muted"
        role="meter"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(Math.min(100, pct))}
      >
        <span
          className={cn('block h-full rounded-full transition-[width] duration-500', L.bar)}
          style={{ width: `${Math.min(100, Math.max(2, pct))}%` }}
        />
      </span>
      <p className="text-[11.5px] text-muted-foreground">{hint}</p>
    </Card>
  );
}

// ─── Charts ──────────────────────────────────────────────────────────────────

/** One measure over time: an area with a crosshair, its limit as a dashed line. */
function AreaChart({
  title,
  points,
  unit,
  limit,
  top,
  summary,
  format,
}: {
  title: string;
  points: { at: string; value: number | null }[];
  unit: string;
  limit?: { value: number; label: string };
  /** The scale's top; the largest value when absent. */
  top?: number;
  summary: string;
  format: (n: number) => string;
}) {
  const id = useId();
  const [hover, setHover] = useState<number | null>(null);
  const W = 600;
  const H = 150;
  const max =
    Math.max(top ?? 0, ...points.map((p) => p.value ?? 0), limit ? limit.value : 0, 1) * 1.05;
  const x = (i: number) => (points.length < 2 ? 0 : (i / (points.length - 1)) * W);
  const y = (v: number) => H - (v / max) * H;
  // A reading that failed leaves a gap rather than a false zero.
  const runs: { i: number; v: number }[][] = [];
  points.forEach((p, i) => {
    if (p.value === null) return;
    if (i === 0 || points[i - 1]!.value === null || !runs.length) runs.push([]);
    runs.at(-1)!.push({ i, v: p.value });
  });
  const move = (e: PointerEvent<SVGSVGElement>) => {
    const box = e.currentTarget.getBoundingClientRect();
    const i = Math.round(((e.clientX - box.left) / box.width) * (points.length - 1));
    setHover(Math.min(points.length - 1, Math.max(0, i)));
  };
  const h = hover === null ? null : points[hover];
  const first = points[0]!;
  const last = points.at(-1)!;
  const tick = (iso: string) => (istDate(first.at) === istDate(last.at) ? clockAt(iso) : at(iso));
  return (
    <Card className="min-w-0 p-3">
      <div className="mb-1 flex items-baseline justify-between gap-2">
        <h3 className="text-[13.5px] font-semibold">{title}</h3>
        <p className="tabular truncate text-[12px] text-muted-foreground" aria-live="polite">
          {h ? (
            <>
              <b className="text-foreground">{h.value === null ? 'No reading' : format(h.value)}</b>{' '}
              · {at(h.at)}
            </>
          ) : (
            summary
          )}
        </p>
      </div>
      <div className="relative">
        <svg
          viewBox={`0 0 ${W} ${H}`}
          preserveAspectRatio="none"
          className="block h-36 w-full touch-pan-y"
          role="img"
          aria-label={`${title}: ${summary}`}
          onPointerMove={move}
          onPointerDown={move}
          onPointerLeave={() => setHover(null)}
        >
          <defs>
            <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--primary)" stopOpacity="0.28" />
              <stop offset="100%" stopColor="var(--primary)" stopOpacity="0.02" />
            </linearGradient>
          </defs>
          {[0.25, 0.5, 0.75].map((g) => (
            <line
              key={g}
              x1="0"
              x2={W}
              y1={H * g}
              y2={H * g}
              className="stroke-border"
              strokeWidth="1"
              vectorEffect="non-scaling-stroke"
            />
          ))}
          {runs.map((run) => (
            <g key={run[0]!.i}>
              <polygon
                points={`${x(run[0]!.i)},${H} ${run.map((p) => `${x(p.i)},${y(p.v)}`).join(' ')} ${x(run.at(-1)!.i)},${H}`}
                fill={`url(#${id})`}
              />
              <polyline
                points={run.map((p) => `${x(p.i)},${y(p.v)}`).join(' ')}
                fill="none"
                className="stroke-primary"
                strokeWidth="2"
                strokeLinejoin="round"
                strokeLinecap="round"
                vectorEffect="non-scaling-stroke"
              />
            </g>
          ))}
          {limit && (
            <line
              x1="0"
              x2={W}
              y1={y(limit.value)}
              y2={y(limit.value)}
              className="stroke-destructive"
              strokeWidth="1.5"
              strokeDasharray="5 4"
              vectorEffect="non-scaling-stroke"
            />
          )}
          {hover !== null && (
            <line
              x1={x(hover)}
              x2={x(hover)}
              y1="0"
              y2={H}
              className="stroke-foreground/50"
              strokeWidth="1"
              vectorEffect="non-scaling-stroke"
            />
          )}
        </svg>
        {limit && (
          <span
            className="pointer-events-none absolute right-0 rounded bg-card/90 px-1 text-[10px] text-muted-foreground"
            style={{ top: `calc(${(y(limit.value) / H) * 100}% + 2px)` }}
          >
            {limit.label}
          </span>
        )}
        {hover !== null && h && h.value !== null && (
          <span
            aria-hidden
            className="pointer-events-none absolute size-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-primary ring-2 ring-card"
            style={{ left: `${(x(hover) / W) * 100}%`, top: `${(y(h.value) / H) * 100}%` }}
          />
        )}
      </div>
      <div className="mt-1 flex justify-between text-[10.5px] text-muted-foreground">
        <span>{tick(first.at)}</span>
        <span className="sr-only">{unit}</span>
        <span>{tick(last.at)}</span>
      </div>
    </Card>
  );
}

/** Average CPU for each hour of the day: one hue, darker is busier. */
function BusyHours({ d }: { d: ServerHealth }) {
  const [hover, setHover] = useState<number | null>(null);
  const max = Math.max(1, ...d.byHour.map((h) => h.cpu ?? 0));
  const h = hover === null ? null : d.byHour[hover];
  const busiest = d.byHour.reduce<(typeof d.byHour)[number] | null>(
    (m, x) => (x.cpu !== null && (!m || x.cpu > m.cpu!) ? x : m),
    null,
  );
  return (
    <Card className="min-w-0 p-3">
      <div className="mb-2 flex items-baseline justify-between gap-2">
        <h3 className="text-[13.5px] font-semibold">Busiest hours</h3>
        <p className="tabular truncate text-[12px] text-muted-foreground" aria-live="polite">
          {h ? (
            <>
              <b className="text-foreground">{h.cpu === null ? 'No readings' : `${h.cpu}% CPU`}</b>{' '}
              · {hourLabel(h.hour)}
            </>
          ) : busiest ? (
            `Busiest around ${hourLabel(busiest.hour)} (${busiest.cpu}%)`
          ) : (
            ''
          )}
        </p>
      </div>
      <div
        className="grid grid-cols-12 gap-1 sm:grid-cols-24"
        role="group"
        aria-label="Average CPU by hour of the day"
        onPointerLeave={() => setHover(null)}
      >
        {d.byHour.map((x) => (
          <button
            key={x.hour}
            type="button"
            aria-label={`${hourLabel(x.hour)}: ${x.cpu === null ? 'no readings' : `${x.cpu}% CPU`}`}
            onPointerEnter={() => setHover(x.hour)}
            onFocus={() => setHover(x.hour)}
            onClick={() => setHover(x.hour)}
            className={cn(
              'h-9 cursor-default rounded-md bg-muted',
              hover === x.hour && 'ring-2 ring-foreground/40',
            )}
          >
            {x.cpu !== null && (
              <span
                className="block size-full rounded-md bg-primary"
                style={{ opacity: 0.12 + (x.cpu / max) * 0.88 }}
              />
            )}
          </button>
        ))}
      </div>
      <p className="mt-1.5 flex items-center justify-between text-[10.5px] text-muted-foreground">
        <span>12 am → 11 pm</span>
        <span className="inline-flex items-center gap-1">
          Quiet
          {[0.15, 0.4, 0.7, 1].map((o) => (
            <span key={o} className="size-2.5 rounded-sm bg-primary" style={{ opacity: o }} />
          ))}
          Busy
        </span>
      </p>
    </Card>
  );
}

// ─── Meaning ─────────────────────────────────────────────────────────────────

/** What the figures mean, in plain words, most useful first. */
function meaning(d: ServerHealth): { level: Level; text: string }[] {
  const n = d.now;
  const s = d.summary;
  const out: { level: Level; text: string }[] = [];
  const memPeak = share(s.memMax ?? n.memUsed, n.memTotal);
  const enough = s.readings >= 30;
  if ((s.stealMax ?? 0) >= 10)
    out.push({
      level: 'warning',
      text: `AWS held back up to ${Math.round(s.stealMax!)}% of the CPU: the instance ran out of CPU credits. A larger type (for example t3.small to t3.medium) or unlimited mode avoids it.`,
    });
  if (n.swapUsed > n.memTotal * 0.25)
    out.push({
      level: 'warning',
      text: `${gb(n.swapUsed)} of swap is in use: memory is short, so some of it runs from the much slower disk.`,
    });
  if (enough && memPeak >= 85)
    out.push({
      level: 'warning',
      text: `Memory peaked at ${memPeak}%. Little is left for a busy moment or a deploy; consider a server with more.`,
    });
  if (d.diskDaysLeft !== null && d.diskDaysLeft <= 60)
    out.push({
      level: d.diskDaysLeft <= 14 ? 'critical' : 'warning',
      text: `At this week’s pace the disk is full in about ${plural(d.diskDaysLeft, 'day')}.`,
    });
  if ((s.dbAvg ?? 0) >= 30)
    out.push({
      level: 'warning',
      text: `Each database trip takes about ${Math.round(s.dbAvg!)} ms; beside the database it would be 1–3 ms. Moving the server to the database’s region is the biggest speed-up available.`,
    });
  if (d.outages.length)
    out.push({
      level: 'warning',
      text: `${plural(d.outages.length, 'gap')} of 3 minutes or more in the readings: a deploy, a restart or downtime.`,
    });
  if ((s.waitingMax ?? 0) >= 5)
    out.push({
      level: 'warning',
      text: `Up to ${s.waitingMax} requests waited for a database connection at once.`,
    });
  if (enough && (s.cpuMax ?? 0) < 60 && (s.stealMax ?? 0) < 5)
    out.push({
      level: 'good',
      text: `CPU averaged ${s.cpuAvg}% and never passed ${s.cpuMax}%: the server is comfortably big enough.`,
    });
  if (enough && memPeak < 75)
    out.push({
      level: 'good',
      text: `Memory peaked at ${memPeak}%, leaving ${gb(n.memTotal - (s.memMax ?? n.memUsed))} free.`,
    });
  if (d.diskDaysLeft === null && share(n.diskTotal - n.diskFree, n.diskTotal) < 80)
    out.push({ level: 'good', text: 'The disk isn’t filling up.' });
  if (!out.length) out.push({ level: 'good', text: 'More to say once an hour of readings is in.' });
  return out;
}

// ─── View ────────────────────────────────────────────────────────────────────

export function ServerView({ range }: { range: { from: string; to: string; since?: string } }) {
  const q = useServerHealth(range);
  const d = q.data;
  if (q.isError && !d) return <ErrorState error={q.error} onRetry={() => void q.refetch()} />;
  if (!d)
    return (
      <div className="space-y-2">
        <Skeleton className="h-36 rounded-2xl" />
        <div className="grid grid-cols-2 gap-2 lg:grid-cols-5">
          {[0, 1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-40 rounded-xl" />
          ))}
        </div>
      </div>
    );
  const n = d.now;
  const s = d.summary;
  const disk = share(n.diskTotal - n.diskFree, n.diskTotal);
  const mem = share(n.memUsed, n.memTotal);
  const app = share(n.appMem, n.appLimit);
  const recent = d.series.slice(-30);
  const of = (f: (x: ServerHealth['series'][number]) => number | null) =>
    recent.map((x) => f(x) ?? 0);
  const line = (f: (x: ServerHealth['series'][number]) => number | null) =>
    d.series.map((x) => ({ at: x.at, value: f(x) }));
  return (
    <div className={cn('space-y-2.5', q.isPlaceholderData && 'opacity-60')}>
      <Hero d={d} />

      <SectionDivider>Right now</SectionDivider>
      <div className="grid grid-cols-2 gap-2 md:grid-cols-3 xl:grid-cols-5">
        <Resource
          icon={Cpu}
          label="CPU"
          value={String(Math.round(n.cpu))}
          unit="%"
          pct={n.cpu}
          level={n.steal >= 20 ? 'warning' : levelOf(n.cpu, 70, 90)}
          hint={
            n.steal >= 5
              ? `AWS holding back ${Math.round(n.steal)}%`
              : `Load ${n.load} on ${plural(n.cores, 'core')}`
          }
          spark={of((x) => x.cpu)}
          sparkMax={100}
        />
        <Resource
          icon={MemoryStick}
          label="Server memory"
          value={String(mem)}
          unit="%"
          pct={mem}
          level={levelOf(mem, 80, 90)}
          hint={`${gb(n.memUsed)} of ${gb(n.memTotal)}${n.swapUsed ? ` · swap ${gb(n.swapUsed)}` : ''}`}
          spark={of((x) => x.mem)}
          sparkMax={n.memTotal || 1}
        />
        <Resource
          icon={Server}
          label="App memory"
          value={n.appLimit ? String(app) : gb(n.appMem)}
          unit={n.appLimit ? '%' : undefined}
          pct={app}
          level={levelOf(app, 75, 90)}
          hint={n.appLimit ? `${gb(n.appMem)} of ${gb(n.appLimit)}` : 'No limit set'}
          spark={of((x) => x.app)}
          sparkMax={n.appLimit ?? Math.max(1, ...of((x) => x.app))}
        />
        <Resource
          icon={HardDrive}
          label="Disk"
          value={String(disk)}
          unit="%"
          pct={disk}
          level={levelOf(disk, 80, 90)}
          hint={
            d.diskDaysLeft !== null
              ? `${gb(n.diskFree)} free · full in ~${plural(d.diskDaysLeft, 'day')}`
              : `${gb(n.diskFree)} free of ${gb(n.diskTotal)}`
          }
          spark={of((x) => x.disk)}
          sparkMax={n.diskTotal || 1}
        />
        <Resource
          icon={Database}
          label="Database trip"
          value={n.dbMs === null ? 'Down' : String(n.dbMs)}
          unit={n.dbMs === null ? undefined : 'ms'}
          pct={n.dbMs === null ? 100 : n.dbMs / 3}
          level={n.dbMs === null ? 'critical' : levelOf(n.dbMs, 150, 300)}
          hint={`${plural(n.dbConnections, 'connection')}${n.dbWaiting ? ` · ${n.dbWaiting} waiting` : ''}`}
          spark={of((x) => x.dbMs)}
          sparkMax={Math.max(100, ...of((x) => x.dbMs))}
        />
      </div>

      <SectionDivider>What it means</SectionDivider>
      <Card className="p-3">
        <ul className="space-y-1.5">
          {meaning(d).map((m) => {
            const Icon =
              m.level === 'good' ? CheckCircle2 : m.level === 'warning' ? Lightbulb : XCircle;
            return (
              <li key={m.text} className="flex gap-2 text-[13px]">
                <Icon className={cn('mt-0.5 size-4 shrink-0', LEVEL[m.level].text)} aria-hidden />
                <span>{m.text}</span>
              </li>
            );
          })}
        </ul>
      </Card>

      {d.series.length < 2 ? (
        <EmptyState
          icon={<Cpu />}
          title="Collecting readings"
          description="One is saved every minute; charts appear after a few."
        />
      ) : (
        <>
          <SectionDivider>Over the period</SectionDivider>
          <div className="grid grid-cols-1 gap-2.5 lg:grid-cols-2">
            <AreaChart
              title="CPU"
              unit="percent"
              points={line((x) => x.cpu)}
              top={100}
              limit={{ value: 90, label: 'Alert at 90%' }}
              summary={`${s.cpuAvg}% on average, ${s.cpuMax}% at most`}
              format={(v) => `${v}%`}
            />
            <AreaChart
              title="Server memory"
              unit="megabytes"
              points={line((x) => x.mem)}
              top={n.memTotal}
              limit={{ value: n.memTotal * 0.9, label: 'Alert at 90%' }}
              summary={`${gb(s.memMax ?? 0)} of ${gb(n.memTotal)} at most`}
              format={gb}
            />
            <AreaChart
              title="App memory"
              unit="megabytes"
              points={line((x) => x.app)}
              top={n.appLimit ?? undefined}
              limit={
                n.appLimit
                  ? { value: n.appLimit * 0.9, label: 'Alert at 90% of its limit' }
                  : undefined
              }
              summary={`${gb(s.appMax ?? 0)} at most`}
              format={gb}
            />
            <AreaChart
              title="Database trip"
              unit="milliseconds"
              points={line((x) => x.dbMs)}
              summary={`${ms(Math.round(s.dbAvg ?? 0))} on average, ${ms(s.dbMax ?? 0)} at most`}
              format={(v) => ms(Math.round(v))}
            />
          </div>
          <BusyHours d={d} />
        </>
      )}

      {d.outages.length > 0 && (
        <>
          <SectionDivider>Restarts and gaps</SectionDivider>
          <Card className="divide-y overflow-hidden">
            {d.outages.map((o) => (
              <div key={o.from} className="flex items-center gap-2.5 px-3 py-2 text-[13px]">
                <AlertTriangle className="size-4 shrink-0 text-warning-foreground dark:text-warning" />
                <span className="min-w-0 flex-1">
                  {at(o.from)} <span className="text-muted-foreground">to {at(o.to)}</span>
                </span>
                <b className="tabular shrink-0">{plural(o.minutes, 'minute')}</b>
              </div>
            ))}
          </Card>
        </>
      )}

      <SectionDivider>Details</SectionDivider>
      <Card className="p-3">
        <dl className="grid grid-cols-2 gap-1.5 text-[12.5px] sm:grid-cols-3 lg:grid-cols-4">
          {[
            ['Server running for', uptime(n.uptime)],
            ['App running for', d.build.server.uptime],
            ['Version', d.build.version.commit ?? '—'],
            [
              'Deployed',
              d.build.deployment.deployedAt
                ? `${formatInstant(d.build.deployment.deployedAt)} (${relativeTime(d.build.deployment.deployedAt)})`
                : '—',
            ],
            ['CPU, 95% of the time below', s.cpuP95 === null ? '—' : `${s.cpuP95}%`],
            ['Busiest CPU', s.cpuMax === null ? '—' : `${s.cpuMax}%`],
            ['Most held back by AWS', s.stealMax === null ? '—' : `${s.stealMax}%`],
            ['Most server memory', s.memMax === null ? '—' : gb(s.memMax)],
            ['Most swap', s.swapMax === null ? '—' : gb(s.swapMax)],
            ['Most app memory', s.appMax === null ? '—' : gb(s.appMax)],
            ['Slowest database trip', s.dbMax === null ? '—' : ms(s.dbMax)],
            ['Longest app pause', s.lagMax === null ? '—' : ms(s.lagMax)],
            ['Most requests waiting', String(s.waitingMax ?? '—')],
            ['Minutes database was down', String(s.dbDown)],
            ['Node', d.build.server.node],
            ['Readings', `${s.readings.toLocaleString('en-IN')}, one a minute`],
          ].map(([k, v]) => (
            <div key={k} className="min-w-0 rounded-lg bg-muted/50 px-2 py-1.5">
              <dt className="text-[11px] text-muted-foreground">{k}</dt>
              <dd className="tabular truncate font-semibold" title={v}>
                {v}
              </dd>
            </div>
          ))}
        </dl>
        {d.build.deployment.rollback && (
          <Badge variant="warning" className="mt-2">
            Rolled back from {d.build.deployment.previousVersion}
          </Badge>
        )}
      </Card>
      <p className="text-[11px] text-muted-foreground">
        Readings are kept 30 days. Admins are notified, once a day for each problem, when the disk
        passes 85%, or when CPU, memory or the database stay bad for 10 minutes.
      </p>
    </div>
  );
}
