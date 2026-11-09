import { ChevronRight, Plus, Users } from 'lucide-react';
import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router';
import { useUser } from '@/app/auth';
import {
  Avatar,
  EmptyState,
  ErrorState,
  ListSkeleton,
  PageHeader,
  Pagination,
  SearchInput,
} from '@/components/common';
import { FilterBar, FilterField, FilterMenu } from '@/components/filters';
import { Button } from '@/components/ui/button';
import { Badge, Card, Select } from '@/components/ui/primitives';
import { money, weekdaysLabel } from '@/lib/format';
import { useBatches, usePrefetchStudent, useStudents } from '@/lib/queries';
import { StudentFormDialog } from './forms';

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
    dues: (params.get('dues') ?? '') as '' | 'outstanding' | 'overdue',
    page: Number(params.get('page') ?? 1),
  };
  const students = useStudents({
    search: q.search || undefined,
    status: q.status === 'all' ? undefined : q.status,
    batchId: q.batchId || undefined,
    dues: q.dues || undefined,
    sort: q.dues ? 'dues' : undefined,
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
          {/* Desktop table */}
          <Card className="hidden overflow-hidden md:block">
            <table className="w-full text-sm">
              <thead className="border-b bg-muted/40 text-left text-muted-foreground">
                <tr>
                  <th className="px-4 py-2.5 font-medium">Student</th>
                  <th className="px-4 py-2.5 font-medium">Batch</th>
                  <th className="px-4 py-2.5 font-medium">Days</th>
                  <th className="px-4 py-2.5 text-right font-medium">Fee</th>
                  <th className="px-4 py-2.5 text-right font-medium">Outstanding</th>
                  <th className="w-8" />
                </tr>
              </thead>
              <tbody className="divide-y">
                {students.data.data.map((s) => (
                  <tr
                    key={s.id}
                    onClick={() => navigate(`/students/${s.id}`)}
                    className="cursor-pointer transition-colors hover:bg-muted/40"
                  >
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <Avatar name={s.fullName} />
                        <div className="min-w-0">
                          <Link
                            to={`/students/${s.id}`}
                            onPointerEnter={() => prefetch(s.id)}
                            onTouchStart={() => prefetch(s.id)}
                            className="font-medium hover:underline"
                            onClick={(e) => e.stopPropagation()}
                          >
                            {s.fullName}
                          </Link>
                          <p className="text-xs text-muted-foreground">
                            {s.code} · {s.phone}
                          </p>
                        </div>
                        {s.status === 'left' && <Badge variant="muted">Left</Badge>}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      {s.batch ? (
                        <>
                          <p>{s.batch.name}</p>
                          {isAdmin && s.coach && (
                            <p className="text-xs text-muted-foreground">{s.coach.name}</p>
                          )}
                        </>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {s.trainingDays ? weekdaysLabel(s.trainingDays) : '—'}
                    </td>
                    <td className="tabular px-4 py-3 text-right">{money(s.effectiveFee)}</td>
                    <td className="tabular px-4 py-3 text-right">
                      {s.overdue > 0 ? (
                        <span className="font-medium text-destructive">{money(s.outstanding)}</span>
                      ) : s.outstanding > 0 ? (
                        <span className="text-warning-foreground dark:text-warning">
                          {money(s.outstanding)}
                        </span>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </td>
                    <td className="pr-3">
                      <ChevronRight className="size-4 text-muted-foreground" />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>

          {/* Mobile cards */}
          <Card className="divide-y md:hidden">
            {students.data.data.map((s) => (
              <Link
                key={s.id}
                to={`/students/${s.id}`}
                onPointerEnter={() => prefetch(s.id)}
                onTouchStart={() => prefetch(s.id)}
                className="flex items-center gap-2 px-1.5 py-1.5 hover:bg-muted/40"
              >
                <Avatar name={s.fullName} />
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">{s.fullName}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    {s.batch?.name ?? 'No batch'} ·{' '}
                    {s.trainingDays ? weekdaysLabel(s.trainingDays) : ''}
                  </p>
                </div>
                {s.outstanding > 0 && (
                  <Badge variant={s.overdue > 0 ? 'destructive' : 'warning'} className="tabular">
                    {money(s.outstanding)}
                  </Badge>
                )}
              </Link>
            ))}
          </Card>

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
