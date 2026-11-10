/**
 * The coach's planning library, shared by all their batches: blocks (timed parts of a session),
 * drills, and whole plans saved under a name.
 */
import {
  Archive,
  ArchiveRestore,
  ArrowDown,
  ArrowUp,
  BookmarkPlus,
  Pencil,
  Plus,
  Trash2,
} from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { toast } from 'sonner';
import { ConfirmDialog, ListSkeleton } from '@/components/common';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/controls';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/overlays';
import { Input } from '@/components/ui/primitives';
import { errorMessage } from '@/lib/api';
import {
  useDeleteSavedPlan,
  useEditSavedPlan,
  useLibrary,
  useReorderLibrary,
  useSaveLibraryItem,
  useSavedPlans,
} from '@/lib/queries';
import type { LibraryItem, SavedPlan } from '@/lib/types';
import { cn } from '@/lib/utils';
import { STAGE_COLORS } from './meta';

function ColorPick({ value, onChange }: { value: string; onChange: (c: string) => void }) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label="Block colour"
          className="size-8 shrink-0 cursor-pointer rounded-lg border"
          style={{ background: value }}
        />
      </PopoverTrigger>
      <PopoverContent className="flex w-auto gap-1.5 p-2">
        {STAGE_COLORS.map((c) => (
          <button
            key={c}
            type="button"
            aria-label={c}
            onClick={() => onChange(c)}
            className={cn(
              'size-7 cursor-pointer rounded-md',
              c === value && 'ring-2 ring-ring ring-offset-2',
            )}
            style={{ background: c }}
          />
        ))}
      </PopoverContent>
    </Popover>
  );
}

function LibraryList({ kind }: { kind: 'stages' | 'events' }) {
  const list = useLibrary(kind, { includeArchived: 'true' });
  const saveItem = useSaveLibraryItem(kind);
  const reorder = useReorderLibrary(kind);
  const isStage = kind === 'stages';
  const [name, setName] = useState('');
  const [minutes, setMinutes] = useState('10');
  const [color, setColor] = useState(STAGE_COLORS[0]!);
  const [editing, setEditing] = useState<LibraryItem | null>(null);

  const active = list.data?.filter((i) => !i.isArchived) ?? [];
  const archived = list.data?.filter((i) => i.isArchived) ?? [];
  const fail = (e: unknown) => toast.error(errorMessage(e));

  function add() {
    if (!name.trim()) return;
    saveItem.mutate(
      isStage
        ? { name: name.trim(), color, durationMin: Number(minutes) || null }
        : { name: name.trim() },
      {
        onSuccess: () => {
          setName('');
          setColor(STAGE_COLORS[(active.length + 1) % STAGE_COLORS.length]!);
        },
        onError: fail,
      },
    );
  }
  function move(index: number, delta: number) {
    const ids = active.map((i) => i.id);
    const [moved] = ids.splice(index, 1);
    ids.splice(index + delta, 0, moved!);
    reorder.mutate({ ids }, { onError: fail });
  }

  return (
    <div className="space-y-2.5">
      <form
        className="flex gap-1.5"
        onSubmit={(e) => {
          e.preventDefault();
          add();
        }}
      >
        {isStage && <ColorPick value={color} onChange={setColor} />}
        <Input
          aria-label={isStage ? 'New block' : 'New drill'}
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder={isStage ? 'e.g. Warm-up' : 'e.g. Footwork ladder'}
          className="h-8"
        />
        {isStage && (
          <Input
            aria-label="Minutes"
            type="number"
            min={1}
            max={240}
            value={minutes}
            onChange={(e) => setMinutes(e.target.value)}
            className="tabular h-8 w-16"
          />
        )}
        <Button
          type="submit"
          size="sm"
          className="h-8"
          loading={saveItem.isPending}
          disabled={!name.trim()}
        >
          <Plus /> Add
        </Button>
      </form>

      {list.isPending ? (
        <ListSkeleton rows={3} />
      ) : (
        <ul className="divide-y rounded-xl border">
          {active.length === 0 && (
            <li className="p-3 text-[13px] text-muted-foreground">Nothing here yet.</li>
          )}
          {active.map((i, idx) => (
            <li key={i.id} className="flex items-center gap-1.5 px-2 py-1.5">
              {isStage && (
                <span
                  className="size-2.5 shrink-0 rounded-full"
                  style={{ background: i.color ?? STAGE_COLORS[0] }}
                />
              )}
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[13px] font-medium">{i.name}</span>
                {(i.description || (isStage && i.durationMin)) && (
                  <span className="block truncate text-[11px] text-muted-foreground">
                    {isStage ? `${i.durationMin} min` : i.description}
                  </span>
                )}
              </span>
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label={`Edit ${i.name}`}
                onClick={() => setEditing(i)}
              >
                <Pencil />
              </Button>
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label={`Move ${i.name} up`}
                disabled={idx === 0}
                onClick={() => move(idx, -1)}
              >
                <ArrowUp />
              </Button>
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label={`Move ${i.name} down`}
                disabled={idx === active.length - 1}
                onClick={() => move(idx, 1)}
              >
                <ArrowDown />
              </Button>
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label={`Archive ${i.name}`}
                onClick={() => saveItem.mutate({ id: i.id, isArchived: true }, { onError: fail })}
              >
                <Archive />
              </Button>
            </li>
          ))}
        </ul>
      )}
      {archived.length > 0 && (
        <details className="text-[13px]">
          <summary className="cursor-pointer text-muted-foreground">
            Archived ({archived.length})
          </summary>
          <ul className="mt-1 space-y-0.5">
            {archived.map((i) => (
              <li
                key={i.id}
                className="flex items-center justify-between rounded-lg px-2 py-1 text-muted-foreground hover:bg-muted"
              >
                {i.name}
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() =>
                    saveItem.mutate({ id: i.id, isArchived: false }, { onError: fail })
                  }
                >
                  <ArchiveRestore /> Restore
                </Button>
              </li>
            ))}
          </ul>
        </details>
      )}
      <EditItem kind={kind} item={editing} onClose={() => setEditing(null)} />
    </div>
  );
}

