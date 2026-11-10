/** The batch's lesson plan: view it, edit it (its coach) and copy it to same-length batches. */
import { AlertTriangle, ClipboardList, Copy, Pencil, Sparkles } from 'lucide-react';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { EmptyState, ErrorState, Field, ListSkeleton } from '@/components/common';
import { Button } from '@/components/ui/button';
import { Checkbox, Switch } from '@/components/ui/controls';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/overlays';
import { Badge, Input, Textarea } from '@/components/ui/primitives';
import { errorMessage } from '@/lib/api';
import { formatShortDate, plural } from '@/lib/format';
import { useBatchPlan, useCopyBatchPlan, usePlanOverview, useSaveBatchPlan } from '@/lib/queries';
import {
  draftProblem,
  PlanEditor,
  starterBlocks,
  toBody,
  toDraft,
  type DraftBlock,
} from './editor';
import { dayLengths, STATUS_META } from './meta';
import { PlanView } from './view';

export function PlanTab({
  batchId,
  onDirtyChange,
}: {
  batchId: string;
  /** Unsaved edits, so the modal can ask before closing. */
  onDirtyChange?: (dirty: boolean) => void;
}) {
  const q = useBatchPlan(batchId);
  const [draft, setDraft] = useState<{
    blocks: DraftBlock[];
    focus: string;
    notes: string;
  } | null>(null);
  const [copyOpen, setCopyOpen] = useState(false);
  const save = useSaveBatchPlan();
  useEffect(() => onDirtyChange?.(draft !== null), [draft, onDirtyChange]);

  if (q.isPending) return <ListSkeleton rows={4} />;
  if (q.isError) return <ErrorState error={q.error} onRetry={() => void q.refetch()} />;
  const { batch, plan, mismatch, canEdit } = q.data;
  const target = batch.sessionMinutes;
  const daysDiffer = target === null;

  const start = (blocks: DraftBlock[]) =>
    setDraft({ blocks, focus: plan?.focus ?? '', notes: plan?.notes ?? '' });

  if (draft) {
    const problem = daysDiffer
      ? `The days aren’t the same length (${dayLengths(batch.minutesByDay)}).`
      : draftProblem(draft.blocks, target);
    return (
      <div className="space-y-1.5">
        <div className="grid gap-1.5 sm:grid-cols-2">
          <Field label="Focus">
            <Input
              value={draft.focus}
              onChange={(e) => setDraft({ ...draft, focus: e.target.value })}
              placeholder="e.g. Forehand consistency"
              maxLength={200}
              className="h-9"
            />
          </Field>
          <Field label="Notes">
            <Textarea
              value={draft.notes}
              onChange={(e) => setDraft({ ...draft, notes: e.target.value })}
              placeholder="Equipment, reminders…"
              maxLength={4000}
              rows={1}
              className="min-h-9"
            />
          </Field>
        </div>
        <PlanEditor
          blocks={draft.blocks}
          target={target}
          onChange={(blocks) => setDraft({ ...draft, blocks })}
        />
        <div className="sticky bottom-0 z-20 -mx-1 flex items-center gap-1.5 border-t bg-card/95 px-1 py-1.5 backdrop-blur">
          <p className="min-w-0 flex-1 text-[12px] leading-tight text-muted-foreground">
            {problem ?? 'Every session of the batch will follow this plan.'}
          </p>
          <Button variant="ghost" size="sm" onClick={() => setDraft(null)}>
            Cancel
          </Button>
          <Button
            size="sm"
            disabled={Boolean(problem) || save.isPending}
            onClick={() =>
              save.mutate(
                {
                  batchId,
                  focus: draft.focus.trim() || null,
                  notes: draft.notes.trim() || null,
                  blocks: toBody(draft.blocks),
                },
                {
                  onSuccess: () => {
                    setDraft(null);
                    toast.success('Lesson plan saved');
                  },
                  onError: (e) =>
                    toast.error('Couldn’t save the plan', { description: errorMessage(e) }),
                },
              )
            }
          >
            {save.isPending ? 'Saving…' : 'Save plan'}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-1.5">
      {daysDiffer && (
        <Banner>
          <b className="font-semibold">{batch.name}’s days aren’t the same length</b> (
          {dayLengths(batch.minutesByDay)}). One plan needs every session to be the same length —
          ask the admin to align the timings.
        </Banner>
      )}
      {mismatch && !daysDiffer && (
        <Banner>
          <b className="font-semibold">This plan needs an update.</b> {mismatch}
          {canEdit && ' Adjust the blocks to fit.'}
        </Banner>
      )}

      {plan ? (
        <>
          <div className="flex flex-wrap items-center gap-1">
            <span className="min-w-0 flex-1 text-[12px] text-muted-foreground">
              {plural(plan.blocks.length, 'block')} ·{' '}
              {plural(
                plan.blocks.reduce((n, b) => n + b.drills.length, 0),
                'drill',
              )}
              {plan.updatedBy &&
                ` · updated by ${plan.updatedBy.name}, ${formatShortDate(plan.updatedAt.slice(0, 10))}`}
            </span>
            {canEdit && (
              <>
                {!mismatch && (
                  <Button variant="outline" size="sm" onClick={() => setCopyOpen(true)}>
                    <Copy /> Copy
                  </Button>
                )}
                <Button size="sm" disabled={daysDiffer} onClick={() => start(toDraft(plan.blocks))}>
                  <Pencil /> Edit plan
                </Button>
              </>
            )}
          </div>
          <PlanView blocks={plan.blocks} target={target} focus={plan.focus} notes={plan.notes} />
        </>
      ) : (
        <EmptyState
          icon={<ClipboardList />}
          title="No lesson plan yet"
          description={
            canEdit
              ? `Build it once from timed blocks and drills${target ? ` that add up to ${target} min` : ''}; every session follows it.`
              : 'The batch’s coach hasn’t set up its plan yet.'
          }
          action={
            canEdit &&
            !daysDiffer && (
              <div className="flex flex-wrap justify-center gap-1.5">
                <Button size="sm" onClick={() => start(starterBlocks(target!))}>
                  <Sparkles /> Start with warm-up · main · cool-down
                </Button>
                <Button size="sm" variant="outline" onClick={() => start([])}>
                  Start empty
                </Button>
              </div>
            )
          }
        />
      )}
      {plan && canEdit && (
        <CopyDialog
          open={copyOpen}
          onOpenChange={setCopyOpen}
          fromBatchId={batchId}
          minutes={plan.totalMinutes}
        />
      )}
    </div>
  );
}

function Banner({ children }: { children: React.ReactNode }) {
  return (
    <div
      role="status"
      className="flex items-start gap-2 rounded-lg border border-warning/40 bg-warning/12 px-2 py-1.5 text-[12px] leading-snug"
    >
      <AlertTriangle
        aria-hidden
        className="mt-0.5 size-4 shrink-0 text-warning-foreground dark:text-warning"
      />
      <span>{children}</span>
    </div>
  );
}

/** Copy to the coach's other batches — only those whose sessions are the same length. */
function CopyDialog({
  open,
  onOpenChange,
  fromBatchId,
  minutes,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  fromBatchId: string;
  minutes: number;
}) {
  const overview = usePlanOverview();
  const copy = useCopyBatchPlan();
  const [picked, setPicked] = useState<string[]>([]);
  const [overwrite, setOverwrite] = useState(false);
  const others = (overview.data?.batches ?? []).filter((b) => b.id !== fromBatchId);
  const same = others.filter((b) => b.sessionMinutes === minutes);
  const hidden = others.length - same.length;
  const canPick = (b: (typeof same)[number]) => overwrite || b.status === 'none';
  const chosen = picked.filter((id) => same.some((b) => b.id === id && canPick(b)));

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        onOpenChange(o);
        if (!o) setPicked([]);
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Copy plan to other batches</DialogTitle>
          <DialogDescription>
            Only your batches with {minutes}-minute sessions can take this plan.
          </DialogDescription>
        </DialogHeader>
        {same.length === 0 ? (
          <p className="py-3 text-center text-[13px] text-muted-foreground">
            None of your other batches has {minutes}-minute sessions.
          </p>
        ) : (
          <div className="space-y-1">
            <label className="flex items-center justify-between gap-2 rounded-lg bg-muted/40 px-2 py-1.5 text-[13px]">
              Replace plans they already have
              <Switch checked={overwrite} onCheckedChange={setOverwrite} />
            </label>
            <ul className="max-h-72 space-y-1 overflow-y-auto">
              {same.map((b) => (
                <li key={b.id}>
                  <label
                    className={`flex cursor-pointer items-center gap-2 rounded-lg border px-2 py-1.5 ${canPick(b) ? '' : 'opacity-50'}`}
                  >
                    <Checkbox
                      checked={chosen.includes(b.id)}
                      disabled={!canPick(b)}
                      onCheckedChange={(c) =>
                        setPicked((p) => (c ? [...p, b.id] : p.filter((x) => x !== b.id)))
                      }
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[13px] font-medium">{b.name}</span>
                      <span className="block truncate text-[11px] text-muted-foreground">
                        {b.location}
                      </span>
                    </span>
                    {b.status !== 'none' && (
                      <Badge variant={STATUS_META[b.status].badge}>Has a plan</Badge>
                    )}
                  </label>
                </li>
              ))}
            </ul>
          </div>
        )}
        {hidden > 0 && (
          <p className="text-[11px] text-muted-foreground">
            {plural(hidden, 'batch', 'batches')} with a different session length not shown.
          </p>
        )}
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            disabled={!chosen.length || copy.isPending}
            onClick={() =>
              copy.mutate(
                { fromBatchId, toBatchIds: chosen, overwrite },
                {
                  onSuccess: (r) => {
                    if (r.copied.length)
                      toast.success(`Copied to ${plural(r.copied.length, 'batch', 'batches')}`);
                    if (r.skipped.length)
                      toast.warning(`${plural(r.skipped.length, 'batch', 'batches')} skipped`, {
                        description: r.skipped.map((s) => s.reason).join(' '),
                      });
                    setPicked([]);
                    onOpenChange(false);
                  },
                  onError: (e) => toast.error('Couldn’t copy', { description: errorMessage(e) }),
                },
              )
            }
          >
            {copy.isPending ? 'Copying…' : `Copy${chosen.length ? ` to ${chosen.length}` : ''}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
