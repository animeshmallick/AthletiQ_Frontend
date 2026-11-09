import { zodResolver } from '@hookform/resolvers/zod';
import { useQuery } from '@tanstack/react-query';
import { CheckCircle2, GraduationCap, UserRound } from 'lucide-react';
import { useState } from 'react';
import { Controller, useForm, useWatch } from 'react-hook-form';
import { Link } from 'react-router';
import { z } from 'zod';
import { Field } from '@/components/common';
import { Button } from '@/components/ui/button';
import { Checkbox, Segmented, WeekdayPicker } from '@/components/ui/controls';
import { Card, Input, Select, Textarea } from '@/components/ui/primitives';
import { api } from '@/lib/api';
import { formatTimeRange, weekdaysLabel } from '@/lib/format';
import {
  applyServerErrors,
  nullIfEmpty,
  passwordSchema,
  phoneSchema,
  optionalPhoneSchema,
} from '@/lib/forms';

interface Options {
  academy: { name: string; phone: string | null; email: string | null };
  batches: {
    id: string;
    name: string;
    weekdays: number[];
    startTime: string;
    endTime: string;
    location: { id: string; name: string; address: string | null };
  }[];
}

const studentSchema = z.object({
  fullName: z.string().trim().min(2, 'Enter the student’s full name').max(120),
  dateOfBirth: z.string().optional(),
  gender: z.enum(['', 'male', 'female', 'other']).optional(),
  guardianName: z.string().max(120).optional(),
  phone: phoneSchema,
  alternatePhone: optionalPhoneSchema.optional(),
  email: z.union([z.literal(''), z.email('Enter a valid email')]).optional(),
  address: z.string().max(500).optional(),
  medicalNotes: z.string().max(1000).optional(),
  preferredBatchId: z.string().optional(),
  preferredDays: z.array(z.number()),
  message: z.string().max(1000).optional(),
  consent: z.boolean().refine((v) => v, 'Please accept to continue'),
  website: z.string().optional(),
});

const coachSchema = z.object({
  fullName: z.string().trim().min(2, 'Enter your full name').max(120),
  email: z.email('Enter a valid email'),
  phone: phoneSchema,
  password: passwordSchema,
  experience: z.string().max(1000).optional(),
  specialization: z.string().max(200).optional(),
  message: z.string().max(1000).optional(),
  website: z.string().optional(),
});

/** Hidden from people, irresistible to bots. */
function Honeypot(props: React.ComponentProps<'input'>) {
  return (
    <div aria-hidden className="absolute -left-[9999px] h-0 overflow-hidden">
      <label>
        Website <input tabIndex={-1} autoComplete="off" {...props} />
      </label>
    </div>
  );
}

