/**
 * Finance → Invoices: one smart filter. Search stays on the bar; the filter button holds status,
 * sort and every filter (who, what, when, how much); chips under the bar show what is applied
 * and remove it with one tap. Everything lives in the URL, so a filtered list can be bookmarked
 * or shared and survives a refresh.
 */
import { X } from 'lucide-react';
import type { ReactNode } from 'react';
import { useUser } from '@/app/auth';
import { SearchInput } from '@/components/common';
import { FilterField, FilterMenu } from '@/components/filters';
import { Segmented } from '@/components/ui/controls';
import { Input, Select } from '@/components/ui/primitives';
import { formatMonth, money } from '@/lib/format';
import { useBatches, useFeePlans, useLocations, useStudents, useUsers } from '@/lib/queries';
import { useSports } from '@/lib/skills';

/** URL param → API param. */
export const INVOICE_FILTERS = {
  student: 'studentId',
  batch: 'batchId',
  sport: 'sportId',
  location: 'locationId',
  coach: 'coachId',
  plan: 'feePlanId',
  month: 'month',
  late: 'overdueBy',
  min: 'amountMin',
  max: 'amountMax',
} as const;
export type FilterKey = keyof typeof INVOICE_FILTERS;

export const STATUSES = [
  { value: 'open', label: 'Unpaid' },
  { value: 'overdue', label: 'Overdue' },
  { value: 'paid', label: 'Paid' },
  { value: 'all', label: 'All' },
] as const;

export const SORTS = [
  { value: 'dueDateAsc', label: 'Due date · earliest' },
  { value: 'dueDateDesc', label: 'Due date · latest' },
  { value: 'issueDateDesc', label: 'Issued · newest' },
  { value: 'issueDateAsc', label: 'Issued · oldest' },
  { value: 'amountDesc', label: 'Amount · high to low' },
  { value: 'amountAsc', label: 'Amount · low to high' },
  { value: 'studentAsc', label: 'Student · A–Z' },
  { value: 'numberDesc', label: 'Invoice no. · newest' },
  { value: 'numberAsc', label: 'Invoice no. · oldest' },
] as const;

/** Unpaid lists default to "what's due first"; others to "newest first". */
export const defaultSort = (status: string) =>
  status === 'open' || status === 'overdue' ? 'dueDateAsc' : 'issueDateDesc';

/** The API query for the filters in the URL (amounts are typed in rupees, sent in paise). */
export function filterQuery(params: URLSearchParams): Record<string, string | number> {
  const out: Record<string, string | number> = {};
  for (const [key, api] of Object.entries(INVOICE_FILTERS)) {
    const v = params.get(key);
    if (!v) continue;
    out[api] = key === 'min' || key === 'max' ? Math.round(Number(v) * 100) : v;
  }
  return out;
}

const LATE: Record<string, string> = {
  '1-30': '1–30 days',
  '31-60': '31–60 days',
  '60+': 'over 60 days',
};

