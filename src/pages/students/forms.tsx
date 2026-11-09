import { zodResolver } from '@hookform/resolvers/zod';
import { AlertTriangle, ArrowRightLeft, Plus, SlidersHorizontal, Trash2 } from 'lucide-react';
import { useEffect, useState, type ReactNode } from 'react';
import { Controller, useForm, useWatch, type FieldErrors } from 'react-hook-form';
import { toast } from 'sonner';
import { z } from 'zod';
import { Field, MoneyInput } from '@/components/common';
import { Button } from '@/components/ui/button';
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
import { isoWeekday, money, today } from '@/lib/format';
import { applyServerErrors, nullIfEmpty, optionalPhoneSchema, phoneSchema } from '@/lib/forms';
import {
  useBatches,
  useBookMakeup,
  useCreateStudent,
  useJoinBatch,
  useLeaveBatch,
  useMoveMembership,
  useRejoinStudent,
  useStudentLeave,
  useUpdateMembership,
  useUpdateStudent,
  type BatchPick,
} from '@/lib/queries';
import type { Batch, Membership, StudentDetail } from '@/lib/types';
import { useUser } from '@/app/auth';
import { scheduleLabel, timeLabel } from '@/lib/batch-times';

// ─── Picking batches ─────────────────────────────────────────────────────────

/** "Mon · Wed · Fri · 5:00–6:30 pm · Coach Ravi" */
const batchLine = (b: Batch) => `${scheduleLabel(b)} · ${b.coach.name}`;

const feeOf = (b: Batch | undefined, pick: BatchPick) =>
  Math.max(0, (pick.customMonthlyFee ?? b?.feePlan.monthlyFee ?? 0) - (pick.monthlyDiscount ?? 0));

/** One batch choice: the batch (days, time, coach and plan come from it) and optional fee tweaks. */
function BatchPickRow({
  value,
  onChange,
  onRemove,
  options,
  error,
  index,
}: {
  value: BatchPick;
  onChange: (v: BatchPick) => void;
  onRemove?: () => void;
  options: Batch[];
  error?: string;
  index: number;
}) {
  const batch = options.find((b) => b.id === value.batchId);
  const adjusted =
    (value.customMonthlyFee !== null && value.customMonthlyFee !== undefined) ||
    !!value.monthlyDiscount;
  const [showFee, setShowFee] = useState(adjusted);
  const full = (b: Batch) => b.memberCount >= b.capacity && b.id !== value.batchId;
  return (
    <div className="space-y-2 rounded-xl border bg-card p-2.5">
      <div className="flex items-start gap-2">
        <Field
          label={index === 0 ? 'Batch' : `Batch ${index + 1}`}
          required
          error={error}
          className="min-w-0 flex-1"
        >
          <Select
            value={value.batchId}
            aria-label={`Batch ${index + 1}`}
            onChange={(e) => onChange({ ...value, batchId: e.target.value })}
            aria-invalid={!!error}
          >
            <option value="">Select a batch…</option>
            {options.map((b) => (
              <option key={b.id} value={b.id} disabled={full(b)}>
                {b.name} · {timeLabel(b)} · {b.coach.name}
                {full(b) ? ' (full)' : ` (${b.memberCount}/${b.capacity})`}
              </option>
            ))}
          </Select>
        </Field>
        {onRemove && (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="mt-6 shrink-0"
            aria-label={`Remove batch ${index + 1}`}
            onClick={onRemove}
          >
            <Trash2 className="text-muted-foreground" />
          </Button>
        )}
      </div>
      {batch && (
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[12px] text-muted-foreground">
          <span>{batchLine(batch)}</span>
          <span aria-hidden>·</span>
          <span>
            {batch.feePlan.name} · <b className="text-foreground">{money(feeOf(batch, value))}</b>
            /month
          </span>
          <button
            type="button"
            className="ml-auto inline-flex cursor-pointer items-center gap-1 font-medium text-primary hover:underline"
            onClick={() => setShowFee((x) => !x)}
          >
            <SlidersHorizontal className="size-3.5" /> {showFee ? 'Hide fee' : 'Adjust fee'}
          </button>
        </div>
      )}
      {batch && showFee && (
        <div className="grid gap-2 sm:grid-cols-2">
          <Field label="Custom monthly fee" hint={`Plan price: ${money(batch.feePlan.monthlyFee)}`}>
            <MoneyInput
              value={value.customMonthlyFee ?? null}
              onChange={(v) => onChange({ ...value, customMonthlyFee: v })}
              placeholder={String(batch.feePlan.monthlyFee / 100)}
            />
          </Field>
          <Field label="Monthly discount">
            <MoneyInput
              value={value.monthlyDiscount ?? 0}
              onChange={(v) => onChange({ ...value, monthlyDiscount: v ?? 0 })}
              placeholder="0"
            />
          </Field>
        </div>
      )}
    </div>
  );
}

