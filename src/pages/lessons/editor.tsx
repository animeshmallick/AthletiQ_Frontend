/**
 * The lesson-plan editor: timed blocks, each with its drills. Blocks and drills reorder by drag
 * (handle) or with the menu's move up/down; a live meter shows how the blocks add up against the
 * session length, which they must match exactly.
 */
import {
  closestCenter,
  DndContext,
  KeyboardSensor,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import { restrictToParentElement, restrictToVerticalAxis } from '@dnd-kit/modifiers';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import {
  ArrowDown,
  ArrowUp,
  Check,
  ChevronDown,
  Copy,
  GripVertical,
  Minus,
  MoreVertical,
  Plus,
  Trash2,
} from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/overlays';
import { Input, Textarea } from '@/components/ui/primitives';
import type { PlanBlocksBody } from '@/lib/queries';
import type { PlanBlock, PlanDrill } from '@/lib/types';
import { cn } from '@/lib/utils';
import { BLOCK_COLORS, BLOCK_SUGGESTIONS } from './meta';

export interface DraftDrill {
  key: string;
  name: string;
  minutes: number | null;
  reps: string | null;
  note: string | null;
}
export interface DraftBlock {
  key: string;
  name: string;
  color: string | null;
  minutes: number;
  drills: DraftDrill[];
}

let seq = 0;
const newKey = () => `k${++seq}`;

export const toDraft = (blocks: PlanBlock[]): DraftBlock[] =>
  blocks.map((b) => ({
    key: newKey(),
    name: b.name,
    color: b.color,
    minutes: b.minutes,
    drills: b.drills.map((d) => ({ key: newKey(), ...d })),
  }));

const clean = (s: string | null) => (s?.trim() ? s.trim() : null);

/** Draft → API body; unnamed drills are dropped. */
export const toBody = (blocks: DraftBlock[]): PlanBlocksBody =>
  blocks.map((b) => ({
    name: b.name.trim(),
    color: b.color,
    minutes: b.minutes,
    drills: b.drills
      .filter((d) => d.name.trim())
      .map((d) => ({
        name: d.name.trim(),
        minutes: d.minutes,
        reps: clean(d.reps),
        note: clean(d.note),
      })),
  }));

export const totalOf = (blocks: { minutes: number }[]) =>
  blocks.reduce((n, b) => n + (b.minutes || 0), 0);

/** Why the draft can't be saved yet, or null. */
export function draftProblem(blocks: DraftBlock[], target: number | null): string | null {
  if (!blocks.length) return 'Add at least one block.';
  const unnamed = blocks.find((b) => !b.name.trim());
  if (unnamed) return 'Every block needs a name.';
  for (const b of blocks) {
    const used = b.drills.reduce((n, d) => n + (d.minutes ?? 0), 0);
    if (used > b.minutes) return `${b.name}: drills take ${used} min, more than its ${b.minutes}.`;
  }
  if (target === null) return null;
  const total = totalOf(blocks);
  if (total < target) return `Add ${target - total} more min to match the ${target}-min session.`;
  if (total > target) return `Remove ${total - target} min to fit the ${target}-min session.`;
  return null;
}

/** A starting point: warm-up, the main block and a cool-down that add up to the session. */
export function starterBlocks(minutes: number): DraftBlock[] {
  const edge = minutes >= 45 ? 10 : Math.max(1, Math.floor(minutes / 6));
  return [
    { key: newKey(), name: 'Warm-up', color: '#22c55e', minutes: edge, drills: [] },
    {
      key: newKey(),
      name: 'Main session',
      color: '#f59e0b',
      minutes: Math.max(1, minutes - 2 * edge),
      drills: [],
    },
    { key: newKey(), name: 'Cool down', color: '#06b6d4', minutes: edge, drills: [] },
  ];
}

// ─── Meter ───────────────────────────────────────────────────────────────────

/** "45 / 60 min" with a bar of the blocks in their colours, against the session length. */
export function MinutesMeter({
  blocks,
  target,
  onFit,
}: {
  blocks: { name: string; color: string | null; minutes: number }[];
  target: number | null;
  /** Adjusts the last block so the plan fits exactly. */
  onFit?: () => void;
}) {
  const total = totalOf(blocks);
  const scale = Math.max(total, target ?? 0) || 1;
  const fits = target !== null && total === target;
  const over = target !== null && total > target;
  return (
    <div className="space-y-1" aria-live="polite">
      <div className="flex items-center justify-between gap-2 text-[12px]">
        <span className="tabular font-semibold">
          <span className={cn(fits ? 'text-success' : over ? 'text-destructive' : '')}>
            {total}
          </span>
          {target !== null && <span className="text-muted-foreground"> / {target} min</span>}
          {target === null && <span className="text-muted-foreground"> min</span>}
        </span>
        {target !== null &&
          (fits ? (
            <span className="inline-flex items-center gap-1 font-semibold text-success">
              <Check className="size-3.5" /> Fits the session
            </span>
          ) : (
            <span className="flex items-center gap-1.5">
              <span
                className={cn(
                  'font-semibold',
                  over ? 'text-destructive' : 'text-warning-foreground dark:text-warning',
                )}
              >
                {over ? `${total - target} min over` : `${target - total} min left`}
              </span>
              {onFit && blocks.length > 0 && (
                <button
                  type="button"
                  onClick={onFit}
                  className="cursor-pointer rounded-md bg-primary/10 px-1.5 py-0.5 text-[11px] font-semibold text-primary hover:bg-primary/15"
                >
                  Fit last block
                </button>
              )}
            </span>
          ))}
      </div>
      <div
        className="relative flex h-2 gap-0.5 overflow-hidden rounded-full bg-muted"
        role="img"
        aria-label={blocks.map((b) => `${b.name} ${b.minutes} min`).join(', ')}
      >
        {blocks.map((b, i) => (
          <span
            key={i}
            className="h-full first:rounded-l-full last:rounded-r-full"
            style={{
              width: `${(b.minutes / scale) * 100}%`,
              background: b.color ?? 'var(--color-primary)',
            }}
          />
        ))}
        {target !== null && total > target && (
          <span
            aria-hidden
            className="absolute inset-y-0 w-0.5 bg-foreground"
            style={{ left: `${(target / scale) * 100}%` }}
          />
        )}
      </div>
    </div>
  );
}

// ─── Sorting ─────────────────────────────────────────────────────────────────

function useListSensors() {
  return useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 120, tolerance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
}

/** A vertical list whose items reorder by dragging their handle. */
function SortableList<T extends { key: string }>({
  items,
  onReorder,
  children,
  className,
}: {
  items: T[];
  onReorder: (next: T[]) => void;
  children: ReactNode;
  className?: string;
}) {
  const sensors = useListSensors();
  const onDragEnd = ({ active, over }: DragEndEvent) => {
    if (!over || active.id === over.id) return;
    const from = items.findIndex((i) => i.key === active.id);
    const to = items.findIndex((i) => i.key === over.id);
    if (from >= 0 && to >= 0) onReorder(arrayMove(items, from, to));
  };
  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      modifiers={[restrictToVerticalAxis, restrictToParentElement]}
      onDragEnd={onDragEnd}
    >
      <SortableContext items={items.map((i) => i.key)} strategy={verticalListSortingStrategy}>
        <div className={className}>{children}</div>
      </SortableContext>
    </DndContext>
  );
}

