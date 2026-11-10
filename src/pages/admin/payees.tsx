/**
 * Payees: outside parties that get a share of fees (a society, ground owner, federation…).
 * The list shows what each is owed and earned; tapping one opens everything about them.
 */
import { Building2, ChevronRight, Plus } from 'lucide-react';
import { useState } from 'react';
import { useSearchParams } from 'react-router';
import { EmptyState, ErrorState, ListSkeleton, PageHeader, SearchInput } from '@/components/common';
import { FilterBar, PeriodFilter } from '@/components/filters';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/controls';
import { Badge } from '@/components/ui/primitives';
import { formatShortDate, money, moneyCompact, plural } from '@/lib/format';
import { periodRange, type PeriodKey } from '@/lib/periods';
import { usePayeeSummaries } from '@/lib/queries';
import { cn } from '@/lib/utils';
import { EditPayeeDialog, PAYEE_PERIODS, PayeeSheet } from './payee-sheet';

export function PayeesPage() {
  const [params, setParams] = useSearchParams();
  const period = (params.get('period') as PeriodKey | null) ?? 'fy';
  const openId = params.get('payee');
  const [search, setSearch] = useState('');
  const [showRetired, setShowRetired] = useState(false);
  const [adding, setAdding] = useState(false);
  const q = usePayeeSummaries(periodRange(period));

  const set = (patch: Record<string, string | null>) => {
    const p = new URLSearchParams(params);
    for (const [k, v] of Object.entries(patch)) {
      if (v) p.set(k, v);
      else p.delete(k);
    }
    setParams(p, { replace: !('payee' in patch) });
  };

  const all = q.data ?? [];
  const needle = search.trim().toLowerCase();
  const list = all.filter(
    (p) =>
      (showRetired || p.isActive) &&
      (!needle || `${p.name} ${p.note ?? ''}`.toLowerCase().includes(needle)),
  );
  const active = all.filter((p) => p.isActive);
  const totals = {
    owed: all.reduce((n, p) => n + p.owedNow, 0),
    earned: all.reduce((n, p) => n + p.earned, 0),
    paid: all.reduce((n, p) => n + p.paid, 0),
    expected: active.reduce((n, p) => n + p.expectedMonthly, 0),
  };
  const retired = all.length - active.length;

  return (
    <div>
      <PageHeader
        title="Payees"
        description="Outside parties that receive a share of fees. Tap one for its history and insights."
        actions={
          <Button size="sm" onClick={() => setAdding(true)}>
            <Plus /> Add payee
          </Button>
        }
      />

      <FilterBar>
        <PeriodFilter
          value={period}
          onChange={(p) => set({ period: p === 'fy' ? null : p })}
          options={PAYEE_PERIODS}
        />
      </FilterBar>

      {all.length > 0 && (
        <div className="mb-3 grid grid-cols-4 gap-1.5 rounded-2xl border bg-card p-1.5 shadow-e1">
          {[
            { label: 'Owed now', value: moneyCompact(totals.owed), warn: totals.owed > 0 },
            { label: 'Earned', value: moneyCompact(totals.earned) },
            { label: 'Paid', value: moneyCompact(totals.paid) },
            { label: 'Expected / mo', value: moneyCompact(totals.expected) },
          ].map((x) => (
            <div key={x.label} className="rounded-xl bg-muted/40 px-1 py-1.5 text-center">
              <p
                className={cn(
                  'tabular truncate text-base leading-tight font-bold',
                  x.warn && 'text-warning-foreground dark:text-warning',
                )}
              >
                {x.value}
              </p>
              <p className="truncate text-[10px] font-medium text-muted-foreground">{x.label}</p>
            </div>
          ))}
        </div>
      )}

      {all.length > 0 && (
        <div className="mb-2 flex items-center gap-2">
          <SearchInput
            value={search}
            onChange={setSearch}
            placeholder="Search payees…"
            className="flex-1"
          />
          {retired > 0 && (
            <label className="flex shrink-0 items-center gap-2 text-[13px]">
              <Switch
                checked={showRetired}
                onCheckedChange={setShowRetired}
                aria-label="Show retired payees"
              />
              Retired ({retired})
            </label>
          )}
        </div>
      )}

      {q.isPending ? (
        <ListSkeleton rows={3} />
      ) : q.isError ? (
        <ErrorState error={q.error} onRetry={() => void q.refetch()} />
      ) : all.length === 0 ? (
        <EmptyState
          icon={<Building2 />}
          title="No payees yet"
          description="Add a society, ground owner or federation that takes a share of fees, then include them in a fee plan’s split."
          action={
            <Button size="sm" onClick={() => setAdding(true)}>
              <Plus /> Add payee
            </Button>
          }
        />
      ) : list.length === 0 ? (
        <p className="py-8 text-center text-[13px] text-muted-foreground">No payees match.</p>
      ) : (
        <div className="grid grid-cols-1 gap-1.5 *:min-w-0 sm:grid-cols-2 sm:gap-2 xl:grid-cols-3">
          {list.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => set({ payee: p.id })}
              aria-label={`${p.name} details`}
              className={cn(
                'flex cursor-pointer flex-col gap-1.5 rounded-xl border bg-card p-1.5 text-left shadow-e1 transition-shadow hover:shadow-e2',
                !p.isActive && 'opacity-60',
              )}
            >
              <span className="flex items-center gap-2">
                <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-amber-500/12 text-amber-700 dark:text-amber-300">
                  <Building2 className="size-4" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-1.5">
                    <span className="truncate text-[14px] font-semibold">{p.name}</span>
                    {!p.isActive && <Badge variant="muted">Retired</Badge>}
                  </span>
                  <span className="block truncate text-[11px] text-muted-foreground">
                    {p.note ||
                      (p.plans
                        ? `${plural(p.plans, 'fee plan')} · ${plural(p.students, 'student')}`
                        : 'Not in any fee plan yet')}
                  </span>
                </span>
                <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
              </span>
              <span className="grid grid-cols-3 gap-0.5">
                {[
                  {
                    label: 'Owed now',
                    value: money(p.owedNow),
                    hint: p.owedNow > 0 ? plural(p.unpaidDays, 'day') : 'settled',
                    warn: p.owedNow > 0,
                  },
                  { label: 'Earned', value: money(p.earned), hint: 'this period' },
                  {
                    label: 'Last paid',
                    value: p.lastPayout ? money(p.lastPayout.amount) : '—',
                    hint: p.lastPayout ? formatShortDate(p.lastPayout.date) : 'never',
                  },
                ].map((x) => (
                  <span key={x.label} className="min-w-0 rounded-md bg-muted/40 px-1.5 py-0.5">
                    <span className="block truncate text-[10px] font-medium text-muted-foreground">
                      {x.label}
                    </span>
                    <span
                      className={cn(
                        'tabular block truncate text-[12px] font-bold',
                        x.warn && 'text-warning-foreground dark:text-warning',
                      )}
                    >
                      {x.value}
                    </span>
                    <span className="block truncate text-[10px] text-muted-foreground">
                      {x.hint}
                    </span>
                  </span>
                ))}
              </span>
              {p.expectedMonthly > 0 && (
                <span className="px-0.5 text-[10px] text-muted-foreground">
                  About {money(p.expectedMonthly)} expected each month
                </span>
              )}
            </button>
          ))}
        </div>
      )}

      <PayeeSheet
        id={openId}
        period={period}
        onPeriod={(p) => set({ period: p === 'fy' ? null : p })}
        onClose={() => set({ payee: null })}
      />
      {adding && <EditPayeeDialog onClose={() => setAdding(false)} />}
    </div>
  );
}