/**
 * One or more batches for a student. The student trains every day each batch runs and is billed
 * each batch's plan separately (with optional custom fee / discount per batch).
 */
export function BatchPicks({
  value,
  onChange,
  error,
  exclude = [],
}: {
  value: BatchPick[];
  onChange: (v: BatchPick[]) => void;
  error?: string;
  /** Batches the student is already in (not offered again). */
  exclude?: string[];
}) {
  const batches = useBatches({ active: 'true' });
  const all = (batches.data ?? []).filter((b) => !exclude.includes(b.id));
  const total = value.reduce(
    (n, p) =>
      n +
      feeOf(
        all.find((b) => b.id === p.batchId),
        p,
      ),
    0,
  );
  return (
    <div className="space-y-2">
      {value.map((pick, i) => (
        <BatchPickRow
          key={i}
          index={i}
          value={pick}
          // Each batch can be picked once.
          options={all.filter(
            (b) => b.id === pick.batchId || !value.some((p) => p.batchId === b.id),
          )}
          error={i === 0 ? error : undefined}
          onChange={(v) => onChange(value.map((p, j) => (j === i ? v : p)))}
          onRemove={value.length > 1 ? () => onChange(value.filter((_, j) => j !== i)) : undefined}
        />
      ))}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => onChange([...value, { batchId: '', monthlyDiscount: 0 }])}
          disabled={value.length >= Math.min(10, all.length)}
        >
          <Plus /> Add another batch
        </Button>
        <p className="rounded-xl bg-accent px-3 py-1.5 text-accent-foreground">
          <span className="text-xs font-medium">Billed every month </span>
          <span className="tabular text-base font-semibold">{money(total)}</span>
          {value.length > 1 && (
            <span className="text-xs text-muted-foreground"> · one invoice per batch</span>
          )}
        </p>
      </div>
    </div>
  );
}

const batchPicksSchema = z
  .array(
    z.object({
      batchId: z.string(),
      customMonthlyFee: z.number().nullable().optional(),
      monthlyDiscount: z.number().min(0).optional(),
    }),
  )
  .refine((l) => l.length > 0 && l.every((p) => p.batchId), 'Pick a batch for every row');

const pickPayload = (l: BatchPick[]) =>
  l.map((p) => ({
    batchId: p.batchId,
    customMonthlyFee: p.customMonthlyFee ?? null,
    monthlyDiscount: p.monthlyDiscount ?? 0,
  }));

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

