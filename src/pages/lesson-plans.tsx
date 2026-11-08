import {
  ArrowDown,
  ArrowUp,
  Archive,
  ArchiveRestore,
  Check,
  ClipboardList,
  Copy,
  Library,
  Plus,
  Save,
  Settings2,
  Trash2,
} from 'lucide-react';
import { useMemo, useState, type ReactNode } from 'react';
import { toast } from 'sonner';
import { useUser } from '@/app/auth';
import {
  ConfirmDialog,
  EmptyState,
  ErrorState,
  Field,
  ListSkeleton,
  PageHeader,
} from '@/components/common';
import { BatchSelect, DateStepper, useBatchDateParams } from '@/components/pickers';
import { Button } from '@/components/ui/button';
import { Checkbox, Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/controls';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/overlays';
import { Badge, Card, Input, Textarea } from '@/components/ui/primitives';
import { errorMessage } from '@/lib/api';
import {
  addDays,
  formatLongDate,
  formatShortDate,
  isoWeekday,
  startOfWeek,
  today,
  WEEKDAYS,
} from '@/lib/format';
import {
  useCopyPlan,
  useDeletePlan,
  useLibrary,
  usePlanCalendar,
  usePlanDay,
  useReorderLibrary,
  useSaveLibraryItem,
  useSavePlan,
} from '@/lib/queries';
import type { LessonPlan, LibraryItem } from '@/lib/types';
import { cn } from '@/lib/utils';

const STAGE_COLORS = ['#22c55e', '#4f46e5', '#f59e0b', '#ef4444', '#06b6d4', '#a855f7', '#64748b'];

// ─── Week strip ──────────────────────────────────────────────────────────────

function WeekStrip({
  batchId,
  date,
  onPick,
}: {
  batchId: string;
  date: string;
  onPick: (d: string) => void;
}) {
  const from = startOfWeek(date);
  const cal = usePlanCalendar({ batchId, from, to: addDays(from, 6) });
  return (
    <div className="mb-5 grid grid-cols-7 gap-1.5">
      {Array.from({ length: 7 }, (_, i) => {
        const d = addDays(from, i);
        const info = cal.data?.days.find((x) => x.date === d);
        const selected = d === date;
        const full = info?.planId && info.totalCells > 0 && info.filledCells >= info.totalCells;
        return (
          <button
            key={d}
            onClick={() => onPick(d)}
            className={cn(
              'flex cursor-pointer flex-col items-center gap-1 rounded-xl border bg-card py-2 transition-all hover:border-primary/50',
              selected && 'border-primary ring-2 ring-primary/20',
              // Non-training / cancelled days: visibly quieter without dropping text contrast.
              info &&
                (!info.isSessionDay || info.cancelled) &&
                'border-dashed bg-muted/50 shadow-none',
              info?.cancelled && 'line-through',
            )}
            aria-pressed={selected}
            aria-label={`${formatLongDate(d)}${info?.cancelled ? ` (cancelled: ${info.cancelled})` : ''}`}
            title={info?.cancelled ? `Cancelled: ${info.cancelled}` : undefined}
          >
            <span className="text-[11px] font-medium text-muted-foreground uppercase">
              {WEEKDAYS[i]?.short}
            </span>
            <span
              className={cn('tabular text-base font-semibold', d === today() && 'text-primary')}
            >
              {Number(d.slice(8))}
            </span>
            <span
              className={cn(
                'size-1.5 rounded-full',
                info?.planId
                  ? full
                    ? 'bg-success'
                    : 'bg-warning'
                  : info?.isSessionDay
                    ? 'bg-muted-foreground/30'
                    : 'bg-transparent',
              )}
            />
          </button>
        );
      })}
    </div>
  );
}

// ─── Picker for grid rows/columns ────────────────────────────────────────────

function ItemsPicker({
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
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm">
          <Settings2 /> {label} ({selected.length})
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-64">
        <p className="mb-2 text-xs font-medium text-muted-foreground">
          Choose {label.toLowerCase()} for this day
        </p>
        {items.length === 0 && (
          <p className="text-sm text-muted-foreground">
            Your library is empty. Add some in “Library”.
          </p>
        )}
        <div className="max-h-64 space-y-1 overflow-y-auto">
          {items.map((i) => {
            const on = selected.includes(i.id);
            return (
              <label
                key={i.id}
                className="flex cursor-pointer items-center gap-2.5 rounded-md px-2 py-1.5 text-sm hover:bg-muted"
              >
                <Checkbox
                  checked={on}
                  onCheckedChange={(c) =>
                    onChange(c ? [...selected, i.id] : selected.filter((x) => x !== i.id))
                  }
                />
                {i.color && (
                  <span className="size-2.5 rounded-full" style={{ background: i.color }} />
                )}
                {i.name}
              </label>
            );
          })}
        </div>
      </PopoverContent>
    </Popover>
  );
}

// ─── Grid editor ─────────────────────────────────────────────────────────────

type Cells = Record<string, string>; // `${eventId}:${stageId}` → content
const cellKey = (e: string, s: string) => `${e}:${s}`;

function PlanEditor({
  batchId,
  date,
  plan,
  readOnly,
  libraryCoachId,
}: {
  batchId: string;
  date: string;
  plan: LessonPlan | null;
  readOnly: boolean;
  libraryCoachId: string;
}) {
  const libQuery = readOnly ? { coachId: libraryCoachId } : {};
  const stagesQ = useLibrary('stages', libQuery);
  const eventsQ = useLibrary('events', libQuery);
  const save = useSavePlan();
  const del = useDeletePlan();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [copyOpen, setCopyOpen] = useState(false);

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
    const m = new Map<string, { name: string; color: string | null }>();
    plan?.stages.forEach((s) => m.set(s.id, s));
    stagesQ.data?.forEach((s) => m.set(s.id, { name: s.name, color: s.color ?? null }));
    return m;
  }, [plan, stagesQ.data]);
  const eventMap = useMemo(() => {
    const m = new Map<string, { name: string; description: string | null }>();
    plan?.events.forEach((e) => m.set(e.id, e));
    eventsQ.data?.forEach((e) => m.set(e.id, { name: e.name, description: e.description ?? null }));
    return m;
  }, [plan, eventsQ.data]);

  const filled = Object.entries(cells).filter(([k, v]) => {
    const [e, s] = k.split(':');
    return v.trim() && eventIds.includes(e!) && stageIds.includes(s!);
  }).length;
  const total = stageIds.length * eventIds.length;

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

  async function submit() {
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

  if (stagesQ.isPending || eventsQ.isPending) return <ListSkeleton rows={4} />;

  if (!readOnly && (stagesQ.data?.length === 0 || eventsQ.data?.length === 0) && !plan) {
    return (
      <EmptyState
        icon={<Library />}
        title="Set up your library first"
        description="Add the stages of a session (e.g. Warm-up, Main, Test, Post-play) and the games or drills you run. Then build each day’s grid from them."
        action={
          <LibraryDialog
            trigger={
              <Button>
                <Library /> Open library
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

  return (
    <div className="space-y-4 pb-24">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Badge
            variant={total && filled >= total ? 'success' : filled ? 'warning' : 'muted'}
            className="tabular"
          >
            {filled}/{total} filled
          </Badge>
          {plan && <span className="text-xs text-muted-foreground">Saved</span>}
        </div>
        {!readOnly && (
          <div className="flex flex-wrap gap-2">
            <ItemsPicker
              label="Stages"
              items={stagesQ.data ?? []}
              selected={stageIds}
              onChange={setStageIds}
            />
            <ItemsPicker
              label="Events"
              items={eventsQ.data ?? []}
              selected={eventIds}
              onChange={setEventIds}
            />
            {plan && (
              <>
                <Button variant="outline" size="sm" onClick={() => setCopyOpen(true)}>
                  <Copy /> Copy to…
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                  onClick={() => setConfirmDelete(true)}
                >
                  <Trash2 /> Delete plan
                </Button>
              </>
            )}
          </div>
        )}
      </div>

      {stageIds.length === 0 || eventIds.length === 0 ? (
        <EmptyState
          title="Pick at least one stage and one event"
          description="Use the Stages and Events buttons above."
        />
      ) : (
        <>
          {/* Desktop: table grid */}
          <Card className="hidden overflow-x-auto md:block">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="border-b bg-muted/40">
                  <th className="w-44 px-3 py-2.5 text-left font-medium text-muted-foreground">
                    Event
                  </th>
                  {stageIds.map((s) => (
                    <th key={s} className="min-w-48 px-3 py-2.5 text-left font-medium">
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
                    <th scope="row" className="px-3 py-3 text-left font-medium">
                      {eventMap.get(e)?.name ?? 'Archived'}
                      {eventMap.get(e)?.description && (
                        <p className="mt-0.5 text-xs font-normal text-muted-foreground">
                          {eventMap.get(e)?.description}
                        </p>
                      )}
                    </th>
                    {stageIds.map((s) => (
                      <td key={s} className="p-1.5">
                        {readOnly ? (
                          <p className="min-h-16 rounded-lg p-2 whitespace-pre-wrap">
                            {cells[cellKey(e, s)] || (
                              <span className="text-muted-foreground/50">—</span>
                            )}
                          </p>
                        ) : (
                          <Textarea
                            aria-label={`${eventMap.get(e)?.name} – ${stageMap.get(s)?.name}`}
                            value={cells[cellKey(e, s)] ?? ''}
                            onChange={(ev) => update(e, s, ev.target.value)}
                            placeholder="What will you do?"
                            rows={3}
                            className="min-h-20 resize-y border-transparent bg-muted/30 shadow-none focus-visible:bg-card"
                          />
                        )}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>

          {/* Mobile: one card per event */}
          <div className="space-y-3 md:hidden">
            {eventIds.map((e) => (
              <Card key={e} className="p-4">
                <p className="mb-3 font-semibold">{eventMap.get(e)?.name ?? 'Archived'}</p>
                <div className="space-y-3">
                  {stageIds.map((s) => (
                    <div key={s} className="space-y-1.5">
                      <p className="inline-flex items-center gap-2 text-xs font-medium text-muted-foreground">
                        <span
                          className="size-2 rounded-full"
                          style={{ background: stageMap.get(s)?.color ?? '#94a3b8' }}
                        />
                        {stageMap.get(s)?.name ?? 'Archived'}
                      </p>
                      {readOnly ? (
                        <p className="text-sm whitespace-pre-wrap">{cells[cellKey(e, s)] || '—'}</p>
                      ) : (
                        <Textarea
                          value={cells[cellKey(e, s)] ?? ''}
                          onChange={(ev) => update(e, s, ev.target.value)}
                          rows={2}
                          placeholder="What will you do?"
                        />
                      )}
                    </div>
                  ))}
                </div>
              </Card>
            ))}
          </div>
        </>
      )}

      <Field label="Session notes" htmlFor="plan-notes">
        {readOnly ? (
          <p className="text-sm whitespace-pre-wrap text-muted-foreground">{notes || '—'}</p>
        ) : (
          <Textarea
            id="plan-notes"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={2}
            placeholder="Equipment, focus areas, reminders…"
          />
        )}
      </Field>

      {!readOnly && dirty && (
        <div className="fixed inset-x-0 bottom-[calc(4rem+env(safe-area-inset-bottom))] z-20 animate-rise px-3 lg:bottom-6 lg:left-64">
          <div className="mx-auto flex max-w-xl items-center gap-3 rounded-2xl border bg-card p-3 shadow-xl">
            <p className="flex-1 text-sm">Unsaved changes to {formatShortDate(date)}</p>
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

  async function submit() {
    try {
      const res = await copy.mutateAsync({ batchId, fromDate, toDates: selected, overwrite });
      toast.success(`Copied to ${res.copied.length} day${res.copied.length === 1 ? '' : 's'}`, {
        description: res.skipped.length
          ? `${res.skipped.length} day(s) already had a plan and were skipped.`
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
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {candidates.map((d) => {
            const on = selected.includes(d);
            return (
              <button
                key={d}
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

// ─── Library management ──────────────────────────────────────────────────────

function LibraryList({ kind }: { kind: 'stages' | 'events' }) {
  const list = useLibrary(kind, { includeArchived: 'true' });
  const saveItem = useSaveLibraryItem(kind);
  const reorder = useReorderLibrary(kind);
  const [name, setName] = useState('');
  const [color, setColor] = useState(STAGE_COLORS[0]!);
  const [editing, setEditing] = useState<string | null>(null);
  const [editName, setEditName] = useState('');

  const active = list.data?.filter((i) => !i.isArchived) ?? [];
  const archived = list.data?.filter((i) => i.isArchived) ?? [];

  async function add() {
    if (!name.trim()) return;
    try {
      await saveItem.mutateAsync(
        kind === 'stages' ? { name: name.trim(), color } : { name: name.trim() },
      );
      setName('');
      setColor(STAGE_COLORS[(active.length + 1) % STAGE_COLORS.length]!);
    } catch (err) {
      toast.error(errorMessage(err));
    }
  }

  function move(index: number, delta: number) {
    const ids = active.map((i) => i.id);
    const [moved] = ids.splice(index, 1);
    ids.splice(index + delta, 0, moved!);
    reorder.mutate(ids, { onError: (e) => toast.error(errorMessage(e)) });
  }

  return (
    <div className="space-y-4">
      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          void add();
        }}
      >
        {kind === 'stages' && (
          <Popover>
            <PopoverTrigger asChild>
              <button
                type="button"
                aria-label="Stage colour"
                className="size-10 shrink-0 cursor-pointer rounded-lg border"
                style={{ background: color }}
              />
            </PopoverTrigger>
            <PopoverContent className="flex w-auto gap-1.5 p-2">
              {STAGE_COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  aria-label={c}
                  onClick={() => setColor(c)}
                  className={cn(
                    'size-7 cursor-pointer rounded-md',
                    c === color && 'ring-2 ring-ring ring-offset-2',
                  )}
                  style={{ background: c }}
                />
              ))}
            </PopoverContent>
          </Popover>
        )}
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder={kind === 'stages' ? 'e.g. Warm-up' : 'e.g. Footwork ladder'}
        />
        <Button type="submit" loading={saveItem.isPending} disabled={!name.trim()}>
          <Plus /> Add
        </Button>
      </form>

      {list.isPending ? (
        <ListSkeleton rows={3} />
      ) : (
        <ul className="divide-y rounded-xl border">
          {active.length === 0 && (
            <li className="p-4 text-sm text-muted-foreground">Nothing here yet.</li>
          )}
          {active.map((i, idx) => (
            <li key={i.id} className="flex items-center gap-2 px-3 py-2">
              {i.color && (
                <span className="size-3 shrink-0 rounded-full" style={{ background: i.color }} />
              )}
              {editing === i.id ? (
                <form
                  className="flex flex-1 gap-2"
                  onSubmit={(e) => {
                    e.preventDefault();
                    saveItem.mutate(
                      { id: i.id, name: editName },
                      {
                        onSuccess: () => setEditing(null),
                        onError: (err) => toast.error(errorMessage(err)),
                      },
                    );
                  }}
                >
                  <Input
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    autoFocus
                    className="h-8"
                  />
                  <Button size="sm" type="submit">
                    Save
                  </Button>
                </form>
              ) : (
                <button
                  className="flex-1 cursor-text text-left text-sm"
                  onClick={() => (setEditing(i.id), setEditName(i.name))}
                >
                  {i.name}
                </button>
              )}
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label="Move up"
                disabled={idx === 0}
                onClick={() => move(idx, -1)}
              >
                <ArrowUp />
              </Button>
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label="Move down"
                disabled={idx === active.length - 1}
                onClick={() => move(idx, 1)}
              >
                <ArrowDown />
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="text-muted-foreground"
                onClick={() => saveItem.mutate({ id: i.id, isArchived: true })}
              >
                <Archive /> Archive
              </Button>
            </li>
          ))}
        </ul>
      )}
      {archived.length > 0 && (
        <details className="text-sm">
          <summary className="cursor-pointer text-muted-foreground">
            Archived ({archived.length})
          </summary>
          <ul className="mt-2 space-y-1">
            {archived.map((i) => (
              <li
                key={i.id}
                className="flex items-center justify-between rounded-lg px-3 py-1.5 text-muted-foreground hover:bg-muted"
              >
                {i.name}
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => saveItem.mutate({ id: i.id, isArchived: false })}
                >
                  <ArchiveRestore /> Restore
                </Button>
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}

function LibraryDialog({ trigger }: { trigger: ReactNode }) {
  return (
    <Dialog>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Your lesson library</DialogTitle>
          <DialogDescription>
            Stages are the columns of your daily grid; events are the rows. Only you can see and
            edit your library.
          </DialogDescription>
        </DialogHeader>
        <Tabs defaultValue="stages">
          <TabsList>
            <TabsTrigger value="stages">Stages</TabsTrigger>
            <TabsTrigger value="events">Events</TabsTrigger>
          </TabsList>
          <TabsContent value="stages" className="mt-4">
            <LibraryList kind="stages" />
          </TabsContent>
          <TabsContent value="events" className="mt-4">
            <LibraryList kind="events" />
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}

// ─── Page ────────────────────────────────────────────────────────────────────

export function LessonPlansPage() {
  const user = useUser();
  const isCoach = user.role === 'coach';
  const { batches, batchId, date, batch, setBatch, setDate } = useBatchDateParams();
  const day = usePlanDay(batchId || undefined, date);

  return (
    <div>
      <PageHeader
        title="Lesson plans"
        description={
          isCoach
            ? 'Plan each session as a grid of events × stages. Copy a good day to the rest of the week.'
            : 'Review what coaches have planned for each batch.'
        }
        actions={
          isCoach && (
            <LibraryDialog
              trigger={
                <Button variant="outline">
                  <Library /> Library
                </Button>
              }
            />
          )
        }
      />
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center">
        <BatchSelect
          value={batchId}
          onChange={setBatch}
          batches={batches.data}
          loading={batches.isPending}
        />
        <DateStepper value={date} onChange={setDate} />
      </div>

      {!batchId ? (
        <EmptyState
          icon={<ClipboardList />}
          title="Pick a batch"
          description="Choose a batch to see or build its plan."
        />
      ) : (
        <>
          <WeekStrip batchId={batchId} date={date} onPick={setDate} />
          <h2 className="mb-3 text-lg font-semibold">
            {formatLongDate(date)}
            {day.data && !day.data.isSessionDay && (
              <Badge variant="muted" className="ml-2 align-middle">
                No regular session
              </Badge>
            )}
          </h2>
          {day.isPending ? (
            <ListSkeleton rows={4} />
          ) : day.isError ? (
            <ErrorState error={day.error} onRetry={() => void day.refetch()} />
          ) : (
            <PlanEditor
              key={`${batchId}:${date}`}
              batchId={batchId}
              date={date}
              plan={day.data.plan}
              readOnly={!isCoach}
              libraryCoachId={batch?.coach.id ?? ''}
            />
          )}
        </>
      )}
    </div>
  );
}
