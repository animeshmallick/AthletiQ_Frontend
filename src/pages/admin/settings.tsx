import { CheckCircle2, CircleAlert, Loader2, Play } from 'lucide-react';
import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { ErrorState, Field, ListSkeleton, PageHeader } from '@/components/common';
import { Button } from '@/components/ui/button';
import {
  Badge,
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
  Input,
  Textarea,
} from '@/components/ui/primitives';
import { errorMessage } from '@/lib/api';
import { formatInstant } from '@/lib/format';
import { applyServerErrors, nullIfEmpty } from '@/lib/forms';
import { useJobRuns, useRunInvoiceJob, useSaveSettings, useSettings } from '@/lib/queries';
import type { AcademySettings } from '@/lib/types';

type Values = Record<
  | 'name'
  | 'legalName'
  | 'address'
  | 'phone'
  | 'email'
  | 'website'
  | 'gstin'
  | 'upiId'
  | 'invoiceFooter',
  string
>;

function toValues(s: AcademySettings): Values {
  return {
    name: s.name,
    legalName: s.legalName ?? '',
    address: s.address ?? '',
    phone: s.phone ?? '',
    email: s.email ?? '',
    website: s.website ?? '',
    gstin: s.gstin ?? '',
    upiId: s.upiId ?? '',
    invoiceFooter: s.invoiceFooter ?? '',
  };
}

function AcademyForm({ settings }: { settings: AcademySettings }) {
  const save = useSaveSettings();
  const form = useForm<Values>({ defaultValues: toValues(settings) });
  const { register, handleSubmit, formState, reset } = form;
  const e = formState.errors;
  useEffect(() => reset(toValues(settings)), [settings, reset]);

  const onSubmit = handleSubmit(async (v) => {
    try {
      await save.mutateAsync({
        name: v.name.trim(),
        legalName: nullIfEmpty(v.legalName),
        address: nullIfEmpty(v.address),
        phone: nullIfEmpty(v.phone),
        email: nullIfEmpty(v.email),
        website: nullIfEmpty(v.website),
        gstin: nullIfEmpty(v.gstin),
        upiId: nullIfEmpty(v.upiId),
        invoiceFooter: nullIfEmpty(v.invoiceFooter),
      });
      toast.success('Settings saved');
    } catch (err) {
      applyServerErrors(err, form.setError, 'Could not save settings');
    }
  });

  return (
    <Card>
      <form onSubmit={onSubmit} noValidate>
        <CardHeader>
          <CardTitle>Academy details</CardTitle>
          <CardDescription>Shown on invoices and in WhatsApp messages to parents.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <Field label="Academy name" required error={e.name?.message}>
            <Input {...register('name', { required: 'Required' })} />
          </Field>
          <Field label="Legal / business name">
            <Input {...register('legalName')} />
          </Field>
          <Field label="Phone" error={e.phone?.message}>
            <Input type="tel" {...register('phone')} />
          </Field>
          <Field label="Email" error={e.email?.message}>
            <Input type="email" {...register('email')} />
          </Field>
          <Field label="Website">
            <Input {...register('website')} />
          </Field>
          <Field
            label="GSTIN"
            error={e.gstin?.message}
            hint="Optional — printed on invoices if set."
          >
            <Input className="uppercase" {...register('gstin')} />
          </Field>
          <Field
            label="UPI ID"
            error={e.upiId?.message}
            hint="Printed on unpaid invoices and share messages."
          >
            <Input placeholder="academy@okhdfc" {...register('upiId')} />
          </Field>
          <Field label="Address" className="sm:col-span-2">
            <Textarea rows={2} {...register('address')} />
          </Field>
          <Field label="Invoice footer" className="sm:col-span-2">
            <Input placeholder="Thank you for training with us!" {...register('invoiceFooter')} />
          </Field>
        </CardContent>
        <CardFooter className="justify-end">
          <Button type="submit" loading={formState.isSubmitting} disabled={!formState.isDirty}>
            Save changes
          </Button>
        </CardFooter>
      </form>
    </Card>
  );
}

function BillingJobs() {
  const runs = useJobRuns();
  const run = useRunInvoiceJob();
  return (
    <Card>
      <CardHeader className="flex-row items-start justify-between gap-4">
        <div>
          <CardTitle>Automatic billing</CardTitle>
          <CardDescription>
            Runs every night at 00:00 IST and catches up after any downtime. Safe to run manually
            anytime.
          </CardDescription>
        </div>
        <Button
          variant="outline"
          size="sm"
          loading={run.isPending}
          onClick={() =>
            run.mutate(undefined, {
              onSuccess: (r) =>
                r.ran
                  ? toast.success(`${r.stats?.invoicesCreated ?? 0} new invoice(s)`)
                  : toast.info(r.reason ?? 'Already running'),
              onError: (e) => toast.error(errorMessage(e)),
            })
          }
        >
          <Play /> Run now
        </Button>
      </CardHeader>
      <CardContent>
        {runs.isPending ? (
          <ListSkeleton rows={3} />
        ) : runs.isError ? (
          <ErrorState error={runs.error} />
        ) : runs.data.length === 0 ? (
          <p className="text-sm text-muted-foreground">No runs yet.</p>
        ) : (
          <ul className="divide-y text-sm">
            {runs.data.slice(0, 10).map((r) => (
              <li key={r.id} className="flex items-center gap-3 py-2.5">
                {r.status === 'succeeded' ? (
                  <CheckCircle2 className="size-4 text-success" />
                ) : r.status === 'failed' ? (
                  <CircleAlert className="size-4 text-destructive" />
                ) : (
                  <Loader2 className="size-4 animate-spin text-muted-foreground" />
                )}
                <span className="flex-1">{formatInstant(r.startedAt)}</span>
                <Badge variant="secondary" className="capitalize">
                  {r.trigger}
                </Badge>
                <span className="tabular w-28 text-right text-muted-foreground">
                  {r.status === 'failed'
                    ? 'Failed'
                    : `${(r.stats?.invoicesCreated as number | undefined) ?? 0} created`}
                </span>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

export function SettingsPage() {
  const q = useSettings();
  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader title="Settings" description="Academy profile and billing automation." />
      <div className="space-y-4 sm:space-y-6">
        {q.isPending ? (
          <ListSkeleton rows={4} />
        ) : q.isError ? (
          <ErrorState error={q.error} onRetry={() => void q.refetch()} />
        ) : (
          <AcademyForm settings={q.data} />
        )}
        <BillingJobs />
      </div>
    </div>
  );
}