function EditItem({
  kind,
  item,
  onClose,
}: {
  kind: 'stages' | 'events';
  item: LibraryItem | null;
  onClose: () => void;
}) {
  const saveItem = useSaveLibraryItem(kind);
  const isStage = kind === 'stages';
  const [form, setForm] = useState({ name: '', description: '', minutes: '', color: '' });
  const [for_, setFor] = useState<string | null>(null);
  if (item && for_ !== item.id) {
    setFor(item.id);
    setForm({
      name: item.name,
      description: item.description ?? '',
      minutes: item.durationMin ? String(item.durationMin) : '',
      color: item.color ?? STAGE_COLORS[0]!,
    });
  }
  return (
    <Dialog open={!!item} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{isStage ? 'Edit block' : 'Edit drill'}</DialogTitle>
          <DialogDescription>
            Changes show in new and edited plans. Saved sessions keep their own minutes.
          </DialogDescription>
        </DialogHeader>
        <form
          className="space-y-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (!item) return;
            saveItem.mutate(
              isStage
                ? {
                    id: item.id,
                    name: form.name.trim(),
                    color: form.color,
                    durationMin: form.minutes ? Number(form.minutes) : null,
                  }
                : {
                    id: item.id,
                    name: form.name.trim(),
                    description: form.description.trim() || null,
                  },
              { onSuccess: onClose, onError: (err) => toast.error(errorMessage(err)) },
            );
          }}
        >
          <div className="flex gap-1.5">
            {isStage && (
              <ColorPick
                value={form.color}
                onChange={(c) => setForm((f) => ({ ...f, color: c }))}
              />
            )}
            <Input
              aria-label="Name"
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              className="h-8"
            />
            {isStage && (
              <Input
                aria-label="Default minutes"
                type="number"
                min={1}
                max={240}
                placeholder="min"
                value={form.minutes}
                onChange={(e) => setForm((f) => ({ ...f, minutes: e.target.value }))}
                className="tabular h-8 w-16"
              />
            )}
          </div>
          {!isStage && (
            <Input
              aria-label="Description"
              placeholder="How it’s run, equipment… (optional)"
              value={form.description}
              onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
              className="h-8"
            />
          )}
          <div className="flex justify-end gap-1.5">
            <Button type="button" variant="ghost" size="sm" onClick={onClose}>
              Cancel
            </Button>
            <Button
              type="submit"
              size="sm"
              loading={saveItem.isPending}
              disabled={!form.name.trim()}
            >
              Save
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function SavedPlansList() {
  const list = useSavedPlans();
  const rename = useEditSavedPlan();
  const remove = useDeleteSavedPlan();
  const [editing, setEditing] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [deleting, setDeleting] = useState<SavedPlan | null>(null);
  if (list.isPending) return <ListSkeleton rows={3} />;
  if (!list.data?.length)
    return (
      <p className="rounded-xl border border-dashed p-3 text-[13px] text-muted-foreground">
        <BookmarkPlus className="mb-1 size-4" />
        No saved plans yet. Open any session’s plan and choose “Save as a reusable plan” from its ⋯
        menu.
      </p>
    );
  return (
    <>
      <ul className="divide-y rounded-xl border">
        {list.data.map((p) => (
          <li key={p.id} className="flex items-center gap-1.5 px-2 py-1.5">
            {editing === p.id ? (
              <form
                className="flex flex-1 gap-1.5"
                onSubmit={(e) => {
                  e.preventDefault();
                  rename.mutate(
                    { id: p.id, name: name.trim() },
                    {
                      onSuccess: () => setEditing(null),
                      onError: (err) => toast.error(errorMessage(err)),
                    },
                  );
                }}
              >
                <Input
                  autoFocus
                  aria-label="Plan name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="h-8"
                />
                <Button size="sm" type="submit" className="h-8" disabled={!name.trim()}>
                  Save
                </Button>
              </form>
            ) : (
              <>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13px] font-semibold">{p.name}</span>
                  <span className="block truncate text-[11px] text-muted-foreground">
                    {p.stages.map((s) => s.name).join(' · ') || 'No blocks'}
                    {p.totalMinutes ? ` · ${p.totalMinutes} min` : ''}
                  </span>
                </span>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label={`Rename ${p.name}`}
                  onClick={() => (setEditing(p.id), setName(p.name))}
                >
                  <Pencil />
                </Button>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label={`Delete ${p.name}`}
                  onClick={() => setDeleting(p)}
                >
                  <Trash2 />
                </Button>
              </>
            )}
          </li>
        ))}
      </ul>
      <ConfirmDialog
        open={!!deleting}
        onOpenChange={(o) => !o && setDeleting(null)}
        title={`Delete “${deleting?.name}”?`}
        description="Sessions already planned from it keep their plans."
        confirmLabel="Delete"
        destructive
        loading={remove.isPending}
        onConfirm={() =>
          deleting &&
          remove.mutate(deleting.id, {
            onSuccess: () => setDeleting(null),
            onError: (err) => toast.error(errorMessage(err)),
          })
        }
      />
    </>
  );
}