function StudentForm({
  options,
  onDone,
}: {
  options: Options | undefined;
  onDone: (msg: string) => void;
}) {
  const form = useForm<z.infer<typeof studentSchema>>({
    resolver: zodResolver(studentSchema),
    defaultValues: {
      fullName: '',
      phone: '',
      preferredDays: [],
      consent: false,
      gender: '',
      preferredBatchId: '',
    },
  });
  const { register, handleSubmit, control, formState } = form;
  const e = formState.errors;
  const preferredBatchId = useWatch({ control, name: 'preferredBatchId' });
  const batch = options?.batches.find((b) => b.id === preferredBatchId);

  const onSubmit = handleSubmit(async (v) => {
    try {
      const res = await api.post<{ message: string }>('/public/register/student', {
        fullName: v.fullName,
        dateOfBirth: v.dateOfBirth || null,
        gender: v.gender || null,
        guardianName: nullIfEmpty(v.guardianName),
        phone: v.phone,
        alternatePhone: nullIfEmpty(v.alternatePhone),
        email: nullIfEmpty(v.email),
        address: nullIfEmpty(v.address),
        medicalNotes: nullIfEmpty(v.medicalNotes),
        preferredBatchId: v.preferredBatchId || null,
        preferredDays: v.preferredDays.length ? v.preferredDays : null,
        message: nullIfEmpty(v.message),
        consent: true,
        website: v.website,
      });
      onDone(res.message);
    } catch (err) {
      applyServerErrors(err, form.setError, 'Could not submit registration');
    }
  });

  return (
    <form onSubmit={onSubmit} noValidate className="relative space-y-3.5">
      <Honeypot {...register('website')} />
      <div className="grid gap-3 sm:grid-cols-2">
        <Field
          label="Student’s full name"
          required
          htmlFor="s-name"
          error={e.fullName?.message}
          className="sm:col-span-2"
        >
          <Input
            id="s-name"
            autoComplete="name"
            aria-invalid={!!e.fullName}
            {...register('fullName')}
          />
        </Field>
        <Field label="Date of birth" htmlFor="s-dob">
          <Input id="s-dob" type="date" {...register('dateOfBirth')} />
        </Field>
        <Field label="Gender" htmlFor="s-gender">
          <Select id="s-gender" {...register('gender')}>
            <option value="">Prefer not to say</option>
            <option value="female">Female</option>
            <option value="male">Male</option>
            <option value="other">Other</option>
          </Select>
        </Field>
        <Field label="Parent / guardian name" htmlFor="s-guardian">
          <Input id="s-guardian" {...register('guardianName')} />
        </Field>
        <Field label="Mobile (WhatsApp)" required htmlFor="s-phone" error={e.phone?.message}>
          <Input
            id="s-phone"
            type="tel"
            inputMode="tel"
            autoComplete="tel"
            placeholder="98765 43210"
            aria-invalid={!!e.phone}
            {...register('phone')}
          />
        </Field>
        <Field label="Alternate mobile" htmlFor="s-alt" error={e.alternatePhone?.message}>
          <Input id="s-alt" type="tel" inputMode="tel" {...register('alternatePhone')} />
        </Field>
        <Field label="Email" htmlFor="s-email" error={e.email?.message}>
          <Input id="s-email" type="email" autoComplete="email" {...register('email')} />
        </Field>
        <Field label="Address" htmlFor="s-address" className="sm:col-span-2">
          <Textarea
            id="s-address"
            rows={2}
            autoComplete="street-address"
            {...register('address')}
          />
        </Field>
        <Field
          label="Medical notes"
          htmlFor="s-medical"
          hint="Allergies, asthma, injuries — anything the coach should know."
          className="sm:col-span-2"
        >
          <Textarea id="s-medical" rows={2} {...register('medicalNotes')} />
        </Field>
      </div>

      <div className="space-y-3 rounded-xl border bg-muted/30 p-4">
        <p className="text-sm font-medium">Training preference</p>
        <Field label="Preferred batch" htmlFor="s-batch">
          <Select id="s-batch" {...register('preferredBatchId')}>
            <option value="">No preference — the academy will suggest one</option>
            {options?.batches.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name} · {b.location.name} · {formatTimeRange(b.startTime, b.endTime)}
              </option>
            ))}
          </Select>
        </Field>
        <Field
          label="Preferred days"
          hint={
            batch
              ? `${batch.name} runs ${weekdaysLabel(batch.weekdays)}.`
              : 'Most students train 3–5 days a week.'
          }
        >
          <Controller
            control={control}
            name="preferredDays"
            render={({ field }) => (
              <WeekdayPicker
                value={field.value}
                onChange={field.onChange}
                allowed={batch?.weekdays}
              />
            )}
          />
        </Field>
      </div>

      <Field label="Anything else?" htmlFor="s-msg">
        <Textarea
          id="s-msg"
          rows={2}
          placeholder="Experience level, goals, questions…"
          {...register('message')}
        />
      </Field>

      <Controller
        control={control}
        name="consent"
        render={({ field }) => (
          <div className="space-y-1">
            <label className="flex cursor-pointer items-start gap-3 text-sm">
              <Checkbox
                checked={field.value}
                onCheckedChange={(c) => field.onChange(c === true)}
                aria-invalid={!!e.consent}
                className="mt-0.5"
              />
              <span className="text-muted-foreground">
                I confirm these details are correct and agree to be contacted by{' '}
                {options?.academy.name ?? 'the academy'} about this registration.
              </span>
            </label>
            {e.consent && (
              <p className="text-xs font-medium text-destructive">{e.consent.message}</p>
            )}
          </div>
        )}
      />

      <Button type="submit" size="lg" className="w-full" loading={formState.isSubmitting}>
        Submit registration
      </Button>
    </form>
  );
}

