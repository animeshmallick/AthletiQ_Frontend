/**
 * Monthly assessment of one batch: who is done, and a sheet to rate each skill 1–5 with a
 * comment and goals. Only the batch's own coach edits, and only during the month.
 */
import { CheckCircle2, ChevronRight, CircleDashed, Lock } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { Avatar, EmptyState, ErrorState, ListSkeleton } from '@/components/common';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/overlays';
import { Badge, Card, Textarea } from '@/components/ui/primitives';
import { errorMessage } from '@/lib/api';
import {
  RATING_LABELS,
  ratingLabel,
  score,
  useSaveAssessment,
  useSkillSheet,
  type SkillSheet,
} from '@/lib/skills';
import { cn } from '@/lib/utils';
import { Change, LevelBadge } from './ui';
import { monthName } from './meta';

export function AssessTab({ batchId, month }: { batchId: string; month: string }) {
  const q = useSkillSheet(batchId, month);
  const [open, setOpen] = useState<string | null>(null);

  if (q.isPending) return <ListSkeleton rows={6} />;
  if (q.isError) return <ErrorState error={q.error} onRetry={() => void q.refetch()} />;
  const sheet = q.data;
  const done = sheet.students.filter((s) => s.current).length;
  const total = sheet.students.length;
  const skillCount = sheet.framework.areas
    .filter((a) => a.isActive)
    .reduce((n, a) => n + a.skills.filter((k) => k.isActive).length, 0);

  return (
    <div className="space-y-2.5">
      <Card className="flex items-center gap-3 p-3">
        <div className="min-w-0 flex-1">
          <p className="text-[13px] font-semibold">
            {done} of {total} assessed for {monthName(sheet.month)}
          </p>
          <p className="text-[12px] text-muted-foreground">
            {sheet.framework.sport.name} · {skillCount} skills ·{' '}
            {sheet.editable
              ? 'Rate each student once a month; you can edit until the month ends.'
              : 'View only.'}
          </p>
          <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full bg-primary transition-[width]"
              style={{ width: `${total ? (done / total) * 100 : 0}%` }}
            />
          </div>
        </div>
        {!sheet.editable && <Lock className="size-4 shrink-0 text-muted-foreground" />}
      </Card>

      {!skillCount ? (
        <EmptyState
          title="No skills set up for this sport"
          description="An admin can add skill areas and skills under Manage → Sports & skills."
        />
      ) : total === 0 ? (
        <EmptyState title="No students in this batch" />
      ) : (
        <Card className="divide-y overflow-hidden">
          {sheet.students.map((s) => {
            const c = s.current;
            const change = c && s.previous ? c.average - s.previous.average : null;
            return (
              <button
                key={s.id}
                type="button"
                onClick={() => setOpen(s.id)}
                className="flex w-full min-w-0 cursor-pointer items-center gap-2.5 px-2 py-1.5 text-left transition-colors hover:bg-muted/50"
              >
                <Avatar name={s.fullName} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13px] font-semibold">{s.fullName}</span>
                  <span className="flex items-center gap-1.5 text-[12px] text-muted-foreground">
                    {c ? (
                      <>
                        <CheckCircle2 className="size-3.5 text-success" /> {score(c.average)} ·{' '}
                        {ratingLabel(c.average)}
                        <Change value={change} />
                      </>
                    ) : (
                      <>
                        <CircleDashed className="size-3.5" />
                        {s.previous
                          ? `Last: ${score(s.previous.average)} in ${monthName(s.previous.month)}`
                          : 'Not assessed yet'}
                      </>
                    )}
                  </span>
                </span>
                {c?.levelName && <LevelBadge name={c.levelName} code={c.levelCode} short />}
                <ChevronRight className="size-4 shrink-0 text-muted-foreground/60" />
              </button>
            );
          })}
        </Card>
      )}

      {open && (
        <AssessDialog
          sheet={sheet}
          studentId={open}
          onClose={() => setOpen(null)}
          onNext={(id) => setOpen(id)}
        />
      )}
    </div>
  );
}

