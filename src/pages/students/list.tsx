import { Layers, LayoutGrid, MapPin, Plus, Trophy, Users } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router';
import { useUser } from '@/app/auth';
import {
  EmptyState,
  ErrorState,
  ListSkeleton,
  PageHeader,
  Pagination,
  SearchInput,
} from '@/components/common';
import { FilterBar, FilterField, FilterMenu } from '@/components/filters';
import { Button } from '@/components/ui/button';
import { Segmented } from '@/components/ui/controls';
import { Select } from '@/components/ui/primitives';
import { useBatches, usePrefetchStudent, useStudents } from '@/lib/queries';
import { StudentFormDialog } from './forms';
import { StudentGroups, type StudentGroupBy } from './grouped';
import { StudentCard } from './student-card';

export function StudentsPage() {
  const user = useUser();
  const isAdmin = user.role === 'admin';
  const navigate = useNavigate();
  const prefetch = usePrefetchStudent();
  const [params, setParams] = useSearchParams();
  const [creating, setCreating] = useState(false);
  const batches = useBatches({});

  const q = {
    search: params.get('q') ?? '',
    status: (params.get('status') ?? 'active') as 'active' | 'left' | 'all',
    batchId: params.get('batch') ?? '',
    locationId: params.get('location') ?? '',
    sportId: params.get('sport') ?? '',
    coachId: params.get('coach') ?? '',
    feePlanId: params.get('plan') ?? '',
    dues: (params.get('dues') ?? '') as '' | 'outstanding' | 'overdue' | 'paying',
    sort: (params.get('sort') ?? '') as '' | 'name' | 'recent' | 'joiningDate' | 'dues',
    page: Number(params.get('page') ?? 1),
    /** Grouped by batch (default), location or sport; 'none' = the plain paged list. */
    group: (params.get('group') ?? 'batch') as StudentGroupBy | 'none',
  };
  const grouped = q.group !== 'none';
  // Filter choices come from the batches in view: only places, sports, coaches and plans in use.
  const options = useMemo(() => {
    const uniq = <T extends { id: string; name: string }>(list: T[]) =>
      [...new Map(list.map((x) => [x.id, x])).values()].sort((a, b) =>
        a.name.localeCompare(b.name),
      );
    const all = batches.data ?? [];
    return {
      locations: uniq(all.map((b) => b.location)),
      sports: uniq(all.map((b) => b.sport).filter(Boolean)),
      coaches: uniq(all.map((b) => b.coach)),
      plans: uniq(all.map((b) => b.feePlan).filter(Boolean)),
    };
  }, [batches.data]);
  const students = useStudents({
    search: q.search || undefined,
    status: q.status === 'all' ? undefined : q.status,
    batchId: q.batchId || undefined,
    locationId: q.locationId || undefined,
    sportId: q.sportId || undefined,
    coachId: (isAdmin && q.coachId) || undefined,
    feePlanId: q.feePlanId || undefined,
    dues: q.dues || undefined,
    // Unpaid filters list the biggest dues first unless a sort is picked.
    sort: q.sort || (q.dues === 'outstanding' || q.dues === 'overdue' ? 'dues' : undefined),
    // Grouping needs everyone in view at once; the plain list pages through.
    page: grouped ? 1 : q.page,
    pageSize: grouped ? 500 : 25,
  });

  const set = (patch: Record<string, string>) => {
    const p = new URLSearchParams(params);
    for (const [k, v] of Object.entries(patch)) {
      if (v) p.set(k, v);
      else p.delete(k);
    }
    if (!('page' in patch)) p.delete('page');
    setParams(p, { replace: true });
  };

  return (
    <div>
      <PageHeader
        title="Students"
        description={isAdmin ? 'Everyone enrolled at the academy.' : 'Students in your batches.'}
        actions={
          isAdmin && (
            <Button onClick={() => setCreating(true)}>
              <Plus /> Add student
            </Button>
          )
        }
      />

      <FilterBar>
        <SearchInput
          value={q.search}
          onChange={(v) => set({ q: v })}
          placeholder="Search name, ID, phone or guardian…"
          className="min-w-0 flex-1 lg:max-w-96"
        />
        <Segmented
          ariaLabel="Group students by"
          value={q.group}
          onChange={(v) => set({ group: v === 'batch' ? '' : v })}
          options={[
            { value: 'batch', label: <Layers className="size-4" aria-label="By batch" /> },
            { value: 'location', label: <MapPin className="size-4" aria-label="By location" /> },
            { value: 'sport', label: <Trophy className="size-4" aria-label="By sport" /> },
            { value: 'none', label: <LayoutGrid className="size-4" aria-label="All students" /> },
          ]}
          className="shrink-0"
        />
        <FilterMenu
          active={
            [q.batchId, q.locationId, q.sportId, q.coachId, q.feePlanId, q.dues, q.sort].filter(
              Boolean,
            ).length + Number(q.status !== 'active')
          }
          onReset={() =>
            set({
              batch: '',
              location: '',
              sport: '',
              coach: '',
              plan: '',
              dues: '',
              sort: '',
              status: '',
            })
          }
        >
          {options.locations.length > 1 && (
            <FilterField label="Location">
              <Select
                value={q.locationId}
                onChange={(e) => set({ location: e.target.value })}
                className="h-9"
                aria-label="Filter by location"
              >
                <option value="">All locations</option>
                {options.locations.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.name}
                  </option>
                ))}
              </Select>
            </FilterField>
          )}
          {options.sports.length > 1 && (
            <FilterField label="Sport">
              <Select
                value={q.sportId}
                onChange={(e) => set({ sport: e.target.value })}
                className="h-9"
                aria-label="Filter by sport"
              >
                <option value="">All sports</option>
                {options.sports.map((x) => (
                  <option key={x.id} value={x.id}>
                    {x.name}
                  </option>
                ))}
              </Select>
            </FilterField>
          )}
          {isAdmin && options.coaches.length > 1 && (
            <FilterField label="Coach">
              <Select
                value={q.coachId}
                onChange={(e) => set({ coach: e.target.value })}
                className="h-9"
                aria-label="Filter by coach"
              >
                <option value="">All coaches</option>
                {options.coaches.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </Select>
            </FilterField>
          )}
          <FilterField label="Batch">
            <Select
              value={q.batchId}
              onChange={(e) => set({ batch: e.target.value })}
              className="h-9"
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
          {options.plans.length > 1 && (
            <FilterField label="Fee plan">
              <Select
                value={q.feePlanId}
                onChange={(e) => set({ plan: e.target.value })}
                className="h-9"
                aria-label="Filter by fee plan"
              >
                <option value="">All fee plans</option>
                {options.plans.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </Select>
            </FilterField>
          )}
          <FilterField label="Fees">
            <Select
              value={q.dues}
              onChange={(e) => set({ dues: e.target.value })}
              className="h-9"
              aria-label="Filter by fees"
            >
              <option value="">Any fee status</option>
              <option value="outstanding">With unpaid fees</option>
              <option value="overdue">Overdue fees</option>
              <option value="paying">Exclude free students</option>
            </Select>
          </FilterField>
          <FilterField label="Status">
            <Select
              value={q.status}
              onChange={(e) => set({ status: e.target.value === 'active' ? '' : e.target.value })}
              className="h-9"
              aria-label="Status"
            >
              <option value="active">Active</option>
              <option value="left">Left</option>
              <option value="all">All</option>
            </Select>
          </FilterField>
          <FilterField label="Sort by">
            <Select
              value={q.sort}
              onChange={(e) => set({ sort: e.target.value })}
              className="h-9"
              aria-label="Sort students"
            >
              <option value="">Name (A–Z)</option>
              <option value="recent">Newest first</option>
              <option value="joiningDate">Joining date</option>
              <option value="dues">Biggest dues first</option>
            </Select>
          </FilterField>
        </FilterMenu>
      </FilterBar>

      {students.isPending ? (
        <ListSkeleton rows={8} />
      ) : students.isError ? (
        <ErrorState error={students.error} onRetry={() => void students.refetch()} />
      ) : students.data.data.length === 0 ? (
        <EmptyState
          icon={<Users />}
          title={q.search ? 'No matching students' : 'No students yet'}
          description={
            q.search
              ? 'Try a different name or phone number.'
              : isAdmin
                ? 'Register your first student to get started.'
                : 'Students appear here once they are placed in your batches.'
          }
          action={
            isAdmin &&
            !q.search && (
              <Button onClick={() => setCreating(true)}>
                <Plus /> Add student
              </Button>
            )
          }
        />
      ) : grouped ? (
        <StudentGroups
          students={students.data.data}
          batches={batches.data ?? []}
          by={q.group as StudentGroupBy}
          isAdmin={isAdmin}
          onPrefetch={prefetch}
        />
      ) : (
        <>
          <div className="grid grid-cols-1 gap-1.5 *:min-w-0 sm:grid-cols-2 sm:gap-2 xl:grid-cols-3">
            {students.data.data.map((s) => (
              <StudentCard key={s.id} s={s} isAdmin={isAdmin} onPrefetch={() => prefetch(s.id)} />
            ))}
          </div>

          {students.data.meta && (
            <Pagination
              page={students.data.meta.page}
              totalPages={students.data.meta.totalPages}
              total={students.data.meta.total}
              onPage={(p) => set({ page: String(p) })}
            />
          )}
        </>
      )}

      {isAdmin && (
        <StudentFormDialog
          open={creating}
          onOpenChange={setCreating}
          onSaved={(s) => navigate(`/students/${s.id}`)}
        />
      )}
    </div>
  );
}
