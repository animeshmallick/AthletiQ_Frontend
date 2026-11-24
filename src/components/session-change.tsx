/**
 * Moving a session (another day and/or time) or adding an extra one, with a live check: what
 * blocks it, what to confirm, and whether an admin has to approve (less than 24 hours' notice).
 * Also the badge that shows where a session came from, and undoing a change.
 */
import {
  AlertTriangle,
  CalendarClock,
  CalendarPlus,
  CircleAlert,
  Clock3,
  RotateCcw,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { useUser } from '@/app/auth';
import { Field } from '@/components/common';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/controls';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/overlays';
import { Badge, Input, Textarea } from '@/components/ui/primitives';
import { ApiError, errorMessage } from '@/lib/api';
import {
  previewChange,
  useCreateChange,
  useReviewChange,
  type ChangeInput,
  type ChangePreview,
} from '@/lib/courses';
import { addDays, formatLongDate, formatShortDate, formatTimeRange, today } from '@/lib/format';
import type { SessionOrigin } from '@/lib/types';

const hhmm = (t: string) => t.slice(0, 5);

/** "Moved from Wed, 11 Mar" / "New time" / "Extra session". */
export function OriginBadge({
  origin,
  date,
  className,
}: {
  origin?: SessionOrigin | null;
  date?: string;
  className?: string;
}) {
  if (!origin || origin.kind === 'regular') return null;
  if (origin.kind === 'extra')
    return (
      <Badge variant="default" className={className}>
        <CalendarPlus /> Extra session
      </Badge>
    );
  const sameDay = origin.originalDate === date;
  return (
    <Badge variant="warning" className={className}>
      <CalendarClock />
      {sameDay || !origin.originalDate
        ? 'New time'
        : `Moved from ${formatShortDate(origin.originalDate)}`}
    </Badge>
  );
}

export interface SessionRef {
  date: string;
  startTime: string;
  endTime: string;
  origin?: SessionOrigin | null;
}

/**
 * Reschedule `session` of the batch, or (without a session) add an extra session. Closes itself
 * once the change is saved.
 */
export function SessionChangeDialog({
  batch,
  session,
  defaultDate,
  onClose,
  onSaved,
}: {
  batch: { id: string; name: string; startTime: string; endTime: string };
  session?: SessionRef | null;
  /** For a new extra session. */
  defaultDate?: string;
  onClose: () => void;
  onSaved?: (change: { id: string; status: string }) => void;
}) {
  const me = useUser();
  const isAdmin = me.role === 'admin';
  const extra = !session;
  const [date, setDate] = useState(session?.date ?? defaultDate ?? addDays(today(), 1));
  const [startTime, setStart] = useState(hhmm(session?.startTime ?? batch.startTime));
  const [endTime, setEnd] = useState(hhmm(session?.endTime ?? batch.endTime));
  const [reason, setReason] = useState('');
  const [confirmed, setConfirmed] = useState<string | null>(null);
  /** The latest check, with the inputs it was made for (a stale one is never shown). */
  const [result, setResult] = useState<{ key: string; preview: ChangePreview } | null>(null);
  const create = useCreateChange(batch.id);
  const unchanged =
    !!session &&
    date === session.date &&
    startTime === hhmm(session.startTime) &&
    endTime === hhmm(session.endTime);
  const canCheck = !!date && !!startTime && !!endTime && !unchanged;
  const key = [date, startTime, endTime].join('|');
  const check = canCheck && result?.key === key ? result.preview : null;
  const checking = canCheck && !check;

  const body: ChangeInput = {
    sessionDate: session?.date,
    date,
    startTime,
    endTime,
    reason: reason.trim() || null,
  };

  // Live check, a moment after the last edit.
  useEffect(() => {
    if (!canCheck) return;
    let live = true;
    const t = setTimeout(() => {
      const fail = (err: unknown): ChangePreview => ({
        ok: false,
        errors: [errorMessage(err)],
        warnings: [],
        kind: session ? 'reschedule' : 'extra',
        originalDate: null,
        needsApproval: false,
        noticeHours: null,
      });
      previewChange(batch.id, { sessionDate: session?.date, date, startTime, endTime })
        .catch(fail)
        .then((preview) => live && setResult({ key, preview }));
    }, 350);
    return () => {
      live = false;
      clearTimeout(t);
    };
  }, [batch.id, session, date, startTime, endTime, canCheck, key]);

  const needsConfirm = !!check?.warnings.length;
  // Confirming covers the warnings of this exact choice only.
  const isConfirmed = confirmed === key;
  const canSave = !!check?.ok && (!needsConfirm || isConfirmed);

  async function save() {
    try {
      const saved = await create.mutateAsync({ ...body, confirm: needsConfirm && isConfirmed });
      toast.success(
        saved.status === 'pending'
          ? 'Sent for approval'
          : extra
            ? 'Extra session added'
            : 'Session moved',
        {
          description:
            saved.status === 'pending'
              ? 'Less than 24 hours’ notice, so an admin approves it. You’ll be notified.'
              : `${formatLongDate(saved.date)} · ${formatTimeRange(saved.startTime, saved.endTime)}. Everyone involved is notified.`,
        },
      );
      onSaved?.(saved);
      onClose();
    } catch (err) {
      // Someone else changed things meanwhile: show the fresh warnings to confirm.
      const warnings =
        (err instanceof ApiError &&
          (err.details as { warnings?: ChangePreview['warnings'] } | undefined)?.warnings) ||
        null;
      if (warnings && check) setResult({ key, preview: { ...check, warnings } });
      toast.error(extra ? 'Could not add the session' : 'Could not move the session', {
        description: errorMessage(err),
      });
    }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{extra ? 'Add an extra session' : 'Move this session'}</DialogTitle>
          <DialogDescription>
            {extra
              ? `A one-off ${batch.name} session on a day it doesn’t usually run. Every student of the batch is expected.`
              : `${batch.name} · ${formatLongDate(session.date)} · ${formatTimeRange(session.startTime, session.endTime)}. Its students, makeups and lesson plan move with it.`}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2.5">
          <Field
            label={extra ? 'Day' : 'New day'}
            hint={
              extra
                ? 'Up to 60 days ahead, on a day the batch doesn’t run.'
                : 'Same day for a new time, or a day the batch doesn’t run (within 14 days).'
            }
          >
            <Input
              type="date"
              aria-label="Day"
              value={date}
              min={today()}
              onChange={(e) => e.target.value && setDate(e.target.value)}
            />
          </Field>
          <div className="grid grid-cols-2 gap-2">
            <Field label="Starts">
              <Input
                type="time"
                aria-label="Starts"
                value={startTime}
                onChange={(e) => e.target.value && setStart(e.target.value)}
              />
            </Field>
            <Field label="Ends">
              <Input
                type="time"
                aria-label="Ends"
                value={endTime}
                onChange={(e) => e.target.value && setEnd(e.target.value)}
              />
            </Field>
          </div>
          <Field label="Reason (optional)">
            <Textarea
              aria-label="Reason"
              rows={2}
              maxLength={300}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder={extra ? 'e.g. Make up the rain-out' : 'e.g. Ground booked for an event'}
            />
          </Field>

          <div aria-live="polite" className="space-y-1.5">
            {unchanged ? (
              <p className="text-[12px] text-muted-foreground">Pick a new day or time.</p>
            ) : checking ? (
              <p className="text-[12px] text-muted-foreground">Checking…</p>
            ) : check ? (
              <>
                {check.errors.map((m) => (
                  <p
                    key={m}
                    role="alert"
                    className="flex items-start gap-1.5 rounded-lg bg-destructive/8 px-2.5 py-1.5 text-[12.5px] text-destructive"
                  >
                    <CircleAlert className="mt-px size-3.5 shrink-0" /> {m}
                  </p>
                ))}
                {check.warnings.map((w) => (
                  <div
                    key={w.code}
                    className="rounded-lg border border-warning/40 bg-warning/10 px-2.5 py-1.5 text-[12.5px]"
                  >
                    <p className="flex items-start gap-1.5 font-medium">
                      <AlertTriangle className="mt-px size-3.5 shrink-0 text-warning-foreground dark:text-warning" />
                      {w.message}
                    </p>
                    {w.students && (
                      <p className="mt-0.5 text-muted-foreground">
                        {w.students
                          .slice(0, 5)
                          .map((s) => `${s.fullName} (${s.batchName})`)
                          .join(', ')}
                        {w.students.length > 5 ? ` and ${w.students.length - 5} more` : ''}
                      </p>
                    )}
                  </div>
                ))}
                {needsConfirm && check.ok && (
                  <label className="flex items-center gap-2 text-[13px]">
                    <Checkbox
                      checked={isConfirmed}
                      onCheckedChange={(v) => setConfirmed(v === true ? key : null)}
                      aria-label="Go ahead anyway"
                    />
                    Go ahead anyway
                  </label>
                )}
                {check.ok && (
                  <p className="flex items-center gap-1.5 text-[12px] text-muted-foreground">
                    <Clock3 className="size-3.5" />
                    {check.needsApproval
                      ? 'Less than 24 hours’ notice: an admin approves it first.'
                      : isAdmin
                        ? 'Takes effect straight away.'
                        : 'Takes effect straight away; admins are told.'}
                  </p>
                )}
              </>
            ) : null}
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button loading={create.isPending} disabled={!canSave} onClick={() => void save()}>
            {check?.needsApproval ? 'Ask for approval' : extra ? 'Add session' : 'Move session'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Puts a moved session back (or drops an extra one), before it starts. */
export function UndoChangeButton({
  changeId,
  kind,
}: {
  changeId: string;
  kind: 'moved' | 'extra';
}) {
  const review = useReviewChange();
  return (
    <Button
      variant="ghost"
      size="sm"
      className="text-muted-foreground"
      loading={review.isPending}
      onClick={() =>
        review.mutate(
          { id: changeId, action: 'cancel' },
          {
            onSuccess: () =>
              toast.success(kind === 'extra' ? 'Extra session removed' : 'Back to its usual time'),
            onError: (e) => toast.error('Could not undo', { description: errorMessage(e) }),
          },
        )
      }
    >
      <RotateCcw /> {kind === 'extra' ? 'Remove extra session' : 'Undo move'}
    </Button>
  );
}

/** True until the session's start (IST wall clock, like the rest of the app). */
export function notStarted(date: string, startTime: string, now: Date = new Date()) {
  const d = today(now);
  if (date !== d) return date > d;
  const ist = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Kolkata',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(now);
  return hhmm(startTime) > ist;
}
