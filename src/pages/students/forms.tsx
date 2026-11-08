import { zodResolver } from '@hookform/resolvers/zod';
import { useEffect, type ReactNode } from 'react';
import {
  Controller,
  useForm,
  useWatch,
  type Control,
  type FieldErrors,
  type UseFormSetValue,
} from 'react-hook-form';
import { toast } from 'sonner';
import { z } from 'zod';
import { Field, MoneyInput } from '@/components/common';
import { Button } from '@/components/ui/button';
import { WeekdayPicker } from '@/components/ui/controls';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/overlays';
import { Input, Select, Separator, Textarea } from '@/components/ui/primitives';
import { errorMessage } from '@/lib/api';
import { formatTimeRange, isoWeekday, money, today, weekdaysLabel } from '@/lib/format';
import {
  applyServerErrors,
  nullIfEmpty,
  optionalPhoneSchema,
  phoneSchema,
  trainingDaysSchema,
  daysForBatch,
  sameDays,
} from '@/lib/forms';
import {
  useBatches,
  useBookMakeup,
  useCreateStudent,
  useFeePlans,
  useRejoinStudent,
  useStudentLeave,
  useTransferStudent,
  useUpdateStudent,
} from '@/lib/queries';
import type { StudentDetail } from '@/lib/types';

// ─── Shared enrollment & fee fields ──────────────────────────────────────────

export const enrollmentSchema = z.object({
  joiningDate: z.string().min(1, 'Pick the joining date'),
  batchId: z.string().min(1, 'Pick a batch'),
  trainingDays: trainingDaysSchema,
  feePlanId: z.string().min(1, 'Pick a fee plan'),
  customMonthlyFee: z.number().nullable(),
  monthlyDiscount: z.number().min(0),
});
export type EnrollmentValues = z.infer<typeof enrollmentSchema>;

/**
 * Batch → training days → fee plan, with smart defaults: picking days suggests the plan priced for
 * that many days per week, and the effective monthly fee is previewed live.
 */
