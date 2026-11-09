import {
  Check,
  ChevronDown,
  ClipboardList,
  Copy,
  Eye,
  History,
  Library,
  MoreHorizontal,
  PencilLine,
  Save,
  Settings2,
  Trash2,
  Undo2,
} from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import { ConfirmDialog, EmptyState, Field, ListSkeleton, Progress } from '@/components/common';
import { useBatchDateParams } from '@/components/pickers';
import { Button } from '@/components/ui/button';
import { Checkbox, Segmented } from '@/components/ui/controls';
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
  DropdownMenuTrigger,
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/overlays';
import { Badge, Card, Textarea } from '@/components/ui/primitives';
import { errorMessage } from '@/lib/api';
import { addDays, formatLongDate, formatShortDate, isoWeekday, WEEKDAYS } from '@/lib/format';
import { useCopyPlan, useDeletePlan, useLibrary, useSavePlan } from '@/lib/queries';
import type { Batch, LessonPlan, LibraryItem } from '@/lib/types';
import { cn } from '@/lib/utils';
import { TemplateDialog } from './library';
import { whenLabel } from './meta';

// ─── Picker for grid rows/columns ────────────────────────────────────────────

function PickList({
  label,
  items,
  selected,
  onChange,
}: {
  label: string;
  items: LibraryItem[];
  selected: string[];
  onChange: (ids: string[]) => void;
}) {
  // Keep library order, so ticking an item puts it in its usual place.
  const toggle = (id: string, on: boolean) =>
    onChange(
      on
        ? items.map((i) => i.id).filter((x) => x === id || selected.includes(x))
        : selected.filter((x) => x !== id),
    );
  return (
    <div className="min-w-0">
      <div className="mb-1 flex items-center justify-between gap-2 px-1">
        <p className="text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">
          {label} <span className="tabular">{selected.length}</span>
        </p>
        {items.length > 0 && (
          <button
            type="button"
            className="cursor-pointer text-[11px] font-medium text-primary hover:underline"
            onClick={() => onChange(selected.length === items.length ? [] : items.map((i) => i.id))}
          >
            {selected.length === items.length ? 'None' : 'All'}
          </button>
        )}
      </div>
      {items.length === 0 ? (
        <p className="px-1 text-[12px] text-muted-foreground">Empty. Add some in “Template”.</p>
      ) : (
        <div className="max-h-56 space-y-0.5 overflow-y-auto">
          {items.map((i) => (
            <label
              key={i.id}
              className="flex cursor-pointer items-center gap-2 rounded-md px-1.5 py-1 text-[13px] hover:bg-muted"
            >
              <Checkbox
                checked={selected.includes(i.id)}
                onCheckedChange={(c) => toggle(i.id, c === true)}
              />
              {i.color && (
                <span className="size-2 shrink-0 rounded-full" style={{ background: i.color }} />
              )}
              <span className="truncate">{i.name}</span>
            </label>
          ))}
        </div>
      )}
    </div>
  );
}

/** One button for the grid's shape: which stages (columns) and events (rows) the day uses. */
function GridPicker({
  stages,
  events,
  stageIds,
  eventIds,
  onStages,
  onEvents,
}: {
  stages: LibraryItem[];
  events: LibraryItem[];
  stageIds: string[];
  eventIds: string[];
  onStages: (ids: string[]) => void;
  onEvents: (ids: string[]) => void;
}) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className="gap-1.5 px-2.5"
          aria-label={`Grid: ${stageIds.length} stages × ${eventIds.length} events`}
        >
          <Settings2 />
          <span className="tabular">
            {stageIds.length}×{eventIds.length}
          </span>
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[min(30rem,calc(100vw-1.5rem))] p-2.5">
        <p className="mb-2 px-1 text-[12px] text-muted-foreground">
          Stages are the grid’s columns; events are its rows.
        </p>
        <div className="grid grid-cols-2 gap-3">
          <PickList label="Stages" items={stages} selected={stageIds} onChange={onStages} />
          <PickList label="Events" items={events} selected={eventIds} onChange={onEvents} />
        </div>
      </PopoverContent>
    </Popover>
  );
}

