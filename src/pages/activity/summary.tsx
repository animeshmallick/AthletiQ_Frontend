/**
 * "Summarise everything": reads the entire activity log on the server (scoped to the caller)
 * and turns it into highlights and totals. Slow on a large log, so it runs only when asked and
 * says so first.
 */
import { Info, Loader2, RefreshCw, Sparkles } from 'lucide-react';
import { useState } from 'react';
import { relativeTime } from '@/app/deployments';
import { ErrorState, SectionDivider } from '@/components/common';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/overlays';
import { formatLongDate } from '@/lib/format';
import { useActivitySummary, type ActivitySummary } from '@/lib/queries';
import { Bars, HourStrip, RankList } from './charts';
import { entityMeta, friendly, humanize, istDay, num } from './meta';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const monthName = (m: string) => {
  const [y, mm] = m.split('-');
  return `${MONTHS[Number(mm) - 1]} ${y}`;
};

export function SummaryButton({ admin }: { admin: boolean }) {
  const [open, setOpen] = useState(false);
  const m = useActivitySummary();
  return (
    <>
      <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
        <Sparkles /> Summarise all
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Sparkles className="size-5 text-primary" />
              {admin ? 'Summary of all activity' : 'Summary of your activity'}
            </DialogTitle>
            <DialogDescription>
              {m.data
                ? `Made ${relativeTime(m.data.generatedAt)} from every entry on record.`
                : 'Reads every entry on record, not just the selected period.'}
            </DialogDescription>
          </DialogHeader>

          {m.data ? (
            <SummaryBody s={m.data} admin={admin} />
          ) : m.isError ? (
            <ErrorState error={m.error} onRetry={() => m.mutate()} />
          ) : (
            <div className="flex gap-2.5 rounded-xl border border-warning/40 bg-warning/10 p-3 text-[13px]">
              <Info className="mt-0.5 size-4 shrink-0 text-warning-foreground dark:text-warning" />
              <div className="space-y-1">
                <p className="font-semibold">This may take a while</p>
                <p className="text-muted-foreground">
                  It reads the entire activity log
                  {admin ? ' for the whole academy' : ' of everything you have done'}, which can
                  take several seconds on a long history. You can close this and keep working; the
                  app is not slowed down for anyone else. Results are kept for 5 minutes.
                </p>
              </div>
            </div>
          )}

          <DialogFooter>
            {m.data ? (
              <Button variant="outline" onClick={() => m.mutate()} disabled={m.isPending}>
                {m.isPending ? <Loader2 className="animate-spin" /> : <RefreshCw />} Refresh
              </Button>
            ) : (
              <Button
                onClick={() => m.mutate()}
                disabled={m.isPending}
                className="w-full sm:w-auto"
              >
                {m.isPending ? (
                  <>
                    <Loader2 className="animate-spin" /> Reading the whole log…
                  </>
                ) : (
                  <>
                    <Sparkles /> Create summary
                  </>
                )}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function Tile({ label, value, hint }: { label: string; value: string | number; hint?: string }) {
  return (
    <div className="rounded-xl bg-muted/50 p-2">
      <p className="text-[11px] text-muted-foreground">{label}</p>
      <p className="tabular text-[17px] leading-tight font-bold">{value}</p>
      {hint && <p className="truncate text-[11px] text-muted-foreground">{hint}</p>}
    </div>
  );
}

function SummaryBody({ s, admin }: { s: ActivitySummary; admin: boolean }) {
  const t = s.totals;
  if (!t.events)
    return <p className="py-6 text-center text-muted-foreground">Nothing recorded yet.</p>;
  return (
    <div className="max-h-[65vh] space-y-3 overflow-y-auto pr-0.5">
      <ul className="space-y-1.5 rounded-xl border bg-primary/4 p-3 text-[13px]">
        {s.highlights.map((h) => (
          <li key={h} className="flex gap-2">
            <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-primary" />
            <span>{friendly(h)}</span>
          </li>
        ))}
      </ul>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Tile
          label="Actions"
          value={num(t.events)}
          hint={t.first ? `since ${formatLongDate(istDay(t.first))}` : undefined}
        />
        <Tile
          label="Active days"
          value={`${t.activeDays}/${t.spanDays}`}
          hint={`${Math.round((t.activeDays / Math.max(1, t.spanDays)) * 100)}% of days`}
        />
        <Tile
          label={admin ? 'People' : 'Records touched'}
          value={admin ? t.people : num(t.records)}
        />
        <Tile label="Worth a second look" value={t.sensitive} />
      </div>

      {s.byMonth.length > 1 && (
        <div>
          <SectionDivider as="h3" className="mb-1">
            Month by month
          </SectionDivider>
          <Bars
            unit="actions"
            data={s.byMonth.map((m) => ({
              key: m.month,
              tick: monthName(m.month).slice(0, 3),
              label: monthName(m.month),
              value: m.n,
            }))}
          />
        </div>
      )}

      <div>
        <SectionDivider as="h3" className="mb-1">
          Time of day
        </SectionDivider>
        <HourStrip hours={s.byHour} unit="actions" />
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="min-w-0">
          <SectionDivider as="h3" className="mb-1">
            Most common
          </SectionDivider>
          <RankList
            items={s.topActions.map((a) => ({
              key: a.action,
              label: humanize(a.action),
              value: a.n,
            }))}
          />
        </div>
        <div className="min-w-0">
          <SectionDivider as="h3" className="mb-1">
            By area
          </SectionDivider>
          <RankList
            items={s.byEntity.map((e) => ({
              key: e.entityType,
              label: entityMeta(e.entityType).label,
              value: e.n,
            }))}
          />
        </div>
        {admin && s.topActors.length > 0 && (
          <div className="min-w-0">
            <SectionDivider as="h3" className="mb-1">
              Most active
            </SectionDivider>
            <RankList
              items={s.topActors.map((p) => ({
                key: p.id,
                label: p.name,
                value: p.n,
                hint: p.role,
              }))}
            />
          </div>
        )}
        {s.sensitive.length > 0 && (
          <div className="min-w-0">
            <SectionDivider as="h3" className="mb-1">
              Worth a second look
            </SectionDivider>
            <RankList
              items={s.sensitive.map((a) => ({
                key: a.action,
                label: humanize(a.action),
                value: a.n,
              }))}
            />
          </div>
        )}
      </div>

      {s.errors && (
        <p className="rounded-xl bg-muted/50 p-2.5 text-[12px] text-muted-foreground">
          Failed requests on record: <b className="text-foreground">{num(s.errors.total)}</b> (
          {s.errors.server} server errors) across {s.errors.routes} endpoints. Details are on the
          Errors tab.
        </p>
      )}
    </div>
  );
}
