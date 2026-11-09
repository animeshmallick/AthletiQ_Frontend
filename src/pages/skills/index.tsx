/**
 * Skills: monthly assessments and skill insights.
 *  - Coaches: assess their own batches (Assess), and see their batches' insights.
 *  - Admins: insights across the academy, and every batch's sheet read-only.
 * Month and batch live in the URL so back / forward keep them.
 */
import { BarChart3, ClipboardCheck, Settings2 } from 'lucide-react';
import { useMemo } from 'react';
import { Link, useSearchParams } from 'react-router';
import { useUser } from '@/app/auth';
import { EmptyState, PageHeader } from '@/components/common';
import { Button } from '@/components/ui/button';
import { Segmented } from '@/components/ui/controls';
import { Select } from '@/components/ui/primitives';
import { today } from '@/lib/format';
import { useBatches } from '@/lib/queries';
import { AssessTab } from './assess';
import { InsightsTab } from './insights';
import { MonthPicker } from './ui';

type Tab = 'assess' | 'insights';

export function SkillsPage() {
  const user = useUser();
  const admin = user.role === 'admin';
  const [params, setParams] = useSearchParams();
  const thisMonth = `${today().slice(0, 7)}-01`;
  const month = /^\d{4}-\d{2}-01$/.test(params.get('month') ?? '')
    ? params.get('month')!
    : thisMonth;
  const tab: Tab = (params.get('tab') as Tab) ?? (admin ? 'insights' : 'assess');

  const batchesQ = useBatches({ active: true });
  // Coaches assess only the batches they run (not ones they cover as a substitute).
  const batches = useMemo(
    () => (batchesQ.data ?? []).filter((b) => admin || b.coach.id === user.id),
    [batchesQ.data, admin, user.id],
  );
  const batchParam = params.get('batch') ?? '';
  const batchId = batches.some((b) => b.id === batchParam) ? batchParam : (batches[0]?.id ?? '');

  const set = (patch: Record<string, string | null>) =>
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
    );

  return (
    <div>
      <PageHeader
        className="mb-2 sm:mb-3"
        title="Skills"
        description={
          admin
            ? 'Monthly skill assessments across the academy: coverage, progress and levels.'
            : 'Rate your students’ skills each month and follow their progress.'
        }
        actions={
          admin ? (
            <Button asChild size="sm" variant="outline">
              <Link to="/sports">
                <Settings2 /> Sports & skills
              </Link>
            </Button>
          ) : undefined
        }
      />
      <div className="mb-2 flex flex-wrap items-center gap-1.5">
        <Segmented
          ariaLabel="Skills view"
          value={tab}
          onChange={(v) => set({ tab: v })}
          options={[
            {
              value: 'assess',
              label: (
                <span className="inline-flex items-center gap-1.5">
                  <ClipboardCheck className="size-4" /> {admin ? 'Batches' : 'Assess'}
                </span>
              ),
            },
            {
              value: 'insights',
              label: (
                <span className="inline-flex items-center gap-1.5">
                  <BarChart3 className="size-4" /> Insights
                </span>
              ),
            },
          ]}
        />
        <MonthPicker
          value={month}
          max={thisMonth}
          onChange={(m) => set({ month: m === thisMonth ? null : m })}
        />
        {batches.length > 1 && (
          <Select
            compact
            aria-label="Batch"
            className="w-auto max-w-56"
            value={tab === 'insights' ? batchParam : batchId}
            onChange={(e) => set({ batch: e.target.value || null })}
          >
            {tab === 'insights' && <option value="">All batches</option>}
            {batches.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
                {admin ? ` · ${b.coach.name}` : ''}
              </option>
            ))}
          </Select>
        )}
      </div>

      {tab === 'insights' ? (
        <InsightsTab month={month} batchId={batchParam || undefined} admin={admin} />
      ) : batchesQ.isPending ? null : batchId ? (
        <AssessTab batchId={batchId} month={month} />
      ) : (
        <EmptyState
          title="No batches to assess"
          description="Students are assessed by the coach who runs their batch."
        />
      )}
    </div>
  );
}