// ─── Run sheet: the plan in session order ────────────────────────────────────

type Cells = Record<string, string>; // `${eventId}:${stageId}` → content
const cellKey = (e: string, s: string) => `${e}:${s}`;
type StageInfo = { name: string; color: string | null };
type EventInfo = { name: string; description: string | null };

/** The plan read stage by stage, the way a session actually runs. */
function RunSheet({
  stageIds,
  eventIds,
  cells,
  notes,
  stageMap,
  eventMap,
}: {
  stageIds: string[];
  eventIds: string[];
  cells: Cells;
  notes: string;
  stageMap: Map<string, StageInfo>;
  eventMap: Map<string, EventInfo>;
}) {
  return (
    <ol className="space-y-1.5">
      {stageIds.map((s, i) => {
        const rows = eventIds.filter((e) => cells[cellKey(e, s)]?.trim());
        const color = stageMap.get(s)?.color ?? '#94a3b8';
        return (
          <li key={s}>
            <Card className="overflow-hidden">
              <div className="flex">
                <span aria-hidden className="w-1 shrink-0" style={{ background: color }} />
                <div className="min-w-0 flex-1 px-2.5 py-2">
                  <p className="mb-1 flex items-center gap-2 text-[13px] font-semibold">
                    <span className="tabular flex size-5 items-center justify-center rounded-full bg-muted text-[11px]">
                      {i + 1}
                    </span>
                    {stageMap.get(s)?.name ?? 'Archived'}
                    <span className="ml-auto text-[11px] font-normal text-muted-foreground">
                      {rows.length}/{eventIds.length}
                    </span>
                  </p>
                  {rows.length === 0 ? (
                    <p className="text-[13px] text-muted-foreground">Nothing planned.</p>
                  ) : (
                    <ul className="space-y-1.5">
                      {rows.map((e) => (
                        <li key={e} className="text-[13px] leading-snug">
                          <span className="font-medium">{eventMap.get(e)?.name ?? 'Archived'}</span>
                          <span className="text-muted-foreground"> — </span>
                          <span className="whitespace-pre-wrap">{cells[cellKey(e, s)]}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>
            </Card>
          </li>
        );
      })}
      {notes.trim() && (
        <li>
          <Card className="px-3 py-2.5 text-[13px]">
            <p className="mb-0.5 font-semibold">Notes</p>
            <p className="whitespace-pre-wrap text-muted-foreground">{notes}</p>
          </Card>
        </li>
      )}
    </ol>
  );
}

// ─── Grid editor ─────────────────────────────────────────────────────────────

export function PlanEditor({
  batchId,
  date,
  plan,
  readOnly,
  batches,
  previousPlanDate,
  onDirtyChange,
}: {
  batchId: string;
  date: string;
  plan: LessonPlan | null;
  readOnly: boolean;
  /** The coach's batches, for switching templates in the template dialog. */
  batches: Batch[];
  previousPlanDate?: string | null;
  onDirtyChange?: (dirty: boolean) => void;
}) {
  const stagesQ = useLibrary('stages', { batchId });
  const eventsQ = useLibrary('events', { batchId });
  const save = useSavePlan();
  const del = useDeletePlan();
  const copy = useCopyPlan();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [copyOpen, setCopyOpen] = useState(false);
  const [mode, setMode] = useState<'edit' | 'run'>('edit');
  const [startBlank, setStartBlank] = useState(false);
  const [openEvent, setOpenEvent] = useState<string | null>(null);

  const [stageIds, setStageIds] = useState<string[]>([]);
  const [eventIds, setEventIds] = useState<string[]>([]);
  const [cells, setCells] = useState<Cells>({});
  const [notes, setNotes] = useState('');

  // Initialise from the saved plan, or default to the whole active library for a new plan.
  // Re-sync only when the saved plan (or, for a new plan, the library) actually changes.
  const sourceKey = plan
    ? `plan:${plan.id}:${plan.updatedAt}`
    : `new:${stagesQ.data?.map((s) => s.id).join() ?? ''}:${eventsQ.data?.map((e) => e.id).join() ?? ''}`;
  const [syncedKey, setSyncedKey] = useState<string | null>(null);
  if (sourceKey !== syncedKey) {
    setSyncedKey(sourceKey);
    if (plan) {
      setStageIds(plan.stages.map((s) => s.id));
      setEventIds(plan.events.map((e) => e.id));
      setCells(
        Object.fromEntries(plan.cells.map((c) => [cellKey(c.eventId, c.stageId), c.content])),
      );
      setNotes(plan.notes ?? '');
    } else {
      setStageIds(stagesQ.data?.map((s) => s.id) ?? []);
      setEventIds(eventsQ.data?.map((e) => e.id) ?? []);
      setCells({});
      setNotes('');
    }
  }

  // Names for items that may have been archived since the plan was made.
  const stageMap = useMemo(() => {
    const m = new Map<string, StageInfo>();
    plan?.stages.forEach((s) => m.set(s.id, s));
    stagesQ.data?.forEach((s) => m.set(s.id, { name: s.name, color: s.color ?? null }));
    return m;
  }, [plan, stagesQ.data]);
  const eventMap = useMemo(() => {
    const m = new Map<string, EventInfo>();
    plan?.events.forEach((e) => m.set(e.id, e));
    eventsQ.data?.forEach((e) => m.set(e.id, { name: e.name, description: e.description ?? null }));
    return m;
  }, [plan, eventsQ.data]);

  const has = (e: string, s: string) => Boolean(cells[cellKey(e, s)]?.trim());
  const filled = eventIds.reduce((n, e) => n + stageIds.filter((s) => has(e, s)).length, 0);
  const total = stageIds.length * eventIds.length;
  const percent = total ? (filled / total) * 100 : 0;

  const dirty = useMemo(() => {
    const base = plan
      ? JSON.stringify([
          plan.stages.map((s) => s.id),
          plan.events.map((e) => e.id),
          Object.fromEntries(plan.cells.map((c) => [cellKey(c.eventId, c.stageId), c.content])),
          plan.notes ?? '',
        ])
      : null;
    const now = JSON.stringify([
      stageIds,
      eventIds,
      Object.fromEntries(Object.entries(cells).filter(([, v]) => v.trim())),
      notes,
    ]);
    return base === null ? filled > 0 || notes.trim() !== '' : base !== now;
  }, [plan, stageIds, eventIds, cells, notes, filled]);
  const canEdit = !readOnly;
  const unsaved = canEdit && dirty;

  // Tell the page (to guard day/batch switches) and the browser (to guard closing the tab).
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
    if (!stageIds.length || !eventIds.length || save.isPending) return;
    try {
      await save.mutateAsync({
        batchId,
        date,
        stageIds,
        eventIds,
        notes: notes.trim() || null,
        cells: Object.entries(cells)
          .filter(([, v]) => v.trim())
          .map(([k, content]) => {
            const [eventId, stageId] = k.split(':') as [string, string];
            return { eventId, stageId, content };
          }),
      });
      toast.success('Lesson plan saved');
    } catch (err) {
      toast.error('Could not save plan', { description: errorMessage(err) });
    }
  }
  useEffect(() => {
    submitRef.current = () => void submit();
  });

  // Ctrl/⌘+S saves while there are changes.
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

  function discard() {
    setSyncedKey(null); // Re-reads the saved plan (or library defaults) on the next render.
  }

  function startFromPrevious() {
    if (!previousPlanDate) return;
    copy.mutate(
      { batchId, fromDate: previousPlanDate, toDates: [date] },
      {
        onSuccess: (r) =>
          r.copied.length
            ? toast.success(`Started from ${formatShortDate(previousPlanDate)}’s plan`, {
                description: 'Change what you need, then save.',
              })
            : toast.error('Could not copy that plan to this day'),
        onError: (e) => toast.error('Could not copy plan', { description: errorMessage(e) }),
      },
    );
  }

  if (stagesQ.isPending || eventsQ.isPending) return <ListSkeleton rows={4} />;

  if (canEdit && (stagesQ.data?.length === 0 || eventsQ.data?.length === 0) && !plan) {
    return (
      <EmptyState
        icon={<Library />}
        title="Set up this batch’s plan template"
        description="Add the stages of a session (e.g. Warm-up, Main, Test, Post-play) and the games or drills this batch runs. Each day’s grid is built from them."
        action={
          <TemplateDialog
            batchId={batchId}
            batches={batches}
            trigger={
              <Button>
                <Library /> Set up template
              </Button>
            }
          />
        }
      />
    );
  }

  if (readOnly && !plan) {
    return (
      <EmptyState
        icon={<ClipboardList />}
        title="No plan for this day"
        description="The coach hasn’t planned this session yet."
      />
    );
  }

  const update = (e: string, s: string, v: string) =>
    setCells((c) => ({ ...c, [cellKey(e, s)]: v }));
  const showRun = readOnly || mode === 'run';
  const offerPrevious = canEdit && !plan && !dirty && previousPlanDate && !startBlank;

  return (
    <div className={cn('space-y-2', canEdit && 'pb-20')}>
      {offerPrevious && (
        <div className="flex items-center gap-2 rounded-lg border border-primary/25 bg-primary/5 py-1 pr-1 pl-2.5">
          <History aria-hidden className="size-3.5 shrink-0 text-primary" />
          <p className="min-w-0 flex-1 truncate text-[12px]">
            Start from {whenLabel(previousPlanDate)}’s plan?
          </p>
          <Button
            size="sm"
            variant="ghost"
            className="h-7 px-2 text-[12px] pointer-coarse:h-7"
            onClick={() => setStartBlank(true)}
          >
            Blank
          </Button>
          <Button
            size="sm"
            className="h-7 gap-1 px-2.5 text-[12px] pointer-coarse:h-7 [&_svg:not([class*=size-])]:size-3.5"
            loading={copy.isPending}
            onClick={startFromPrevious}
            aria-label={`Copy ${formatShortDate(previousPlanDate)} plan`}
          >
            <Copy /> Copy
          </Button>
        </div>
      )}

      {/* Toolbar: one compact row — progress, view switch, grid shape, more. */}
      <div className="flex items-center gap-1.5">
        <div
          className={cn(
            'flex h-8 min-w-0 flex-1 items-center gap-2 rounded-lg px-2.5 sm:flex-none',
            total && filled >= total ? 'bg-success/10' : 'bg-muted/70',
          )}
        >
          <Progress
            value={percent}
            tone={total && filled >= total ? 'success' : 'warning'}
            label="Grid filled"
            className="w-12 shrink-0 sm:w-20"
          />
          <span className="tabular truncate text-[12px] font-semibold">
            {`${filled}/${total} filled`}
          </span>
          {plan && !dirty && (
            <Check aria-label="Saved" className="size-3.5 shrink-0 text-success" />
          )}
        </div>
        {canEdit && (
          <>
            <Segmented
              size="sm"
              ariaLabel="View"
              className="ml-auto"
              value={mode}
              onChange={setMode}
              options={[
                {
                  value: 'edit',
                  label: (
                    <span className="inline-flex items-center gap-1">
                      <PencilLine className="size-3.5" />
                      <span className="sr-only sm:not-sr-only">Edit</span>
                    </span>
                  ),
                },
                {
                  value: 'run',
                  label: (
                    <span className="inline-flex items-center gap-1">
                      <Eye className="size-3.5" />
                      <span className="sr-only sm:not-sr-only">Run sheet</span>
                    </span>
                  ),
                },
              ]}
            />
            {mode === 'edit' && (
              <GridPicker
                stages={stagesQ.data ?? []}
                events={eventsQ.data ?? []}
                stageIds={stageIds}
                eventIds={eventIds}
                onStages={setStageIds}
                onEvents={setEventIds}
              />
            )}
            {plan && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon-sm" aria-label="More plan actions">
                    <MoreHorizontal />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent>
                  <DropdownMenuItem onSelect={() => setCopyOpen(true)} disabled={dirty}>
                    <Copy /> Copy to other days…
                  </DropdownMenuItem>
                  <DropdownMenuItem destructive onSelect={() => setConfirmDelete(true)}>
                    <Trash2 /> Delete plan
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </>
        )}
      </div>

      {stageIds.length === 0 || eventIds.length === 0 ? (
        <EmptyState
          title="Pick at least one stage and one event"
          description="Use the grid button above to choose them."
        />
      ) : showRun ? (
        <>
          {/* Read-only on a big screen keeps the familiar grid; the run sheet suits phones. */}
          {readOnly && (
            <ReadGrid
              className="hidden md:block"
              stageIds={stageIds}
              eventIds={eventIds}
              cells={cells}
              stageMap={stageMap}
              eventMap={eventMap}
            />
          )}
          <div className={cn(readOnly && 'md:hidden')}>
            <RunSheet
              stageIds={stageIds}
              eventIds={eventIds}
              cells={cells}
              notes={notes}
              stageMap={stageMap}
              eventMap={eventMap}
            />
          </div>
        </>
      ) : (
        <>
          {/* Desktop: table grid */}
          <Card className="hidden overflow-x-auto md:block">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="border-b bg-muted/40">
                  <th className="w-40 px-3 py-2 text-left text-[12px] font-medium text-muted-foreground">
                    Event
                  </th>
                  {stageIds.map((s) => (
                    <th key={s} className="min-w-44 px-3 py-2 text-left text-[13px] font-medium">
                      <span className="inline-flex items-center gap-2">
                        <span
                          className="size-2.5 rounded-full"
                          style={{ background: stageMap.get(s)?.color ?? '#94a3b8' }}
                        />
                        {stageMap.get(s)?.name ?? 'Archived'}
                        <span className="tabular text-[11px] font-normal text-muted-foreground">
                          {eventIds.filter((e) => has(e, s)).length}/{eventIds.length}
                        </span>
                      </span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {eventIds.map((e) => (
                  <tr key={e} className="border-b align-top last:border-0">
                    <th scope="row" className="px-3 py-2.5 text-left text-[13px] font-medium">
                      {eventMap.get(e)?.name ?? 'Archived'}
                      {eventMap.get(e)?.description && (
                        <p className="mt-0.5 text-xs font-normal text-muted-foreground">
                          {eventMap.get(e)?.description}
                        </p>
                      )}
                    </th>
                    {stageIds.map((s) => (
                      <td key={s} className="p-1">
                        <Textarea
                          aria-label={`${eventMap.get(e)?.name} – ${stageMap.get(s)?.name}`}
                          value={cells[cellKey(e, s)] ?? ''}
                          onChange={(ev) => update(e, s, ev.target.value)}
                          placeholder="What will you do?"
                          rows={2}
                          className="min-h-16 resize-y border-transparent bg-muted/30 text-[13px] shadow-none focus-visible:bg-card"
                        />
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>

          {/* Mobile: one collapsible card per event */}
          <div className="space-y-1.5 md:hidden">
            {eventIds.map((e, idx) => {
              const n = stageIds.filter((s) => has(e, s)).length;
              const open = openEvent === null ? idx === 0 || n > 0 : openEvent === e;
              return (
                <Card key={e} className="overflow-hidden">
                  <button
                    type="button"
                    aria-expanded={open}
                    onClick={() => setOpenEvent(open ? '' : e)}
                    className="flex w-full cursor-pointer items-center gap-2 px-2.5 py-2 text-left"
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[14px] font-semibold">
                        {eventMap.get(e)?.name ?? 'Archived'}
                      </span>
                      {eventMap.get(e)?.description && (
                        <span className="block truncate text-[12px] text-muted-foreground">
                          {eventMap.get(e)?.description}
                        </span>
                      )}
                    </span>
                    <Badge
                      variant={n === stageIds.length ? 'success' : n ? 'warning' : 'muted'}
                      className="tabular"
                    >
                      {n}/{stageIds.length}
                    </Badge>
                    <ChevronDown
                      className={cn(
                        'size-4 shrink-0 text-muted-foreground transition-transform',
                        open && 'rotate-180',
                      )}
                    />
                  </button>
                  {open && (
                    <div className="space-y-1.5 border-t px-2.5 pt-1.5 pb-2.5">
                      {stageIds.map((s) => (
                        <label key={s} className="block space-y-1">
                          <span className="inline-flex items-center gap-1.5 text-[12px] font-medium text-muted-foreground">
                            <span
                              className="size-2 rounded-full"
                              style={{ background: stageMap.get(s)?.color ?? '#94a3b8' }}
                            />
                            {stageMap.get(s)?.name ?? 'Archived'}
                          </span>
                          <Textarea
                            value={cells[cellKey(e, s)] ?? ''}
                            onChange={(ev) => update(e, s, ev.target.value)}
                            rows={2}
                            placeholder="What will you do?"
                            className="min-h-14 text-[14px]"
                          />
                        </label>
                      ))}
                    </div>
                  )}
                </Card>
              );
            })}
          </div>
        </>
      )}

      {canEdit && mode === 'edit' ? (
        <Field label="Session notes" htmlFor="plan-notes">
          <Textarea
            id="plan-notes"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={2}
            placeholder="Equipment, focus areas, reminders…"
          />
        </Field>
      ) : (
        readOnly &&
        notes.trim() && (
          <div className="hidden md:block">
            <p className="mb-1 text-[13px] font-medium">Session notes</p>
            <p className="text-sm whitespace-pre-wrap text-muted-foreground">{notes}</p>
          </div>
        )
      )}

      {unsaved && (
        <div className="fixed inset-x-0 bottom-[calc(4rem+env(safe-area-inset-bottom))] z-20 animate-rise px-3 lg:bottom-6 lg:left-64">
          <div className="mx-auto flex max-w-xl items-center gap-2 rounded-2xl border bg-card p-2.5 pl-3.5 shadow-xl">
            <p className="min-w-0 flex-1 text-[13px] leading-tight">
              Unsaved changes
              <span className="block text-[11px] text-muted-foreground">
                {formatShortDate(date)} · {filled}/{total} filled
              </span>
            </p>
            <Button size="sm" variant="ghost" onClick={discard}>
              <Undo2 /> Discard
            </Button>
            <Button
              size="sm"
              loading={save.isPending}
              onClick={() => void submit()}
              disabled={!stageIds.length || !eventIds.length}
            >
              <Save /> Save plan
            </Button>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title="Delete this plan?"
        description={`The lesson plan for ${formatLongDate(date)} will be removed.`}
        confirmLabel="Delete plan"
        destructive
        loading={del.isPending}
        onConfirm={() =>
          del.mutate(
            { batchId, date },
            {
              onSuccess: () => (setConfirmDelete(false), toast.success('Plan deleted')),
              onError: (e) => toast.error(errorMessage(e)),
            },
          )
        }
      />
      {plan && (
        <CopyDialog open={copyOpen} onOpenChange={setCopyOpen} batchId={batchId} fromDate={date} />
      )}
    </div>
  );
}

function ReadGrid({
  className,
  stageIds,
  eventIds,
  cells,
  stageMap,
  eventMap,
}: {
  className?: string;
  stageIds: string[];
  eventIds: string[];
  cells: Cells;
  stageMap: Map<string, StageInfo>;
  eventMap: Map<string, EventInfo>;
}) {
  return (
    <Card className={cn('overflow-x-auto', className)}>
      <table className="w-full border-collapse text-[13px]">
        <thead>
          <tr className="border-b bg-muted/40">
            <th className="w-40 px-3 py-2 text-left text-[12px] font-medium text-muted-foreground">
              Event
            </th>
            {stageIds.map((s) => (
              <th key={s} className="min-w-40 px-3 py-2 text-left font-medium">
                <span className="inline-flex items-center gap-2">
                  <span
                    className="size-2.5 rounded-full"
                    style={{ background: stageMap.get(s)?.color ?? '#94a3b8' }}
                  />
                  {stageMap.get(s)?.name ?? 'Archived'}
                </span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {eventIds.map((e) => (
            <tr key={e} className="border-b align-top last:border-0">
              <th scope="row" className="px-3 py-2 text-left font-medium">
                {eventMap.get(e)?.name ?? 'Archived'}
              </th>
              {stageIds.map((s) => (
                <td key={s} className="px-3 py-2 whitespace-pre-wrap">
                  {cells[cellKey(e, s)] || <span className="text-muted-foreground/50">—</span>}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </Card>
  );
}

function CopyDialog({
  open,
  onOpenChange,
  batchId,
  fromDate,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  batchId: string;
  fromDate: string;
}) {
  const { batch } = useBatchDateParams();
  const copy = useCopyPlan();
  const [selected, setSelected] = useState<string[]>([]);
  const [overwrite, setOverwrite] = useState(false);
  // Next 14 session days after the source date.
  const candidates = useMemo(() => {
    const out: string[] = [];
    for (
      let d = addDays(fromDate, 1);
      out.length < 14 && d <= addDays(fromDate, 60);
      d = addDays(d, 1)
    ) {
      if (!batch || batch.weekdays.includes(isoWeekday(d))) out.push(d);
    }
    return out;
  }, [fromDate, batch]);
  const sameWeekday = candidates.filter((d) => isoWeekday(d) === isoWeekday(fromDate));
  const restOfWeek = candidates.filter((d) => d <= addDays(fromDate, 7 - isoWeekday(fromDate)));

  async function submit() {
    try {
      const res = await copy.mutateAsync({ batchId, fromDate, toDates: selected, overwrite });
      toast.success(`Copied to ${res.copied.length} day${res.copied.length === 1 ? '' : 's'}`, {
        description: res.skipped.length
          ? `${res.skipped.length} day(s) already had a plan or have no session, so were skipped.`
          : undefined,
      });
      setSelected([]);
      onOpenChange(false);
    } catch (err) {
      toast.error('Could not copy plan', { description: errorMessage(err) });
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Copy plan</DialogTitle>
          <DialogDescription>
            Reuse {formatLongDate(fromDate)}’s grid on other session days.
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-wrap gap-1.5">
          {restOfWeek.length > 0 && (
            <Button size="sm" variant="outline" onClick={() => setSelected(restOfWeek)}>
              Rest of this week
            </Button>
          )}
          {sameWeekday.length > 0 && (
            <Button size="sm" variant="outline" onClick={() => setSelected(sameWeekday)}>
              Every {WEEKDAYS[isoWeekday(fromDate) - 1]?.long}
            </Button>
          )}
          {selected.length > 0 && (
            <Button size="sm" variant="ghost" onClick={() => setSelected([])}>
              Clear
            </Button>
          )}
        </div>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {candidates.map((d) => {
            const on = selected.includes(d);
            return (
              <button
                key={d}
                type="button"
                aria-pressed={on}
                onClick={() => setSelected((s) => (on ? s.filter((x) => x !== d) : [...s, d]))}
                className={cn(
                  'flex cursor-pointer items-center justify-between rounded-lg border px-3 py-2 text-sm transition-colors',
                  on ? 'border-primary bg-accent' : 'hover:bg-muted',
                )}
              >
                <span>
                  {WEEKDAYS[isoWeekday(d) - 1]?.short} {formatShortDate(d)}
                </span>
                {on && <Check className="size-4 text-primary" />}
              </button>
            );
          })}
        </div>
        <label className="flex cursor-pointer items-center gap-2.5 text-sm">
          <Checkbox checked={overwrite} onCheckedChange={(c) => setOverwrite(c === true)} />
          Replace plans that already exist on those days
        </label>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            disabled={!selected.length}
            loading={copy.isPending}
            onClick={() => void submit()}
          >
            Copy to {selected.length || ''} day{selected.length === 1 ? '' : 's'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
