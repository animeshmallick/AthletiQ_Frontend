/** Attendance → Monthly register: a tile per batch for the month; tapping one opens its register. */
import { ChevronRight, ClipboardList, TrendingDown, TrendingUp } from 'lucide-react';
import { useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { useUser } from '@/app/auth';
import { EmptyState, ErrorState, ListSkeleton, SearchInput } from '@/components/common';
import { PeriodStepper } from '@/components/date-nav';
import { Badge, Card } from '@/components/ui/primitives';
import { scheduleLabel } from '@/lib/batch-times';
import { formatShortDate, plural } from '@/lib/format';
import {
  monthLabel,
  monthParam,
  monthStep,
  rateBar,
  rateTone,
  thisMonth,
  useRegisterTiles,
  type RegisterTile,
} from '@/lib/registers';
import { cn } from '@/lib/utils';

export function Change({ value, className }: { value: number | null; className?: string }) {
  if (value === null || value === 0) return null;
  const Icon = value > 0 ? TrendingUp : TrendingDown;
  return (
    <span
      className={cn(
        'tabular inline-flex items-center gap-0.5 text-[11px] font-semibold',
        value > 0 ? 'text-success' : 'text-destructive',
        className,
      )}
      title="Compared with the month before"
    >
      <Icon className="size-3" />
      {value > 0 ? '+' : ''}
      {value}
    </span>
  );
}

/** Attendance as a ring. */
export function RateRing({ rate, size = 52 }: { rate: number | null; size?: number }) {
  const r = 20;
  const around = 2 * Math.PI * r;
  return (
    <span
      className="relative inline-flex shrink-0 items-center justify-center"
      style={{ width: size, height: size }}
      role="img"
      aria-label={rate === null ? 'No attendance yet' : `${rate}% attendance`}
    >
      <svg viewBox="0 0 48 48" className="absolute inset-0 size-full -rotate-90">
        <circle cx="24" cy="24" r={r} fill="none" strokeWidth="5" className="stroke-muted" />
        {rate !== null && (
          <circle
            cx="24"
            cy="24"
            r={r}
            fill="none"
            strokeWidth="5"
            strokeLinecap="round"
            strokeDasharray={`${(rate / 100) * around} ${around}`}
            className={
              rate >= 80 ? 'stroke-success' : rate >= 60 ? 'stroke-warning' : 'stroke-destructive'
            }
          />
        )}
      </svg>
      <span className={cn('tabular text-[13px] font-bold', rateTone(rate))}>
        {rate === null ? '—' : `${rate}%`}
      </span>
    </span>
  );
}

/** A bar per session held, oldest first. */
function Trend({ trend }: { trend: RegisterTile['trend'] }) {
  if (trend.length < 2) return null;
  return (
    <span
      className="flex h-7 items-end gap-[2px]"
      role="img"
      aria-label={`Attendance over ${trend.length} sessions`}
    >
      {trend.slice(-16).map((t) => (
        <span
          key={t.date}
          title={`${formatShortDate(t.date)}: ${t.rate}%`}
          className={cn('min-w-0 flex-1 rounded-t-[2px] opacity-80', rateBar(t.rate))}
          style={{ height: `${Math.max(8, t.rate ?? 0)}%` }}
        />
      ))}
    </span>
  );
}

function Tile({ t, month, isAdmin }: { t: RegisterTile; month: string; isAdmin: boolean }) {
  const s = t.summary;
  const due = s.sessions - s.upcoming;
  return (
    <Link
      to={`/attendance/register/${t.batch.id}${month === thisMonth() ? '' : `?month=${month.slice(0, 7)}`}`}
      className="block rounded-2xl outline-none focus-visible:ring-3 focus-visible:ring-ring/30"
    >
      <Card className="h-full space-y-2 p-3 transition-[box-shadow,transform] hover:shadow-e2 active:scale-[0.99]">
        <div className="flex items-start gap-2.5">
          <RateRing rate={s.rate} />
          <div className="min-w-0 flex-1">
            <p className="flex items-center gap-1.5">
              <span className="truncate text-[14.5px] font-semibold">{t.batch.name}</span>
              {!t.batch.isActive && (
                <Badge variant="muted" className="shrink-0">
                  Inactive
                </Badge>
              )}
            </p>
            <p className="truncate text-[12px] text-muted-foreground">{scheduleLabel(t.batch)}</p>
            <p className="truncate text-[12px] text-muted-foreground">
              {isAdmin ? `${t.batch.coach.name} · ` : ''}
              {t.batch.location}
            </p>
          </div>
          <span className="flex shrink-0 items-center gap-1">
            <Change value={s.change} />
            <ChevronRight className="size-4 text-muted-foreground" />
          </span>
        </div>
        <Trend trend={t.trend} />
        <div className="grid grid-cols-3 gap-1.5 text-center">
          {[
            { label: 'Students', value: s.students },
            { label: 'Sessions held', value: `${s.held}/${due}` },
            { label: 'Avg present', value: s.averagePresent ?? '—' },
          ].map((x) => (
            <div key={x.label} className="rounded-lg bg-muted/50 px-1 py-1">
              <p className="tabular text-[14px] leading-tight font-bold">{x.value}</p>
              <p className="truncate text-[10px] text-muted-foreground">{x.label}</p>
            </div>
          ))}
        </div>
        {(t.absentRuns > 0 || t.low > 0 || s.unrecorded > 0 || t.perfect > 0) && (
          <div className="flex flex-wrap gap-1">
            {t.absentRuns > 0 && (
              <Badge variant="destructive">
                {plural(t.absentRuns, 'student')} missing 3+ in a row
              </Badge>
            )}
            {t.low > 0 && <Badge variant="warning">{t.low} below 60%</Badge>}
            {s.unrecorded > 0 && (
              <Badge variant="muted">{plural(s.unrecorded, 'session')} not recorded</Badge>
            )}
            {t.perfect > 0 && <Badge variant="success">{t.perfect} at 100%</Badge>}
          </div>
        )}
      </Card>
    </Link>
  );
}

export function RegisterTiles() {
  const isAdmin = useUser().role === 'admin';
  const [params, setParams] = useSearchParams();
  const month = monthParam(params.get('month'));
  const [search, setSearch] = useState('');
  const q = useRegisterTiles(month);
  const go = (m: string) =>
    setParams(
      (p) => {
        const next = new URLSearchParams(p);
        if (m === thisMonth()) next.delete('month');
        else next.set('month', m.slice(0, 7));
        return next;
      },
      { replace: true },
    );
  const all = q.data?.batches ?? [];
  const needle = search.trim().toLowerCase();
  const list = all.filter(
    (t) =>
      !needle ||
      `${t.batch.name} ${t.batch.coach.name} ${t.batch.location} ${t.batch.sport}`
        .toLowerCase()
        .includes(needle),
  );
  const counted = all.reduce(
    (n, t) => n + t.summary.present + t.summary.late + t.summary.absent,
    0,
  );
  const attended = all.reduce((n, t) => n + t.summary.present + t.summary.late, 0);

  return (
    <div className="space-y-2">
      <PeriodStepper
        label={monthLabel(month)}
        sublabel={
          q.data
            ? `${plural(all.length, 'batch', 'batches')}${counted ? ` · ${Math.round((attended * 100) / counted)}% attendance` : ''}`
            : 'Loading…'
        }
        prevLabel="Previous month"
        nextLabel="Next month"
        onPrev={() => go(monthStep(month, -1))}
        onNext={() => go(monthStep(month, 1))}
        nextDisabled={month >= thisMonth()}
        onToday={month === thisMonth() ? undefined : () => go(thisMonth())}
        todayLabel="This month"
      />
      {all.length > 3 && (
        <SearchInput
          value={search}
          onChange={setSearch}
          placeholder={isAdmin ? 'Search batch, coach or place' : 'Search batches'}
          dense
        />
      )}
      {q.isPending ? (
        <ListSkeleton rows={4} />
      ) : q.isError ? (
        <ErrorState error={q.error} onRetry={() => void q.refetch()} />
      ) : !list.length ? (
        <EmptyState
          icon={<ClipboardList />}
          title={all.length ? 'No batches match' : 'No registers for this month'}
        />
      ) : (
        <div
          className={cn(
            'grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-3',
            q.isPlaceholderData && 'opacity-60',
          )}
        >
          {list.map((t) => (
            <Tile key={t.batch.id} t={t} month={month} isAdmin={isAdmin} />
          ))}
        </div>
      )}
    </div>
  );
}
