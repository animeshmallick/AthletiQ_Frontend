import { zodResolver } from '@hookform/resolvers/zod';
import {
  ArrowLeft,
  CalendarCheck2,
  ClipboardList,
  Clock,
  LayoutGrid,
  MapPin,
  Pencil,
  Plus,
  Users,
} from 'lucide-react';
import { useEffect, useState } from 'react';
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
  Progress,
} from '@/components/common';
import { Button } from '@/components/ui/button';
import { Checkbox, Switch, WeekdayPicker } from '@/components/ui/controls';
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
import { formatDate, formatTimeRange, plural, WEEKDAYS, weekdaysLabel } from '@/lib/format';
import { applyServerErrors } from '@/lib/forms';
import { useBatch, useBatches, useLocations, useSaveBatch, useUsers } from '@/lib/queries';
import type { Batch } from '@/lib/types';
import { cn } from '@/lib/utils';

const schema = z
  .object({
    name: z.string().trim().min(2, 'Enter a name').max(120),
    coachId: z.string().min(1, 'Pick a coach'),
    locationId: z.string().min(1, 'Pick a location'),
    weekdays: z.array(z.number()).min(1, 'Pick at least one day'),
    startTime: z.string().min(1, 'Required'),
    endTime: z.string().min(1, 'Required'),
    capacity: z.string().regex(/^\d*$/, 'Whole number').optional(),
    isActive: z.boolean(),
  })
  .refine((v) => v.endTime > v.startTime, {
    path: ['endTime'],
    message: 'Must be after the start time',
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
  const form = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: batch
      ? {
          name: batch.name,
          coachId: batch.coach.id,
          locationId: batch.location.id,
          weekdays: batch.weekdays,
          startTime: batch.startTime.slice(0, 5),
          endTime: batch.endTime.slice(0, 5),
          capacity: batch.capacity ? String(batch.capacity) : '',
          isActive: batch.isActive,
        }
      : {
          name: '',
          coachId: '',
          locationId: '',
          weekdays: [1, 2, 3, 4, 5, 6],
          startTime: '06:00',
          endTime: '08:00',
          capacity: '',
          isActive: true,
        },
  });
  const { register, control, handleSubmit, formState, reset } = form;
  const e = formState.errors;
  const [applyToStudents, setApplyToStudents] = useState(false);
  useEffect(() => {
    if (!open) reset();
  }, [open, reset]);
  // Closing the dialog (any way) clears the one-off "apply to students" choice.
  const close = (o: boolean) => {
    if (!o) setApplyToStudents(false);
    onOpenChange(o);
  };
  const watchedDays = useWatch({ control, name: 'weekdays' });
  const daysChanged =
    !!batch && [...watchedDays].sort().join() !== [...batch.weekdays].sort().join();
  const canApply = daysChanged && batch!.memberCount > 0;

  const onSubmit = handleSubmit(async (v) => {
    try {
      await save.mutateAsync({
        id: batch?.id,
        ...v,
        capacity: v.capacity ? Number(v.capacity) : null,
        ...(canApply && applyToStudents ? { applyDaysToStudents: true } : {}),
      });
      toast.success(
        batch
          ? canApply && applyToStudents
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
        <form id="batch-form" onSubmit={onSubmit} noValidate className="grid gap-4 sm:grid-cols-2">
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
          <Field label="Runs on" required error={e.weekdays?.message} className="sm:col-span-2">
            <Controller
              control={control}
              name="weekdays"
              render={({ field }) => (
                <WeekdayPicker value={field.value} onChange={field.onChange} />
              )}
            />
          </Field>
          {canApply && (
            <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-primary/25 bg-accent/50 p-3 sm:col-span-2">
              <Checkbox
                checked={applyToStudents}
                onCheckedChange={(c) => setApplyToStudents(c === true)}
                className="mt-0.5"
              />
              <span className="text-[13px] leading-snug">
                <span className="font-semibold">
                  Also update all {plural(batch!.memberCount, 'student')} in this batch
                </span>
                <span className="mt-0.5 block text-muted-foreground">
                  Their training days become {weekdaysLabel([...watchedDays].sort((a, b) => a - b))}{' '}
                  from today. History is kept and fees don&apos;t change.
                </span>
              </span>
            </label>
          )}
          <Field label="Starts" required error={e.startTime?.message}>
            <Input type="time" {...register('startTime')} />
          </Field>
          <Field label="Ends" required error={e.endTime?.message}>
            <Input type="time" {...register('endTime')} />
          </Field>
          <Field label="Capacity" error={e.capacity?.message} hint="Leave empty for no limit.">
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

function DayDots({ days }: { days: number[] }) {
  return (
    <div className="flex gap-1" aria-label={weekdaysLabel(days)}>
      {WEEKDAYS.map((d) => (
        <span
          key={d.value}
          className={cn(
            'flex size-6 items-center justify-center rounded-md text-[10px] font-semibold',
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

export function BatchesPage() {
  const user = useUser();
  const isAdmin = user.role === 'admin';
  const [showInactive, setShowInactive] = useState(false);
  const q = useBatches(showInactive ? {} : { active: 'true' });
  const [editing, setEditing] = useState<Batch | 'new' | null>(null);

  return (
    <div>
      <PageHeader
        title="Batches"
        description={
          isAdmin ? 'Training groups, their schedule, coach and location.' : 'Your training groups.'
        }
        actions={
          <>
            <label className="flex items-center gap-2 text-sm text-muted-foreground">
              <Switch checked={showInactive} onCheckedChange={setShowInactive} /> Show inactive
            </label>
            {isAdmin && (
              <Button onClick={() => setEditing('new')}>
                <Plus /> New batch
              </Button>
            )}
          </>
        }
      />
      {q.isPending ? (
        <ListSkeleton rows={4} />
      ) : q.isError ? (
        <ErrorState error={q.error} onRetry={() => void q.refetch()} />
      ) : q.data.length === 0 ? (
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
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {q.data.map((b) => (
            <Card
              key={b.id}
              className={cn(
                'flex flex-col transition-shadow hover:shadow-md',
                !b.isActive && 'opacity-60',
              )}
            >
              <Link to={`/batches/${b.id}`} className="flex-1 space-y-3 p-5">
                <div className="flex items-start justify-between gap-2">
                  <h3 className="font-semibold">{b.name}</h3>
                  {!b.isActive && <Badge variant="muted">Inactive</Badge>}
                </div>
                <div className="space-y-1.5 text-sm text-muted-foreground">
                  <p className="flex items-center gap-2">
                    <Clock className="size-4" /> {formatTimeRange(b.startTime, b.endTime)}
                  </p>
                  <p className="flex items-center gap-2">
                    <MapPin className="size-4" /> {b.location.name}
                  </p>
                  {isAdmin && (
                    <p className="flex items-center gap-2">
                      <Avatar name={b.coach.name} className="size-4 text-[8px]" /> {b.coach.name}
                    </p>
                  )}
                </div>
                <DayDots days={b.weekdays} />
                <div>
                  <div className="mb-1 flex justify-between text-xs text-muted-foreground">
                    <span className="flex items-center gap-1">
                      <Users className="size-3.5" /> {plural(b.memberCount, 'student')}
                    </span>
                    {b.capacity && <span>Capacity {b.capacity}</span>}
                  </div>
                  {b.capacity && (
                    <Progress
                      label="Batch capacity used"
                      value={(b.memberCount / b.capacity) * 100}
                      tone={b.memberCount >= b.capacity ? 'warning' : 'primary'}
                    />
                  )}
                </div>
              </Link>
              {isAdmin && (
                <div className="border-t px-3 py-2">
                  <Button variant="ghost" size="sm" onClick={() => setEditing(b)}>
                    <Pencil /> Edit
                  </Button>
                </div>
              )}
            </Card>
          ))}
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

  if (q.isPending) return <Skeleton className="h-64 w-full rounded-xl" />;
  if (q.isError) return <ErrorState error={q.error} onRetry={() => void q.refetch()} />;
  const b = q.data;

  return (
    <div>
      <PageHeader
        back={
          <Link
            to="/batches"
            className="mb-2 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="size-4" /> Batches
          </Link>
        }
        title={b.name}
        description={`${formatTimeRange(b.startTime, b.endTime)} · ${weekdaysLabel(b.weekdays)} · ${b.location.name} · Coach ${b.coach.name}`}
        actions={
          <>
            <Button asChild variant="outline">
              <Link to={`/attendance?batch=${b.id}`}>
                <CalendarCheck2 /> Attendance
              </Link>
            </Button>
            <Button asChild variant="outline">
              <Link to={`/lesson-plans?batch=${b.id}`}>
                <ClipboardList /> Plans
              </Link>
            </Button>
            {user.role === 'admin' && (
              <Button onClick={() => setEditing(true)}>
                <Pencil /> Edit
              </Button>
            )}
          </>
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
    </div>
  );
}
