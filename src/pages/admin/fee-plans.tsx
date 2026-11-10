import { Pencil, Plus, Tags } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router';
import { toast } from 'sonner';
import {
  EmptyState,
  ErrorState,
  Field,
  ListSkeleton,
  MoneyInput,
  PageHeader,
  SectionDivider,
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
  SheetContent,
} from '@/components/ui/overlays';
import { Badge, Card, Input, Select } from '@/components/ui/primitives';
import { errorMessage } from '@/lib/api';
import { money, moneyCompact, plural } from '@/lib/format';
import { useFeePlans, useSaveFeePlan } from '@/lib/queries';
import { useMedia } from '@/lib/use-phone';
import type { FeePlan } from '@/lib/types';
import { cn } from '@/lib/utils';
import { SplitBar, SplitDialog } from './fee-split';
import { AllPlansDistribution, PlanSplitPanel } from './split-tree';

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
        <div className="grid gap-3 sm:grid-cols-2">
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
  selected,
  onEdit,
  onSelect,
}: {
  p: FeePlan;
  /** This plan's share of all students on active plans (0–100). */
  share: number;
  selected: boolean;
  onEdit: () => void;
  onSelect: () => void;
}) {
  const students = p.activeStudents ?? 0;
  // Whole rupees (amounts are paise).
  const perSession =
    Math.round(p.monthlyFee / (p.daysPerWeek * SESSIONS_PER_WEEK_TO_MONTH) / 100) * 100;
  return (
    <Card
      className={cn(
        'relative flex items-stretch gap-2 px-2.5 py-2 transition-[box-shadow,border-color] hover:shadow-e2',
        !p.isActive && 'bg-muted/30',
        selected && 'border-primary ring-2 ring-primary/25',
      )}
    >
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5 pr-7">
          <button
            type="button"
            onClick={onSelect}
            aria-pressed={selected}
            aria-label={`Show ${p.name}`}
            className="min-w-0 cursor-pointer truncate text-left text-[14px] leading-tight font-semibold after:absolute after:inset-0 after:rounded-2xl focus-visible:outline-none"
          >
            {p.name}
          </button>
          <span
            className={cn(
              'tabular shrink-0 rounded-md px-1.5 py-0.5 text-[10px] leading-none font-semibold',
              p.isActive ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground',
            )}
            title={`${p.daysPerWeek} training day${p.daysPerWeek === 1 ? '' : 's'} a week`}
          >
            {p.daysPerWeek}×/wk
          </span>
          {!p.isActive && (
            <Badge variant="muted" className="shrink-0">
              Retired
            </Badge>
          )}
        </div>
        <p className="mt-0.5 flex items-baseline gap-1 text-[11px] text-muted-foreground">
          <span className="tabular text-base leading-none font-bold tracking-tight text-foreground">
            {money(p.monthlyFee)}
          </span>
          <span>/mo</span>
          <span className="tabular truncate">
            · ≈{money(perSession)}/session ·{' '}
            <span
              className="font-medium text-foreground"
              title={`${Math.round(share)}% of students on active plans`}
            >
              {plural(students, 'student')}
            </span>
          </span>
        </p>
        {p.description && (
          <p className="mt-0.5 truncate text-[11px] text-muted-foreground" title={p.description}>
            {p.description}
          </p>
        )}
        <div className="relative z-10">
          <SplitBar plan={p} onEdit={onSelect} />
        </div>
      </div>
      <Button
        variant="ghost"
        size="icon"
        className="absolute top-1 right-1 z-10 size-7 [&_svg:not([class*=size-])]:size-3.5"
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
  const [splitting, setSplitting] = useState<FeePlan | null>(null);
  // Deep link from elsewhere (e.g. a payee): /fee-plans?split=<planId> opens that plan's split.
  const [params, setParams] = useSearchParams();
  const splitId = params.get('split');
  const linked = (splitId && q.data?.find((p) => p.id === splitId)) || null;
  const openSplit = splitting ?? linked;
  const closeSplit = () => {
    setSplitting(null);
    if (splitId)
      setParams(
        (p) => {
          p.delete('split');
          return p;
        },
        { replace: true },
      );
  };
  const [showRetired, setShowRetired] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
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
  const withSplit = active.filter((p) => p.split?.length).length;
  const wide = useMedia('(min-width: 1280px)');
  // Wide screens always show a plan; elsewhere a plan opens only when tapped.
  const selected = shown.find((p) => p.id === selectedId) ?? (wide ? shown[0] : undefined);
  const retiredToggle =
    retired > 0 ? (
      <label className="flex h-8 items-center gap-2 rounded-lg border bg-card px-2.5 text-[12px] text-muted-foreground">
        <Switch checked={showRetired} onCheckedChange={setShowRetired} /> Retired ({retired})
      </label>
    ) : null;
  const cards = shown.map((p) => (
    <PlanCard
      key={p.id}
      p={p}
      share={students && p.isActive ? Math.round(((p.activeStudents ?? 0) / students) * 100) : 0}
      selected={wide && p.id === selected?.id}
      onEdit={() => setEditing(p)}
      onSelect={() => setSelectedId(p.id)}
    />
  ));
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
          <div className="grid grid-cols-5 gap-1.5 rounded-2xl border bg-card p-1.5 shadow-e1">
            {[
              { label: 'Active plans', value: active.length },
              { label: 'With split', value: `${withSplit}/${active.length}` },
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
          <AllPlansDistribution plans={active} />
          <SectionDivider>Plans</SectionDivider>
          {shown.length === 0 ? (
            <EmptyState
              icon={<Tags />}
              title="No active plans"
              description="Turn on Retired to see older plans."
              action={retiredToggle}
            />
          ) : wide ? (
            // Large screens: one workspace — the plan list on the left, the open plan beside it.
            <Card className="grid grid-cols-[minmax(0,21rem)_minmax(0,1fr)] overflow-hidden p-0">
              <div className="flex min-h-0 flex-col border-r bg-muted/25">
                <div className="flex items-center gap-2 border-b px-3 py-2">
                  <p className="mr-auto text-[12px] font-semibold tracking-wide text-muted-foreground uppercase">
                    Plans <span className="tabular">{shown.length}</span>
                  </p>
                  {retiredToggle}
                </div>
                <div
                  role="listbox"
                  aria-label="Fee plans"
                  className="max-h-[calc(100dvh-15rem)] min-h-[26rem] space-y-1.5 overflow-y-auto p-2"
                >
                  {cards}
                </div>
              </div>
              <div className="max-h-[calc(100dvh-12.5rem)] min-h-[26rem] overflow-y-auto">
                {selected && (
                  <PlanSplitPanel
                    key={selected.id}
                    bare
                    plan={selected}
                    onEditSplit={() => setSplitting(selected)}
                  />
                )}
              </div>
            </Card>
          ) : (
            // Phones / tablets: the list; a plan opens in a sheet.
            <>
              {retired > 0 && <div className="flex justify-end">{retiredToggle}</div>}
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">{cards}</div>
            </>
          )}
          <p className="px-0.5 text-[11px] text-muted-foreground">
            “Per month” is the list price of every student on an active plan, before custom fees and
            discounts. Price changes apply to invoices generated from now on. Select a plan to see
            how its fee is distributed; split changes apply to fees received from then on.
          </p>
        </div>
      )}
      {!wide && (
        <Dialog open={Boolean(selected)} onOpenChange={(o) => !o && setSelectedId(null)}>
          {selected && (
            <SheetContent title={selected.name} className="p-0">
              <div className="min-h-0 flex-1 overflow-y-auto">
                <PlanSplitPanel
                  key={selected.id}
                  bare
                  closeSpace
                  plan={selected}
                  onEditSplit={() => setSplitting(selected)}
                />
              </div>
            </SheetContent>
          )}
        </Dialog>
      )}
      {openSplit && <SplitDialog plan={openSplit} onClose={closeSplit} />}
      {editing && (
        <PlanDialog
          plan={editing === 'new' ? undefined : editing}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  );
}
