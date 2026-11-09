/**
 * Sports & skills (admins): each sport's skill areas, the skills coaches rate in them, and the
 * level ladder reached by the average rating. Removing a skill that already has ratings retires
 * it (kept for history) instead of deleting it.
 */
import { ArrowDown, ArrowUp, Plus, Save, Trash2, Trophy } from 'lucide-react';
import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import {
  EmptyState,
  ErrorState,
  ListSkeleton,
  PageHeader,
  SectionDivider,
} from '@/components/common';
import { Button } from '@/components/ui/button';
import { Segmented, Switch } from '@/components/ui/controls';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/overlays';
import { Badge, Card, Input } from '@/components/ui/primitives';
import { errorMessage } from '@/lib/api';
import {
  useCreateSport,
  useSaveFramework,
  useSports,
  useUpdateSport,
  type Framework,
  type FrameworkInput,
  type SportListItem,
} from '@/lib/skills';

type Draft = {
  areas: {
    key: string;
    id?: string;
    name: string;
    skills: { key: string; id?: string; name: string; description: string }[];
  }[];
  levels: { key: string; code: string; name: string; min: string }[];
};

let seq = 0;
const k = () => `n${++seq}`;

function toDraft(s: Framework): Draft {
  return {
    areas: s.areas
      .filter((a) => a.isActive)
      .map((a) => ({
        key: a.id,
        id: a.id,
        name: a.name,
        skills: a.skills
          .filter((x) => x.isActive)
          .map((x) => ({ key: x.id, id: x.id, name: x.name, description: x.description ?? '' })),
      })),
    levels: s.levels.map((l) => ({
      key: l.id,
      code: l.code ?? '',
      name: l.name,
      min: (l.minScore / 100).toFixed(2),
    })),
  };
}

function move<T>(list: T[], i: number, d: number) {
  const j = i + d;
  if (j < 0 || j >= list.length) return list;
  const out = [...list];
  [out[i], out[j]] = [out[j]!, out[i]!];
  return out;
}

export function SportsPage() {
  const q = useSports();
  const [selected, setSelected] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const sports = useMemo(() => q.data ?? [], [q.data]);
  const current = sports.find((s) => s.sport.id === selected) ?? sports[0];

  return (
    <div>
      <PageHeader
        className="mb-2 sm:mb-3"
        title="Sports & skills"
        description="What coaches rate each month, and the levels students move through."
        actions={
          <Button size="sm" onClick={() => setAdding(true)}>
            <Plus /> Add sport
          </Button>
        }
      />
      {q.isPending ? (
        <ListSkeleton rows={4} />
      ) : q.isError ? (
        <ErrorState error={q.error} onRetry={() => void q.refetch()} />
      ) : !current ? (
        <EmptyState
          icon={<Trophy />}
          title="No sports yet"
          description="Add the sports your academy teaches."
        />
      ) : (
        <>
          {sports.length > 1 && (
            <Segmented
              ariaLabel="Sport"
              className="mb-2 max-w-full overflow-x-auto"
              value={current.sport.id}
              onChange={setSelected}
              options={sports.map((s) => ({
                value: s.sport.id,
                label: <span className={s.sport.isActive ? '' : 'opacity-60'}>{s.sport.name}</span>,
              }))}
            />
          )}
          <Editor key={current.sport.id} sport={current} />
        </>
      )}
      <AddSportDialog open={adding} onClose={() => setAdding(false)} onCreated={setSelected} />
    </div>
  );
}

