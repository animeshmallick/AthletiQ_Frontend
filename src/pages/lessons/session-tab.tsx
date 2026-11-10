/**
 * One session's plan: the batch plan's blocks until the coach fills in the day's drills (picked
 * from each block's list, or custom). The coach — or a substitute on the days they cover — fills it
 * in so it adds up to that day's length, edits it, or clears it.
 */
import {
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  ListChecks,
  Lock,
  Pencil,
  RotateCcw,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { ConfirmDialog, EmptyState, ErrorState, Field, ListSkeleton } from '@/components/common';
import { FloatBadge } from '@/components/floating-badge';
import { Button } from '@/components/ui/button';
import { Badge, Input } from '@/components/ui/primitives';
import { errorMessage } from '@/lib/api';
import { formatLongDate, relativeDay } from '@/lib/format';
import { useResetSessionPlan, useSaveSessionPlan, useSessionPlan } from '@/lib/queries';
import type { SessionPlanView } from '@/lib/types';
import { draftProblem, PlanEditor, toBody, toDraft, type DraftBlock } from './editor';
import { PlanView } from './view';

const NEAR = ['Today', 'Tomorrow', 'Yesterday'];
const SMALL =
  'h-7 gap-1 rounded-lg px-2 text-[12px] pointer-coarse:h-7 pointer-coarse:text-[12px] [&_svg:not([class*=size-])]:size-3.5';

/** Previous / next day and a date picker (disabled while a day is being filled in). */
export function DayStepper({
  date,
  sub,
  disabled,
  onStep,
  onPick,
  onToday,
  unit = 'day',
}: {
  date: string;
  sub?: string;
  disabled?: boolean;
  onStep: (n: 1 | -1) => void;
  onPick: (d: string) => void;
  /** Back to today (shown when on another day). */
  onToday?: () => void;
  unit?: 'day' | 'session';
}) {
  const rel = relativeDay(date);
  return (
    <div className="flex items-center gap-1 rounded-xl border bg-card p-1 shadow-e1">
      <Button
        variant="outline"
        size="icon-sm"
        aria-label={`Previous ${unit}`}
        disabled={disabled}
        onClick={() => onStep(-1)}
      >
        <ChevronLeft />
      </Button>
      <label className="relative min-w-0 flex-1 cursor-pointer rounded-lg px-1 py-0.5 text-center hover:bg-muted/50">
        <span className="block truncate text-[14px] leading-tight font-semibold">
          {NEAR.includes(rel) ? `${rel} · ` : ''}
          {formatLongDate(date)}
        </span>
        {sub && <span className="block truncate text-[11px] text-muted-foreground">{sub}</span>}
        {!disabled && (
          <input
            type="date"
            aria-label="Pick a date"
            value={date}
            onChange={(e) => e.target.value && onPick(e.target.value)}
            className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
          />
        )}
      </label>
      {onToday && (
        <button
          type="button"
          onClick={onToday}
          disabled={disabled}
          className="h-6 shrink-0 cursor-pointer rounded-full bg-primary/10 px-2 text-[11px] font-semibold text-primary transition-colors hover:bg-primary/15 disabled:opacity-50"
        >
          Today
        </button>
      )}
      <Button
        variant="outline"
        size="icon-sm"
        aria-label={`Next ${unit}`}
        disabled={disabled}
        onClick={() => onStep(1)}
      >
        <ChevronRight />
      </Button>
    </div>
  );
}

/** How a day's plan stands, as a small badge. */
export function SessionStatus({ d }: { d: SessionPlanView | undefined }) {
  if (!d) return null;
  if (d.lockedReason)
    return (
      <FloatBadge tone="muted" icon={<Lock />}>
        No session
      </FloatBadge>
    );
  if (d.source === 'session') return <FloatBadge tone="success">Filled in</FloatBadge>;
  if (d.source === 'batch') return <FloatBadge tone="warning">Not filled in yet</FloatBadge>;
  return <FloatBadge tone="neutral">No plan yet</FloatBadge>;
}

/** One batch's plan for one day: view it, fill it in, edit or clear it. */
export function SessionPlan({
  batchId,
  date,
  onEditingChange,
  onOpenPlan,
}: {
  batchId: string;
  date: string;
  /** Filling in (unsaved): the page holds the day and asks before leaving. */
  onEditingChange?: (editing: boolean) => void;
  onOpenPlan?: () => void;
}) {
  const q = useSessionPlan(batchId, date);
  const [draft, setDraft] = useState<{ blocks: DraftBlock[]; note: string } | null>(null);
  const save = useSaveSessionPlan();
  const reset = useResetSessionPlan();
  const [confirmReset, setConfirmReset] = useState(false);
  useEffect(() => onEditingChange?.(draft !== null), [draft, onEditingChange]);
  const d = q.data?.date === date && q.data.batch.id === batchId ? q.data : undefined;

  if (q.isError) return <ErrorState error={q.error} onRetry={() => void q.refetch()} />;
  if (!d) return <ListSkeleton rows={3} />;

  if (draft) {
    const problem = draftProblem(draft.blocks, d.minutes);
    return (
      <div className="space-y-1.5">
        <Field label="Note for this session">
          <Input
            value={draft.note}
            onChange={(e) => setDraft({ ...draft, note: e.target.value })}
            placeholder="e.g. Match practice before the tournament"
            maxLength={1000}
            className="h-9"
          />
        </Field>
        <PlanEditor
          blocks={draft.blocks}
          target={d.minutes}
          options={d.drillOptions}
          onChange={(blocks) => setDraft({ ...draft, blocks })}
        />
        <div className="sticky bottom-[calc(3.5rem+1px+env(safe-area-inset-bottom))] z-20 -mx-1 flex items-center gap-1.5 rounded-t-lg border-t bg-background/95 px-1 py-1.5 backdrop-blur lg:bottom-0">
          <p className="min-w-0 flex-1 text-[12px] leading-tight text-muted-foreground">
            {problem ?? 'Only this day changes; the batch plan stays as it is.'}
          </p>
          <Button variant="ghost" size="sm" onClick={() => setDraft(null)}>
            Cancel
          </Button>
          <Button
            size="sm"
            disabled={Boolean(problem) || save.isPending}
            onClick={() =>
              save.mutate(
                { batchId, date, note: draft.note.trim() || null, blocks: toBody(draft.blocks) },
                {
                  onSuccess: () => {
                    setDraft(null);
                    toast.success('Session plan saved');
                  },
                  onError: (e) => toast.error('Couldn’t save', { description: errorMessage(e) }),
                },
              )
            }
          >
            {save.isPending ? 'Saving…' : 'Save this day'}
          </Button>
        </div>
      </div>
    );
  }

  const fits = d.totalMinutes === d.minutes;
  const actions = d.canAdjust && !d.lockedReason && d.source !== 'none';
  return (
    <div className="space-y-1.5">
      {(actions || (d.source !== 'none' && !fits && !d.lockedReason)) && (
        <div className="flex flex-wrap items-center justify-end gap-1">
          <span className="flex min-w-0 flex-1 flex-wrap items-center gap-1">
            {d.source !== 'none' && !fits && !d.lockedReason && (
              <Badge variant="warning">
                {d.totalMinutes} of {d.minutes} min
              </Badge>
            )}
          </span>
          {actions && (
            <>
              {d.source === 'session' && (
                <Button
                  variant="ghost"
                  size="sm"
                  className={SMALL}
                  onClick={() => setConfirmReset(true)}
                >
                  <RotateCcw /> Clear
                </Button>
              )}
              <Button
                size="sm"
                className={SMALL}
                variant={d.source === 'session' ? 'outline' : 'default'}
                onClick={() => setDraft({ blocks: toDraft(d.blocks), note: d.note ?? '' })}
              >
                {d.source === 'session' ? (
                  <>
                    <Pencil /> Edit
                  </>
                ) : (
                  <>
                    <ListChecks /> Fill now
                  </>
                )}
              </Button>
            </>
          )}
        </div>
      )}
      {d.lockedReason && (
        <p className="rounded-lg border bg-muted/40 px-2 py-1.5 text-[12px] text-muted-foreground">
          {d.lockedReason}
        </p>
      )}
      {d.note && (
        <p className="rounded-lg border border-primary/25 bg-primary/5 px-2 py-1 text-[13px]">
          {d.note}
        </p>
      )}
      {d.lockedReason ? null : d.source === 'none' ? (
        <EmptyState
          icon={<ClipboardList />}
          title="No lesson plan yet"
          description="Sessions follow the batch plan. Set it up once and every day picks it up."
          action={
            onOpenPlan && (
              <Button size="sm" onClick={onOpenPlan}>
                Set up the plan
              </Button>
            )
          }
        />
      ) : (
        <>
          {d.source === 'batch' && d.canAdjust && (
            <p className="text-[12px] text-muted-foreground">
              The day follows the batch plan’s blocks. Tap Fill now to pick its drills.
            </p>
          )}
          <PlanView blocks={d.blocks} target={d.minutes} focus={d.focus} />
        </>
      )}
      <ConfirmDialog
        open={confirmReset}
        onOpenChange={setConfirmReset}
        title="Clear this day?"
        description="The drills picked for this day are removed; it goes back to the batch plan’s blocks."
        confirmLabel="Clear"
        loading={reset.isPending}
        onConfirm={() =>
          reset.mutate(
            { batchId, date },
            {
              onSuccess: () => {
                setConfirmReset(false);
                toast.success('Cleared');
              },
              onError: (e) => toast.error('Couldn’t clear', { description: errorMessage(e) }),
            },
          )
        }
      />
    </div>
  );
}
