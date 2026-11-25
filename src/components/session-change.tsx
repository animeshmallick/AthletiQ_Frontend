/**
 * Rescheduling a missed session (a calendar of the next 30 days, with a switch that highlights the
 * days suiting every student's billing month), moving a session in advance and, for admins, adding
 * an extra one. Also the badge that shows where a session came from, and undoing a change.
 */
import {
  AlertTriangle,
  CalendarClock,
  CalendarPlus,
  CircleAlert,
  RotateCcw,
  Sparkles,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { useUser } from '@/app/auth';
import { CancelSessionButton, RestoreSessionButton } from '@/components/cancel-session';
import { Field, ListSkeleton } from '@/components/common';
import { Button } from '@/components/ui/button';
import { Checkbox, Switch } from '@/components/ui/controls';
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
  useSmartDates,
  useUndoChange,
  type ChangeInput,
  type ChangePreview,
  type ChangeWarning,
  type SmartDates,
} from '@/lib/cycles';
import {
  addDays,
  formatLongDate,
  formatShortDate,
  formatTimeRange,
  isoWeekday,
  plural,
  today,
  WEEKDAYS,
} from '@/lib/format';
import { hhmm, mayCancelOn, notStarted } from '@/lib/session-origin';
import type { SessionOrigin } from '@/lib/types';
import { cn } from '@/lib/utils';

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
  const extra = origin.kind === 'extra';
  return (
    <Badge variant={extra ? 'default' : 'warning'} className={className}>
      {extra ? <CalendarPlus /> : <CalendarClock />}
      {extra
        ? 'Extra session'
        : !origin.originalDate || origin.originalDate === date
          ? 'New time'
          : `Moved from ${formatShortDate(origin.originalDate)}`}
    </Badge>
  );
}

/** The days a missed session can go to, Monday first; smart ones highlighted when asked. */
function DayGrid({
  data,
  value,
  smart,
  onPick,
}: {
  data: SmartDates;
  value: string;
  smart: boolean;
  onPick: (date: string) => void;
}) {
  if (!data.days.length) return null;
  const lead = isoWeekday(data.days[0]!.date) - 1;
  return (
    <div className="grid grid-cols-7 gap-1" role="group" aria-label="Choose a day">
      {WEEKDAYS.map((w) => (
        <span key={w.value} className="text-center text-[10px] font-medium text-muted-foreground">
          {w.min}
        </span>
      ))}
      {Array.from({ length: lead }, (_, i) => (
        <span key={`lead-${i}`} />
      ))}
      {data.days.map((d) => {
        const marked = smart && d.smart;
        return (
          <button
            key={d.date}
            type="button"
            disabled={!!d.blocked}
            aria-pressed={d.date === value}
            aria-label={`${formatLongDate(d.date)}${marked ? ', suits every student' : ''}`}
            title={
              d.blocked ??
              (d.outside.length ? `After the billing month of ${d.outside.join(', ')}` : undefined)
            }
            onClick={() => onPick(d.date)}
            className={cn(
              'flex h-10 flex-col items-center justify-center rounded-lg border text-[13px] leading-none font-medium transition-colors',
              'disabled:border-transparent disabled:text-muted-foreground/40',
              marked && 'border-success bg-success/15 text-success',
              d.date === value && 'border-primary bg-primary text-primary-foreground',
            )}
          >
            {Number(d.date.slice(8))}
            <span className="mt-0.5 text-[8.5px] font-normal opacity-70">
              {formatShortDate(d.date)
                .replace(/[^A-Za-z]/g, '')
                .slice(0, 3)}
            </span>
          </button>
        );
      })}
    </div>
  );
}

export interface SessionRef {
  date: string;
  startTime: string;
  endTime: string;
}

/**
 * `missed` reschedules a missed session; `session` alone moves one in advance; neither
 * adds an extra session (admin).
 */