export function EnrollmentFields({
  control,
  setValue,
  errors,
  showJoining = true,
}: {
  control: Control<EnrollmentValues & Record<string, unknown>>;
  setValue: UseFormSetValue<EnrollmentValues & Record<string, unknown>>;
  errors: FieldErrors<EnrollmentValues>;
  showJoining?: boolean;
}) {
  const batches = useBatches({ active: 'true' });
  const plans = useFeePlans({ active: 'true' });
  const [batchId, days, planId, custom, discount] = useWatch({
    control,
    name: ['batchId', 'trainingDays', 'feePlanId', 'customMonthlyFee', 'monthlyDiscount'],
  }) as [string, number[], string, number | null, number];
  const batch = batches.data?.find((b) => b.id === batchId);
  const plan = plans.data?.find((p) => p.id === planId);

  // Suggest the plan matching the number of training days.
  useEffect(() => {
    if (!plans.data || !days?.length) return;
    const current = plans.data.find((p) => p.id === planId);
    if (current && current.daysPerWeek === days.length) return;
    const match = plans.data.find((p) => p.daysPerWeek === days.length);
    if (match) setValue('feePlanId', match.id, { shouldValidate: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [days?.length, plans.data]);

  // When a batch is chosen, training days follow it (pre-filled with the batch's days).
  useEffect(() => {
    if (!batch) return;
    const next = daysForBatch(batch.weekdays, days);
    if (!sameDays(next, days)) setValue('trainingDays', next, { shouldValidate: !!days?.length });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [batch?.id]);

  const base = custom ?? plan?.monthlyFee ?? 0;
  const total = Math.max(0, base - (discount ?? 0));

  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {showJoining && (
        <Field
          label="Joining date"
          required
          htmlFor="joiningDate"
          error={errors.joiningDate?.message}
          hint="Billing cycles start on this day every month."
        >
          <Controller
            control={control}
            name="joiningDate"
            render={({ field }) => (
              <Input id="joiningDate" type="date" {...field} value={field.value as string} />
            )}
          />
        </Field>
      )}
      <Field
        label="Batch"
        required
        htmlFor="batchId"
        error={errors.batchId?.message}
        className={showJoining ? '' : 'sm:col-span-2'}
      >
        <Controller
          control={control}
          name="batchId"
          render={({ field }) => (
            <Select
              id="batchId"
              {...field}
              value={field.value as string}
              aria-invalid={!!errors.batchId}
            >
              <option value="">Select a batch…</option>
              {batches.data?.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name} · {formatTimeRange(b.startTime, b.endTime)} · {b.coach.name}
                  {b.capacity ? ` (${b.memberCount}/${b.capacity})` : ''}
                </option>
              ))}
            </Select>
          )}
        />
      </Field>
      <Field
        label="Training days"
        required
        error={errors.trainingDays?.message}
        hint={
          batch ? `${batch.name} runs ${weekdaysLabel(batch.weekdays)}.` : 'Pick a batch first.'
        }
        className="sm:col-span-2"
      >
        <Controller
          control={control}
          name="trainingDays"
          render={({ field }) => (
            <WeekdayPicker
              value={field.value as number[]}
              onChange={field.onChange}
              allowed={batch?.weekdays ?? []}
              invalid={!!errors.trainingDays}
            />
          )}
        />
      </Field>
      <Field label="Fee plan" required htmlFor="feePlanId" error={errors.feePlanId?.message}>
        <Controller
          control={control}
          name="feePlanId"
          render={({ field }) => (
            <Select id="feePlanId" {...field} value={field.value as string}>
              <option value="">Select a plan…</option>
              {plans.data?.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} · {money(p.monthlyFee)}/mo
                </option>
              ))}
            </Select>
          )}
        />
      </Field>
      <Field
        label="Custom monthly fee"
        htmlFor="customFee"
        hint="Leave empty to use the plan price."
      >
        <Controller
          control={control}
          name="customMonthlyFee"
          render={({ field }) => (
            <MoneyInput
              id="customFee"
              value={field.value as number | null}
              onChange={field.onChange}
              placeholder={plan ? String(plan.monthlyFee / 100) : ''}
            />
          )}
        />
      </Field>
      <Field label="Monthly discount" htmlFor="discount">
        <Controller
          control={control}
          name="monthlyDiscount"
          render={({ field }) => (
            <MoneyInput
              id="discount"
              value={field.value as number}
              onChange={(v) => field.onChange(v ?? 0)}
              placeholder="0"
            />
          )}
        />
      </Field>
      <div className="flex flex-col justify-end rounded-xl bg-accent px-4 py-3 text-accent-foreground">
        <p className="text-xs font-medium">Billed every month</p>
        <p className="tabular text-xl font-semibold">{money(total)}</p>
      </div>
    </div>
  );
}

// ─── Create / edit student ───────────────────────────────────────────────────

const profileSchema = z.object({
  fullName: z.string().trim().min(2, 'Enter the full name').max(120),
  dateOfBirth: z.string().optional(),
  gender: z.enum(['', 'male', 'female', 'other']),
  guardianName: z.string().max(120).optional(),
  phone: phoneSchema,
  alternatePhone: optionalPhoneSchema.optional(),
  email: z.union([z.literal(''), z.email('Enter a valid email')]).optional(),
  address: z.string().max(500).optional(),
  medicalNotes: z.string().max(1000).optional(),
  notes: z.string().max(2000).optional(),
});

const createSchema = profileSchema.extend(enrollmentSchema.shape);
const editSchema = profileSchema.extend({
  joiningDate: z.string().min(1),
  feePlanId: z.string().min(1, 'Pick a fee plan'),
  customMonthlyFee: z.number().nullable(),
  monthlyDiscount: z.number().min(0),
});

type CreateValues = z.infer<typeof createSchema>;

function profilePayload(v: z.infer<typeof profileSchema>) {
  return {
    fullName: v.fullName,
    dateOfBirth: v.dateOfBirth || null,
    gender: v.gender || null,
    guardianName: nullIfEmpty(v.guardianName),
    phone: v.phone,
    alternatePhone: nullIfEmpty(v.alternatePhone),
    email: nullIfEmpty(v.email),
    address: nullIfEmpty(v.address),
    medicalNotes: nullIfEmpty(v.medicalNotes),
    notes: nullIfEmpty(v.notes),
  };
}

