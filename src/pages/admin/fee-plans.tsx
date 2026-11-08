import { Pencil, Plus, Tags } from 'lucide-react';
import { useState } from 'react';
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
import { money } from '@/lib/format';
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

export function FeePlansPage() {
  const q = useFeePlans();
  const [editing, setEditing] = useState<FeePlan | 'new' | null>(null);
  return (
    <div>
      <PageHeader
        title="Fee plans"
        description="Monthly pricing, usually by training days per week. Individual students can still have a custom fee or discount."
        actions={
          <Button onClick={() => setEditing('new')}>
            <Plus /> New plan
          </Button>
        }
      />
      {q.isPending ? (
        <ListSkeleton rows={3} />
      ) : q.isError ? (
        <ErrorState error={q.error} onRetry={() => void q.refetch()} />
      ) : q.data.length === 0 ? (
        <EmptyState
          icon={<Tags />}
          title="No fee plans yet"
          action={
            <Button onClick={() => setEditing('new')}>
              <Plus /> New plan
            </Button>
          }
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {q.data.map((p) => (
            <Card key={p.id} className={cn('flex flex-col p-5', !p.isActive && 'opacity-60')}>
              <div className="flex items-start justify-between gap-2">
                <p className="font-semibold">{p.name}</p>
                {!p.isActive && <Badge variant="muted">Retired</Badge>}
              </div>
              <p className="tabular mt-3 text-3xl font-semibold tracking-tight">
                {money(p.monthlyFee)}
                <span className="text-sm font-normal text-muted-foreground">/mo</span>
              </p>
              <p className="mt-1 text-sm text-muted-foreground">
                {p.daysPerWeek} day{p.daysPerWeek > 1 ? 's' : ''} a week · {p.activeStudents ?? 0}{' '}
                students
              </p>
              {p.description && (
                <p className="mt-2 text-sm text-muted-foreground">{p.description}</p>
              )}
              <div className="mt-auto pt-4">
                <Button variant="outline" size="sm" onClick={() => setEditing(p)}>
                  <Pencil /> Edit
                </Button>
              </div>
            </Card>
          ))}
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
