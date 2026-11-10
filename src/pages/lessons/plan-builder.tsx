/**
 * A session plan is a run of timed blocks (Warm-up 10 min, Ball drills 20 min…), each with the
 * drills to run and an optional note per drill, plus a one-line focus. Coaches start from the last
 * session or a saved plan in one tap, tweak minutes with steppers, add drills from their library
 * (or create one by typing), then save — or run the session from a clean run sheet.
 */
import {
  ArrowDown,
  ArrowUp,
  BookmarkPlus,
  CalendarRange,
  Check,
  ClipboardList,
  Clock,
  History,
  Minus,
  MoreHorizontal,
  Play,
  Plus,
  RotateCcw,
  Save,
  Search,
  Sparkles,
  StickyNote,
  Target,
  Trash2,
  X,
} from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import { ConfirmDialog, EmptyState, ListSkeleton } from '@/components/common';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/controls';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/overlays';
import { Card, Input, Textarea } from '@/components/ui/primitives';
import { errorMessage } from '@/lib/api';
import { timesOn } from '@/lib/batch-times';
import {
  addDays,
  formatShortDate,
  formatTime,
  isoWeekday,
  startOfWeek,
  WEEKDAYS,
} from '@/lib/format';
import {
  type GridBody,
  useCopyPlan,
  useDeletePlan,
  useLibrary,
  usePlanDay,
  useSaveLibraryItem,
  useSavedPlans,
  useSavePlan,
  useSaveSavedPlan,
} from '@/lib/queries';
import type { Batch, LessonPlan, LibraryItem, PlanGrid, SavedPlan } from '@/lib/types';
import { cn } from '@/lib/utils';
import { STAGE_COLORS } from './meta';

// ─── Draft model ─────────────────────────────────────────────────────────────

type Drill = { eventId: string; content: string };
interface Draft {
  stageIds: string[];
  minutes: Record<string, number | null>;
  drills: Record<string, Drill[]>;
  focus: string;
  notes: string;
}

function fromGrid(g: PlanGrid): Draft {
  const order = new Map(g.events.map((e, i) => [e.id, i]));
  const drills: Record<string, Drill[]> = {};
  for (const c of [...g.cells].sort(
    (a, b) => (order.get(a.eventId) ?? 0) - (order.get(b.eventId) ?? 0),
  ))
    (drills[c.stageId] ??= []).push({ eventId: c.eventId, content: c.content });
  return {
    stageIds: g.stages.map((s) => s.id),
    minutes: Object.fromEntries(g.stages.map((s) => [s.id, s.minutes])),
    drills,
    focus: g.focus ?? '',
    notes: g.notes ?? '',
  };
}

function blankDraft(stages: LibraryItem[]): Draft {
  return {
    stageIds: stages.map((s) => s.id),
    minutes: Object.fromEntries(stages.map((s) => [s.id, s.durationMin ?? null])),
    drills: {},
    focus: '',
    notes: '',
  };
}

function toBody(d: Draft): GridBody {
  const eventIds: string[] = [];
  const cells: GridBody['cells'] = [];
  for (const s of d.stageIds)
    for (const x of d.drills[s] ?? []) {
      if (!eventIds.includes(x.eventId)) eventIds.push(x.eventId);
      cells.push({ eventId: x.eventId, stageId: s, content: x.content.trim() });
    }
  return {
    stageIds: d.stageIds,
    eventIds,
    durations: Object.fromEntries(
      d.stageIds.flatMap((s) => (d.minutes[s] ? [[s, d.minutes[s]!] as const] : [])),
    ),
    focus: d.focus.trim() || null,
    notes: d.notes.trim() || null,
    cells,
  };
}

const total = (d: Draft) => d.stageIds.reduce((n, s) => n + (d.minutes[s] ?? 0), 0);
const toMin = (t: string) => {
  const [h = 0, m = 0] = t.split(':').map(Number);
  return h * 60 + m;
};
const clock = (mins: number) =>
  formatTime(
    `${String(Math.floor(mins / 60) % 24).padStart(2, '0')}:${String(mins % 60).padStart(2, '0')}`,
  );
/** When each block starts, in minutes since midnight. */
function startTimes(d: Draft, from: number) {
  const out: number[] = [];
  let t = from;
  for (const s of d.stageIds) {
    out.push(t);
    t += d.minutes[s] ?? 0;
  }
  return out;
}
const QUICK_MINUTES = [5, 10, 15, 20, 30, 45];

type Info = { name: string; color?: string | null; description?: string | null };

// ─── Builder ─────────────────────────────────────────────────────────────────

