import { Plus, Users } from 'lucide-react';
import { useState } from 'react';
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
import { Select } from '@/components/ui/primitives';
import { useBatches, usePrefetchStudent, useStudents } from '@/lib/queries';
import { StudentFormDialog } from './forms';
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
    dues: (params.get('dues') ?? '') as '' | 'outstanding' | 'overdue' | 'paying',
    page: Number(params.get('page') ?? 1),
  };
  const students = useStudents({
    search: q.search || undefined,
    status: q.status === 'all' ? undefined : q.status,
    batchId: q.batchId || undefined,
    dues: q.dues || undefined,
    // Unpaid filters list the biggest dues first.
    sort: q.dues === 'outstanding' || q.dues === 'overdue' ? 'dues' : undefined,
    page: q.page,
    pageSize: 25,
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
        <FilterMenu
          active={
            Number(Boolean(q.batchId)) + Number(Boolean(q.dues)) + Number(q.status !== 'active')
          }
          onReset={() => set({ batch: '', dues: '', status: '' })}
        >
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