function ProfileFields({
  register,
  errors,
}: {
  register: ReturnType<typeof useForm<CreateValues>>['register'];
  errors: FieldErrors<CreateValues>;
}) {
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <Field
        label="Full name"
        required
        htmlFor="fullName"
        error={errors.fullName?.message}
        className="sm:col-span-2"
      >
        <Input id="fullName" autoFocus aria-invalid={!!errors.fullName} {...register('fullName')} />
      </Field>
      <Field label="Parent / guardian" htmlFor="guardianName">
        <Input id="guardianName" {...register('guardianName')} />
      </Field>
      <Field label="Mobile (WhatsApp)" required htmlFor="phone" error={errors.phone?.message}>
        <Input
          id="phone"
          type="tel"
          inputMode="tel"
          aria-invalid={!!errors.phone}
          {...register('phone')}
        />
      </Field>
      <Field
        label="Alternate mobile"
        htmlFor="alternatePhone"
        error={errors.alternatePhone?.message}
      >
        <Input id="alternatePhone" type="tel" inputMode="tel" {...register('alternatePhone')} />
      </Field>
      <Field label="Email" htmlFor="email" error={errors.email?.message}>
        <Input id="email" type="email" {...register('email')} />
      </Field>
      <Field label="Date of birth" htmlFor="dob">
        <Input id="dob" type="date" max={today()} {...register('dateOfBirth')} />
      </Field>
      <Field label="Gender" htmlFor="gender">
        <Select id="gender" {...register('gender')}>
          <option value="">—</option>
          <option value="female">Female</option>
          <option value="male">Male</option>
          <option value="other">Other</option>
        </Select>
      </Field>
      <Field label="Address" htmlFor="address" className="sm:col-span-2">
        <Textarea id="address" rows={2} {...register('address')} />
      </Field>
      <Field label="Medical notes" htmlFor="medical" className="sm:col-span-2">
        <Textarea id="medical" rows={2} {...register('medicalNotes')} />
      </Field>
      <Field
        label="Internal notes"
        htmlFor="notes"
        hint="Only visible to staff."
        className="sm:col-span-2"
      >
        <Textarea id="notes" rows={2} {...register('notes')} />
      </Field>
    </div>
  );
}