export function PlanBuilder({
  batch,
  date,
  plan,
  readOnly,
  isAdmin,
  batches,
  previousPlanDate,
  onDirtyChange,
}: {
  batch: Batch;
  date: string;
  plan: LessonPlan | null;
  readOnly: boolean;
  isAdmin: boolean;
  /** The coach's batches, for planning the week across batches. */
  batches: Batch[];
  previousPlanDate?: string | null;
  onDirtyChange?: (dirty: boolean) => void;
}) {
  const libQ = isAdmin ? { batchId: batch.id } : {};
  const stagesQ = useLibrary('stages', libQ);
  const eventsQ = useLibrary('events', libQ);
  const saved = useSavedPlans({}, !readOnly);
  const previous = usePlanDay(
    !readOnly && previousPlanDate ? batch.id : undefined,
    previousPlanDate ?? '',
  );
  const savePlan = useSavePlan();
  const del = useDeletePlan();
  const [running, setRunning] = useState(false);
  const [saveAs, setSaveAs] = useState(false);
  const [week, setWeek] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const { startTime, endTime } = timesOn(batch, date);
  const sessionMinutes = toMin(endTime) - toMin(startTime);

  // The saved plan (or, for a new plan, the library's blocks) is the baseline.
  const activeStages = useMemo(() => stagesQ.data ?? [], [stagesQ.data]);
  const base = useMemo(
    () => (plan ? fromGrid(plan) : blankDraft(activeStages)),
    [plan, activeStages],
  );
  const baseKey = plan
    ? `plan:${plan.id}:${plan.updatedAt}`
    : `new:${activeStages.map((s) => `${s.id}${s.durationMin}`).join()}`;
  const [draft, setDraft] = useState<Draft>(base);
  const [syncedKey, setSyncedKey] = useState(baseKey);
  if (syncedKey !== baseKey) {
    setSyncedKey(baseKey);
    setDraft(base);
  }

  // Names for blocks / drills, including archived ones an older plan still uses.
  const stageInfo = useMemo(() => {
    const m = new Map<string, Info>();
    plan?.stages.forEach((s) => m.set(s.id, s));
    stagesQ.data?.forEach((s) => m.set(s.id, s));
    return m;
  }, [plan, stagesQ.data]);
  const eventInfo = useMemo(() => {
    const m = new Map<string, Info>();
    plan?.events.forEach((e) => m.set(e.id, e));
    eventsQ.data?.forEach((e) => m.set(e.id, e));
    return m;
  }, [plan, eventsQ.data]);

  const canEdit = !readOnly;
  const dirty = canEdit && JSON.stringify(toBody(draft)) !== JSON.stringify(toBody(base));
  const hasContent =
    draft.stageIds.some((s) => (draft.drills[s] ?? []).length > 0) || !!draft.focus.trim();
  const unsaved = canEdit && (plan ? dirty : hasContent);

  useEffect(() => {
    onDirtyChange?.(unsaved);
    if (!unsaved) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [unsaved, onDirtyChange]);
  useEffect(() => () => onDirtyChange?.(false), [onDirtyChange]);

  const submitRef = useRef<() => void>(() => {});
  async function submit() {
    if (savePlan.isPending || !draft.stageIds.length) return;
    try {
      await savePlan.mutateAsync({ batchId: batch.id, date, ...toBody(draft) });
      toast.success('Plan saved');
    } catch (err) {
      toast.error('Could not save plan', { description: errorMessage(err) });
    }
  }
  useEffect(() => {
    submitRef.current = () => void submit();
  });
  useEffect(() => {
    if (!unsaved) return;
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
        e.preventDefault();
        submitRef.current();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [unsaved]);

  const update = (fn: (d: Draft) => Draft) => setDraft((d) => fn(d));
  const load = (g: PlanGrid, label: string) => {
    setDraft(fromGrid(g));
    toast.success(`Loaded ${label}`, { description: 'Adjust anything, then save.' });
  };

  if (stagesQ.isPending || eventsQ.isPending) return <ListSkeleton rows={4} />;

  if (readOnly && !plan)
    return (
      <EmptyState
        icon={<ClipboardList />}
        title="No plan for this session"
        description={
          isAdmin ? 'The coach hasn’t planned this session yet.' : 'This session can’t be planned.'
        }
      />
    );

  const used = new Set(draft.stageIds);
  const minutesTotal = total(draft);
  const starts = startTimes(draft, toMin(startTime));

  return (
    <div className="space-y-2.5 pb-20">
      {canEdit && !plan && (
        <QuickStart
          previousDate={previousPlanDate ?? null}
          previous={previous.data?.plan ?? null}
          saved={saved.data ?? []}
          onLoad={load}
        />
      )}

      {/* Focus + time budget */}
      <Card className="space-y-2 p-2.5">
        <label className="flex items-center gap-2">
          <Target className="size-4 shrink-0 text-primary" aria-hidden />
          {canEdit ? (
            <input
              aria-label="Session focus"
              value={draft.focus}
              maxLength={200}
              placeholder="Session focus, e.g. Backhand consistency"
              onChange={(e) => update((d) => ({ ...d, focus: e.target.value }))}
              className="min-w-0 flex-1 bg-transparent text-[14px] font-semibold outline-none placeholder:font-normal placeholder:text-muted-foreground"
            />
          ) : (
            <span className="text-[14px] font-semibold">
              {draft.focus || (
                <span className="font-normal text-muted-foreground">No focus set</span>
              )}
            </span>
          )}
        </label>
        <TimeMeter
          draft={draft}
          info={stageInfo}
          totalMinutes={minutesTotal}
          sessionMinutes={sessionMinutes}
        />
      </Card>

      {/* Blocks */}
      <ol className="space-y-2" aria-label="Session blocks">
        {draft.stageIds.map((sid, i) => {
          const info = stageInfo.get(sid) ?? { name: 'Removed block' };
          const mins = draft.minutes[sid] ?? null;
          const from = starts[i]!;
          return (
            <li key={sid}>
              <BlockCard
                index={i}
                count={draft.stageIds.length}
                info={info}
                minutes={mins}
                timeLabel={mins ? `${clock(from)} – ${clock(from + mins)}` : null}
                drills={draft.drills[sid] ?? []}
                eventInfo={eventInfo}
                library={eventsQ.data ?? []}
                canEdit={canEdit}
                onMinutes={(m) => update((d) => ({ ...d, minutes: { ...d.minutes, [sid]: m } }))}
                onMove={(delta) =>
                  update((d) => {
                    const ids = [...d.stageIds];
                    const [x] = ids.splice(i, 1);
                    ids.splice(i + delta, 0, x!);
                    return { ...d, stageIds: ids };
                  })
                }
                onRemove={() =>
                  update((d) => ({ ...d, stageIds: d.stageIds.filter((s) => s !== sid) }))
                }
                onDrills={(list) => update((d) => ({ ...d, drills: { ...d.drills, [sid]: list } }))}
                batchId={batch.id}
              />
            </li>
          );
        })}
      </ol>

      {canEdit && (
        <AddBlock
          library={(stagesQ.data ?? []).filter((s) => !used.has(s.id))}
          batchId={batch.id}
          onAdd={(s) =>
            update((d) => ({
              ...d,
              stageIds: [...d.stageIds, s.id],
              minutes: { ...d.minutes, [s.id]: s.durationMin ?? null },
            }))
          }
        />
      )}

      {/* Notes */}
      {(canEdit || draft.notes) && (
        <Card className="p-2.5">
          <p className="mb-1 flex items-center gap-1.5 text-[12px] font-semibold text-muted-foreground">
            <StickyNote className="size-3.5" /> Notes
          </p>
          {canEdit ? (
            <Textarea
              aria-label="Notes"
              rows={2}
              value={draft.notes}
              placeholder="Equipment, reminders, who to watch…"
              onChange={(e) => update((d) => ({ ...d, notes: e.target.value }))}
              className="min-h-14 text-[13px]"
            />
          ) : (
            <p className="text-[13px] whitespace-pre-wrap">{draft.notes}</p>
          )}
        </Card>
      )}

      {/* Action bar: sticky above the tab bar on phones. */}
      <div className="sticky bottom-[calc(4.25rem+env(safe-area-inset-bottom))] z-20 lg:bottom-3">
        <div className="flex items-center gap-1.5 rounded-2xl border bg-card/95 p-1.5 shadow-e2 backdrop-blur">
          <Button
            variant="outline"
            size="sm"
            className="h-9 rounded-xl"
            disabled={!draft.stageIds.length}
            onClick={() => setRunning(true)}
          >
            <Play /> Run
          </Button>
          <p className="tabular min-w-0 flex-1 truncate text-center text-[11px] text-muted-foreground">
            {unsaved ? 'Unsaved changes' : plan ? 'Saved' : 'Not planned yet'}
          </p>
          {canEdit && (
            <>
              {unsaved && plan && (
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label="Discard changes"
                  onClick={() => setDraft(base)}
                >
                  <RotateCcw />
                </Button>
              )}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon-sm" aria-label="More plan actions">
                    <MoreHorizontal />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onSelect={() => setSaveAs(true)}>
                    <BookmarkPlus /> Save as a reusable plan
                  </DropdownMenuItem>
                  <DropdownMenuItem disabled={!plan || unsaved} onSelect={() => setWeek(true)}>
                    <CalendarRange /> Use for other sessions…
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onSelect={() => setDraft(blankDraft(activeStages))}>
                    <RotateCcw /> Start over
                  </DropdownMenuItem>
                  {plan && (
                    <DropdownMenuItem destructive onSelect={() => setConfirmDelete(true)}>
                      <Trash2 /> Delete plan
                    </DropdownMenuItem>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
              <Button
                size="sm"
                className="h-9 rounded-xl"
                loading={savePlan.isPending}
                disabled={!unsaved || !draft.stageIds.length}
                onClick={() => void submit()}
              >
                <Save /> Save
              </Button>
            </>
          )}
        </div>
      </div>

      <RunSheet
        open={running}
        onClose={() => setRunning(false)}
        title={batch.name}
        draft={draft}
        stageInfo={stageInfo}
        eventInfo={eventInfo}
        start={toMin(startTime)}
      />
      <SaveAsDialog open={saveAs} onClose={() => setSaveAs(false)} body={toBody(draft)} />
      {plan && (
        <PlanSessionsDialog
          open={week}
          onClose={() => setWeek(false)}
          batch={batch}
          batches={batches}
          date={date}
        />
      )}
      <ConfirmDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title="Delete this plan?"
        description="The session will show as not planned."
        confirmLabel="Delete plan"
        destructive
        loading={del.isPending}
        onConfirm={() =>
          del.mutate(
            { batchId: batch.id, date },
            {
              onSuccess: () => {
                toast.success('Plan deleted');
                setConfirmDelete(false);
              },
              onError: (e) => toast.error(errorMessage(e)),
            },
          )
        }
      />
    </div>
  );
}

// ─── Quick start ─────────────────────────────────────────────────────────────

function QuickStart({
  previousDate,
  previous,
  saved,
  onLoad,
}: {
  previousDate: string | null;
  previous: LessonPlan | null;
  saved: SavedPlan[];
  onLoad: (g: PlanGrid, label: string) => void;
}) {
  if (!previous && !saved.length) return null;
  return (
    <section aria-label="Quick start" className="space-y-1.5">
      <p className="flex items-center gap-1.5 text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">
        <Sparkles className="size-3.5" /> Start from
      </p>
      <div className="-mx-1 flex [scrollbar-width:none] gap-1.5 overflow-x-auto px-1 pb-1">
        {previous && previousDate && (
          <button
            type="button"
            onClick={() => onLoad(previous, `${formatShortDate(previousDate)}’s plan`)}
            className="flex w-40 shrink-0 cursor-pointer flex-col gap-0.5 rounded-xl border border-primary/30 bg-primary/5 p-2 text-left transition-colors hover:bg-primary/10"
          >
            <span className="flex items-center gap-1 text-[11px] font-semibold text-primary">
              <History className="size-3.5" /> Repeat last session
            </span>
            <span className="truncate text-[12px] font-medium">
              {previous.focus || formatShortDate(previousDate)}
            </span>
            <span className="text-[10px] text-muted-foreground">
              {formatShortDate(previousDate)} · {previous.stages.length} blocks
              {previous.totalMinutes ? ` · ${previous.totalMinutes} min` : ''}
            </span>
          </button>
        )}
        {saved.map((p) => (
          <button
            key={p.id}
            type="button"
            onClick={() => onLoad(p, `“${p.name}”`)}
            className="flex w-36 shrink-0 cursor-pointer flex-col gap-0.5 rounded-xl border bg-card p-2 text-left shadow-e1 transition-colors hover:bg-muted/60"
          >
            <span className="flex items-center gap-1 text-[11px] font-semibold text-muted-foreground">
              <BookmarkPlus className="size-3.5" /> Saved plan
            </span>
            <span className="truncate text-[12px] font-semibold">{p.name}</span>
            <span className="text-[10px] text-muted-foreground">
              {p.stages.length} blocks{p.totalMinutes ? ` · ${p.totalMinutes} min` : ''}
            </span>
          </button>
        ))}
      </div>
    </section>
  );
}

// ─── Time meter ──────────────────────────────────────────────────────────────

function TimeMeter({
  draft,
  info,
  totalMinutes,
  sessionMinutes,
}: {
  draft: Draft;
  info: Map<string, Info>;
  totalMinutes: number;
  sessionMinutes: number;
}) {
  const scale = Math.max(totalMinutes, sessionMinutes, 1);
  const over = totalMinutes - sessionMinutes;
  return (
    <div className="space-y-1">
      <div className="flex h-2 gap-0.5 overflow-hidden rounded-full bg-muted" aria-hidden>
        {draft.stageIds.map((s, i) => {
          const m = draft.minutes[s] ?? 0;
          if (!m) return null;
          return (
            <span
              key={s}
              className="h-full first:rounded-l-full last:rounded-r-full"
              style={{
                width: `${(m / scale) * 100}%`,
                background: info.get(s)?.color ?? STAGE_COLORS[i % STAGE_COLORS.length],
              }}
            />
          );
        })}
      </div>
      <p className="flex items-center gap-1 text-[11px] text-muted-foreground">
        <Clock className="size-3" />
        <span className="tabular font-semibold text-foreground">{totalMinutes} min</span>
        planned of {sessionMinutes} min
        {sessionMinutes > 0 && (
          <span
            className={cn(
              'ml-auto font-semibold',
              over > 0 ? 'text-destructive' : over === 0 ? 'text-success' : '',
            )}
          >
            {over > 0 ? `${over} min over` : over === 0 ? 'Fits exactly' : `${-over} min free`}
          </span>
        )}
      </p>
    </div>
  );
}

// ─── A block ─────────────────────────────────────────────────────────────────

function BlockCard({
  index,
  count,
  info,
  minutes,
  timeLabel,
  drills,
  eventInfo,
  library,
  canEdit,
  onMinutes,
  onMove,
  onRemove,
  onDrills,
  batchId,
}: {
  index: number;
  count: number;
  info: Info;
  minutes: number | null;
  timeLabel: string | null;
  drills: Drill[];
  eventInfo: Map<string, Info>;
  library: LibraryItem[];
  canEdit: boolean;
  onMinutes: (m: number | null) => void;
  onMove: (delta: number) => void;
  onRemove: () => void;
  onDrills: (list: Drill[]) => void;
  batchId: string;
}) {
  const [noteFor, setNoteFor] = useState<string | null>(null);
  const color = info.color ?? STAGE_COLORS[index % STAGE_COLORS.length];
  return (
    <Card className="overflow-hidden border-l-4 p-0" style={{ borderLeftColor: color }}>
      <div className="flex items-center gap-2 px-2.5 pt-2">
        <span className="tabular flex size-5 shrink-0 items-center justify-center rounded-full bg-muted text-[10px] font-bold">
          {index + 1}
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[14px] leading-tight font-semibold">{info.name}</p>
          {timeLabel && <p className="tabular text-[10px] text-muted-foreground">{timeLabel}</p>}
        </div>
        {canEdit ? (
          <MinutesStepper value={minutes} onChange={onMinutes} label={info.name} />
        ) : (
          minutes && (
            <span className="tabular rounded-full bg-muted px-2 py-0.5 text-[11px] font-semibold">
              {minutes} min
            </span>
          )
        )}
        {canEdit && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                aria-label={`${info.name} options`}
                className="flex size-7 shrink-0 cursor-pointer items-center justify-center rounded-lg text-muted-foreground hover:bg-muted"
              >
                <MoreHorizontal className="size-4" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem disabled={index === 0} onSelect={() => onMove(-1)}>
                <ArrowUp /> Move up
              </DropdownMenuItem>
              <DropdownMenuItem disabled={index === count - 1} onSelect={() => onMove(1)}>
                <ArrowDown /> Move down
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem destructive onSelect={onRemove}>
                <Trash2 /> Remove block
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>

      <div className="space-y-1 px-2.5 pt-1.5 pb-2">
        {drills.length === 0 && !canEdit && (
          <p className="text-[12px] text-muted-foreground">No drills.</p>
        )}
        {drills.map((d) => {
          const name = eventInfo.get(d.eventId)?.name ?? 'Removed drill';
          const editing = noteFor === d.eventId;
          return (
            <div key={d.eventId} className="rounded-lg bg-muted/50 px-2 py-1">
              <div className="flex items-center gap-1.5">
                <Check className="size-3.5 shrink-0 text-success" aria-hidden />
                <span className="min-w-0 flex-1 truncate text-[13px] font-medium">{name}</span>
                {canEdit && (
                  <>
                    <button
                      type="button"
                      aria-label={`Note for ${name}`}
                      onClick={() => setNoteFor(editing ? null : d.eventId)}
                      className={cn(
                        'flex size-6 cursor-pointer items-center justify-center rounded-md text-muted-foreground hover:bg-background',
                        d.content && 'text-primary',
                      )}
                    >
                      <StickyNote className="size-3.5" />
                    </button>
                    <button
                      type="button"
                      aria-label={`Remove ${name}`}
                      onClick={() => onDrills(drills.filter((x) => x.eventId !== d.eventId))}
                      className="flex size-6 cursor-pointer items-center justify-center rounded-md text-muted-foreground hover:bg-background hover:text-destructive"
                    >
                      <X className="size-3.5" />
                    </button>
                  </>
                )}
              </div>
              {editing ? (
                <Input
                  autoFocus
                  aria-label={`Coaching note for ${name}`}
                  maxLength={2000}
                  value={d.content}
                  placeholder="Coaching note, e.g. 3 × 10 reps, focus on footwork"
                  onChange={(e) =>
                    onDrills(
                      drills.map((x) =>
                        x.eventId === d.eventId ? { ...x, content: e.target.value } : x,
                      ),
                    )
                  }
                  onKeyDown={(e) => e.key === 'Enter' && setNoteFor(null)}
                  className="mt-1 h-8 text-[12px]"
                />
              ) : (
                d.content && (
                  <p className="pl-5 text-[11px] leading-snug text-muted-foreground">{d.content}</p>
                )
              )}
            </div>
          );
        })}
        {canEdit && (
          <DrillPicker
            library={library}
            exclude={drills.map((d) => d.eventId)}
            batchId={batchId}
            onPick={(id) => onDrills([...drills, { eventId: id, content: '' }])}
          />
        )}
      </div>
    </Card>
  );
}

function MinutesStepper({
  value,
  onChange,
  label,
}: {
  value: number | null;
  onChange: (m: number | null) => void;
  label: string;
}) {
  const step = (d: number) => onChange(Math.min(240, Math.max(5, (value ?? 0) + d)));
  return (
    <div className="flex h-7 shrink-0 items-center rounded-lg border bg-card">
      <button
        type="button"
        aria-label={`Less time for ${label}`}
        disabled={!value || value <= 5}
        onClick={() => step(-5)}
        className="flex h-full w-6 cursor-pointer items-center justify-center text-muted-foreground disabled:opacity-40"
      >
        <Minus className="size-3" />
      </button>
      <Popover>
        <PopoverTrigger asChild>
          <button
            type="button"
            aria-label={`Minutes for ${label}`}
            className="tabular h-full min-w-11 cursor-pointer px-1 text-[12px] font-semibold"
          >
            {value ? `${value}m` : '—'}
          </button>
        </PopoverTrigger>
        <PopoverContent className="grid w-auto grid-cols-3 gap-1 p-1.5" align="end">
          {QUICK_MINUTES.map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => onChange(m)}
              className={cn(
                'tabular h-8 w-12 cursor-pointer rounded-md border text-[12px] font-semibold',
                m === value ? 'border-primary bg-primary/10 text-primary' : 'hover:bg-muted',
              )}
            >
              {m}m
            </button>
          ))}
        </PopoverContent>
      </Popover>
      <button
        type="button"
        aria-label={`More time for ${label}`}
        onClick={() => step(5)}
        className="flex h-full w-6 cursor-pointer items-center justify-center text-muted-foreground"
      >
        <Plus className="size-3" />
      </button>
    </div>
  );
}

/** Search the drill library; typing a new name creates the drill and adds it. */
function DrillPicker({
  library,
  exclude,
  batchId,
  onPick,
}: {
  library: LibraryItem[];
  exclude: string[];
  batchId: string;
  onPick: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const create = useSaveLibraryItem('events');
  const term = q.trim().toLowerCase();
  const options = library.filter(
    (e) => !exclude.includes(e.id) && (!term || e.name.toLowerCase().includes(term)),
  );
  const exact = library.some((e) => e.name.toLowerCase() === term);
  const pick = (id: string) => {
    onPick(id);
    setQ('');
    setOpen(false);
  };
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="flex h-7 w-full cursor-pointer items-center justify-center gap-1 rounded-lg border border-dashed text-[12px] font-medium text-muted-foreground transition-colors hover:border-primary hover:text-primary"
        >
          <Plus className="size-3.5" /> Add drill
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-72 p-1.5" align="start">
        <div className="relative mb-1">
          <Search className="pointer-events-none absolute top-1/2 left-2 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            autoFocus
            aria-label="Find or create a drill"
            placeholder="Find or create a drill"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            className="h-8 pl-7 text-[13px]"
          />
        </div>
        <ul className="max-h-56 overflow-y-auto">
          {options.map((e) => (
            <li key={e.id}>
              <button
                type="button"
                onClick={() => pick(e.id)}
                className="w-full cursor-pointer rounded-md px-2 py-1.5 text-left hover:bg-muted"
              >
                <span className="block text-[13px] font-medium">{e.name}</span>
                {e.description && (
                  <span className="block truncate text-[11px] text-muted-foreground">
                    {e.description}
                  </span>
                )}
              </button>
            </li>
          ))}
          {term && !exact && (
            <li>
              <button
                type="button"
                disabled={create.isPending}
                onClick={() =>
                  create.mutate(
                    { name: q.trim(), batchId },
                    {
                      onSuccess: (item) => pick(item.id),
                      onError: (e) => toast.error(errorMessage(e)),
                    },
                  )
                }
                className="flex w-full cursor-pointer items-center gap-1.5 rounded-md px-2 py-1.5 text-left text-[13px] font-medium text-primary hover:bg-primary/10"
              >
                <Plus className="size-3.5" /> Create “{q.trim()}”
              </button>
            </li>
          )}
          {!options.length && !term && (
            <li className="px-2 py-3 text-center text-[12px] text-muted-foreground">
              Type a name to create your first drill.
            </li>
          )}
        </ul>
      </PopoverContent>
    </Popover>
  );
}

function AddBlock({
  library,
  batchId,
  onAdd,
}: {
  library: LibraryItem[];
  batchId: string;
  onAdd: (s: LibraryItem) => void;
}) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [mins, setMins] = useState('10');
  const create = useSaveLibraryItem('stages');
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="flex h-9 w-full cursor-pointer items-center justify-center gap-1.5 rounded-xl border border-dashed text-[13px] font-medium text-muted-foreground transition-colors hover:border-primary hover:text-primary"
        >
          <Plus className="size-4" /> Add block
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-72 space-y-2 p-2" align="center">
        {library.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {library.map((s) => (
              <button
                key={s.id}
                type="button"
                onClick={() => {
                  onAdd(s);
                  setOpen(false);
                }}
                className="flex h-7 cursor-pointer items-center gap-1 rounded-full border px-2 text-[12px] font-medium hover:bg-muted"
              >
                <span
                  className="size-2 rounded-full"
                  style={{ background: s.color ?? STAGE_COLORS[0] }}
                />
                {s.name}
                {s.durationMin ? (
                  <span className="text-muted-foreground">{s.durationMin}m</span>
                ) : null}
              </button>
            ))}
          </div>
        )}
        <form
          className="flex gap-1.5"
          onSubmit={(e) => {
            e.preventDefault();
            if (!name.trim()) return;
            create.mutate(
              {
                name: name.trim(),
                durationMin: Number(mins) || null,
                batchId,
                color: STAGE_COLORS[library.length % STAGE_COLORS.length],
              },
              {
                onSuccess: (s) => {
                  onAdd(s);
                  setName('');
                  setOpen(false);
                },
                onError: (err) => toast.error(errorMessage(err)),
              },
            );
          }}
        >
          <Input
            aria-label="New block name"
            placeholder="New block, e.g. Match play"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="h-8 text-[13px]"
          />
          <Input
            aria-label="New block minutes"
            type="number"
            min={1}
            max={240}
            value={mins}
            onChange={(e) => setMins(e.target.value)}
            className="tabular h-8 w-14 text-[13px]"
          />
          <Button type="submit" size="sm" className="h-8" loading={create.isPending}>
            Add
          </Button>
        </form>
      </PopoverContent>
    </Popover>
  );
}

