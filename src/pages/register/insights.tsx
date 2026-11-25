/** A month of one batch's attendance in insights (nothing about money). */
import {
  AlarmClock,
  Award,
  CalendarDays,
  ClipboardCheck,
  PhoneCall,
  ShieldAlert,
  Sparkles,
  TrendingDown,
  TrendingUp,
  Users,
  type LucideIcon,
} from 'lucide-react';
import type { ReactNode } from 'react';
import { Link } from 'react-router';
import { EmptyState, SectionDivider } from '@/components/common';
import { Card } from '@/components/ui/primitives';
import { formatLongDate, formatShortDate, isoWeekday, plural, WEEKDAYS } from '@/lib/format';
import { rateBar, rateTone, type MonthlyRegister, type RegisterPerson } from '@/lib/registers';
import { cn } from '@/lib/utils';
import { Change } from './tiles';

function Panel({
  title,
  hint,
  icon: Icon,
  children,
}: {
  title: string;
  hint?: string;
  icon: LucideIcon;
  children: ReactNode;
}) {
  return (
    <Card className="min-w-0 p-3">
      <h3 className="mb-2 flex items-center gap-1.5 text-[13.5px] font-semibold">
        <Icon className="size-4 shrink-0 text-muted-foreground" />
        <span className="min-w-0 flex-1 truncate">{title}</span>
        {hint && (
          <span className="shrink-0 text-[11px] font-normal text-muted-foreground">{hint}</span>
        )}
      </h3>
      {children}
    </Card>
  );
}

function People({
  list,
  empty,
  aside,
}: {
  list: RegisterPerson[];
  empty: string;
  aside: (p: RegisterPerson) => ReactNode;
}) {
  if (!list.length) return <p className="py-2 text-[12.5px] text-muted-foreground">{empty}</p>;
  return (
    <ul className="divide-y">
      {list.map((p) => (
        <li key={p.studentId}>
          <Link
            to={`/students/${p.studentId}`}
            className="flex items-center gap-2 py-1.5 text-[13px] hover:text-primary"
          >
            <span className="min-w-0 flex-1 truncate font-medium">{p.fullName}</span>
            <span className="tabular shrink-0 text-[12px]">{aside(p)}</span>
          </Link>
        </li>
      ))}
    </ul>
  );
}

const Rate = ({ p }: { p: RegisterPerson }) => (
  <span className="inline-flex items-center gap-1.5">
    <Change value={p.change} />
    <b className={rateTone(p.rate)}>{p.rate === null ? '—' : `${p.rate}%`}</b>
  </span>
);

function Columns({
  data,
}: {
  data: { key: string; label: string; title: string; rate: number | null }[];
}) {
  if (!data.length)
    return <p className="py-2 text-[12.5px] text-muted-foreground">No sessions marked yet.</p>;
  return (
    <div className="flex h-32 gap-1.5">
      {data.map((d) => (
        <div
          key={d.key}
          title={d.title}
          className="flex min-w-0 flex-1 flex-col items-center justify-end gap-1"
        >
          <span className={cn('tabular text-[11px] font-semibold', rateTone(d.rate))}>
            {d.rate === null ? '—' : `${d.rate}%`}
          </span>
          <span
            className={cn('w-full max-w-10 rounded-t-md', rateBar(d.rate))}
            style={{ height: `${Math.max(3, (d.rate ?? 0) * 0.8)}px` }}
          />
          <span className="truncate text-[10.5px] text-muted-foreground">{d.label}</span>
        </div>
      ))}
    </div>
  );
}

const BANDS = [
  { key: 'excellent', label: '90% and above', tone: 'bg-success' },
  { key: 'good', label: '80–89%', tone: 'bg-success/60' },
  { key: 'fair', label: '60–79%', tone: 'bg-warning' },
  { key: 'low', label: 'Below 60%', tone: 'bg-destructive' },
  { key: 'none', label: 'No attendance', tone: 'bg-muted-foreground/30' },
] as const;