function Editor({ sport }: { sport: SportListItem }) {
  const [draft, setDraft] = useState<Draft>(() => toDraft(sport));
  const save = useSaveFramework();
  const update = useUpdateSport();
  const retired = sport.areas.flatMap((a) =>
    a.skills.filter((x) => !x.isActive || !a.isActive).map((x) => x.name),
  );
  const dirty = JSON.stringify(draft) !== JSON.stringify(toDraft(sport));

  const setArea = (i: number, patch: Partial<Draft['areas'][number]>) =>
    setDraft((d) => ({ ...d, areas: d.areas.map((a, j) => (j === i ? { ...a, ...patch } : a)) }));

  async function submit() {
    const body: FrameworkInput = {
      areas: draft.areas.map((a) => ({
        id: a.id,
        name: a.name.trim(),
        skills: a.skills.map((x) => ({
          id: x.id,
          name: x.name.trim(),
          description: x.description.trim() || null,
        })),
      })),
      levels: draft.levels.map((l) => ({
        code: l.code.trim().toUpperCase() || null,
        name: l.name.trim(),
        minScore: Math.round(Number(l.min) * 100),
      })),
    };
    if (body.areas.some((a) => !a.name || !a.skills.length || a.skills.some((x) => !x.name)))
      return toast.error('Every area needs a name and at least one named skill');
    if (body.levels.some((l) => !l.name || !(l.minScore >= 100 && l.minScore <= 500)))
      return toast.error('Each level needs a name and a minimum score from 1 to 5');
    try {
      const saved = await save.mutateAsync({ id: sport.sport.id, ...body });
      // New areas and skills now have ids: edit those from here on.
      setDraft(toDraft(saved));
      toast.success(`${sport.sport.name} saved`);
    } catch (err) {
      toast.error('Could not save', { description: errorMessage(err) });
    }
  }

  return (
    <div className="space-y-2.5">
      <Card className="flex flex-wrap items-center gap-2 p-2.5">
        <div className="min-w-0 flex-1">
          <p className="text-[14px] font-semibold">{sport.sport.name}</p>
          <p className="text-[12px] text-muted-foreground">
            {sport.batches} batch{sport.batches === 1 ? '' : 'es'} ·{' '}
            {draft.areas.reduce((n, a) => n + a.skills.length, 0)} skills in {draft.areas.length}{' '}
            areas
          </p>
        </div>
        <label className="flex items-center gap-2 text-[13px]">
          Active
          <Switch
            checked={sport.sport.isActive}
            onCheckedChange={(c) =>
              update.mutate(
                { id: sport.sport.id, isActive: c },
                {
                  onError: (e) => toast.error('Could not change', { description: errorMessage(e) }),
                },
              )
            }
            aria-label="Sport active"
          />
        </label>
        <Button size="sm" disabled={!dirty} loading={save.isPending} onClick={() => void submit()}>
          <Save /> Save
        </Button>
      </Card>

      <SectionDivider>Skill areas</SectionDivider>
      {draft.areas.map((area, i) => (
        <Card key={area.key} className="space-y-1.5 p-2.5">
          <div className="flex items-center gap-1.5">
            <Input
              value={area.name}
              maxLength={60}
              aria-label="Area name"
              className="h-9 font-semibold"
              onChange={(e) => setArea(i, { name: e.target.value })}
            />
            <Button
              variant="ghost"
              size="icon"
              aria-label="Move area up"
              disabled={i === 0}
              onClick={() => setDraft((d) => ({ ...d, areas: move(d.areas, i, -1) }))}
            >
              <ArrowUp />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              aria-label="Move area down"
              disabled={i === draft.areas.length - 1}
              onClick={() => setDraft((d) => ({ ...d, areas: move(d.areas, i, 1) }))}
            >
              <ArrowDown />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              aria-label={`Remove ${area.name || 'area'}`}
              onClick={() => setDraft((d) => ({ ...d, areas: d.areas.filter((_, j) => j !== i) }))}
            >
              <Trash2 className="text-destructive" />
            </Button>
          </div>
          <ul className="space-y-1 pl-2">
            {area.skills.map((skill, si) => (
              <li key={skill.key} className="flex flex-wrap items-center gap-1.5 sm:flex-nowrap">
                <Input
                  value={skill.name}
                  maxLength={80}
                  aria-label="Skill name"
                  placeholder="Skill"
                  className="h-8 min-w-0 flex-1 basis-40"
                  onChange={(e) =>
                    setArea(i, {
                      skills: area.skills.map((x, j) =>
                        j === si ? { ...x, name: e.target.value } : x,
                      ),
                    })
                  }
                />
                <Input
                  value={skill.description}
                  maxLength={300}
                  aria-label="What good looks like"
                  placeholder="What good looks like (optional)"
                  className="h-8 min-w-0 flex-[2] basis-56"
                  onChange={(e) =>
                    setArea(i, {
                      skills: area.skills.map((x, j) =>
                        j === si ? { ...x, description: e.target.value } : x,
                      ),
                    })
                  }
                />
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-8"
                  aria-label={`Remove ${skill.name || 'skill'}`}
                  onClick={() => setArea(i, { skills: area.skills.filter((_, j) => j !== si) })}
                >
                  <Trash2 className="text-muted-foreground" />
                </Button>
              </li>
            ))}
          </ul>
          <Button
            variant="ghost"
            size="sm"
            onClick={() =>
              setArea(i, { skills: [...area.skills, { key: k(), name: '', description: '' }] })
            }
          >
            <Plus /> Add skill
          </Button>
        </Card>
      ))}
      <Button
        variant="outline"
        size="sm"
        onClick={() =>
          setDraft((d) => ({
            ...d,
            areas: [
              ...d.areas,
              { key: k(), name: '', skills: [{ key: k(), name: '', description: '' }] },
            ],
          }))
        }
      >
        <Plus /> Add skill area
      </Button>
      {retired.length > 0 && (
        <p className="text-[12px] text-muted-foreground">
          Retired (kept for history, no longer rated): {retired.join(', ')}
        </p>
      )}

      <SectionDivider>Levels</SectionDivider>
      <Card className="space-y-1.5 p-2.5">
        <p className="text-[12px] text-muted-foreground">
          A student’s level follows their latest assessment average (1–5) and can go up or down. The
          code’s letter is the band: A Beginner, B Intermediate, C Advanced.
        </p>
        {[...draft.levels]
          .map((l, i) => ({ l, i }))
          .sort((a, b) => Number(a.l.min) - Number(b.l.min))
          .map(({ l, i }) => (
            <div key={l.key} className="flex items-center gap-1.5">
              <Input
                value={l.code}
                maxLength={2}
                aria-label="Level code"
                placeholder="B1"
                className="h-8 w-14 text-center font-semibold uppercase"
                onChange={(e) =>
                  setDraft((d) => ({
                    ...d,
                    levels: d.levels.map((x, j) =>
                      j === i ? { ...x, code: e.target.value.toUpperCase() } : x,
                    ),
                  }))
                }
              />
              <Input
                value={l.name}
                maxLength={60}
                aria-label="Level name"
                className="h-8 flex-1"
                onChange={(e) =>
                  setDraft((d) => ({
                    ...d,
                    levels: d.levels.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)),
                  }))
                }
              />
              <span className="text-[12px] text-muted-foreground">from</span>
              <Input
                value={l.min}
                inputMode="decimal"
                aria-label="Minimum average"
                className="h-8 w-20 text-right tabular-nums"
                onChange={(e) =>
                  setDraft((d) => ({
                    ...d,
                    levels: d.levels.map((x, j) => (j === i ? { ...x, min: e.target.value } : x)),
                  }))
                }
              />
              <Button
                variant="ghost"
                size="icon"
                className="size-8"
                aria-label={`Remove ${l.name || 'level'}`}
                onClick={() =>
                  setDraft((d) => ({ ...d, levels: d.levels.filter((_, j) => j !== i) }))
                }
              >
                <Trash2 className="text-muted-foreground" />
              </Button>
            </div>
          ))}
        <Button
          variant="ghost"
          size="sm"
          onClick={() =>
            setDraft((d) => ({
              ...d,
              levels: [...d.levels, { key: k(), code: '', name: '', min: '' }],
            }))
          }
        >
          <Plus /> Add level
        </Button>
      </Card>
      {dirty && (
        <div className="sticky bottom-[calc(4.5rem+env(safe-area-inset-bottom))] z-10 flex justify-end lg:bottom-3">
          <Badge variant="warning" className="mr-2 self-center">
            Unsaved changes
          </Badge>
          <Button loading={save.isPending} onClick={() => void submit()}>
            <Save /> Save {sport.sport.name}
          </Button>
        </div>
      )}
    </div>
  );
}

function AddSportDialog({
  open,
  onClose,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  onCreated: (id: string) => void;
}) {
  const [name, setName] = useState('');
  const create = useCreateSport();
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Add a sport</DialogTitle>
        </DialogHeader>
        <Input
          autoFocus
          value={name}
          maxLength={60}
          placeholder="e.g. Football"
          aria-label="Sport name"
          onChange={(e) => setName(e.target.value)}
        />
        <p className="text-[12px] text-muted-foreground">
          It starts with the standard five levels; add its skill areas next.
        </p>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            loading={create.isPending}
            disabled={name.trim().length < 2}
            onClick={() =>
              create.mutate(name.trim(), {
                onSuccess: (f) => {
                  toast.success(`${f.sport.name} added`);
                  setName('');
                  onCreated(f.sport.id);
                  onClose();
                },
                onError: (e) => toast.error('Could not add', { description: errorMessage(e) }),
              })
            }
          >
            Add
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