// ─── Run sheet ───────────────────────────────────────────────────────────────

function RunSheet({
  open,
  onClose,
  title,
  draft,
  stageInfo,
  eventInfo,
  start,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  draft: Draft;
  stageInfo: Map<string, Info>;
  eventInfo: Map<string, Info>;
  start: number;
}) {
  const [current, setCurrent] = useState(0);
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [nowMs, setNowMs] = useState(0);
  useEffect(() => {
    if (!open || startedAt === null) return;
    const t = setInterval(() => setNowMs(Date.now()), 1000);
    return () => clearInterval(t);
  }, [open, startedAt]);
  const go = (i: number) => {
    setCurrent(i);
    const t = Date.now();
    setStartedAt(t);
    setNowMs(t);
  };
  const sid = draft.stageIds[current];
  const mins = sid ? (draft.minutes[sid] ?? 0) : 0;
  const elapsed = startedAt === null ? 0 : Math.max(0, Math.floor((nowMs - startedAt) / 1000));
  const left = mins * 60 - elapsed;
  const mmss = (s: number) =>
    `${s < 0 ? '+' : ''}${Math.floor(Math.abs(s) / 60)}:${String(Math.abs(s) % 60).padStart(2, '0')}`;
  const starts = startTimes(draft, start);
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[92dvh] gap-2 overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>
            {draft.focus || 'Run sheet'} · {total(draft)} min
          </DialogDescription>
        </DialogHeader>
        <div className="flex items-center gap-2 rounded-xl bg-primary/8 p-2">
          <div className="min-w-0 flex-1">
            <p className="text-[11px] font-semibold text-primary uppercase">
              {startedAt === null ? 'Ready' : `Block ${current + 1} of ${draft.stageIds.length}`}
            </p>
            <p className="truncate text-[15px] font-bold">
              {sid ? (stageInfo.get(sid)?.name ?? '') : ''}
            </p>
          </div>
          {startedAt !== null && mins > 0 && (
            <span
              className={cn(
                'tabular text-[20px] font-bold',
                left < 0 ? 'text-destructive' : 'text-foreground',
              )}
              aria-label="Time left in this block"
            >
              {mmss(left)}
            </span>
          )}
          {startedAt === null ? (
            <Button size="sm" onClick={() => go(0)}>
              <Play /> Start
            </Button>
          ) : (
            <Button
              size="sm"
              disabled={current >= draft.stageIds.length - 1}
              onClick={() => go(current + 1)}
            >
              Next
            </Button>
          )}
        </div>
        <ol className="space-y-1.5">
          {draft.stageIds.map((s, i) => {
            const m = draft.minutes[s] ?? 0;
            const from = starts[i]!;
            const info = stageInfo.get(s);
            const done = startedAt !== null && i < current;
            const now = startedAt !== null && i === current;
            return (
              <li key={s}>
                <button
                  type="button"
                  onClick={() => go(i)}
                  className={cn(
                    'w-full cursor-pointer rounded-xl border border-l-4 p-2 text-left transition-colors',
                    now ? 'border-primary bg-primary/5' : 'bg-card',
                    done && 'opacity-55',
                  )}
                  style={{ borderLeftColor: info?.color ?? undefined }}
                >
                  <span className="flex items-center gap-2">
                    {done ? (
                      <Check className="size-4 text-success" />
                    ) : (
                      <span className="tabular text-[11px] font-bold text-muted-foreground">
                        {i + 1}
                      </span>
                    )}
                    <span className="min-w-0 flex-1 truncate text-[14px] font-semibold">
                      {info?.name}
                    </span>
                    <span className="tabular text-[11px] text-muted-foreground">
                      {m ? `${clock(from)} · ${m}m` : ''}
                    </span>
                  </span>
                  {(draft.drills[s] ?? []).map((d) => (
                    <span key={d.eventId} className="mt-1 block pl-6 text-[13px]">
                      • {eventInfo.get(d.eventId)?.name}
                      {d.content && (
                        <span className="block text-[12px] text-muted-foreground">{d.content}</span>
                      )}
                    </span>
                  ))}
                </button>
              </li>
            );
          })}
        </ol>
        {draft.notes && (
          <p className="rounded-lg bg-muted/60 p-2 text-[12px] whitespace-pre-wrap">
            {draft.notes}
          </p>
        )}
      </DialogContent>
    </Dialog>
  );
}