function Sortable({
  id,
  label,
  children,
  className,
}: {
  id: string;
  label: string;
  children: (handle: ReactNode) => ReactNode;
  className?: string;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id });
  const handle = (
    <button
      type="button"
      ref={setActivatorNodeRef}
      {...attributes}
      {...listeners}
      aria-label={`Drag to reorder ${label}`}
      className="flex size-7 shrink-0 cursor-grab touch-none items-center justify-center rounded-md text-muted-foreground hover:bg-muted active:cursor-grabbing"
    >
      <GripVertical className="size-4" />
    </button>
  );
  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      className={cn(
        'relative',
        isDragging && 'z-10 opacity-90 shadow-e3 ring-2 ring-primary/40',
        className,
      )}
    >
      {children(handle)}
    </div>
  );
}

// ─── Small controls ──────────────────────────────────────────────────────────

function MinutesInput({
  value,
  onChange,
  label,
  step = 5,
  allowEmpty = false,
}: {
  value: number | null;
  onChange: (v: number | null) => void;
  label: string;
  step?: number;
  allowEmpty?: boolean;
}) {
  const set = (n: number) => onChange(Math.min(600, Math.max(1, n)));
  return (
    <div className="flex shrink-0 items-center rounded-lg border bg-card">
      <button
        type="button"
        aria-label={`Less time for ${label}`}
        onClick={() => set((value ?? step) - step)}
        className="flex size-7 cursor-pointer items-center justify-center text-muted-foreground hover:text-foreground"
      >
        <Minus className="size-3.5" />
      </button>
      <input
        type="number"
        inputMode="numeric"
        aria-label={`Minutes for ${label}`}
        value={value ?? ''}
        placeholder={allowEmpty ? '–' : undefined}
        onChange={(e) => {
          const n = Number(e.target.value);
          if (e.target.value === '') onChange(allowEmpty ? null : 1);
          else if (Number.isFinite(n)) set(Math.round(n));
        }}
        className="tabular h-7 w-9 [appearance:textfield] bg-transparent text-center text-[13px] font-semibold outline-none [&::-webkit-inner-spin-button]:appearance-none"
      />
      <button
        type="button"
        aria-label={`More time for ${label}`}
        onClick={() => set((value ?? 0) + step)}
        className="flex size-7 cursor-pointer items-center justify-center text-muted-foreground hover:text-foreground"
      >
        <Plus className="size-3.5" />
      </button>
    </div>
  );
}