/** Plain-language takeaways, most useful first. */
function highlights(r: MonthlyRegister): string[] {
  const s = r.summary;
  const i = r.insights;
  const out: string[] = [];
  if (s.rate !== null)
    out.push(
      `Attendance is ${s.rate}%${
        s.change
          ? `, ${s.change > 0 ? 'up' : 'down'} ${Math.abs(s.change)} points from last month (${s.previousRate}%)`
          : s.change === 0
            ? ', the same as last month'
            : ''
      }.`,
    );
  if (i.absentRuns.length)
    out.push(
      `${i.absentRuns.map((p) => p.fullName).join(', ')} ${i.absentRuns.length === 1 ? 'has' : 'have'} missed 3 or more sessions in a row: worth a call.`,
    );
  if (i.declined.length)
    out.push(`${plural(i.declined.length, 'student')} dropped 10 points or more since last month.`);
  const days = i.byWeekday.filter((d) => d.rate !== null && d.sessions >= 2);
  if (days.length > 1) {
    const top = days.reduce((a, b) => (b.rate! > a.rate! ? b : a));
    const low = days.reduce((a, b) => (b.rate! < a.rate! ? b : a));
    if (top.rate! - low.rate! >= 10)
      out.push(
        `${WEEKDAYS[top.weekday - 1]!.long}s are fullest (${top.rate}%), ${WEEKDAYS[low.weekday - 1]!.long}s the weakest (${low.rate}%).`,
      );
  }
  if (i.perfect.length) out.push(`${plural(i.perfect.length, 'student')} came to every session.`);
  if (s.unrecorded)
    out.push(
      `${plural(s.unrecorded, 'session')} ${s.unrecorded === 1 ? 'has' : 'have'} no check-in or attendance.`,
    );
  if (s.unmarked) out.push(`${plural(s.unmarked, 'mark')} missing in sessions that were held.`);
  return out;
}