const createSchema = profileSchema.extend({
  joiningDate: z.string().min(1, 'Pick the joining date'),
  batches: batchPicksSchema,
});
const editSchema = profileSchema.extend({ joiningDate: z.string().min(1) });

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
    <div className="grid gap-3 sm:grid-cols-2">
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
          batches: [],
        }
      : {
          fullName: '',
          gender: '',
          phone: '',
          joiningDate: today(),
          batches: [{ batchId: '', monthlyDiscount: 0 }],
        },
  });
  const { register, handleSubmit, control, formState, reset } = form;

  useEffect(() => {
    if (!open) reset();
  }, [open, reset]);

  const onSubmit = handleSubmit(async (v) => {
    try {
      const saved = editing
        ? await update.mutateAsync({
            ...profilePayload(v),
            ...(v.joiningDate !== student!.joiningDate ? { joiningDate: v.joiningDate } : {}),
          })
        : await create.mutateAsync({
            ...profilePayload(v),
            joiningDate: v.joiningDate,
            batches: pickPayload(v.batches),
          });
      toast.success(editing ? 'Student updated' : `${saved.fullName} registered (${saved.code})`, {
        description: editing
          ? undefined
          : v.batches.length > 1
            ? 'An invoice for each batch’s first month has been generated.'
            : 'Their first month’s invoice has been generated.',
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

  const joiningLocked = !!student && student.billing.invoiceCount > 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{editing ? `Edit ${student!.fullName}` : 'Register a student'}</DialogTitle>
          <DialogDescription>
            {editing
              ? 'Update contact details. Batches and fees are managed on each batch card.'
              : 'Add the student and place them in one or more batches. Each batch is billed on its own plan.'}
          </DialogDescription>
        </DialogHeader>
        <form id="student-form" onSubmit={onSubmit} noValidate className="space-y-3 sm:space-y-4">
          <ProfileFields register={register} errors={formState.errors} />
          <Separator />
          <Field
            label="Joining date"
            required
            htmlFor="joiningDate"
            error={formState.errors.joiningDate?.message}
            hint={
              joiningLocked
                ? 'Locked — invoices already use it as the billing day.'
                : 'Each batch’s monthly invoice is issued on this day.'
            }
          >
            <Input
              id="joiningDate"
              type="date"
              disabled={joiningLocked}
              {...register('joiningDate')}
            />
          </Field>
          {!editing && (
            <Controller
              control={control}
              name="batches"
              render={({ field }) => (
                <BatchPicks
                  value={field.value}
                  onChange={field.onChange}
                  error={
                    formState.errors.batches?.message ?? formState.errors.batches?.root?.message
                  }
                />
              )}
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

// ─── Batch memberships ───────────────────────────────────────────────────────

/** Adds the student to another batch (its own invoice, from the day they join it). */
export function AddBatchDialog({
  student,
  open,
  onOpenChange,
}: {
  student: StudentDetail;
  open: boolean;
  onOpenChange: (o: boolean) => void;
}) {
  const join = useJoinBatch(student.id);
  const batches = useBatchesData() ?? [];
  const [pick, setPick] = useState<BatchPick[]>([{ batchId: '', monthlyDiscount: 0 }]);
  const [from, setFrom] = useState(today());
  const [error, setError] = useState<string | undefined>();

  async function submit() {
    const p = pick[0]!;
    if (!p.batchId) return setError('Pick a batch');
    try {
      await join.mutateAsync({ ...pickPayload([p])[0]!, effectiveFrom: from });
      toast.success('Added to the batch', {
        description: 'Its first month’s invoice has been generated.',
      });
      onOpenChange(false);
    } catch (err) {
      toast.error('Could not add to the batch', { description: errorMessage(err) });
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Add {student.fullName} to another batch</DialogTitle>
          <DialogDescription>
            They’ll train every day that batch runs, and it is billed separately on its own plan.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <BatchPickRow
            index={0}
            value={pick[0]!}
            onChange={(v) => {
              setPick([v]);
              setError(undefined);
            }}
            options={batches.filter((b) => !student.memberships.some((m) => m.batchId === b.id))}
            error={error}
          />
          <Field label="Starts on" required hint="Billing for this batch is anchored on this day.">
            <Input
              type="date"
              min={student.joiningDate}
              value={from}
              onChange={(e) => setFrom(e.target.value)}
            />
          </Field>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button loading={join.isPending} onClick={() => void submit()}>
            <Plus /> Add to batch
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Active batches (shared query). */
function useBatchesData() {
  return useBatches({ active: 'true' }).data;
}

const moveSchema = z.object({
  batchId: z.string().min(1, 'Pick a batch'),
  effectiveFrom: z.string().min(1, 'Pick a date'),
  reason: z.string().max(500).optional(),
});

/** Moves one membership to another batch; billing continues on the same day. */
export function MoveBatchDialog({
  student,
  membership,
  open,
  onOpenChange,
}: {
  student: StudentDetail;
  membership: Membership;
  open: boolean;
  onOpenChange: (o: boolean) => void;
}) {
  const move = useMoveMembership(student.id);
  const batches = useBatchesData() ?? [];
  const options = batches.filter(
    (b) => b.id !== membership.batchId && !student.memberships.some((m) => m.batchId === b.id),
  );
  const form = useForm<z.infer<typeof moveSchema>>({
    resolver: zodResolver(moveSchema),
    defaultValues: { batchId: '', effectiveFrom: today(), reason: '' },
  });
  const { register, handleSubmit, formState, control } = form;
  const targetId = useWatch({ control, name: 'batchId' });
  const target = batches.find((b) => b.id === targetId);

  const onSubmit = handleSubmit(async (v) => {
    try {
      await move.mutateAsync({
        enrollmentId: membership.enrollmentId,
        batchId: v.batchId,
        effectiveFrom: v.effectiveFrom,
        reason: nullIfEmpty(v.reason),
      });
      toast.success(`Moved to ${target?.name ?? 'the new batch'}`);
      onOpenChange(false);
    } catch (err) {
      applyServerErrors(err, form.setError, 'Could not move the student');
    }
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Move from {membership.batchName}</DialogTitle>
          <DialogDescription>
            History stays. Invoices keep the same day of the month ({membership.billingDay}); the
            new batch’s plan applies from the next invoice.
          </DialogDescription>
        </DialogHeader>
        <form id="move-form" onSubmit={onSubmit} noValidate className="space-y-3">
          <Field label="New batch" required error={formState.errors.batchId?.message}>
            <Select {...register('batchId')}>
              <option value="">Select a batch…</option>
              {options.map((b) => (
                <option key={b.id} value={b.id} disabled={b.memberCount >= b.capacity}>
                  {b.name} · {timeLabel(b)} · {b.coach.name}
                  {b.memberCount >= b.capacity ? ' (full)' : ''}
                </option>
              ))}
            </Select>
          </Field>
          {target && (
            <p className="rounded-xl bg-muted/60 px-3 py-2 text-[13px]">
              {batchLine(target)} · {target.feePlan.name} <b>{money(target.feePlan.monthlyFee)}</b>
              /month
              {(membership.customMonthlyFee !== null || membership.monthlyDiscount > 0) &&
                ' · their custom fee / discount carries over'}
            </p>
          )}
          <Field
            label="Moves on"
            required
            error={formState.errors.effectiveFrom?.message}
            hint={`Their last day in ${membership.batchName} is the day before.`}
          >
            <Input type="date" min={membership.since} {...register('effectiveFrom')} />
          </Field>
          <Field label="Reason">
            <Input placeholder="e.g. School timing changed" {...register('reason')} />
          </Field>
        </form>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="submit" form="move-form" loading={formState.isSubmitting}>
            <ArrowRightLeft /> Move
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Ends one membership: no more invoices for that batch. */
export function LeaveBatchDialog({
  student,
  membership,
  open,
  onOpenChange,
}: {
  student: StudentDetail;
  membership: Membership;
  open: boolean;
  onOpenChange: (o: boolean) => void;
}) {
  const leave = useLeaveBatch(student.id);
  const [leftOn, setLeftOn] = useState(today());
  const [reason, setReason] = useState('');
  async function submit() {
    try {
      await leave.mutateAsync({
        enrollmentId: membership.enrollmentId,
        leftOn,
        reason: nullIfEmpty(reason),
      });
      toast.success(`Left ${membership.batchName}`);
      onOpenChange(false);
    } catch (err) {
      toast.error('Could not update', { description: errorMessage(err) });
    }
  }
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Leave {membership.batchName}</DialogTitle>
          <DialogDescription>
            {student.fullName} stays in their other batches. No more invoices for this batch; the
            current month was prepaid (adjust or refund that invoice if needed).
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <Field label="Last day in this batch" required>
            <Input
              type="date"
              min={membership.since}
              value={leftOn}
              onChange={(e) => setLeftOn(e.target.value)}
            />
          </Field>
          <Field label="Reason">
            <Textarea rows={2} value={reason} onChange={(e) => setReason(e.target.value)} />
          </Field>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button variant="destructive" loading={leave.isPending} onClick={() => void submit()}>
            Leave batch
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** One membership's custom fee and discount. */
export function MembershipFeeDialog({
  student,
  membership,
  open,
  onOpenChange,
}: {
  student: StudentDetail;
  membership: Membership;
  open: boolean;
  onOpenChange: (o: boolean) => void;
}) {
  const update = useUpdateMembership(student.id);
  const [custom, setCustom] = useState<number | null>(membership.customMonthlyFee);
  const [discount, setDiscount] = useState(membership.monthlyDiscount);
  const total = Math.max(0, (custom ?? membership.plan.monthlyFee) - discount);
  async function submit() {
    try {
      await update.mutateAsync({
        enrollmentId: membership.enrollmentId,
        customMonthlyFee: custom,
        monthlyDiscount: discount,
      });
      toast.success('Fee updated', { description: 'Applies from the next invoice.' });
      onOpenChange(false);
    } catch (err) {
      toast.error('Could not update the fee', { description: errorMessage(err) });
    }
  }
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Fee for {membership.batchName}</DialogTitle>
          <DialogDescription>
            Plan: {membership.plan.name} · {money(membership.plan.monthlyFee)}/month. Changes apply
            from the next invoice.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Custom monthly fee" hint="Leave empty to use the plan price.">
            <MoneyInput
              value={custom}
              onChange={setCustom}
              placeholder={String(membership.plan.monthlyFee / 100)}
            />
          </Field>
          <Field label="Monthly discount">
            <MoneyInput value={discount} onChange={(v) => setDiscount(v ?? 0)} placeholder="0" />
          </Field>
          <div className="rounded-xl bg-accent px-4 py-3 text-accent-foreground sm:col-span-2">
            <p className="text-xs font-medium">Next invoices for this batch</p>
            <p className="tabular text-xl font-semibold">{money(total)} / month</p>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button loading={update.isPending} onClick={() => void submit()}>
            Save fee
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
  const me = useUser();
  const isAdmin = me.role === 'admin';
  // Coaches book only in batches they coach; admins in any batch.
  const bookable = (batches.data ?? []).filter((b) => isAdmin || b.coach.id === me.id);
  const batch = batches.data?.find((b) => b.id === selectedBatchId);
  // A batch whose coach isn't one of the student's own coaches.
  const coaches = student.memberships.map((m) => m.coachName);
  const otherCoach =
    isAdmin &&
    !!batch &&
    student.memberships.length > 0 &&
    !student.memberships.some((m) => m.coachId === batch.coach.id);
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
      toast.success(isAdmin ? 'Makeup session booked' : 'Makeup requested', {
        description: isAdmin ? undefined : 'An admin will approve it. You’ll get a notification.',
      });
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
            {!isAdmin && ' Requests are approved by an admin.'}
          </DialogDescription>
        </DialogHeader>
        <form id="makeup-form" onSubmit={onSubmit} noValidate className="space-y-3">
          <Field label="Batch" required error={formState.errors.batchId?.message}>
            <Controller
              control={control}
              name="batchId"
              render={({ field }) => (
                <Select {...field}>
                  <option value="">Select a batch…</option>
                  {bookable.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.name} · {scheduleLabel(b)}
                    </option>
                  ))}
                </Select>
              )}
            />
          </Field>
          {otherCoach && (
            <div
              role="alert"
              className="flex items-start gap-2 rounded-xl border border-warning/40 bg-warning/12 px-3 py-2 text-[13px] leading-snug"
            >
              <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warning-foreground dark:text-warning" />
              <span>
                <b className="font-semibold">Different coach.</b> This session is with{' '}
                {batch!.coach.name}, not {student.fullName}’s usual coach ({coaches.join(', ')}).{' '}
                {batch!.coach.name} will see them on the attendance list that day.
              </span>
            </div>
          )}
          <div className="grid gap-3 sm:grid-cols-2">
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
            They’ll leave every batch after the last day and no further months are invoiced. Fees
            are prepaid, so the current month is already billed — cancel, adjust or refund those
            invoices if needed.
          </DialogDescription>
        </DialogHeader>
        <form id="leave-form" onSubmit={onSubmit} className="space-y-3">
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
  batches: batchPicksSchema,
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
  const last = student.enrollmentHistory[0];
  const form = useForm<z.infer<typeof rejoinSchema>>({
    resolver: zodResolver(rejoinSchema),
    defaultValues: {
      rejoinDate: today(),
      batches: [{ batchId: last?.batchId ?? '', monthlyDiscount: 0 }],
    },
  });
  const { control, register, handleSubmit, formState } = form;

  const onSubmit = handleSubmit(async (v) => {
    try {
      await rejoin.mutateAsync({ rejoinDate: v.rejoinDate, batches: pickPayload(v.batches) });
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
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Rejoin {student.fullName}</DialogTitle>
          <DialogDescription>
            Each batch is billed from the rejoin date, which becomes its monthly invoice day.
            Earlier invoices stay as they are.
          </DialogDescription>
        </DialogHeader>
        <form id="rejoin-form" onSubmit={onSubmit} noValidate className="space-y-3">
          <Field
            label="Rejoin date"
            required
            error={formState.errors.rejoinDate?.message}
            hint={student.leftOn ? `Left on ${student.leftOn}.` : undefined}
          >
            <Input type="date" min={student.leftOn ?? undefined} {...register('rejoinDate')} />
          </Field>
          <Controller
            control={control}
            name="batches"
            render={({ field }) => (
              <BatchPicks
                value={field.value}
                onChange={field.onChange}
                error={formState.errors.batches?.message ?? formState.errors.batches?.root?.message}
              />
            )}
          />
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