// ─── Save as / use for other sessions ────────────────────────────────────────

function SaveAsDialog({
  open,
  onClose,
  body,
}: {
  open: boolean;
  onClose: () => void;
  body: GridBody;
}) {
  const [name, setName] = useState('');
  const save = useSaveSavedPlan();
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Save as a reusable plan</DialogTitle>
          <DialogDescription>
            Start any session from it in one tap. It keeps the blocks, minutes, drills and notes.
          </DialogDescription>
        </DialogHeader>
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            if (!name.trim()) return;
            save.mutate(
              { name: name.trim(), ...body },
              {
                onSuccess: () => {
                  toast.success(`Saved “${name.trim()}”`);
                  setName('');
                  onClose();
                },
                onError: (err) => toast.error(errorMessage(err)),
              },
            );
          }}
        >
          <Input
            autoFocus
            aria-label="Plan name"
            placeholder="e.g. Footwork day"
            maxLength={120}
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" loading={save.isPending} disabled={!name.trim()}>
              <BookmarkPlus /> Save plan
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/** Copy this session's plan to other sessions this week and next, on any of the coach's batches. */
function PlanSessionsDialog({
  open,
  onClose,
  batch,
  batches,
  date,
}: {
  open: boolean;
  onClose: () => void;
  batch: Batch;
  batches: Batch[];
  date: string;
}) {
  const copy = useCopyPlan();
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [overwrite, setOverwrite] = useState(false);
  const monday = startOfWeek(date);
  const days = Array.from({ length: 14 }, (_, i) => addDays(monday, i));
  const options = [batch, ...batches.filter((b) => b.id !== batch.id)].flatMap((b) =>
    days
      .filter((d) => b.weekdays.includes(isoWeekday(d)) && !(b.id === batch.id && d === date))
      .filter(
        (d) => !b.substitution || (d >= b.substitution.fromDate && d <= b.substitution.toDate),
      )
      .map((d) => ({ key: `${b.id}|${d}`, batch: b, date: d })),
  );
  const thisWeek = options.filter((o) => o.batch.id === batch.id && o.date < addDays(monday, 7));
  const toggle = (k: string) =>
    setPicked((p) => {
      const n = new Set(p);
      if (n.has(k)) n.delete(k);
      else n.add(k);
      return n;
    });

  async function run() {
    const byBatch = new Map<string, string[]>();
    for (const k of picked) {
      const [b, d] = k.split('|') as [string, string];
      byBatch.set(b, [...(byBatch.get(b) ?? []), d]);
    }
    let copied = 0;
    let skipped = 0;
    try {
      for (const [toBatchId, toDates] of byBatch) {
        const r = await copy.mutateAsync({
          batchId: batch.id,
          fromDate: date,
          toBatchId,
          toDates,
          overwrite,
        });
        copied += r.copied.length;
        skipped += r.skipped.length;
      }
      toast.success(`Plan used for ${copied} session${copied === 1 ? '' : 's'}`, {
        description: skipped ? `${skipped} skipped (already planned or not running).` : undefined,
      });
      setPicked(new Set());
      onClose();
    } catch (err) {
      toast.error('Could not copy the plan', { description: errorMessage(err) });
    }
  }

  const groups = new Map<string, typeof options>();
  for (const o of options) groups.set(o.batch.id, [...(groups.get(o.batch.id) ?? []), o]);

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Use this plan for other sessions</DialogTitle>
          <DialogDescription>This week and next, on any of your batches.</DialogDescription>
        </DialogHeader>
        {thisWeek.length > 0 && (
          <Button
            variant="tonal"
            size="sm"
            className="w-full"
            onClick={() => setPicked(new Set(thisWeek.map((o) => o.key)))}
          >
            <CalendarRange /> Rest of this week for {batch.name}
          </Button>
        )}
        <div className="space-y-2.5">
          {[...groups.values()].map((list) => (
            <section key={list[0]!.batch.id}>
              <p className="mb-1 truncate text-[12px] font-semibold">{list[0]!.batch.name}</p>
              <div className="flex flex-wrap gap-1">
                {list.map((o) => {
                  const on = picked.has(o.key);
                  return (
                    <button
                      key={o.key}
                      type="button"
                      aria-pressed={on}
                      onClick={() => toggle(o.key)}
                      className={cn(
                        'flex h-8 cursor-pointer flex-col items-center justify-center rounded-lg border px-2 text-[10px] leading-tight transition-colors',
                        on ? 'border-primary bg-primary/10 text-primary' : 'hover:bg-muted',
                      )}
                    >
                      <span className="font-semibold">
                        {WEEKDAYS[isoWeekday(o.date) - 1]?.short}
                      </span>
                      <span className="tabular">{formatShortDate(o.date)}</span>
                    </button>
                  );
                })}
              </div>
            </section>
          ))}
          {!options.length && (
            <p className="text-[13px] text-muted-foreground">
              No other sessions in the next two weeks.
            </p>
          )}
        </div>
        <label className="flex items-center gap-2 text-[13px]">
          <Checkbox checked={overwrite} onCheckedChange={(v) => setOverwrite(v === true)} />
          Replace plans that already exist
        </label>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button loading={copy.isPending} disabled={!picked.size} onClick={() => void run()}>
            Use for {picked.size || ''} session{picked.size === 1 ? '' : 's'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
