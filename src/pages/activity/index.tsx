/**
 * Activity log. Admins see the whole academy ("Audit log"); coaches see only what they did
 * ("My activity"). Tabs:
 *  - Insights (default): volume, timing, areas, people, items to review, response times.
 *  - Activity: key events (audit trail) or every change (request log), grouped by day.
 *  - Errors: app errors from devices (admins: everyone; coaches: their own) and, for admins,
 *    failed requests by kind, endpoint and code.
 * A "Summarise all" button reads the whole log on request. Filters live in the URL, so
 * back / forward and shared links keep them.
 */
import { AlertTriangle, BarChart3, Bug, ListTree } from 'lucide-react';
import { useCallback } from 'react';
import { useSearchParams } from 'react-router';
import { useUser } from '@/app/auth';
import { PageHeader, SearchInput } from '@/components/common';
import { FilterBar, FilterField, FilterMenu, PeriodFilter } from '@/components/filters';
import { Segmented, Switch } from '@/components/ui/controls';
import { Select } from '@/components/ui/primitives';
import { ACTIVITY_PERIODS, activityWindow, type PeriodKey } from '@/lib/periods';
import { useActivityInsights } from '@/lib/queries';
import { ClientErrorsView } from './client-errors';
import { ErrorsView } from './errors';
import { EventFeed, FilterChip, RequestFeed } from './feed';
import { ActivityInsightsView, type Drill } from './insights';
import { ENTITY, entityMeta } from './meta';
import { SummaryButton } from './summary';

type Tab = 'activity' | 'insights' | 'errors';
type View = 'events' | 'changes';