export function StudentFormDialog({
  open,
  onOpenChange,
  student,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  student?: StudentDetail;
  onSaved?: (s: StudentDetail) => void;
}) {
  const editing = Boolean(student);
  const create = useCreateStudent();
  const update = useUpdateStudent(student?.id ?? '');
  const form = useForm<CreateValues>({
    resolver: zodResolver(editing ? (editSchema as unknown as typeof createSchema) : createSchema),
    defaultValues: student
      ? {
          fullName: student.fullName,
          dateOfBirth: student.dateOfBirth ?? '',
          gender: student.gender ?? '',
          guardianName: student.guardianName ?? '',
          phone: student.phone,
          alternatePhone: student.alternatePhone ?? '',
          email: student.email ?? '',
          address: student.address ?? '',
          medicalNotes: student.medicalNotes ?? '',
          notes: student.notes ?? '',
          joiningDate: student.joiningDate,
          feePlanId: student.feePlanId,
          customMonthlyFee: student.customMonthlyFee,
          monthlyDiscount: student.monthlyDiscount,
          batchId: student.currentEnrollment?.batchId ?? '',
          trainingDays: student.currentEnrollment?.trainingDays ?? [],
        }
      : {
          fullName: '',
          gender: '',
          phone: '',
          joiningDate: today(),
          batchId: '',
          trainingDays: [],
          feePlanId: '',
          customMonthlyFee: null,
          monthlyDiscount: 0,
        },
  });
  const { register, handleSubmit, control, setValue, formState, reset } = form;

  useEffect(() => {
    if (!open) reset();
  }, [open, reset]);

  const onSubmit = handleSubmit(async (v) => {
    try {
      const saved = editing
        ? await update.mutateAsync({
            ...profilePayload(v),
            ...(v.joiningDate !== student!.joiningDate ? { joiningDate: v.joiningDate } : {}),
            feePlanId: v.feePlanId,
            customMonthlyFee: v.customMonthlyFee,
            monthlyDiscount: v.monthlyDiscount,
          })
        : await create.mutateAsync({
            ...profilePayload(v),
            joiningDate: v.joiningDate,
            batchId: v.batchId,
            trainingDays: v.trainingDays,
            feePlanId: v.feePlanId,
            customMonthlyFee: v.customMonthlyFee,
            monthlyDiscount: v.monthlyDiscount,
          });
      toast.success(editing ? 'Student updated' : `${saved.fullName} registered (${saved.code})`, {
        description: editing ? undefined : 'Their first month’s invoice has been generated.',
      });
      onOpenChange(false);
      onSaved?.(saved);
    } catch (err) {
      applyServerErrors(
        err,
        form.setError,
        editing ? 'Could not update student' : 'Could not register student',
      );
    }
  });

  const enrollmentControl = control as unknown as Control<
    EnrollmentValues & Record<string, unknown>
  >;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{editing ? `Edit ${student!.fullName}` : 'Register a student'}</DialogTitle>
          <DialogDescription>
            {editing
              ? 'Update contact details and fees. Use “Change batch” to move batches.'
              : 'Add the student, place them in a batch and set their fee.'}
          </DialogDescription>
        </DialogHeader>
        <form id="student-form" onSubmit={onSubmit} noValidate className="space-y-4 sm:space-y-6">
          <ProfileFields register={register} errors={formState.errors} />
          <Separator />
          {editing ? (
            <FeeOnlyFields
              control={enrollmentControl}
              errors={formState.errors}
              joiningLocked={student!.billing.invoiceCount > 0}
              register={register}
            />
          ) : (
            <EnrollmentFields
              control={enrollmentControl}
              setValue={setValue as never}
              errors={formState.errors}
            />
          )}
        </form>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="submit" form="student-form" loading={formState.isSubmitting}>
            {editing ? 'Save changes' : 'Register student'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function FeeOnlyFields({
  control,
  errors,
  joiningLocked,
  register,
}: {
  control: Control<EnrollmentValues & Record<string, unknown>>;
  errors: FieldErrors<CreateValues>;
  joiningLocked: boolean;
  register: ReturnType<typeof useForm<CreateValues>>['register'];
}) {
  const plans = useFeePlans({ active: 'true' });
  const [planId, custom, discount] = useWatch({
    control,
    name: ['feePlanId', 'customMonthlyFee', 'monthlyDiscount'],
  }) as [string, number | null, number];
  const plan = plans.data?.find((p) => p.id === planId);
  const total = Math.max(0, (custom ?? plan?.monthlyFee ?? 0) - (discount ?? 0));
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <Field
        label="Joining date"
        htmlFor="joiningDate"
        hint={
          joiningLocked
            ? 'Locked — invoices already use it as the billing anchor.'
            : 'Anchors the monthly billing cycle.'
        }
      >
        <Input id="joiningDate" type="date" disabled={joiningLocked} {...register('joiningDate')} />
      </Field>
      <Field label="Fee plan" required htmlFor="feePlanId" error={errors.feePlanId?.message}>
        <Controller
          control={control}
          name="feePlanId"
          render={({ field }) => (
            <Select id="feePlanId" {...field} value={field.value as string}>
              {plans.data?.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} · {money(p.monthlyFee)}/mo
                </option>
              ))}
            </Select>
          )}
        />
      </Field>
      <Field label="Custom monthly fee" htmlFor="customFee" hint="Applies from the next invoice.">
        <Controller
          control={control}
          name="customMonthlyFee"
          render={({ field }) => (
            <MoneyInput
              id="customFee"
              value={field.value as number | null}
              onChange={field.onChange}
            />
          )}
        />
      </Field>
      <Field label="Monthly discount" htmlFor="discount">
        <Controller
          control={control}
          name="monthlyDiscount"
          render={({ field }) => (
            <MoneyInput
              id="discount"
              value={field.value as number}
              onChange={(v) => field.onChange(v ?? 0)}
            />
          )}
        />
      </Field>
      <div className="rounded-xl bg-accent px-4 py-3 text-accent-foreground sm:col-span-2">
        <p className="text-xs font-medium">Next invoices will be</p>
        <p className="tabular text-xl font-semibold">{money(total)} / month</p>
      </div>
    </div>
  );
}