export function RegisterInsights({
  r,
  onSession,
}: {
  r: MonthlyRegister;
  onSession: (date: string) => void;
}) {
  const s = r.summary;
  const i = r.insights;
  if (!s.held && !s.cancelled)
    return (
      <EmptyState
        icon={<Sparkles />}
        title="No insights yet"
        description="They appear once this month’s sessions are marked."
      />
    );
  const marks = [
    { label: 'Present', n: s.present, tone: 'bg-success' },
    { label: 'Late', n: s.late, tone: 'bg-warning' },
    { label: 'Absent', n: s.absent, tone: 'bg-destructive' },
    { label: 'Excused', n: s.excused, tone: 'bg-info' },
  ];
  const total = marks.reduce((n, m) => n + m.n, 0) || 1;
  const points = highlights(r);
  const lead = r.sessions[0] ? isoWeekday(`${r.month.slice(0, 7)}-01`) - 1 : 0;
  const last = new Date(
    Date.UTC(Number(r.month.slice(0, 4)), Number(r.month.slice(5, 7)), 0),
  ).getUTCDate();
  const on = new Map(r.sessions.map((x) => [Number(x.date.slice(8)), x]));

  return (
    <div className="space-y-2.5">
      {points.length > 0 && (
        <Card className="border-primary/25 bg-primary/5 p-3">
          <h3 className="mb-1.5 flex items-center gap-1.5 text-[13.5px] font-semibold">
            <Sparkles className="size-4 text-primary" /> This month in short
          </h3>
          <ul className="space-y-1 text-[13px]">
            {points.map((p) => (
              <li key={p} className="flex gap-2">
                <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-primary" />
                {p}
              </li>
            ))}
          </ul>
        </Card>
      )}

      <SectionDivider>Who needs a word</SectionDivider>
      <div className="grid grid-cols-1 items-start gap-2.5 md:grid-cols-2 xl:grid-cols-3">
        <Panel title="Missing in a row" hint="3 or more" icon={PhoneCall}>
          <People
            list={i.absentRuns}
            empty="Nobody is missing sessions in a row."
            aside={(p) => (
              <>
                <b className="text-destructive">{p.absentRun} in a row</b>
                {p.lastAttended && (
                  <span className="text-muted-foreground">
                    {' '}
                    · last came {formatShortDate(p.lastAttended)}
                  </span>
                )}
              </>
            )}
          />
        </Panel>
        <Panel title="Low attendance" hint="Below 60%" icon={ShieldAlert}>
          <People
            list={i.low}
            empty="Everyone is at 60% or more."
            aside={(p) => (
              <>
                <span className="text-muted-foreground">
                  {p.attended}/{p.counted} ·{' '}
                </span>
                <Rate p={p} />
              </>
            )}
          />
        </Panel>
        <Panel title="Dropped since last month" hint="10 points or more" icon={TrendingDown}>
          <People list={i.declined} empty="Nobody dropped." aside={(p) => <Rate p={p} />} />
        </Panel>
        <Panel title="Often late" hint="2 times or more" icon={AlarmClock}>
          <People
            list={i.oftenLate}
            empty="Nobody is often late."
            aside={(p) => <b>{p.late} times</b>}
          />
        </Panel>
        {i.neverMarked.length > 0 && (
          <Panel title="Never marked" hint="Expected, no mark" icon={Users}>
            <People list={i.neverMarked} empty="" aside={() => 'No marks this month'} />
          </Panel>
        )}
      </div>

      <SectionDivider>Doing well</SectionDivider>
      <div className="grid grid-cols-1 items-start gap-2.5 md:grid-cols-3">
        <Panel title="100% attendance" icon={Award}>
          <People
            list={i.perfect}
            empty="Nobody has come to every session."
            aside={(p) => plural(p.counted, 'session')}
          />
        </Panel>
        <Panel title="Top attendance" icon={Users}>
          <People list={i.top} empty="No attendance yet." aside={(p) => <Rate p={p} />} />
        </Panel>
        <Panel title="Most improved" hint="10 points or more" icon={TrendingUp}>
          <People list={i.improved} empty="No big gains yet." aside={(p) => <Rate p={p} />} />
        </Panel>
      </div>

      <SectionDivider>Patterns</SectionDivider>
      <div className="grid grid-cols-1 items-start gap-2.5 md:grid-cols-2 xl:grid-cols-3">
        <Panel title="Week by week" icon={TrendingUp}>
          <Columns
            data={i.byWeek.map((w) => ({
              key: w.week,
              label: formatShortDate(w.week).replace(/ \d{4}$/, ''),
              title: `Week of ${formatShortDate(w.week)}: ${plural(w.sessions, 'session')}`,
              rate: w.rate,
            }))}
          />
        </Panel>
        <Panel title="By day of the week" icon={CalendarDays}>
          <Columns
            data={i.byWeekday.map((d) => ({
              key: String(d.weekday),
              label: WEEKDAYS[d.weekday - 1]!.short,
              title: `${WEEKDAYS[d.weekday - 1]!.long}: ${plural(d.sessions, 'session')}`,
              rate: d.rate,
            }))}
          />
        </Panel>
        <Panel title="Month at a glance" hint="Tap a day" icon={CalendarDays}>
          <div className="grid grid-cols-7 gap-1 text-center">
            {WEEKDAYS.map((w) => (
              <span key={w.value} className="text-[10px] text-muted-foreground">
                {w.min}
              </span>
            ))}
            {Array.from({ length: lead }, (_, k) => (
              <span key={`l${k}`} />
            ))}
            {Array.from({ length: last }, (_, k) => {
              const x = on.get(k + 1);
              return x ? (
                <button
                  key={k}
                  type="button"
                  onClick={() => onSession(x.date)}
                  aria-label={`${formatLongDate(x.date)}: ${x.rate === null ? x.state : `${x.rate}%`}`}
                  className={cn(
                    'flex h-9 cursor-pointer flex-col items-center justify-center rounded-lg text-[11px] leading-none font-semibold',
                    x.state === 'held' && x.rate !== null
                      ? x.rate >= 80
                        ? 'bg-success/20 text-success'
                        : x.rate >= 60
                          ? 'bg-warning/25 text-warning-foreground dark:text-warning'
                          : 'bg-destructive/15 text-destructive'
                      : x.state === 'cancelled'
                        ? 'bg-muted text-muted-foreground line-through'
                        : x.state === 'unrecorded'
                          ? 'border border-dashed border-warning text-muted-foreground'
                          : 'border text-muted-foreground',
                  )}
                >
                  {k + 1}
                  {x.state === 'held' && x.rate !== null && (
                    <span className="mt-0.5 text-[8.5px] font-normal">{x.rate}%</span>
                  )}
                </button>
              ) : (
                <span
                  key={k}
                  className="flex h-9 items-center justify-center text-[11px] text-muted-foreground/40"
                >
                  {k + 1}
                </span>
              );
            })}
          </div>
        </Panel>
        <Panel title="Students by attendance" icon={Users}>
          <div className="flex h-3 overflow-hidden rounded-full bg-muted">
            {BANDS.map((b) => (
              <span
                key={b.key}
                className={b.tone}
                style={{ width: `${(i.bands[b.key] / Math.max(1, s.students)) * 100}%` }}
                title={`${b.label}: ${i.bands[b.key]}`}
              />
            ))}
          </div>
          <ul className="mt-2 space-y-1 text-[12.5px]">
            {BANDS.map((b) => (
              <li key={b.key} className="flex items-center gap-2">
                <span className={cn('size-2.5 rounded-sm', b.tone)} />
                <span className="flex-1">{b.label}</span>
                <b className="tabular">{i.bands[b.key]}</b>
              </li>
            ))}
          </ul>
        </Panel>
        <Panel title="All marks" icon={ClipboardCheck}>
          <div className="flex h-3 overflow-hidden rounded-full bg-muted">
            {marks.map((m) => (
              <span
                key={m.label}
                className={m.tone}
                style={{ width: `${(m.n / total) * 100}%` }}
                title={`${m.label}: ${m.n}`}
              />
            ))}
          </div>
          <ul className="mt-2 space-y-1 text-[12.5px]">
            {marks.map((m) => (
              <li key={m.label} className="flex items-center gap-2">
                <span className={cn('size-2.5 rounded-sm', m.tone)} />
                <span className="flex-1">{m.label}</span>
                <b className="tabular">{m.n}</b>
                <span className="tabular w-9 text-right text-muted-foreground">
                  {Math.round((m.n / total) * 100)}%
                </span>
              </li>
            ))}
          </ul>
        </Panel>
        <Panel title="Sessions and records" icon={CalendarDays}>
          <dl className="grid grid-cols-2 gap-1.5 text-[12.5px]">
            {[
              ['Held', String(s.held)],
              ['Cancelled', String(s.cancelled)],
              ['Not recorded', String(s.unrecorded)],
              ['Still to come', String(s.upcoming)],
              ['Moved / extra', `${s.moved} / ${s.extra}`],
              ['Covered by substitute', String(s.covered)],
              ['Made up elsewhere', String(s.madeUp)],
              ['Marks filled in', s.completeness === null ? '—' : `${s.completeness}%`],
              [
                'Coach on time',
                s.punctuality === null ? '—' : `${s.punctuality}% of ${s.checkIns}`,
              ],
              ['Joined / left', `${i.joined} / ${i.left}`],
              ['Best session', i.best ? `${formatShortDate(i.best.date)} · ${i.best.rate}%` : '—'],
              [
                'Weakest session',
                i.worst ? `${formatShortDate(i.worst.date)} · ${i.worst.rate}%` : '—',
              ],
            ].map(([k, v]) => (
              <div key={k} className="rounded-lg bg-muted/50 px-2 py-1.5">
                <dt className="text-[11px] text-muted-foreground">{k}</dt>
                <dd className="tabular font-semibold">{v}</dd>
              </div>
            ))}
          </dl>
        </Panel>
      </div>
    </div>
  );
}
