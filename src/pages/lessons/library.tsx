import { Archive, ArchiveRestore, ArrowDown, ArrowUp, Plus } from 'lucide-react';
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
import { Input } from '@/components/ui/primitives';
import { errorMessage } from '@/lib/api';
import { useLibrary, useReorderLibrary, useSaveLibraryItem } from '@/lib/queries';
import { cn } from '@/lib/utils';
import { STAGE_COLORS } from './meta';

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

export function LibraryDialog({ trigger }: { trigger: ReactNode }) {
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
