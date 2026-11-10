/**
 * Students grouped by batch, location or sport (like the Batches page): collapsed to start, one group
 * open at a time, each header summing up its students, dues and attendance. A student in two batches
 * shows in each group they belong to.
 */
import { Accordion } from 'radix-ui';
import { CalendarCheck2, ChevronDown, Layers, MapPin, Trophy } from 'lucide-react';
import { useState } from 'react';
import { money, plural } from '@/lib/format';
import type { Batch, StudentListItem } from '@/lib/types';
import { cn } from '@/lib/utils';
import { StudentCard } from './student-card';

export type StudentGroupBy = 'batch' | 'location' | 'sport';

interface Group {
  id: string;
  name: string;
  /** Context under the name: sport · place for a batch, batches / sports for a place… */
  sub: string;
  students: StudentListItem[];
}

const NONE = '__none__';

function groupStudents(
  students: StudentListItem[],
  batches: Map<string, Batch>,
  by: StudentGroupBy,
): Group[] {
  const map = new Map<string, Group & { parts: Set<string> }>();
  for (const s of students) {
    const keys = new Map<string, { name: string; part?: string }>();
    for (const m of s.batches) {
      const b = batches.get(m.id);
      if (by === 'batch')
        keys.set(m.id, {
          name: m.name,
          part: b ? `${b.sport.name} · ${b.location.name}` : undefined,
        });
      else if (b && by === 'location')
        keys.set(b.location.id, { name: b.location.name, part: b.sport.name });
      else if (b && by === 'sport')
        keys.set(b.sport.id, { name: b.sport.name, part: b.location.name });
    }
    if (!keys.size) keys.set(NONE, { name: 'No batch' });
    for (const [id, k] of keys) {
      const g = map.get(id) ?? { id, name: k.name, sub: '', students: [], parts: new Set() };
      g.students.push(s);
      if (k.part) g.parts.add(k.part);
      map.set(id, g);
    }
  }
  return [...map.values()]
    .map(({ parts, ...g }) => ({ ...g, sub: [...parts].join(', ') }))
    .sort(
      (a, b) =>
        Number(a.id === NONE) - Number(b.id === NONE) ||
        b.students.length - a.students.length ||
        a.name.localeCompare(b.name),
    );
}

const ICON: Record<StudentGroupBy, typeof Layers> = {
  batch: Layers,
  location: MapPin,
  sport: Trophy,
};

export function StudentGroups({
  students,
  batches,
  by,
  isAdmin,
  onPrefetch,
}: {
  students: StudentListItem[];
  batches: Batch[];
  by: StudentGroupBy;
  isAdmin: boolean;
  onPrefetch: (id: string) => void;
}) {
  const byId = new Map(batches.map((b) => [b.id, b]));
  const groups = groupStudents(students, byId, by);
  const [open, setOpen] = useState<string | undefined>(undefined);
  // All groups start collapsed; one opens at a time.
  const value = open && groups.some((g) => g.id === open) ? open : '';
  const Icon = ICON[by];

  return (
    <Accordion.Root
      type="single"
      collapsible
      value={value}
      onValueChange={setOpen}
      className="space-y-1.5"
    >
      {groups.map((g) => {
        const overdue = g.students.reduce((n, s) => n + s.overdue, 0);
        const unpaid = g.students.reduce((n, s) => n + s.outstanding, 0);
        const rates = g.students
          .map((s) => s.attendanceRate)
          .filter((r): r is number => typeof r === 'number');
        const rate = rates.length
          ? Math.round(rates.reduce((a, b) => a + b, 0) / rates.length)
          : null;
        const batch = by === 'batch' ? byId.get(g.id) : undefined;
        return (
          <Accordion.Item
            key={g.id}
            value={g.id}
            className="overflow-hidden rounded-xl border bg-card shadow-e1"
          >
            <Accordion.Header>
              <Accordion.Trigger className="group flex w-full cursor-pointer items-center gap-2 px-2 py-1.5 text-left hover:bg-muted/40">
                <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <Icon className="size-4" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[14px] font-semibold">{g.name}</span>
                  <span className="block truncate text-[11px] text-muted-foreground">
                    {plural(g.students.length, 'student')}
                    {batch?.capacity ? ` of ${batch.capacity}` : ''}
                    {g.sub ? ` · ${g.sub}` : ''}
                  </span>
                  {/* Dues and attendance at a glance. */}
                  <span className="mt-0.5 flex flex-wrap items-center gap-1 text-[10px] font-semibold">
                    {overdue > 0 ? (
                      <span className="rounded-full bg-destructive/10 px-1.5 py-px text-destructive">
                        Overdue {money(overdue)}
                      </span>
                    ) : unpaid > 0 ? (
                      <span className="rounded-full bg-warning/15 px-1.5 py-px text-warning-foreground dark:text-warning">
                        Due {money(unpaid)}
                      </span>
                    ) : (
                      <span className="rounded-full bg-success/10 px-1.5 py-px text-success">
                        All paid
                      </span>
                    )}
                    {rate !== null && (
                      <span
                        title="Average attendance, last 30 days"
                        className={cn(
                          'inline-flex items-center gap-0.5 rounded-full px-1.5 py-px',
                          rate >= 75
                            ? 'bg-success/10 text-success'
                            : rate >= 50
                              ? 'bg-warning/15 text-warning-foreground dark:text-warning'
                              : 'bg-destructive/10 text-destructive',
                        )}
                      >
                        <CalendarCheck2 className="size-3" /> {rate}%
                      </span>
                    )}
                  </span>
                </span>
                <ChevronDown className="size-4 shrink-0 text-muted-foreground transition-transform group-data-[state=open]:rotate-180" />
              </Accordion.Trigger>
            </Accordion.Header>
            <Accordion.Content className="border-t bg-muted/20 p-1.5">
              <div className="grid grid-cols-1 gap-1.5 *:min-w-0 sm:grid-cols-2 xl:grid-cols-3">
                {g.students.map((s) => (
                  <StudentCard
                    key={s.id}
                    s={s}
                    isAdmin={isAdmin}
                    onPrefetch={() => onPrefetch(s.id)}
                  />
                ))}
              </div>
            </Accordion.Content>
          </Accordion.Item>
        );
      })}
    </Accordion.Root>
  );
}