function ColorPick({ value, onChange }: { value: string | null; onChange: (c: string) => void }) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label="Block colour"
          className="size-5 shrink-0 cursor-pointer rounded-full ring-2 ring-card ring-offset-1 ring-offset-border"
          style={{ background: value ?? 'var(--color-primary)' }}
        />
      </PopoverTrigger>
      <PopoverContent title="Block colour" className="w-auto p-2">
        <div className="flex gap-1.5">
          {BLOCK_COLORS.map((c) => (
            <button
              key={c}
              type="button"
              aria-label={`Colour ${c}`}
              aria-pressed={c === value}
              onClick={() => onChange(c)}
              className={cn(
                'size-7 cursor-pointer rounded-full',
                c === value && 'ring-2 ring-foreground ring-offset-2 ring-offset-card',
              )}
              style={{ background: c }}
            />
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}

// ─── Editor ──────────────────────────────────────────────────────────────────

export function PlanEditor({
  blocks,
  onChange,
  target,
  options,
}: {
  blocks: DraftBlock[];
  onChange: (next: DraftBlock[]) => void;
  /** The session length the blocks must add up to (null: the batch's days differ). */
  target: number | null;
  /** A session: each block's drills from the batch plan, offered to pick from (by block name). */
  options?: Record<string, PlanDrill[]>;
}) {
  const update = (key: string, patch: Partial<DraftBlock>) =>
    onChange(blocks.map((b) => (b.key === key ? { ...b, ...patch } : b)));
  const move = (i: number, dir: -1 | 1) => {
    const j = i + dir;
    if (j >= 0 && j < blocks.length) onChange(arrayMove(blocks, i, j));
  };
  const left = target === null ? 10 : Math.max(5, target - totalOf(blocks));
  const add = (name: string, color: string | null) =>
    onChange([...blocks, { key: newKey(), name, color, minutes: Math.min(left, 600), drills: [] }]);
  const fit = () => {
    if (target === null || !blocks.length) return;
    const last = blocks[blocks.length - 1]!;
    const minutes = last.minutes + target - totalOf(blocks);
    if (minutes >= 1) update(last.key, { minutes });
  };

  return (
    <div className="space-y-1.5">
      <div className="sticky top-0 z-20 -mx-1 rounded-lg bg-background/95 px-1 py-1 backdrop-blur">
        <MinutesMeter blocks={blocks} target={target} onFit={fit} />
      </div>
      <SortableList items={blocks} onReorder={onChange} className="space-y-1.5">
        {blocks.map((b, i) => (
          <Sortable key={b.key} id={b.key} label={b.name || 'block'}>
            {(handle) => (
              <BlockCard
                block={b}
                options={options?.[b.name]}
                handle={handle}
                first={i === 0}
                last={i === blocks.length - 1}
                onChange={(patch) => update(b.key, patch)}
                onMove={(dir) => move(i, dir)}
                onDuplicate={() =>
                  onChange([
                    ...blocks.slice(0, i + 1),
                    {
                      ...b,
                      key: newKey(),
                      drills: b.drills.map((d) => ({ ...d, key: newKey() })),
                    },
                    ...blocks.slice(i + 1),
                  ])
                }
                onRemove={() => onChange(blocks.filter((x) => x.key !== b.key))}
              />
            )}
          </Sortable>
        ))}
      </SortableList>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="sm" className="w-full border-dashed">
            <Plus /> Add block
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-56">
          <DropdownMenuLabel>Add a block</DropdownMenuLabel>
          {BLOCK_SUGGESTIONS.filter((s) => !blocks.some((b) => b.name === s.name)).map((s) => (
            <DropdownMenuItem key={s.name} onSelect={() => add(s.name, s.color)}>
              <span className="size-2.5 rounded-full" style={{ background: s.color }} />
              {s.name}
            </DropdownMenuItem>
          ))}
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={() => add('', BLOCK_COLORS[blocks.length % 7]!)}>
            <Plus /> Custom block
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

function BlockCard({
  block: b,
  options,
  handle,
  first,
  last,
  onChange,
  onMove,
  onDuplicate,
  onRemove,
}: {
  block: DraftBlock;
  options?: PlanDrill[];
  handle: ReactNode;
  first: boolean;
  last: boolean;
  onChange: (patch: Partial<DraftBlock>) => void;
  onMove: (dir: -1 | 1) => void;
  onDuplicate: () => void;
  onRemove: () => void;
}) {
  const drillMinutes = b.drills.reduce((n, d) => n + (d.minutes ?? 0), 0);
  const setDrill = (key: string, patch: Partial<DraftDrill>) =>
    onChange({ drills: b.drills.map((d) => (d.key === key ? { ...d, ...patch } : d)) });
  const [focusKey, setFocusKey] = useState<string | null>(null);

  return (
    <div
      className="overflow-hidden rounded-xl border border-l-4 bg-card shadow-e1"
      style={{ borderLeftColor: b.color ?? 'var(--color-primary)' }}
    >
      <div className="flex items-center gap-1 p-1">
        {handle}
        <ColorPick value={b.color} onChange={(color) => onChange({ color })} />
        <input
          value={b.name}
          onChange={(e) => onChange({ name: e.target.value })}
          placeholder="Block name"
          aria-label="Block name"
          autoFocus={!b.name}
          maxLength={120}
          className="h-8 min-w-0 flex-1 rounded-md bg-transparent px-1.5 text-[14px] font-semibold outline-none focus:bg-muted/50"
        />
        <MinutesInput
          value={b.minutes}
          label={b.name || 'block'}
          onChange={(v) => onChange({ minutes: v ?? 1 })}
        />
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon-sm" aria-label={`More for ${b.name || 'block'}`}>
              <MoreVertical />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem disabled={first} onSelect={() => onMove(-1)}>
              <ArrowUp /> Move up
            </DropdownMenuItem>
            <DropdownMenuItem disabled={last} onSelect={() => onMove(1)}>
              <ArrowDown /> Move down
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={onDuplicate}>
              <Copy /> Duplicate
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem destructive onSelect={onRemove}>
              <Trash2 /> Remove block
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <div className="border-t bg-muted/20 px-1 py-1">
        {b.drills.length > 0 && (
          <SortableList
            items={b.drills}
            onReorder={(drills) => onChange({ drills })}
            className="space-y-0.5"
          >
            {b.drills.map((d) => (
              <Sortable key={d.key} id={d.key} label={d.name || 'drill'}>
                {(h) => (
                  <DrillRow
                    drill={d}
                    handle={h}
                    autoFocus={focusKey === d.key}
                    onChange={(patch) => setDrill(d.key, patch)}
                    onRemove={() => onChange({ drills: b.drills.filter((x) => x.key !== d.key) })}
                  />
                )}
              </Sortable>
            ))}
          </SortableList>
        )}
        {/* The batch plan's drills for this block, not picked yet: tap to add. */}
        {options && options.some((o) => !b.drills.some((d) => d.name === o.name)) && (
          <div className="flex flex-wrap gap-1 px-1 py-1" aria-label={`Drills for ${b.name}`}>
            {options
              .filter((o) => !b.drills.some((d) => d.name === o.name))
              .map((o) => (
                <button
                  key={o.name}
                  type="button"
                  onClick={() => onChange({ drills: [...b.drills, { key: newKey(), ...o }] })}
                  className="inline-flex h-7 cursor-pointer items-center gap-1 rounded-full border border-dashed border-primary/40 bg-card px-2 text-[12px] font-medium text-primary transition-colors hover:bg-primary/8"
                >
                  <Plus className="size-3" /> {o.name}
                </button>
              ))}
          </div>
        )}
        <div className="flex items-center justify-between gap-2">
          <button
            type="button"
            onClick={() => {
              const key = newKey();
              setFocusKey(key);
              onChange({
                drills: [...b.drills, { key, name: '', minutes: null, reps: null, note: null }],
              });
            }}
            className="inline-flex h-7 cursor-pointer items-center gap-1 rounded-md px-1.5 text-[12px] font-semibold text-primary hover:bg-primary/8"
          >
            <Plus className="size-3.5" /> {options?.length ? 'Custom drill' : 'Add drill'}
          </button>
          {drillMinutes > 0 && (
            <span
              className={cn(
                'tabular pr-1 text-[11px]',
                drillMinutes > b.minutes
                  ? 'font-semibold text-destructive'
                  : 'text-muted-foreground',
              )}
            >
              Drills {drillMinutes} of {b.minutes} min
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

function DrillRow({
  drill: d,
  handle,
  autoFocus,
  onChange,
  onRemove,
}: {
  drill: DraftDrill;
  handle: ReactNode;
  autoFocus: boolean;
  onChange: (patch: Partial<DraftDrill>) => void;
  onRemove: () => void;
}) {
  const [open, setOpen] = useState(false);
  const summary = [d.minutes ? `${d.minutes} min` : null, d.reps].filter(Boolean).join(' · ');
  return (
    <div className="rounded-lg bg-card">
      <div className="flex items-center gap-0.5">
        {handle}
        <input
          value={d.name}
          onChange={(e) => onChange({ name: e.target.value })}
          placeholder="Drill name"
          aria-label="Drill name"
          autoFocus={autoFocus}
          maxLength={120}
          className="h-8 min-w-0 flex-1 rounded-md bg-transparent px-1 text-[13px] outline-none focus:bg-muted/50"
        />
        {summary && !open && (
          <span className="tabular shrink-0 rounded-full bg-muted px-1.5 py-px text-[10px] font-semibold text-muted-foreground">
            {summary}
          </span>
        )}
        {d.note && !open && (
          <span className="size-1.5 shrink-0 rounded-full bg-primary" title="Has a note" />
        )}
        <button
          type="button"
          aria-expanded={open}
          aria-label={`Details for ${d.name || 'drill'}`}
          onClick={() => setOpen((o) => !o)}
          className="flex size-7 shrink-0 cursor-pointer items-center justify-center rounded-md text-muted-foreground hover:bg-muted"
        >
          <ChevronDown className={cn('size-4 transition-transform', open && 'rotate-180')} />
        </button>
      </div>
      {open && (
        <div className="grid grid-cols-[auto_1fr] items-center gap-1 px-1 pb-1">
          <MinutesInput
            value={d.minutes}
            allowEmpty
            step={1}
            label={d.name || 'drill'}
            onChange={(minutes) => onChange({ minutes })}
          />
          <Input
            value={d.reps ?? ''}
            onChange={(e) => onChange({ reps: e.target.value })}
            placeholder="Reps / sets, e.g. 3 × 10"
            aria-label="Reps"
            maxLength={60}
            className="h-8 text-[13px]"
          />
          <Textarea
            value={d.note ?? ''}
            onChange={(e) => onChange({ note: e.target.value })}
            placeholder="Coaching note (optional)"
            aria-label="Drill note"
            maxLength={500}
            rows={2}
            className="col-span-2 min-h-0 text-[13px]"
          />
          <button
            type="button"
            onClick={onRemove}
            className="col-span-2 inline-flex h-7 cursor-pointer items-center justify-center gap-1 rounded-md text-[12px] font-semibold text-destructive hover:bg-destructive/8"
          >
            <Trash2 className="size-3.5" /> Remove drill
          </button>
        </div>
      )}
    </div>
  );
}