export function AuditLogPage() {
  const user = useUser();
  const admin = user.role === 'admin';
  const [params, setParams] = useSearchParams();

  const rawTab = params.get('tab');
  const tab: Tab = rawTab === 'activity' || rawTab === 'errors' ? rawTab : 'insights';
  // Errors: app errors from devices, or (admins) failed requests on the server.
  const errorsView: 'app' | 'requests' =
    admin && params.get('errors') === 'requests' ? 'requests' : 'app';
  const rawPeriod = params.get('period') as PeriodKey | null;
  const period: PeriodKey = rawPeriod && ACTIVITY_PERIODS.includes(rawPeriod) ? rawPeriod : '24h';
  const range = activityWindow(period);
  const view: View = params.get('view') === 'changes' ? 'changes' : 'events';
  const area = params.get('area') ?? '';
  const person = admin ? (params.get('person') ?? '') : '';
  const record = params.get('record') ?? '';
  const sensitive = params.get('sensitive') === '1';
  const search = params.get('q') ?? '';

  const set = useCallback(
    (patch: Record<string, string | null>) =>
      setParams(
        (p) => {
          const next = new URLSearchParams(p);
          for (const [k, v] of Object.entries(patch)) {
            if (v) next.set(k, v);
            else next.delete(k);
          }
          return next;
        },
        { replace: true },
      ),
    [setParams],
  );

  // People active in the period, for the admin's person filter.
  const people = useActivityInsights(range, admin && tab === 'activity').data?.byActor ?? [];
  const personName = people.find((p) => p.id === person)?.name;

  const drill = (d: Drill) =>
    set({
      tab: 'activity',
      view: null,
      area: d.entityType ?? null,
      person: d.actorId ?? null,
      sensitive: d.sensitive ? '1' : null,
      q: d.search ?? null,
      record: null,
    });

  const active = Number(!!area) + Number(!!person) + Number(sensitive);
  const tabs: { value: Tab; label: string; icon: typeof ListTree }[] = [
    { value: 'insights', label: 'Insights', icon: BarChart3 },
    { value: 'errors' as const, label: 'Errors', icon: Bug },
    { value: 'activity', label: 'Activity', icon: ListTree },
  ];

  return (
    <div>
      <PageHeader
        className="mb-2 sm:mb-3"
        title={admin ? 'Audit log' : 'My activity'}
        description={
          admin
            ? 'Who did what and when, with trends and failures.'
            : 'Everything you have done, with trends.'
        }
        actions={<SummaryButton admin={admin} />}
      />
      <Segmented
        ariaLabel="Activity view"
        className="mb-2 w-full sm:w-auto"
        value={tab}
        onChange={(v) => set({ tab: v === 'insights' ? null : v })}
        options={tabs.map((t) => ({
          value: t.value,
          label: (
            <span className="inline-flex items-center gap-1.5">
              <t.icon className="size-4" /> {t.label}
            </span>
          ),
        }))}
      />

      <FilterBar>
        <PeriodFilter
          value={period}
          onChange={(k) => set({ period: k === '24h' ? null : k })}
          options={ACTIVITY_PERIODS}
        />
        {tab === 'activity' && view === 'events' && (
          <FilterMenu
            active={active}
            onReset={() => set({ area: null, person: null, sensitive: null })}
          >
            <FilterField label="Area">
              <Select
                value={area}
                onChange={(e) => set({ area: e.target.value || null })}
                className="h-9"
                aria-label="Area"
              >
                <option value="">All areas</option>
                {Object.entries(ENTITY).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v.label}
                  </option>
                ))}
              </Select>
            </FilterField>
            {admin && (
              <FilterField label="Person">
                <Select
                  value={person}
                  onChange={(e) => set({ person: e.target.value || null })}
                  className="h-9"
                  aria-label="Person"
                >
                  <option value="">Everyone</option>
                  {person && !personName && <option value={person}>Selected person</option>}
                  {people.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name} ({p.n})
                    </option>
                  ))}
                </Select>
              </FilterField>
            )}
            <label className="flex cursor-pointer items-center justify-between gap-3 text-[13px]">
              <span className="inline-flex items-center gap-1.5">
                <AlertTriangle className="size-4 text-warning-foreground dark:text-warning" />
                Only items worth a second look
              </span>
              <Switch
                checked={sensitive}
                onCheckedChange={(c) => set({ sensitive: c ? '1' : null })}
                aria-label="Only items worth a second look"
              />
            </label>
          </FilterMenu>
        )}
      </FilterBar>

      {tab === 'activity' && (
        <>
          <div className="mb-2 flex flex-wrap items-center gap-1.5">
            <Segmented
              ariaLabel="What to list"
              size="sm"
              value={view}
              onChange={(v) => set({ view: v === 'events' ? null : v })}
              options={[
                { value: 'events', label: 'Key events' },
                { value: 'changes', label: 'Every change' },
              ]}
            />
            {view === 'events' && (
              <SearchInput
                value={search}
                onChange={(v) => set({ q: v.trim() || null })}
                placeholder="Search actions, names, details…"
                className="min-w-48 flex-1"
              />
            )}
          </div>
          {(area || person || sensitive || record) && view === 'events' && (
            <div className="mb-2 flex flex-wrap gap-1.5">
              {record && (
                <FilterChip onClear={() => set({ record: null })}>
                  History of one {entityMeta(area).label.toLowerCase()}
                </FilterChip>
              )}
              {area && !record && (
                <FilterChip onClear={() => set({ area: null })}>
                  {entityMeta(area).label}
                </FilterChip>
              )}
              {person && (
                <FilterChip onClear={() => set({ person: null })}>
                  {personName ?? 'One person'}
                </FilterChip>
              )}
              {sensitive && (
                <FilterChip onClear={() => set({ sensitive: null })}>
                  Worth a second look
                </FilterChip>
              )}
            </div>
          )}
          {view === 'events' ? (
            <EventFeed
              showActor={admin}
              filters={{
                // A record's history spans all time.
                ...(record ? {} : range),
                entityType: area,
                actorId: person,
                entityId: record,
                sensitive,
                search,
              }}
              onRecord={(t, id) => set({ area: t, record: id, person: null, q: null })}
            />
          ) : (
            <RequestFeed showActor={admin} filters={{ ...range, actorId: person }} />
          )}
        </>
      )}
      {tab === 'insights' && <ActivityInsightsView range={range} admin={admin} onDrill={drill} />}
      {tab === 'errors' && (
        <div className="space-y-2">
          {admin && (
            <Segmented
              ariaLabel="Which errors"
              size="sm"
              value={errorsView}
              onChange={(v) => set({ errors: v === 'requests' ? 'requests' : null })}
              options={[
                { value: 'app', label: 'App errors' },
                { value: 'requests', label: 'Failed requests' },
              ]}
            />
          )}
          {errorsView === 'requests' ? (
            <ErrorsView range={range} />
          ) : (
            <ClientErrorsView range={range} />
          )}
        </div>
      )}
    </div>
  );
}
