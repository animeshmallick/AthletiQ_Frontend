/** A plan, read-only: the blocks as a timeline with their drills (minutes, reps, notes). */
import { Clock } from 'lucide-react';
import type { PlanBlock } from '@/lib/types';
import { MinutesMeter } from './editor';

/** "6:00" offsets for each block from the session start, e.g. 0–10, 10–20 min. */
function offsets(blocks: PlanBlock[]) {
  let at = 0;
  return blocks.map((b) => {
    const from = at;
    at += b.minutes;
    return { from, to: at };
  });
}

export function PlanView({
  blocks,
  target,
  focus,
  notes,
}: {
  blocks: PlanBlock[];
  target: number | null;
  focus?: string | null;
  notes?: string | null;
}) {
  const at = offsets(blocks);
  return (
    <div className="space-y-1.5">
      {(focus || notes) && (
        <div className="rounded-lg border bg-card px-2 py-1 text-[13px] shadow-e1">
          {focus && (
            <p>
              <span className="font-semibold">Focus:</span> {focus}
            </p>
          )}
          {notes && <p className="whitespace-pre-line text-muted-foreground">{notes}</p>}
        </div>
      )}
      <MinutesMeter blocks={blocks} target={target} />
      <ol className="space-y-1">
        {blocks.map((b, i) => (
          <li
            key={b.id ?? i}
            className="overflow-hidden rounded-xl border border-l-4 bg-card shadow-e1"
            style={{ borderLeftColor: b.color ?? 'var(--color-primary)' }}
          >
            <div className="flex items-center gap-2 px-2 py-1">
              <span className="min-w-0 flex-1 truncate text-[14px] font-semibold">{b.name}</span>
              <span className="tabular shrink-0 text-[11px] text-muted-foreground">
                {at[i]!.from}–{at[i]!.to}′
              </span>
              <span className="tabular inline-flex shrink-0 items-center gap-0.5 rounded-full bg-muted px-1.5 py-px text-[11px] font-semibold">
                <Clock className="size-3" /> {b.minutes} min
              </span>
            </div>
            {b.drills.length > 0 && (
              <ul className="divide-y border-t bg-muted/20">
                {b.drills.map((d, j) => (
                  <li key={d.id ?? j} className="px-2 py-1 text-[13px]">
                    <div className="flex items-baseline gap-2">
                      <span className="min-w-0 flex-1">{d.name}</span>
                      {(d.minutes || d.reps) && (
                        <span className="tabular shrink-0 text-[11px] text-muted-foreground">
                          {[d.minutes ? `${d.minutes} min` : null, d.reps]
                            .filter(Boolean)
                            .join(' · ')}
                        </span>
                      )}
                    </div>
                    {d.note && (
                      <p className="text-[12px] leading-snug text-muted-foreground">{d.note}</p>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </li>
        ))}
      </ol>
    </div>
  );
}