export function SessionChangeDialog({
  batch,
  session,
  missed = false,
  onClose,
}: {
  batch: { id: string; name: string; startTime: string; endTime: string };
  session?: SessionRef | null;
  missed?: boolean;
  onClose: () => void;
}) {
  const isAdmin = useUser().role === 'admin';
  const extra = !session;
  const [date, setDate] = useState(missed ? '' : (session?.date ?? addDays(today(), 1)));
  const [startTime, setStart] = useState(hhmm(session?.startTime ?? batch.startTime));
  const [endTime, setEnd] = useState(hhmm(session?.endTime ?? batch.endTime));
  const [reason, setReason] = useState('');
  const [smart, setSmart] = useState(false);
  const days = useSmartDates(batch.id, session?.date ?? '', missed);
  /** The choice whose warnings were confirmed. */
  const [confirmed, setConfirmed] = useState<string | null>(null);
  /** The latest check, with the inputs it was made for (a stale one is never shown). */
  const [result, setResult] = useState<{ key: string; preview: ChangePreview } | null>(null);
  const create = useCreateChange(batch.id);
  const unchanged =
    !!session &&
    !missed &&
    date === session.date &&
    startTime === hhmm(session.startTime) &&
    endTime === hhmm(session.endTime);
  const canCheck = !!date && !!startTime && !!endTime && !unchanged;
  const key = [date, startTime, endTime].join('|');
  const check = canCheck && result?.key === key ? result.preview : null;
  const sessionDate = session?.date;

  useEffect(() => {
    if (!canCheck) return;
    let live = true;
    const t = setTimeout(() => {
      previewChange(batch.id, { sessionDate, date, startTime, endTime })
        .catch((err: unknown): ChangePreview => ({
          ok: false,
          errors: [errorMessage(err)],
          warnings: [],
        }))
        .then((preview) => live && setResult({ key, preview }));
    }, 350);
    return () => {
      live = false;
      clearTimeout(t);
    };
  }, [batch.id, sessionDate, date, startTime, endTime, canCheck, key]);

  const needsConfirm = !!check?.warnings.length;
  const isConfirmed = confirmed === key;
  const canSave = !!check?.ok && (!needsConfirm || isConfirmed);

  async function save() {
    const body: ChangeInput = {
      sessionDate,
      date,
      startTime,
      endTime,
      reason: reason.trim() || null,
      confirm: needsConfirm && isConfirmed,
    };
    try {
      const saved = await create.mutateAsync(body);
      toast.success(
        extra ? 'Extra session added' : missed ? 'Session rescheduled' : 'Session moved',
        {
          description: `${formatLongDate(saved.date)} · ${formatTimeRange(saved.startTime, saved.endTime)}`,
        },
      );
      onClose();
    } catch (err) {
      // Something changed meanwhile: show the fresh warnings to confirm.
      const warnings =
        err instanceof ApiError
          ? (err.details as { warnings?: ChangeWarning[] } | undefined)?.warnings
          : undefined;
      if (warnings) {
        setResult({ key, preview: { ok: true, errors: [], warnings } });
        setConfirmed(null);
      }
      toast.error('Could not save', { description: errorMessage(err) });
    }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {extra
              ? 'Add an extra session'
              : missed
                ? 'Reschedule missed session'
                : 'Move this session'}
          </DialogTitle>
          <DialogDescription>
            {extra
              ? `A one-off ${batch.name} session on a day it doesn’t usually run. Every student is expected.`
              : `${batch.name} · ${formatLongDate(session.date)} · ${formatTimeRange(session.startTime, session.endTime)}. Same place; its students attend free of extra charge.`}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          {missed && (
            <>
              <label className="flex items-center justify-between gap-3 rounded-xl border px-3 py-2">
                <span className="text-[13px]">
                  <span className="flex items-center gap-1.5 font-medium">
                    <Sparkles className="size-4 text-success" /> Smart dates
                  </span>
                  <span className="text-[12px] text-muted-foreground">
                    Highlight days inside every student’s billing month
                  </span>
                </span>
                <Switch checked={smart} onCheckedChange={setSmart} aria-label="Smart dates" />
              </label>
              {days.isPending ? (
                <ListSkeleton rows={3} />
              ) : days.isError ? (
                <p role="alert" className="text-[13px] text-destructive">
                  {errorMessage(days.error)}
                </p>
              ) : (
                <>
                  {smart && days.data.message && (
                    <p role="status" className="rounded-lg bg-warning/12 px-2.5 py-2 text-[12.5px]">
                      {days.data.message}
                    </p>
                  )}
                  <DayGrid data={days.data} value={date} smart={smart} onPick={setDate} />
                  <p className="text-[12px] text-muted-foreground">
                    {plural(days.data.students, 'student')} affected.{' '}
                    {days.data.days.length
                      ? 'Greyed-out days aren’t available.'
                      : 'The 30 days are over.'}
                  </p>
                </>
              )}
            </>
          )}
          {(!missed || isAdmin) && (
            <Field
              label={extra ? 'Day' : missed ? 'Or another day' : 'New day'}
              hint={
                missed
                  ? 'Admins can go past the 30 days.'
                  : session && !isAdmin
                    ? 'Within 30 days, on a day the batch doesn’t run.'
                    : undefined
              }
            >
              <Input
                type="date"
                aria-label="Day"
                value={date}
                min={today()}
                onChange={(e) => setDate(e.target.value)}
              />
            </Field>
          )}
          <div className="grid grid-cols-2 gap-2">
            <Field label="Starts">
              <Input
                type="time"
                aria-label="Starts"
                value={startTime}
                onChange={(e) => setStart(e.target.value)}
              />
            </Field>
            <Field label="Ends">
              <Input
                type="time"
                aria-label="Ends"
                value={endTime}
                onChange={(e) => setEnd(e.target.value)}
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
            />
          </Field>
          <div aria-live="polite" className="space-y-1.5">
            {!canCheck ? (
              <p className="text-[12px] text-muted-foreground">
                {unchanged ? 'Pick a new day or time.' : 'Pick a day.'}
              </p>
            ) : !check ? (
              <p className="text-[12px] text-muted-foreground">Checking…</p>
            ) : (
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
                        {w.students.map((s) => `${s.fullName} (${s.detail})`).join(', ')}
                      </p>
                    )}
                  </div>
                ))}
                {check.ok && needsConfirm && (
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
                  <p className="text-[12px] text-muted-foreground">
                    Takes effect straight away{isAdmin ? '.' : '; admins are told.'}
                  </p>
                )}
              </>
            )}
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button loading={create.isPending} disabled={!canSave} onClick={() => void save()}>
            {extra ? 'Add session' : missed ? 'Reschedule' : 'Move session'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Puts a rescheduled session back (or drops an extra one), before it starts. */
export function UndoChangeButton({ changeId, extra }: { changeId: string; extra: boolean }) {
  const undo = useUndoChange();
  return (
    <Button
      variant="ghost"
      size="sm"
      className="text-muted-foreground"
      loading={undo.isPending}
      onClick={() =>
        undo.mutate(changeId, {
          onSuccess: () => toast.success(extra ? 'Extra session removed' : 'Reschedule undone'),
          onError: (e) => toast.error('Could not undo', { description: errorMessage(e) }),
        })
      }
    >
      <RotateCcw /> {extra ? 'Remove' : 'Undo'}
    </Button>
  );
}

/**
 * Actions for one session: cancel or restore, or reschedule when missed (anyone who runs
 * it), move in advance, or undo a change.
 */
export function SessionActions({
  batch,
  session,
  origin,
  cancelled,
  recorded,
  mine,
}: {
  batch: { id: string; name: string; startTime: string; endTime: string };
  session: SessionRef;
  origin?: SessionOrigin | null;
  cancelled: boolean;
  /** Attendance or a check-in exists: it happened, so it stays as it is. */
  recorded: boolean;
  /** The batch's own coach is looking (substitutes only reschedule missed sessions). */
  mine: boolean;
}) {
  const isAdmin = useUser().role === 'admin';
  const [open, setOpen] = useState(false);
  const canMove = !recorded && notStarted(session.date, session.startTime);
  const movable =
    (cancelled || (canMove && (isAdmin || mine))) && (isAdmin || origin?.kind !== 'extra');
  const changed = origin?.changeId && origin.kind !== 'regular' ? origin.changeId : null;
  const cancellable = !cancelled && !recorded && mayCancelOn(session.date, isAdmin);
  const undoable = canMove && (isAdmin || origin?.kind !== 'extra') ? changed : null;
  if (!movable && !cancellable && !cancelled && !undoable) return null;
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {movable && (
        <Button size="sm" variant="tonal" onClick={() => setOpen(true)}>
          <CalendarClock /> {cancelled ? 'Reschedule' : 'Move session'}
        </Button>
      )}
      {cancellable && <CancelSessionButton batchId={batch.id} date={session.date} />}
      {cancelled && <RestoreSessionButton batchId={batch.id} date={session.date} />}
      {undoable && <UndoChangeButton changeId={undoable} extra={origin?.kind === 'extra'} />}
      {open && (
        <SessionChangeDialog
          batch={batch}
          session={session}
          missed={cancelled}
          onClose={() => setOpen(false)}
        />
      )}
    </div>
  );
}
