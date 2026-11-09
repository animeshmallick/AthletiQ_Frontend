import { zodResolver } from '@hookform/resolvers/zod';
import {
  CalendarCheck2,
  ClipboardList,
  FileText,
  LayoutGrid,
  MapPin,
  Pencil,
  Plus,
  Users,
} from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Controller, useForm, useWatch } from 'react-hook-form';
import { Link, useParams } from 'react-router';
import { toast } from 'sonner';
import { z } from 'zod';
import { useUser } from '@/app/auth';
import {
  Avatar,
  EmptyState,
  ErrorState,
  Field,
  ListSkeleton,
  PageHeader,
  SearchInput,
} from '@/components/common';
import { BackLink } from '@/components/back-link';
import { Button } from '@/components/ui/button';
import { Switch, WeekdayPicker } from '@/components/ui/controls';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/overlays';
import {
  Badge,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Input,
  Select,
  Skeleton,
} from '@/components/ui/primitives';
import {
  formatDate,
  formatDuration,
  formatTime,
  formatTimeRange,
  isoWeekday,
  money,
  plural,
  today,
  WEEKDAYS,
  weekdaysLabel,
} from '@/lib/format';
import { applyServerErrors } from '@/lib/forms';
import {
  useBatch,
  useBatches,
  useDashboard,
  useFeePlans,
  useLocations,
  useSaveBatch,
  useUsers,
} from '@/lib/queries';
import type { Batch } from '@/lib/types';
import { cn } from '@/lib/utils';
import { BATCH_REPORT_INCLUDES, ReportDialog, slug } from '@/components/report-dialog';
import { useSports } from '@/lib/skills';
import { scheduleGroups, scheduleLabel, timesOn, timesVary } from '@/lib/batch-times';

const schema = z
  .object({
    name: z.string().trim().min(2, 'Enter a name').max(120),
    coachId: z.string().min(1, 'Pick a coach'),
    locationId: z.string().min(1, 'Pick a location'),
    sportId: z.string().min(1, 'Pick a sport'),
    feePlanId: z.string().min(1, 'Pick a fee plan'),
    weekdays: z.array(z.number()).min(1, 'Pick at least one day'),
    startTime: z.string().min(1, 'Required'),
    endTime: z.string().min(1, 'Required'),
    /** Days that run at their own time (ISO weekday → start/end). */
    dayTimes: z.record(z.string(), z.object({ start: z.string(), end: z.string() })),
    capacity: z
      .string()
      .trim()
      .min(1, 'Enter the most students this batch can take')
      .regex(/^\d+$/, 'Whole number')
      .refine((v) => Number(v) >= 1 && Number(v) <= 1000, 'Between 1 and 1000'),
    isActive: z.boolean(),
  })
  .refine((v) => v.endTime > v.startTime, {
    path: ['endTime'],
    message: 'Must be after the start time',
  })
  .superRefine((v, ctx) => {
    for (const [d, t] of Object.entries(v.dayTimes)) {
      if (!v.weekdays.includes(Number(d))) continue;
      if (!t.start || !t.end || t.end <= t.start)
        ctx.addIssue({
          code: 'custom',
          path: ['dayTimes', d],
          message: 'End must be after start',
        });
    }
  });

type Values = z.infer<typeof schema>;