function CoachForm({ onDone }: { onDone: (msg: string) => void }) {
  const form = useForm<z.infer<typeof coachSchema>>({
    resolver: zodResolver(coachSchema),
    defaultValues: { fullName: '', email: '', phone: '', password: '' },
  });
  const { register, handleSubmit, formState } = form;
  const e = formState.errors;

  const onSubmit = handleSubmit(async (v) => {
    try {
      const res = await api.post<{ message: string }>('/public/register/coach', {
        fullName: v.fullName,
        email: v.email,
        phone: v.phone,
        password: v.password,
        experience: nullIfEmpty(v.experience),
        specialization: nullIfEmpty(v.specialization),
        message: nullIfEmpty(v.message),
        website: v.website,
      });
      onDone(res.message);
    } catch (err) {
      applyServerErrors(err, form.setError, 'Could not submit registration');
    }
  });

  return (
    <form onSubmit={onSubmit} noValidate className="relative space-y-3">
      <Honeypot {...register('website')} />
      <Field label="Full name" required htmlFor="c-name" error={e.fullName?.message}>
        <Input
          id="c-name"
          autoComplete="name"
          aria-invalid={!!e.fullName}
          {...register('fullName')}
        />
      </Field>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field
          label="Email"
          required
          htmlFor="c-email"
          error={e.email?.message}
          hint="You will sign in with this."
        >
          <Input
            id="c-email"
            type="email"
            autoComplete="email"
            aria-invalid={!!e.email}
            {...register('email')}
          />
        </Field>
        <Field label="Mobile" required htmlFor="c-phone" error={e.phone?.message}>
          <Input
            id="c-phone"
            type="tel"
            inputMode="tel"
            autoComplete="tel"
            aria-invalid={!!e.phone}
            {...register('phone')}
          />
        </Field>
      </div>
      <Field
        label="Password"
        required
        htmlFor="c-pass"
        error={e.password?.message}
        hint="At least 8 characters with letters and numbers."
      >
        <Input
          id="c-pass"
          type="password"
          autoComplete="new-password"
          aria-invalid={!!e.password}
          {...register('password')}
        />
      </Field>
      <Field label="Specialisation" htmlFor="c-spec">
        <Input
          id="c-spec"
          placeholder="e.g. Footwork, fitness, U-12"
          {...register('specialization')}
        />
      </Field>
      <Field label="Coaching experience" htmlFor="c-exp">
        <Textarea
          id="c-exp"
          rows={3}
          placeholder="Years coaching, certifications, levels played…"
          {...register('experience')}
        />
      </Field>
      <Button type="submit" size="lg" className="w-full" loading={formState.isSubmitting}>
        Submit for approval
      </Button>
    </form>
  );
}

export function RegisterPage() {
  const [type, setType] = useState<'student' | 'coach'>('student');
  const [done, setDone] = useState<string | null>(null);
  const options = useQuery({
    queryKey: ['public', 'register-options'],
    queryFn: () => api.get<Options>('/public/register/options'),
  });
  const academy = options.data?.academy.name ?? 'AthletiQ';

  return (
    <div className="min-h-dvh bg-muted/40">
      <header className="border-b bg-card">
        <div className="mx-auto flex h-14 max-w-3xl items-center justify-between px-4">
          <div className="flex items-center gap-2.5">
            <div className="flex size-8 items-center justify-center rounded-lg bg-primary text-sm font-bold text-primary-foreground">
              A
            </div>
            <span className="font-semibold">{academy}</span>
          </div>
          <Button asChild variant="ghost" size="sm">
            <Link to="/login">Sign in</Link>
          </Button>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-4 py-8 sm:py-12">
        {done ? (
          <Card className="flex flex-col items-center px-6 py-14 text-center">
            <div className="mb-4 flex size-14 items-center justify-center rounded-full bg-success/12">
              <CheckCircle2 className="size-7 text-success" />
            </div>
            <h1 className="text-xl font-semibold">Registration received</h1>
            <p className="mt-2 max-w-md text-sm text-muted-foreground">{done}</p>
            {options.data?.academy.phone && (
              <p className="mt-4 text-sm">
                Questions? Call{' '}
                <a className="font-medium text-primary" href={`tel:${options.data.academy.phone}`}>
                  {options.data.academy.phone}
                </a>
              </p>
            )}
            <Button variant="outline" className="mt-4 sm:mt-4" onClick={() => setDone(null)}>
              Register someone else
            </Button>
          </Card>
        ) : (
          <>
            <div className="mb-4 text-center">
              <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Join {academy}</h1>
              <p className="mt-2 text-sm text-muted-foreground">
                Fill in a few details — we’ll confirm your batch and get you started.
              </p>
            </div>
            <div className="mb-4 flex justify-center">
              <Segmented
                ariaLabel="Registration type"
                value={type}
                onChange={setType}
                options={[
                  {
                    value: 'student',
                    label: (
                      <>
                        <GraduationCap className="size-4" /> I’m a student
                      </>
                    ),
                  },
                  {
                    value: 'coach',
                    label: (
                      <>
                        <UserRound className="size-4" /> I’m a coach
                      </>
                    ),
                  },
                ]}
              />
            </div>
            <Card className="p-5 sm:p-8">
              {type === 'student' ? (
                <StudentForm options={options.data} onDone={setDone} />
              ) : (
                <CoachForm onDone={setDone} />
              )}
            </Card>
          </>
        )}
      </main>
    </div>
  );
}