// ─── Transfer / training days ────────────────────────────────────────────────

const transferSchema = z.object({
  batchId: z.string().min(1, 'Pick a batch'),
  trainingDays: trainingDaysSchema,
  effectiveFrom: z.string().min(1, 'Pick a date'),
  reason: z.string().max(500).optional(),
});

/** Keeps a dialog's training days valid for the selected batch whenever the batch changes. */
function useDaysFollowBatch(
  batch: { id: string; weekdays: number[] } | undefined,
  days: number[],
  setDays: (d: number[]) => void,
) {
  useEffect(() => {
    if (!batch) return;
    const next = daysForBatch(batch.weekdays, days);
    if (!sameDays(next, days)) setDays(next);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [batch?.id]);
}

export function TransferDialog({
  student,
  open,
  onOpenChange,
}: {
  student: StudentDetail;
  open: boolean;
  onOpenChange: (o: boolean) => void;
}) {
  const transfer = useTransferStudent(student.id);
  const batches = useBatches({ active: 'true' });
  const form = useForm<z.infer<typeof transferSchema>>({
    resolver: zodResolver(transferSchema),
    defaultValues: {
      batchId: student.currentEnrollment?.batchId ?? '',
      trainingDays: student.currentEnrollment?.trainingDays ?? [],
      effectiveFrom: today(),
      reason: '',
    },
  });
  const { control, register, handleSubmit, formState } = form;
  const selectedBatchId = useWatch({ control, name: 'batchId' });
  const batch = batches.data?.find((b) => b.id === selectedBatchId);
  const sameBatch = selectedBatchId === student.currentEnrollment?.batchId;
  const transferDays = useWatch({ control, name: 'trainingDays' });
  useDaysFollowBatch(batch, transferDays, (d) =>
    form.setValue('trainingDays', d, { shouldValidate: true, shouldDirty: true }),
  );

  const onSubmit = handleSubmit(async (v) => {
    try {
      await transfer.mutateAsync({ ...v, reason: nullIfEmpty(v.reason) });
      toast.success(sameBatch ? 'Training days updated' : `Moved to ${batch?.name}`);
      onOpenChange(false);
    } catch (err) {
      applyServerErrors(err, form.setError, 'Could not change batch');
    }
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Change batch or days</DialogTitle>
          <DialogDescription>
            Permanent change from the chosen date. History and attendance in the old batch are kept.
          </DialogDescription>
        </DialogHeader>
        <form id="transfer-form" onSubmit={onSubmit} noValidate className="space-y-4">
          <Field label="Batch" required error={formState.errors.batchId?.message}>
            <Controller
              control={control}
              name="batchId"
              render={({ field }) => (
                <Select {...field}>
                  {batches.data?.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.name} · {formatTimeRange(b.startTime, b.endTime)} · {b.coach.name}
                    </option>
                  ))}
                </Select>
              )}
            />
          </Field>
          <Field label="Training days" required error={formState.errors.trainingDays?.message}>
            <Controller
              control={control}
              name="trainingDays"
              render={({ field }) => (
                <WeekdayPicker
                  value={field.value}
                  onChange={field.onChange}
                  allowed={batch?.weekdays}
                />
              )}
            />
          </Field>
          <Field label="Effective from" required error={formState.errors.effectiveFrom?.message}>
            <Input
              type="date"
              min={student.currentEnrollment?.effectiveFrom}
              {...register('effectiveFrom')}
            />
          </Field>
          <Field label="Reason">
            <Input placeholder="e.g. School timing changed" {...register('reason')} />
          </Field>
        </form>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="submit" form="transfer-form" loading={formState.isSubmitting}>
            {sameBatch ? 'Update days' : 'Move student'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Makeup ──────────────────────────────────────────────────────────────────

const makeupSchema = z.object({
  batchId: z.string().min(1, 'Pick a batch'),
  date: z.string().min(1, 'Pick a date'),
  missedDate: z.string().optional(),
  reason: z.string().max(500).optional(),
});

export function MakeupDialog({
  student,
  open,
  onOpenChange,
}: {
  student: StudentDetail;
  open: boolean;
  onOpenChange: (o: boolean) => void;
}) {
  const book = useBookMakeup(student.id);
  const batches = useBatches({ active: 'true' });
  const form = useForm<z.infer<typeof makeupSchema>>({
    resolver: zodResolver(makeupSchema),
    defaultValues: { batchId: '', date: today(), missedDate: '', reason: '' },
  });
  const { control, register, handleSubmit, formState, setError } = form;
  const [selectedBatchId, date] = useWatch({ control, name: ['batchId', 'date'] });
  const batch = batches.data?.find((b) => b.id === selectedBatchId);
  const runs = !batch || !date || batch.weekdays.includes(isoWeekday(date));

  const onSubmit = handleSubmit(async (v) => {
    if (!runs) {
      setError('date', { message: `${batch?.name} doesn’t run on that day` });
      return;
    }
    try {
      await book.mutateAsync({
        batchId: v.batchId,
        date: v.date,
        missedDate: v.missedDate || null,
        reason: nullIfEmpty(v.reason),
      });
      toast.success('Makeup session booked');
      onOpenChange(false);
      form.reset();
    } catch (err) {
      applyServerErrors(err, setError, 'Could not book makeup');
    }
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Book a makeup session</DialogTitle>
          <DialogDescription>
            {student.fullName} will appear on that batch’s attendance for one day only.
          </DialogDescription>
        </DialogHeader>
        <form id="makeup-form" onSubmit={onSubmit} noValidate className="space-y-4">
          <Field label="Batch" required error={formState.errors.batchId?.message}>
            <Controller
              control={control}
              name="batchId"
              render={({ field }) => (
                <Select {...field}>
                  <option value="">Select a batch…</option>
                  {batches.data
                    ?.filter((b) => b.id !== student.currentEnrollment?.batchId)
                    .map((b) => (
                      <option key={b.id} value={b.id}>
                        {b.name} · {formatTimeRange(b.startTime, b.endTime)} ·{' '}
                        {weekdaysLabel(b.weekdays)}
                      </option>
                    ))}
                </Select>
              )}
            />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field
              label="Makeup date"
              required
              error={
                formState.errors.date?.message ??
                (!runs ? `${batch?.name} doesn’t run that day` : undefined)
              }
            >
              <Input type="date" {...register('date')} />
            </Field>
            <Field label="Missed session (optional)">
              <Input type="date" {...register('missedDate')} />
            </Field>
          </div>
          <Field label="Reason">
            <Input placeholder="e.g. Exam on Tuesday" {...register('reason')} />
          </Field>
        </form>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="submit" form="makeup-form" loading={formState.isSubmitting}>
            Book makeup
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Leave ───────────────────────────────────────────────────────────────────

export function LeaveDialog({
  student,
  open,
  onOpenChange,
}: {
  student: StudentDetail;
  open: boolean;
  onOpenChange: (o: boolean) => void;
}) {
  const leave = useStudentLeave(student.id);
  const form = useForm({ defaultValues: { leftOn: today(), reason: '' } });

  const onSubmit = form.handleSubmit(async (v) => {
    try {
      await leave.mutateAsync({ leftOn: v.leftOn, reason: nullIfEmpty(v.reason) });
      toast.success(`${student.fullName} marked as left`);
      onOpenChange(false);
    } catch (err) {
      toast.error('Could not update student', { description: errorMessage(err) });
    }
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Mark {student.fullName} as left</DialogTitle>
          <DialogDescription>
            They’ll be removed from their batch after the last day and no further months are
            invoiced. Fees are prepaid, so the current month is already billed — cancel, adjust or
            refund that invoice if needed.
          </DialogDescription>
        </DialogHeader>
        <form id="leave-form" onSubmit={onSubmit} className="space-y-4">
          <Field label="Last training day" required>
            <Input
              type="date"
              min={student.joiningDate}
              {...form.register('leftOn', { required: true })}
            />
          </Field>
          <Field label="Reason">
            <Textarea
              rows={2}
              placeholder="e.g. Relocated to another city"
              {...form.register('reason')}
            />
          </Field>
        </form>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            variant="destructive"
            type="submit"
            form="leave-form"
            loading={form.formState.isSubmitting}
          >
            Mark as left
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function SectionTitle({ children }: { children: ReactNode }) {
  return (
    <h3 className="text-sm font-semibold tracking-wide text-muted-foreground uppercase">
      {children}
    </h3>
  );
}

// ─── Rejoin ──────────────────────────────────────────────────────────────────

const rejoinSchema = z.object({
  rejoinDate: z.string().min(1, 'Pick the rejoin date'),
  batchId: z.string().min(1, 'Pick a batch'),
  trainingDays: trainingDaysSchema,
  feePlanId: z.string().min(1, 'Pick a fee plan'),
});

export function RejoinDialog({
  student,
  open,
  onOpenChange,
}: {
  student: StudentDetail;
  open: boolean;
  onOpenChange: (o: boolean) => void;
}) {
  const rejoin = useRejoinStudent(student.id);
  const batches = useBatches({ active: 'true' });
  const plans = useFeePlans({ active: 'true' });
  const last = student.enrollmentHistory[0];
  const form = useForm<z.infer<typeof rejoinSchema>>({
    resolver: zodResolver(rejoinSchema),
    defaultValues: {
      rejoinDate: today(),
      batchId: last?.batchId ?? '',
      trainingDays: last?.trainingDays ?? [],
      feePlanId: student.feePlanId,
    },
  });
  const { control, register, handleSubmit, formState } = form;
  const selectedBatchId = useWatch({ control, name: 'batchId' });
  const batch = batches.data?.find((b) => b.id === selectedBatchId);
  const rejoinDays = useWatch({ control, name: 'trainingDays' });
  useDaysFollowBatch(batch, rejoinDays, (d) =>
    form.setValue('trainingDays', d, { shouldValidate: true, shouldDirty: true }),
  );

  const onSubmit = handleSubmit(async (v) => {
    try {
      await rejoin.mutateAsync({
        ...v,
        feePlanId: v.feePlanId === student.feePlanId ? undefined : v.feePlanId,
      });
      toast.success(`${student.fullName} is back!`, {
        description: 'Billing restarts from the rejoin date.',
      });
      onOpenChange(false);
    } catch (err) {
      applyServerErrors(err, form.setError, 'Could not rejoin student');
    }
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Rejoin {student.fullName}</DialogTitle>
          <DialogDescription>
            Billing restarts from the rejoin date, which becomes the new monthly invoice day.
            Earlier invoices stay as they are.
          </DialogDescription>
        </DialogHeader>
        <form id="rejoin-form" onSubmit={onSubmit} noValidate className="space-y-4">
          <Field
            label="Rejoin date"
            required
            error={formState.errors.rejoinDate?.message}
            hint={student.leftOn ? `Left on ${student.leftOn}.` : undefined}
          >
            <Input type="date" min={student.leftOn ?? undefined} {...register('rejoinDate')} />
          </Field>
          <Field label="Batch" required error={formState.errors.batchId?.message}>
            <Select {...register('batchId')}>
              <option value="">Select a batch…</option>
              {batches.data?.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name} · {formatTimeRange(b.startTime, b.endTime)} · {b.coach.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Training days" required error={formState.errors.trainingDays?.message}>
            <Controller
              control={control}
              name="trainingDays"
              render={({ field }) => (
                <WeekdayPicker
                  value={field.value}
                  onChange={field.onChange}
                  allowed={batch?.weekdays}
                />
              )}
            />
          </Field>
          <Field label="Fee plan" required error={formState.errors.feePlanId?.message}>
            <Select {...register('feePlanId')}>
              {plans.data?.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} · {money(p.monthlyFee)}/mo
                </option>
              ))}
            </Select>
          </Field>
        </form>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="submit" form="rejoin-form" loading={formState.isSubmitting}>
            Rejoin student
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