function AssessDialog({
  sheet,
  studentId,
  onClose,
  onNext,
}: {
  sheet: SkillSheet;
  studentId: string;
  onClose: () => void;
  onNext: (id: string) => void;
}) {
  const index = sheet.students.findIndex((s) => s.id === studentId);
  const student = sheet.students[index]!;
  const editable = sheet.editable;
  const areas = sheet.framework.areas
    .filter((a) => a.isActive)
    .map((a) => ({ ...a, skills: a.skills.filter((k) => k.isActive) }))
    .filter((a) => a.skills.length);
  const [ratings, setRatings] = useState<Record<string, number>>(
    () => student.current?.ratings ?? {},
  );
  const [comment, setComment] = useState(student.current?.comment ?? '');
  const [goals, setGoals] = useState(student.current?.goals ?? '');
  const save = useSaveAssessment();
  const all = areas.flatMap((a) => a.skills);
  const left = all.filter((k) => !ratings[k.id]).length;
  const values = all.map((k) => ratings[k.id]).filter((v): v is number => !!v);
  const avg = values.length
    ? Math.round((values.reduce((a, b) => a + b, 0) / values.length) * 100)
    : null;
  const nextPending = sheet.students.find((s, i) => i > index && !s.current);

  async function submit(goNext: boolean) {
    if (left) return toast.error(`Rate every skill (${left} left)`);
    try {
      await save.mutateAsync({
        batchId: sheet.batch.id,
        studentId,
        ratings: all.map((k) => ({ skillId: k.id, rating: ratings[k.id]! })),
        comment: comment.trim() || null,
        goals: goals.trim() || null,
      });
      toast.success(`Saved ${student.fullName}`);
      if (goNext && nextPending) onNext(nextPending.id);
      else onClose();
    } catch (err) {
      toast.error('Could not save', { description: errorMessage(err) });
    }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{student.fullName}</DialogTitle>
          <DialogDescription>
            {sheet.framework.sport.name} · {monthName(sheet.month)}
            {student.previous &&
              ` · last time ${score(student.previous.average)} (${monthName(student.previous.month)})`}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          {areas.map((area) => (
            <section key={area.id}>
              <h3 className="mb-1 text-[11px] font-semibold tracking-wider text-muted-foreground uppercase">
                {area.name}
              </h3>
              <div className="divide-y rounded-xl border">
                {area.skills.map((k) => {
                  const prev = student.previous?.ratings[k.id];
                  const v = ratings[k.id];
                  return (
                    <div
                      key={k.id}
                      className="flex flex-wrap items-center gap-x-3 gap-y-1 px-2.5 py-1.5"
                    >
                      <div className="min-w-0 flex-1 basis-40">
                        <p className="text-[13px] font-medium">{k.name}</p>
                        <p className="truncate text-[11px] text-muted-foreground">
                          {v ? RATING_LABELS[v - 1] : (k.description ?? 'Not rated')}
                          {prev ? ` · last time ${prev}` : ''}
                        </p>
                      </div>
                      <div role="radiogroup" aria-label={k.name} className="flex gap-1">
                        {[1, 2, 3, 4, 5].map((n) => (
                          <button
                            key={n}
                            type="button"
                            role="radio"
                            aria-checked={v === n}
                            aria-label={`${n} – ${RATING_LABELS[n - 1]}`}
                            title={RATING_LABELS[n - 1]}
                            disabled={!editable}
                            onClick={() => setRatings((r) => ({ ...r, [k.id]: n }))}
                            className={cn(
                              'relative flex size-8 cursor-pointer items-center justify-center rounded-lg border text-[13px] font-semibold transition-colors disabled:cursor-default',
                              v === n
                                ? 'border-primary bg-primary text-primary-foreground'
                                : v && n < v
                                  ? 'border-primary/30 bg-primary/10 text-primary'
                                  : 'bg-card hover:bg-muted',
                            )}
                          >
                            {n}
                            {prev === n && v !== n && (
                              <span
                                aria-hidden
                                className="absolute -bottom-1 left-1/2 size-1.5 -translate-x-1/2 rounded-full bg-muted-foreground/60"
                              />
                            )}
                          </button>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>
          ))}

          <label className="block space-y-1">
            <span className="text-[13px] font-medium">How it is going</span>
            <Textarea
              rows={2}
              maxLength={1000}
              value={comment}
              disabled={!editable}
              onChange={(e) => setComment(e.target.value)}
              placeholder="Shown to parents on the progress report"
            />
          </label>
          <label className="block space-y-1">
            <span className="text-[13px] font-medium">Goals for next month</span>
            <Textarea
              rows={2}
              maxLength={1000}
              value={goals}
              disabled={!editable}
              onChange={(e) => setGoals(e.target.value)}
            />
          </label>
        </div>

        {editable ? (
          <DialogFooter className="sticky bottom-0 z-10 -mx-1 flex-wrap border-t bg-card px-1 pt-2">
            <div className="basis-full text-[12px] text-muted-foreground sm:mr-auto sm:basis-auto">
              {avg !== null ? (
                <>
                  Average <b className="text-foreground">{score(avg)}</b> · {ratingLabel(avg)}
                </>
              ) : (
                'Tap 1–5 for each skill'
              )}
              {left > 0 && (
                <Badge variant="muted" className="ml-1.5">
                  {left} left
                </Badge>
              )}
            </div>
            <Button variant="outline" loading={save.isPending} onClick={() => void submit(false)}>
              Save
            </Button>
            {nextPending && (
              <Button loading={save.isPending} onClick={() => void submit(true)}>
                Save & next
              </Button>
            )}
          </DialogFooter>
        ) : (
          <p className="flex items-center gap-1.5 text-[12px] text-muted-foreground">
            <Lock className="size-3.5" /> Only the batch’s coach can rate, during the month.
          </p>
        )}
      </DialogContent>
    </Dialog>
  );
}
