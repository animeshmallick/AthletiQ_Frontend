import { Archive, ArchiveRestore, ArrowDown, ArrowUp, Copy, Plus } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { toast } from 'sonner';
import { ListSkeleton } from '@/components/common';
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
import { Input, Select } from '@/components/ui/primitives';
import { errorMessage } from '@/lib/api';
import { useCopyTemplate, useLibrary, useReorderLibrary, useSaveLibraryItem } from '@/lib/queries';
import type { Batch } from '@/lib/types';
import { cn } from '@/lib/utils';
import { STAGE_COLORS } from './meta';
import { timeLabel } from '@/lib/batch-times';

function LibraryList({ kind, batchId }: { kind: 'stages' | 'events'; batchId: string }) {
  const list = useLibrary(kind, { batchId, includeArchived: 'true' });
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
        kind === 'stages' ? { batchId, name: name.trim(), color } : { batchId, name: name.trim() },
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
    reorder.mutate({ batchId, ids }, { onError: (e) => toast.error(errorMessage(e)) });
  }

  return (
    <div className="space-y-3">
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

/** Offers to fill an empty template from another batch the coach runs. */
function CopyFrom({ batchId, others }: { batchId: string; others: Batch[] }) {
  const copy = useCopyTemplate();
  const [from, setFrom] = useState(others[0]?.id ?? '');
  if (!others.length) return null;
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-lg border border-dashed bg-muted/40 p-2">
      <Copy aria-hidden className="size-4 shrink-0 text-muted-foreground" />
      <span className="text-[13px]">Start from</span>
      <Select
        aria-label="Copy template from"
        className="h-8 min-w-0 flex-1 text-[13px]"
        value={from}
        onChange={(e) => setFrom(e.target.value)}
      >
        {others.map((b) => (
          <option key={b.id} value={b.id}>
            {b.name}
          </option>
        ))}
      </Select>
      <Button
        size="sm"
        loading={copy.isPending}
        disabled={!from}
        onClick={() =>
          copy.mutate(
            { fromBatchId: from, toBatchId: batchId },
            {
              onSuccess: (r) =>
                toast.success(
                  r.stages + r.events
                    ? `Copied ${r.stages} stage${r.stages === 1 ? '' : 's'} and ${r.events} event${r.events === 1 ? '' : 's'}`
                    : 'Nothing new to copy',
                ),
              onError: (e) => toast.error(errorMessage(e)),
            },
          )
        }
      >
        Copy template
      </Button>
    </div>
  );
}

/**
 * Each batch's plan template: the stages (grid columns) and events (grid rows) its daily plans
 * are built from. The batch's coach edits it; switch batch to edit another one's template.
 */
export function TemplateDialog({
  trigger,
  batchId,
  batches,
}: {
  trigger: ReactNode;
  batchId: string;
  batches: Batch[];
}) {
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState(batchId);
  const current = selected || batches[0]?.id || '';
  const batch = batches.find((b) => b.id === current);
  const stages = useLibrary('stages', { batchId: current || undefined });
  const events = useLibrary('events', { batchId: current || undefined });
  const empty = stages.data?.length === 0 && events.data?.length === 0;
  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (o) setSelected(batchId); // Open on the batch being planned.
      }}
    >
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="gap-3 sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Batch plan template</DialogTitle>
          <DialogDescription>
            Stages are the columns of each day’s grid; events are the rows. Every batch has its own
            template, kept by its coach.
          </DialogDescription>
        </DialogHeader>
        {batches.length > 1 && (
          <Select
            aria-label="Template for batch"
            className="h-9"
            value={current}
            onChange={(e) => setSelected(e.target.value)}
          >
            {batches.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name} · {timeLabel(b)}
              </option>
            ))}
          </Select>
        )}
        {!current ? (
          <p className="text-sm text-muted-foreground">You have no batches to plan for.</p>
        ) : (
          <>
            {empty && (
              <CopyFrom
                key={current}
                batchId={current}
                others={batches.filter((b) => b.id !== current)}
              />
            )}
            <Tabs defaultValue="stages" key={current}>
              <TabsList>
                <TabsTrigger value="stages">
                  Stages{' '}
                  <span className="tabular text-muted-foreground">{stages.data?.length ?? ''}</span>
                </TabsTrigger>
                <TabsTrigger value="events">
                  Events{' '}
                  <span className="tabular text-muted-foreground">{events.data?.length ?? ''}</span>
                </TabsTrigger>
              </TabsList>
              <TabsContent value="stages" className="mt-3">
                <LibraryList kind="stages" batchId={current} />
              </TabsContent>
              <TabsContent value="events" className="mt-3">
                <LibraryList kind="events" batchId={current} />
              </TabsContent>
            </Tabs>
            {batch && (
              <p className="text-[11px] text-muted-foreground">
                Changes apply to {batch.name}’s new and edited plans. Saved plans keep their grid.
              </p>
            )}
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