export function BatchDialog({
  open,
  onOpenChange,
  batch,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  batch?: Batch;
}) {
  const save = useSaveBatch();
  const coaches = useUsers({ role: 'coach', status: 'active', pageSize: 100 });
  const locations = useLocations({ active: 'true' });
  const sports = useSports();
  const plans = useFeePlans({ active: 'true', forBatch: 'true' });
  const form = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: batch
      ? {
          name: batch.name,
          coachId: batch.coach.id,
          locationId: batch.location.id,
          sportId: batch.sport.id,
          feePlanId: batch.feePlan.id,
          weekdays: batch.weekdays,
          startTime: batch.startTime.slice(0, 5),
          endTime: batch.endTime.slice(0, 5),
          dayTimes: Object.fromEntries(
            Object.entries(batch.dayTimes ?? {}).map(([d, t]) => [
              d,
              { start: t!.start.slice(0, 5), end: t!.end.slice(0, 5) },
            ]),
          ),
          capacity: String(batch.capacity),
          isActive: batch.isActive,
        }
      : {
          name: '',
          coachId: '',
          locationId: '',
          sportId: '',
          feePlanId: '',
          weekdays: [1, 2, 3, 4, 5, 6],
          startTime: '06:00',
          endTime: '08:00',
          dayTimes: {},
          capacity: '',
          isActive: true,
        },
  });
  const { register, control, handleSubmit, formState, reset } = form;
  const e = formState.errors;
  useEffect(() => {
    if (!open) reset();
  }, [open, reset]);
  const close = (o: boolean) => onOpenChange(o);
  const watchedDays = useWatch({ control, name: 'weekdays' });
  const watchedPlan = useWatch({ control, name: 'feePlanId' });
  const watchedStart = useWatch({ control, name: 'startTime' });
  const watchedEnd = useWatch({ control, name: 'endTime' });
  // Plans priced for as many days a week as the batch runs (plus the current one), and the
  // built-in free plan, which fits any days.
  const fitting = (plans.data ?? []).filter(
    (p) => p.isSystem || p.daysPerWeek === watchedDays.length || p.id === batch?.feePlan.id,
  );
  const paidFitting = fitting.filter((p) => !p.isSystem);
  const daysChanged =
    !!batch && [...watchedDays].sort().join() !== [...batch.weekdays].sort().join();

  const onSubmit = handleSubmit(async (v) => {
    try {
      await save.mutateAsync({
        id: batch?.id,
        ...v,
        // Only days the batch still runs (the server also drops ones equal to the usual time).
        dayTimes: Object.fromEntries(
          Object.entries(v.dayTimes).filter(([d]) => v.weekdays.includes(Number(d))),
        ),
        capacity: Number(v.capacity),
      });
      toast.success(
        batch
          ? daysChanged && batch.memberCount
            ? `Batch updated · ${plural(batch.memberCount, 'student')} now train on the new days`
            : 'Batch updated'
          : 'Batch created',
      );
      close(false);
    } catch (err) {
      applyServerErrors(err, form.setError, 'Could not save batch');
    }
  });

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{batch ? 'Edit batch' : 'New batch'}</DialogTitle>
          <DialogDescription>
            A batch is a recurring session with one coach at one location.
          </DialogDescription>
        </DialogHeader>
        <form id="batch-form" onSubmit={onSubmit} noValidate className="grid gap-3 sm:grid-cols-2">
          <Field label="Name" required error={e.name?.message} className="sm:col-span-2">
            <Input placeholder="e.g. Morning U-12" autoFocus {...register('name')} />
          </Field>
          <Field
            label="Coach"
            required
            error={e.coachId?.message}
            hint={batch ? 'Reassigning moves all students to the new coach.' : undefined}
          >
            <Select {...register('coachId')}>
              <option value="">Select…</option>
              {coaches.data?.data.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Location" required error={e.locationId?.message}>
            <Select {...register('locationId')}>
              <option value="">Select…</option>
              {locations.data?.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field
            label="Sport"
            required
            error={e.sportId?.message}
            hint="Decides the skills its students are assessed on."
            className="sm:col-span-2"
          >
            <Select required {...register('sportId')}>
              <option value="">Select…</option>
              {sports.data
                ?.filter((sp) => sp.sport.isActive || sp.sport.id === batch?.sport.id)
                .map((sp) => (
                  <option key={sp.sport.id} value={sp.sport.id}>
                    {sp.sport.name}
                  </option>
                ))}
            </Select>
          </Field>
          <Field label="Runs on" required error={e.weekdays?.message} className="sm:col-span-2">
            <Controller
              control={control}
              name="weekdays"
              render={({ field }) => (
                <WeekdayPicker value={field.value} onChange={field.onChange} />
              )}
            />
          </Field>
          <Field
            label="Fee plan"
            required
            error={e.feePlanId?.message}
            hint={
              batch && watchedPlan && watchedPlan !== batch.feePlan.id && batch.memberCount
                ? `Applies to ${plural(batch.memberCount, 'student')} from their next invoice.`
                : `Every student in the batch is billed this. Plans for ${watchedDays.length} day${watchedDays.length === 1 ? '' : 's'} a week.`
            }
            className="sm:col-span-2"
          >
            <Select required {...register('feePlanId')}>
              <option value="">Select…</option>
              {fitting.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.isSystem
                    ? `${p.name} · no fee, no invoices`
                    : `${p.name} · ${money(p.monthlyFee)}/month`}
                </option>
              ))}
            </Select>
          </Field>
          {paidFitting.length === 0 && plans.isSuccess && (
            <p className="rounded-xl bg-warning/12 px-3 py-2 text-[13px] sm:col-span-2">
              No paid plan is for {watchedDays.length} day{watchedDays.length === 1 ? '' : 's'} a
              week. Add one under Fee plans, change the days, or make the batch free.
            </p>
          )}
          <Field label="Starts" required error={e.startTime?.message}>
            <Input type="time" {...register('startTime')} />
          </Field>
          <Field label="Ends" required error={e.endTime?.message}>
            <Input type="time" {...register('endTime')} />
          </Field>
          <Controller
            control={control}
            name="dayTimes"
            render={({ field }) => (
              <DayTimesEditor
                value={field.value}
                onChange={field.onChange}
                weekdays={watchedDays}
                start={watchedStart}
                end={watchedEnd}
                errors={e.dayTimes as Record<string, { message?: string }> | undefined}
                changing={!!batch}
              />
            )}
          />
          <Field
            label="Capacity"
            required
            error={e.capacity?.message}
            hint="Most students this batch can take."
          >
            <Input inputMode="numeric" {...register('capacity')} />
          </Field>
          {batch && (
            <Field label="Active">
              <Controller
                control={control}
                name="isActive"
                render={({ field }) => (
                  <Switch checked={field.value} onCheckedChange={field.onChange} />
                )}
              />
            </Field>
          )}
        </form>
        <DialogFooter>
          <Button variant="outline" onClick={() => close(false)}>
            Cancel
          </Button>
          <Button type="submit" form="batch-form" loading={formState.isSubmitting}>
            {batch ? 'Save changes' : 'Create batch'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/**
 * "Some days run at a different time": off by default; when on, each day the batch runs gets
 * its own switch and start/end, starting from the usual time.
 */
function DayTimesEditor({
  value,
  onChange,
  weekdays,
  start,
  end,
  errors,
  changing,
}: {
  value: Record<string, { start: string; end: string }>;
  onChange: (v: Record<string, { start: string; end: string }>) => void;
  weekdays: number[];
  start: string;
  end: string;
  errors?: Record<string, { message?: string }>;
  changing: boolean;
}) {
  const days = [...weekdays].sort((a, b) => a - b);
  const active = days.filter((d) => value[String(d)]);
  const [open, setOpen] = useState(active.length > 0);
  const set = (d: number, t: { start: string; end: string } | null) => {
    const next = { ...value };
    if (t) next[String(d)] = t;
    else delete next[String(d)];
    onChange(next);
  };
  const usual = start && end && end > start ? formatTimeRange(start, end) : 'the usual time';
  return (
    <div className="rounded-xl border border-border p-3 sm:col-span-2">
      <label className="flex cursor-pointer items-center justify-between gap-3">
        <span className="min-w-0">
          <span className="block text-sm font-medium">Some days run at a different time</span>
          <span className="block text-[12px] text-muted-foreground">
            Other days use {usual}.{changing ? ' Changes apply from today.' : ''}
          </span>
        </span>
        <Switch
          checked={open}
          aria-label="Some days run at a different time"
          onCheckedChange={(on) => {
            setOpen(on);
            if (!on) onChange({});
          }}
        />
      </label>
      {open && (
        <ul className="mt-3 space-y-2">
          {days.map((d) => {
            const t = value[String(d)];
            const day = WEEKDAYS[d - 1]!;
            const err = errors?.[String(d)]?.message;
            return (
              <li key={d} className="flex min-h-9 flex-wrap items-center gap-x-3 gap-y-1.5">
                <Switch
                  checked={!!t}
                  aria-label={`${day.long} at its own time`}
                  onCheckedChange={(on) => set(d, on ? { start, end } : null)}
                />
                <span className="w-9 text-sm font-medium">{day.short}</span>
                {t ? (
                  <span className="flex min-w-0 flex-1 items-center gap-2">
                    <Input
                      type="time"
                      aria-label={`${day.long} starts`}
                      value={t.start}
                      onChange={(ev) => set(d, { ...t, start: ev.target.value })}
                      className="min-w-0 flex-1"
                    />
                    <span aria-hidden className="text-muted-foreground">
                      –
                    </span>
                    <Input
                      type="time"
                      aria-label={`${day.long} ends`}
                      value={t.end}
                      aria-invalid={err ? true : undefined}
                      onChange={(ev) => set(d, { ...t, end: ev.target.value })}
                      className="min-w-0 flex-1"
                    />
                  </span>
                ) : (
                  <span className="text-[13px] text-muted-foreground">{usual}</span>
                )}
                {err && (
                  <span role="alert" className="w-full pl-[5.25rem] text-[12px] text-destructive">
                    {err}
                  </span>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function DayDots({ days, compact }: { days: number[]; compact?: boolean }) {
  return (
    <div className="flex gap-0.5" aria-label={weekdaysLabel(days)}>
      {WEEKDAYS.map((d) => (
        <span
          key={d.value}
          className={cn(
            'flex items-center justify-center rounded font-semibold',
            compact ? 'size-5 text-[9px]' : 'size-6 text-[10px]',
            days.includes(d.value)
              ? 'bg-primary/12 text-primary'
              : 'bg-muted text-muted-foreground/50',
          )}
        >
          {d.min}
        </span>
      ))}
    </div>
  );
}

const istClock = new Intl.DateTimeFormat('en-GB', {
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
  timeZone: 'Asia/Kolkata',
});
const toMin = (t: string) => {
  const [h = 0, m = 0] = t.split(':').map(Number);
  return h * 60 + m;
};

/** "Live now" while today's session runs, "Today" before it, otherwise nothing. */
function todayStatus(b: Batch, now: Date) {
  const day = today(now);
  if (!b.isActive || !b.weekdays.includes(isoWeekday(day))) return null;
  const t = timesOn(b, day);
  const mins = toMin(istClock.format(now));
  if (mins >= toMin(t.startTime) && mins < toMin(t.endTime)) return 'live' as const;
  if (mins < toMin(t.startTime)) return 'today' as const;
  return null;
}

function BatchCard({
  b,
  isAdmin,
  attendanceRate,
  status,
  onEdit,
}: {
  b: Batch;
  isAdmin: boolean;
  attendanceRate: number | null | undefined;
  status: 'live' | 'today' | null;
  onEdit: () => void;
}) {
  // Today's time when it runs today (days can differ), otherwise the usual one.
  const t = status ? timesOn(b, today()) : b;
  const [hm, suffix] = formatTime(t.startTime).split(' ');
  const vary = timesVary(b);
  const fill = b.capacity ? Math.min(100, (b.memberCount / b.capacity) * 100) : null;
  const full = b.capacity !== null && b.memberCount >= b.capacity;
  return (
    <Card
      className={cn(
        'relative overflow-hidden p-0 transition-shadow hover:shadow-e2',
        !b.isActive && 'opacity-60',
      )}
    >
      <Link to={`/batches/${b.id}`} className="flex gap-3 p-3 pr-11">
        {/* Start time block */}
        <span
          className={cn(
            'flex w-14 shrink-0 flex-col items-center justify-center rounded-xl py-1.5 text-center',
            status === 'live' ? 'bg-success/12 text-success' : 'bg-primary/10 text-primary',
          )}
        >
          <span className="tabular text-[15px] leading-none font-bold">{hm}</span>
          <span className="mt-0.5 text-[10px] font-semibold uppercase">{suffix}</span>
          <span className="mt-1 text-[10px] text-current/70">
            {formatDuration(toMin(t.endTime) - toMin(t.startTime))}
          </span>
        </span>

        <span className="min-w-0 flex-1 space-y-1.5">
          <span className="flex min-w-0 items-center gap-1.5">
            <span className="truncate text-[15px] font-semibold">{b.name}</span>
            {status === 'live' && (
              <Badge variant="success" className="shrink-0">
                <span className="size-1.5 animate-pulse rounded-full bg-current" /> Live
              </Badge>
            )}
            {status === 'today' && (
              <Badge variant="muted" className="shrink-0">
                Today
              </Badge>
            )}
            {!b.isActive && (
              <Badge variant="muted" className="shrink-0">
                Inactive
              </Badge>
            )}
          </span>
          <span className="flex min-w-0 items-center gap-1.5 text-[12px] text-muted-foreground">
            {isAdmin && (
              <>
                <Avatar name={b.coach.name} className="size-4 text-[7px]" />
                <span className="max-w-[45%] truncate">{b.coach.name}</span>
                <span aria-hidden>·</span>
              </>
            )}
            <MapPin className="size-3 shrink-0" />
            <span className="truncate">{b.location.name}</span>
          </span>
          <DayDots days={b.weekdays} compact />
          {vary && (
            <span className="block truncate text-[11px] text-muted-foreground">
              {/* The time block shows the usual time; list the days that differ. */}
              {scheduleGroups(b)
                .filter((g) => g.time !== formatTimeRange(b.startTime, b.endTime))
                .map((g) => `${g.days.map((d) => WEEKDAYS[d - 1]!.short).join(', ')} ${g.time}`)
                .join(' · ')}
            </span>
          )}
          <span className="flex items-center gap-2 pt-0.5 text-[11px] text-muted-foreground">
            <span className="inline-flex shrink-0 items-center gap-1">
              <Users className="size-3" />
              <b
                className={cn(
                  'tabular text-foreground',
                  full && 'text-warning-foreground dark:text-warning',
                )}
              >
                {b.memberCount}
                {b.capacity ? `/${b.capacity}` : ''}
              </b>
              {b.capacity
                ? full
                  ? 'full'
                  : 'seats'
                : plural(b.memberCount, 'student').replace(/^\d+ /, '')}
            </span>
            {fill !== null && (
              <span
                className="h-1 min-w-8 flex-1 overflow-hidden rounded-full bg-muted"
                aria-hidden
              >
                <span
                  className={cn('block h-full rounded-full', full ? 'bg-warning' : 'bg-primary')}
                  style={{ width: `${fill}%` }}
                />
              </span>
            )}
            {attendanceRate !== undefined && (
              <span
                className="inline-flex shrink-0 items-center gap-1"
                title="Attendance, last 30 days"
              >
                <CalendarCheck2 className="size-3" />
                <b
                  className={cn(
                    'tabular',
                    attendanceRate === null
                      ? 'text-muted-foreground'
                      : attendanceRate >= 80
                        ? 'text-success'
                        : attendanceRate >= 60
                          ? 'text-warning-foreground dark:text-warning'
                          : 'text-destructive',
                  )}
                >
                  {attendanceRate === null ? '—' : `${attendanceRate}%`}
                </b>
              </span>
            )}
          </span>
        </span>
      </Link>
      {isAdmin && (
        <Button
          variant="ghost"
          size="icon"
          className="absolute top-2 right-2 size-8 text-muted-foreground"
          onClick={onEdit}
          aria-label={`Edit ${b.name}`}
        >
          <Pencil className="size-4" />
        </Button>
      )}
    </Card>
  );
}

export function BatchesPage() {
  const user = useUser();
  const isAdmin = user.role === 'admin';
  const [showInactive, setShowInactive] = useState(false);
  const [search, setSearch] = useState('');
  const [coachId, setCoachId] = useState('');
  const q = useBatches(showInactive ? {} : { active: 'true' });
  const dash = useDashboard();
  const [editing, setEditing] = useState<Batch | 'new' | null>(null);
  const [reportOpen, setReportOpen] = useState(false);
  const now = new Date();

  const all = useMemo(
    () =>
      [...(q.data ?? [])].sort(
        (a, b) =>
          Number(b.isActive) - Number(a.isActive) ||
          a.startTime.localeCompare(b.startTime) ||
          a.name.localeCompare(b.name),
      ),
    [q.data],
  );
  const coaches = useMemo(
    () =>
      [...new Map(all.map((b) => [b.coach.id, b.coach.name])).entries()].sort((a, b) =>
        a[1].localeCompare(b[1]),
      ),
    [all],
  );
  const needle = search.trim().toLowerCase();
  const shown = all.filter(
    (b) =>
      (!coachId || b.coach.id === coachId) &&
      (!needle ||
        [b.name, b.coach.name, b.location.name].some((v) => v.toLowerCase().includes(needle))),
  );
  const rates = new Map(dash.data?.batchHealth.map((h) => [h.id, h.attendanceRate]));
  const active = all.filter((b) => b.isActive);
  const students = active.reduce((n, b) => n + b.memberCount, 0);
  const capacity = active.reduce((n, b) => n + (b.capacity ?? 0), 0);
  const capped = active.reduce((n, b) => n + (b.capacity ? b.memberCount : 0), 0);
  const liveNow = active.filter((b) => todayStatus(b, now) === 'live').length;

  return (
    <div>
      <PageHeader
        title="Batches"
        description={
          isAdmin ? 'Training groups, their schedule, coach and location.' : 'Your training groups.'
        }
        actions={
          isAdmin && (
            <>
              <Button
                variant="outline"
                onClick={() => setReportOpen(true)}
                disabled={!active.length}
              >
                <FileText /> Reports
              </Button>
              <Button onClick={() => setEditing('new')}>
                <Plus /> New batch
              </Button>
            </>
          )
        }
      />
      {isAdmin && reportOpen && (
        <ReportDialog
          open
          onOpenChange={setReportOpen}
          title="Batch report"
          description="Every student with attendance, skills, fees and history. Share it on WhatsApp or download it."
          options={[
            {
              value: 'all',
              label: 'All batches combined',
              hint: `${active.length} batches · ${students} students`,
            },
            ...active.map((b) => ({
              value: b.id,
              label: b.name,
              hint: `${b.coach.name} · ${plural(b.memberCount, 'student')}`,
            })),
          ]}
          path={(v) => `/reports/batches/pdf?batchId=${v}`}
          filename={(v) =>
            `${v === 'all' ? 'all-batches' : slug(active.find((b) => b.id === v)?.name ?? 'batch')}-report-${today()}.pdf`
          }
          includes={BATCH_REPORT_INCLUDES}
        />
      )}

      {q.isPending ? (
        <ListSkeleton rows={4} />
      ) : q.isError ? (
        <ErrorState error={q.error} onRetry={() => void q.refetch()} />
      ) : all.length === 0 ? (
        <EmptyState
          icon={<LayoutGrid />}
          title="No batches yet"
          description={
            isAdmin
              ? 'Create a batch, assign a coach and a location.'
              : 'Your admin will assign batches to you.'
          }
        />
      ) : (
        <div className="space-y-3">
          {/* Summary */}
          <div className="grid grid-cols-4 gap-1.5 rounded-2xl border bg-card p-1.5 shadow-e1">
            {[
              { label: 'Batches', value: active.length },
              { label: 'Students', value: students },
              {
                label: 'Seats left',
                value: capacity ? Math.max(0, capacity - capped) : '—',
              },
              { label: 'Live now', value: liveNow },
            ].map((s) => (
              <div key={s.label} className="rounded-xl bg-muted/40 px-1 py-1.5 text-center">
                <p className="tabular text-base leading-tight font-bold">{s.value}</p>
                <p className="truncate text-[10px] font-medium text-muted-foreground">{s.label}</p>
              </div>
            ))}
          </div>

          {/* Filters */}
          <div className="flex flex-wrap items-center gap-2">
            <SearchInput
              value={search}
              onChange={setSearch}
              placeholder={isAdmin ? 'Search batch, coach or location' : 'Search batches'}
              className="min-w-0 flex-1 basis-56"
            />
            {isAdmin && coaches.length > 1 && (
              <Select
                value={coachId}
                onChange={(e) => setCoachId(e.target.value)}
                aria-label="Filter by coach"
                className="w-auto min-w-36 flex-1 sm:flex-none"
              >
                <option value="">All coaches</option>
                {coaches.map(([id, name]) => (
                  <option key={id} value={id}>
                    {name}
                  </option>
                ))}
              </Select>
            )}
            <label className="flex h-10 items-center gap-2 rounded-xl border bg-card px-3 text-[13px] text-muted-foreground">
              <Switch checked={showInactive} onCheckedChange={setShowInactive} /> Inactive
            </label>
          </div>

          {shown.length === 0 ? (
            <EmptyState icon={<LayoutGrid />} title="No batches match" />
          ) : (
            <div className="grid gap-2.5 sm:grid-cols-2 xl:grid-cols-3">
              {shown.map((b) => (
                <BatchCard
                  key={b.id}
                  b={b}
                  isAdmin={isAdmin}
                  attendanceRate={dash.data ? (rates.get(b.id) ?? null) : undefined}
                  status={todayStatus(b, now)}
                  onEdit={() => setEditing(b)}
                />
              ))}
            </div>
          )}
        </div>
      )}
      {editing && (
        <BatchDialog
          open
          onOpenChange={(o) => !o && setEditing(null)}
          batch={editing === 'new' ? undefined : editing}
        />
      )}
    </div>
  );
}

export function BatchDetailPage() {
  const { id = '' } = useParams();
  const user = useUser();
  const q = useBatch(id);
  const [editing, setEditing] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);

  if (q.isPending) return <Skeleton className="h-64 w-full rounded-xl" />;
  if (q.isError) return <ErrorState error={q.error} onRetry={() => void q.refetch()} />;
  const b = q.data;

  return (
    <div>
      <PageHeader
        back={<BackLink to="/batches">Batches</BackLink>}
        title={b.name}
        description={`${scheduleLabel(b)} · ${b.location.name} · Coach ${b.coach.name}`}
        actions={
          // One compact row: two quick links, then icon buttons.
          <div className="flex items-center gap-1">
            <Button asChild variant="outline" size="sm" className="gap-1 px-2.5">
              <Link to={`/attendance?batch=${b.id}`}>
                <CalendarCheck2 /> Attendance
              </Link>
            </Button>
            <Button asChild variant="outline" size="sm" className="gap-1 px-2.5">
              <Link to={`/lesson-plans?batch=${b.id}`}>
                <ClipboardList /> Plans
              </Link>
            </Button>
            {user.role === 'admin' && (
              <Button
                variant="outline"
                size="icon-sm"
                aria-label="Batch report"
                title="Batch report"
                onClick={() => setReportOpen(true)}
              >
                <FileText />
              </Button>
            )}
            {user.role === 'admin' && (
              <Button
                size="icon-sm"
                aria-label="Edit batch"
                title="Edit batch"
                onClick={() => setEditing(true)}
              >
                <Pencil />
              </Button>
            )}
          </div>
        }
      />
      <Card>
        <CardHeader>
          <CardTitle>
            Students ({b.members.length}
            {b.capacity ? ` / ${b.capacity}` : ''})
          </CardTitle>
        </CardHeader>
        <CardContent>
          {b.members.length === 0 ? (
            <EmptyState icon={<Users />} title="No students in this batch yet" />
          ) : (
            <ul className="divide-y">
              {b.members.map((m) => (
                <li key={m.studentId}>
                  <Link
                    to={`/students/${m.studentId}`}
                    className="flex items-center gap-3 py-3 hover:bg-muted/30"
                  >
                    <Avatar name={m.fullName} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium">{m.fullName}</p>
                      <p className="text-xs text-muted-foreground">
                        {m.code} · since {formatDate(m.effectiveFrom)}
                      </p>
                    </div>
                    <DayDots days={m.trainingDays} />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
      {editing && <BatchDialog open onOpenChange={setEditing} batch={b} />}
      {reportOpen && (
        <ReportDialog
          open
          onOpenChange={setReportOpen}
          title={`${b.name} - report`}
          description="Every student in this batch with attendance, skills, fees and history since they joined it."
          options={[{ value: b.id, label: b.name }]}
          path={(v) => `/reports/batches/pdf?batchId=${v}`}
          filename={() => `${slug(b.name)}-report-${today()}.pdf`}
          includes={BATCH_REPORT_INCLUDES}
        />
      )}
    </div>
  );
}