export function InvoiceFilters({
  params,
  status,
  search,
  set,
  summary,
  actions,
}: {
  params: URLSearchParams;
  status: string;
  search: string;
  set: (patch: Record<string, string | null>) => void;
  /** Shown at the end of the chip row (e.g. "24 invoices · ₹69,000"). */
  summary?: ReactNode;
  /** Beside the search (e.g. the grouping toggle). */
  actions?: ReactNode;
}) {
  const isAdmin = useUser().role === 'admin';
  const students = useStudents({ pageSize: 100, sort: 'name' });
  const batches = useBatches();
  const sports = useSports();
  const locations = useLocations();
  const plans = useFeePlans({ forBatch: 'true' });
  const coaches = useUsers({ role: 'coach', pageSize: 100 }, { enabled: isAdmin });
  const v = (k: FilterKey) => params.get(k) ?? '';
  const sort = params.get('sort') ?? defaultSort(status);
  const sortChanged = !!params.get('sort');
  const overdueTab = status === 'overdue';

  // What's applied, as removable chips (status is always shown, for context).
  const nameOf = <T extends { id: string }>(
    list: T[] | undefined,
    id: string,
    label: (x: T) => string,
  ) => {
    const x = list?.find((i) => i.id === id);
    return x ? label(x) : '…';
  };
  const min = v('min');
  const max = v('max');
  type Chip = { key: string; label: string; clear?: Record<string, null> };
  const chip = (key: FilterKey, label: string): Chip[] =>
    v(key) ? [{ key, label, clear: { [key]: null } }] : [];
  const chips: Chip[] = [
    {
      key: 'status',
      label: STATUSES.find((x) => x.value === status)?.label ?? 'Unpaid',
      clear: status === 'open' ? undefined : { status: null },
    },
    ...(sortChanged
      ? [
          {
            key: 'sort',
            label: SORTS.find((x) => x.value === sort)?.label ?? sort,
            clear: { sort: null },
          },
        ]
      : []),
    ...chip(
      'student',
      nameOf(students.data?.data, v('student'), (x) => x.fullName),
    ),
    ...chip(
      'batch',
      nameOf(batches.data, v('batch'), (x) => x.name),
    ),
    ...chip('sport', sports.data?.find((x) => x.sport.id === v('sport'))?.sport.name ?? '…'),
    ...chip(
      'location',
      nameOf(locations.data, v('location'), (x) => x.name),
    ),
    ...chip('coach', `Coach ${nameOf(coaches.data?.data, v('coach'), (x) => x.name)}`),
    ...chip(
      'plan',
      nameOf(plans.data, v('plan'), (x) => x.name),
    ),
    ...chip('month', v('month') ? formatMonth(v('month')) : ''),
    ...chip('late', `Overdue ${LATE[v('late')] ?? v('late')}`),
    ...(min || max
      ? [
          {
            key: 'amount',
            label:
              min && max
                ? `${money(+min * 100)} – ${money(+max * 100)}`
                : min
                  ? `${money(+min * 100)} or more`
                  : `Up to ${money(+max * 100)}`,
            clear: { min: null, max: null },
          },
        ]
      : []),
  ];
  const active = chips.filter((c) => c.clear).length;
  const resetAll = () =>
    set({
      status: null,
      sort: null,
      ...Object.fromEntries(Object.keys(INVOICE_FILTERS).map((k) => [k, null])),
    });

  return (
    <div className="mb-2 space-y-1.5">
      <div className="flex items-center gap-1.5">
        <SearchInput
          value={search}
          onChange={(q) => set({ q: q || null })}
          placeholder="Invoice no. or student…"
          className="min-w-0 flex-1"
          dense
        />
        {actions}
        <FilterMenu active={active} onReset={resetAll} className="h-9">
          <div className="space-y-2.5 sm:max-h-[min(70vh,34rem)] sm:overflow-y-auto sm:pr-1">
            <div className="space-y-1">
              <span className="text-[12px] font-medium text-muted-foreground">Status</span>
              <Segmented
                ariaLabel="Invoice status"
                value={status}
                onChange={(st) => set({ status: st === 'open' ? null : st, sort: null })}
                options={STATUSES}
                className="w-full"
              />
            </div>
            <FilterField label="Sort by">
              <Select
                compact
                aria-label="Sort invoices"
                value={sort}
                onChange={(e) =>
                  set({ sort: e.target.value === defaultSort(status) ? null : e.target.value })
                }
              >
                {SORTS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </Select>
            </FilterField>
            <FilterField label="Student">
              <Select
                compact
                value={v('student')}
                onChange={(e) => set({ student: e.target.value || null })}
                aria-label="Filter by student"
              >
                <option value="">All students</option>
                {students.data?.data.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.fullName}
                  </option>
                ))}
              </Select>
            </FilterField>
            <FilterField label="Batch">
              <Select
                compact
                value={v('batch')}
                onChange={(e) => set({ batch: e.target.value || null })}
                aria-label="Filter by batch"
              >
                <option value="">All batches</option>
                {batches.data?.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </Select>
            </FilterField>
            <div className="grid grid-cols-2 gap-2">
              <FilterField label="Sport">
                <Select
                  compact
                  value={v('sport')}
                  onChange={(e) => set({ sport: e.target.value || null })}
                  aria-label="Filter by sport"
                >
                  <option value="">All</option>
                  {sports.data?.map((s) => (
                    <option key={s.sport.id} value={s.sport.id}>
                      {s.sport.name}
                    </option>
                  ))}
                </Select>
              </FilterField>
              <FilterField label="Location">
                <Select
                  compact
                  value={v('location')}
                  onChange={(e) => set({ location: e.target.value || null })}
                  aria-label="Filter by location"
                >
                  <option value="">All</option>
                  {locations.data?.map((l) => (
                    <option key={l.id} value={l.id}>
                      {l.name}
                    </option>
                  ))}
                </Select>
              </FilterField>
            </div>
            {isAdmin && (
              <FilterField label="Coach">
                <Select
                  compact
                  value={v('coach')}
                  onChange={(e) => set({ coach: e.target.value || null })}
                  aria-label="Filter by coach"
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
            <FilterField label="Fee plan">
              <Select
                compact
                value={v('plan')}
                onChange={(e) => set({ plan: e.target.value || null })}
                aria-label="Filter by fee plan"
              >
                <option value="">All plans</option>
                {plans.data?.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </Select>
            </FilterField>
            <FilterField label="Billing month">
              <Input
                type="month"
                className="h-9"
                value={v('month')}
                onChange={(e) => set({ month: e.target.value || null })}
                aria-label="Billing month"
              />
            </FilterField>
            {(status === 'open' || status === 'all' || overdueTab) && (
              <FilterField label="Overdue by">
                <Select
                  compact
                  value={v('late')}
                  onChange={(e) => set({ late: e.target.value || null })}
                  aria-label="Filter by days overdue"
                >
                  <option value="">Any</option>
                  <option value="1-30">1–30 days</option>
                  <option value="31-60">31–60 days</option>
                  <option value="60+">More than 60 days</option>
                </Select>
              </FilterField>
            )}
            <FilterField label="Amount (₹)">
              <span className="flex items-center gap-2">
                <Input
                  inputMode="numeric"
                  className="h-9"
                  placeholder="Min"
                  aria-label="Minimum amount"
                  value={v('min')}
                  onChange={(e) => set({ min: e.target.value.replace(/\D/g, '') || null })}
                />
                <span aria-hidden className="text-muted-foreground">
                  –
                </span>
                <Input
                  inputMode="numeric"
                  className="h-9"
                  placeholder="Max"
                  aria-label="Maximum amount"
                  value={v('max')}
                  onChange={(e) => set({ max: e.target.value.replace(/\D/g, '') || null })}
                />
              </span>
            </FilterField>
          </div>
        </FilterMenu>
      </div>
      <div className="flex flex-wrap items-center gap-1" aria-label="Applied filters">
        {chips.map((c) =>
          c.clear ? (
            <button
              key={c.key}
              type="button"
              onClick={() => set(c.clear!)}
              className="inline-flex max-w-full cursor-pointer items-center gap-1 rounded-full bg-primary/10 py-0.5 pr-1 pl-2 text-[12px] font-medium text-primary hover:bg-primary/15"
              aria-label={`Remove filter: ${c.label}`}
            >
              <span className="truncate">{c.label}</span>
              <X className="size-3.5 shrink-0" />
            </button>
          ) : (
            <span
              key={c.key}
              className="inline-flex items-center rounded-full bg-muted px-2 py-0.5 text-[12px] font-medium text-muted-foreground"
            >
              {c.label}
            </span>
          ),
        )}
        {active > 1 && (
          <button
            type="button"
            onClick={resetAll}
            className="cursor-pointer px-1 text-[12px] font-medium text-primary hover:underline"
          >
            Clear all
          </button>
        )}
        {summary && <span className="ml-auto text-[12px] text-muted-foreground">{summary}</span>}
      </div>
    </div>
  );
}
