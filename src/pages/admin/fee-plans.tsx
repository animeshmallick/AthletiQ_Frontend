import { Pencil, Plus, Tags } from 'lucide-react';
import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import {
  EmptyState,
  ErrorState,
  Field,
  ListSkeleton,
  MoneyInput,
  PageHeader,
} from '@/components/common';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/controls';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/overlays';
import { Badge, Card, Input, Select } from '@/components/ui/primitives';
import { errorMessage } from '@/lib/api';
import { money, moneyCompact, plural } from '@/lib/format';
import { useFeePlans, useSaveFeePlan } from '@/lib/queries';
import type { FeePlan } from '@/lib/types';
import { cn } from '@/lib/utils';

function PlanDialog({ plan, onClose }: { plan?: FeePlan; onClose: () => void }) {
  const save = useSaveFeePlan();
  const [name, setName] = useState(plan?.name ?? '');
  const [days, setDays] = useState(plan?.daysPerWeek ?? 3);
  const [fee, setFee] = useState<number | null>(plan?.monthlyFee ?? null);
  const [description, setDescription] = useState(plan?.description ?? '');
  const [active, setActive] = useState(plan?.isActive ?? true);

  async function submit() {
    if (!name.trim() || fee === null) return toast.error('Enter a name and monthly fee');
    try {
      await save.mutateAsync({
        id: plan?.id,
        name: name.trim(),
        daysPerWeek: days,
        monthlyFee: fee,
        description: description.trim() || null,
        isActive: active,
      });
      toast.success(plan ? 'Plan updated' : 'Plan created', {
        description: plan ? 'New prices apply to invoices generated from now on.' : undefined,
      });
      onClose();
    } catch (err) {
      toast.error('Could not save plan', { description: errorMessage(err) });
    }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{plan ? 'Edit fee plan' : 'New fee plan'}</DialogTitle>
          <DialogDescription>
            When a student’s training days are chosen, the plan with the same number of days is
            suggested.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Name" required className="sm:col-span-2">
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. 3 days a week"
              autoFocus
            />
          </Field>
          <Field label="Days per week" required>
            <Select value={days} onChange={(e) => setDays(Number(e.target.value))}>
              {[1, 2, 3, 4, 5, 6, 7].map((d) => (
                <option key={d} value={d}>
                  {d} day{d > 1 ? 's' : ''}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Monthly fee" required>
            <MoneyInput value={fee} onChange={setFee} />
          </Field>
          <Field label="Description" className="sm:col-span-2">
            <Input value={description} onChange={(e) => setDescription(e.target.value)} />
          </Field>
          {plan && (
            <label className="flex items-center gap-3 text-sm">
              <Switch checked={active} onCheckedChange={setActive} /> Available for new students
            </label>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button loading={save.isPending} onClick={() => void submit()}>
            {plan ? 'Save' : 'Create plan'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Average sessions in a month for a weekly schedule (52 weeks / 12 months). */
const SESSIONS_PER_WEEK_TO_MONTH = 52 / 12;

function PlanCard({
  p,
  share,
  onEdit,
}: {
  p: FeePlan;
  /** This plan's share of all students on active plans (0–100). */
  share: number;
  onEdit: () => void;
}) {
  const students = p.activeStudents ?? 0;
  // Whole rupees (amounts are paise).
  const perSession =
    Math.round(p.monthlyFee / (p.daysPerWeek * SESSIONS_PER_WEEK_TO_MONTH) / 100) * 100;
  return (
    <Card
      className={cn(
        'relative flex items-stretch gap-3 p-3 transition-shadow hover:shadow-e2',
        !p.isActive && 'bg-muted/30',
      )}
    >
      <div
        className={cn(
          'flex w-14 shrink-0 flex-col items-center justify-center rounded-xl',
          p.isActive ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground',
        )}
      >
        <span className="tabular text-xl leading-none font-bold">{p.daysPerWeek}</span>
        <span className="mt-0.5 text-[10px] font-medium">
          {p.daysPerWeek === 1 ? 'day/wk' : 'days/wk'}
        </span>
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-start gap-2 pr-8">
          <p className="min-w-0 truncate text-[14px] leading-tight font-semibold">{p.name}</p>
          {!p.isActive && (
            <Badge variant="muted" className="shrink-0">
              Retired
            </Badge>
          )}
        </div>
        <p className="mt-1 flex items-baseline gap-1.5">
          <span className="tabular text-lg leading-none font-bold tracking-tight">
            {money(p.monthlyFee)}
          </span>
          <span className="text-[11px] text-muted-foreground">/month</span>
          <span className="tabular truncate text-[11px] text-muted-foreground">
            · ≈ {money(perSession)}/session
          </span>
        </p>
        {p.description && (
          <p className="mt-1 truncate text-[12px] text-muted-foreground" title={p.description}>
            {p.description}
          </p>
        )}
        <div className="mt-2 flex items-center gap-2">
          <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
            <div
              className={cn(
                'h-full rounded-full',
                p.isActive ? 'bg-primary' : 'bg-muted-foreground/40',
              )}
              style={{ width: `${share}%` }}
            />
          </div>
          <span className="tabular shrink-0 text-[11px] font-medium text-muted-foreground">
            {plural(students, 'student')}
          </span>
        </div>
      </div>
      <Button
        variant="ghost"
        size="icon"
        className="absolute top-1.5 right-1.5 size-8"
        aria-label={`Edit ${p.name}`}
        onClick={onEdit}
      >
        <Pencil />
      </Button>
    </Card>
  );
}

export function FeePlansPage() {
  const q = useFeePlans();
  const [editing, setEditing] = useState<FeePlan | 'new' | null>(null);
  const [showRetired, setShowRetired] = useState(false);
  const all = useMemo(
    () =>
      [...(q.data ?? [])].sort(
        (a, b) =>
          Number(b.isActive) - Number(a.isActive) ||
          a.daysPerWeek - b.daysPerWeek ||
          a.monthlyFee - b.monthlyFee,
      ),
    [q.data],
  );
  const active = all.filter((p) => p.isActive);
  const retired = all.length - active.length;
  const shown = showRetired ? all : active;
  const students = active.reduce((n, p) => n + (p.activeStudents ?? 0), 0);
  const monthly = active.reduce((n, p) => n + p.monthlyFee * (p.activeStudents ?? 0), 0);
  const avgFee = students ? Math.round(monthly / students) : null;
  const newButton = (
    <Button onClick={() => setEditing('new')}>
      <Plus /> New plan
    </Button>
  );

  return (
    <div>
      <PageHeader
        title="Fee plans"
        description="Monthly pricing by training days per week. Students can still have a custom fee or discount."
        actions={newButton}
      />
      {q.isPending ? (
        <ListSkeleton rows={3} />
      ) : q.isError ? (
        <ErrorState error={q.error} onRetry={() => void q.refetch()} />
      ) : all.length === 0 ? (
        <EmptyState icon={<Tags />} title="No fee plans yet" action={newButton} />
      ) : (
        <div className="space-y-3">
          <div className="grid grid-cols-4 gap-1.5 rounded-2xl border bg-card p-1.5 shadow-e1">
            {[
              { label: 'Active plans', value: active.length },
              { label: 'Students', value: students },
              { label: 'Avg fee', value: avgFee === null ? '—' : moneyCompact(avgFee) },
              { label: 'Per month', value: moneyCompact(monthly) },
            ].map((x) => (
              <div key={x.label} className="rounded-xl bg-muted/40 px-1 py-1.5 text-center">
                <p className="tabular truncate text-base leading-tight font-bold">{x.value}</p>
                <p className="truncate text-[10px] font-medium text-muted-foreground">{x.label}</p>
              </div>
            ))}
          </div>
          {retired > 0 && (
            <div className="flex justify-end">
              <label className="flex h-9 items-center gap-2 rounded-xl border bg-card px-3 text-[13px] text-muted-foreground">
                <Switch checked={showRetired} onCheckedChange={setShowRetired} /> Retired ({retired}
                )
              </label>
            </div>
          )}
          {shown.length === 0 ? (
            <EmptyState
              icon={<Tags />}
              title="No active plans"
              description="Turn on Retired to see older plans."
            />
          ) : (
            <div className="grid gap-2.5 sm:grid-cols-2 xl:grid-cols-3">
              {shown.map((p) => (
                <PlanCard
                  key={p.id}
                  p={p}
                  share={
                    students && p.isActive
                      ? Math.round(((p.activeStudents ?? 0) / students) * 100)
                      : 0
                  }
                  onEdit={() => setEditing(p)}
                />
              ))}
            </div>
          )}
          <p className="px-0.5 text-[11px] text-muted-foreground">
            “Per month” is the list price of every student on an active plan, before custom fees and
            discounts. Price changes apply to invoices generated from now on.
          </p>
        </div>
      )}
      {editing && (
        <PlanDialog
          plan={editing === 'new' ? undefined : editing}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  );
}