/** The coach's library: blocks, drills and saved plans, used across all their batches. */
export function LibraryDialog({ trigger }: { trigger: ReactNode }) {
  const stages = useLibrary('stages');
  const events = useLibrary('events');
  const saved = useSavedPlans();
  const count = (n?: number) => <span className="tabular text-muted-foreground">{n ?? ''}</span>;
  return (
    <Dialog>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="max-h-[92dvh] gap-3 overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Planning library</DialogTitle>
          <DialogDescription>
            Your blocks, drills and saved plans — shared by all your batches.
          </DialogDescription>
        </DialogHeader>
        <Tabs defaultValue="stages">
          <TabsList>
            <TabsTrigger value="stages">Blocks {count(stages.data?.length)}</TabsTrigger>
            <TabsTrigger value="events">Drills {count(events.data?.length)}</TabsTrigger>
            <TabsTrigger value="saved">Saved plans {count(saved.data?.length)}</TabsTrigger>
          </TabsList>
          <TabsContent value="stages" className="mt-2.5">
            <LibraryList kind="stages" />
          </TabsContent>
          <TabsContent value="events" className="mt-2.5">
            <LibraryList kind="events" />
          </TabsContent>
          <TabsContent value="saved" className="mt-2.5">
            <SavedPlansList />
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
