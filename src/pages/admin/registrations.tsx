import {
  CheckCircle2,
  GraduationCap,
  Inbox,
  Link2,
  Mail,
  Phone,
  UserRound,
  XCircle,
} from 'lucide-react';
import { useState } from 'react';
import { useForm, type Control } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { toast } from 'sonner';
import {
  ConfirmDialog,
  EmptyState,
  ErrorState,
  ListSkeleton,
  PageHeader,
  Pagination,
} from '@/components/common';
import { Button } from '@/components/ui/button';
import { Segmented } from '@/components/ui/controls';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/overlays';
import { Badge, Card } from '@/components/ui/primitives';
import { errorMessage } from '@/lib/api';
import { formatDate, formatInstant, formatPhone, today, weekdaysLabel } from '@/lib/format';
import { applyServerErrors } from '@/lib/forms';
import { useRegistrations, useReviewRegistration } from '@/lib/queries';
import type { Registration } from '@/lib/types';
import { EnrollmentFields, enrollmentSchema, type EnrollmentValues } from '../students/forms';

function ApproveStudentDialog({ reg, onClose }: { reg: Registration; onClose: () => void }) {
  const review = useReviewRegistration();
  const form = useForm<EnrollmentValues>({
    resolver: zodResolver(enrollmentSchema),
    defaultValues: {
      joiningDate: today(),
      batchId: reg.preferredBatch?.id ?? '',
      // Filled from the chosen batch's days (see EnrollmentFields).
      trainingDays: [],
      feePlanId: '',
      customMonthlyFee: null,
      monthlyDiscount: 0,
    },
  });

  const onSubmit = form.handleSubmit(async (v) => {
    try {
      await review.mutateAsync({ id: reg.id, action: 'approve', body: v });
      toast.success(`${reg.fullName} enrolled`, {
        description: 'Their first month’s invoice has been generated.',
      });
      onClose();
    } catch (err) {
      applyServerErrors(err, form.setError, 'Could not approve');
    }
  });

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Enrol {reg.fullName}</DialogTitle>
          <DialogDescription>
            Confirm the batch, days and fee.{' '}
            {reg.preferredBatch && `They asked for ${reg.preferredBatch.name}`}
            {reg.preferredDays?.length ? ` on ${weekdaysLabel(reg.preferredDays)}.` : ''}
          </DialogDescription>
        </DialogHeader>
        <form id="approve-form" onSubmit={onSubmit} noValidate className="space-y-3">
          {reg.preferredDays?.length ? (
            <div className="flex flex-wrap items-center gap-2 rounded-xl bg-accent/60 px-3 py-2 text-[13px]">
              <span className="text-muted-foreground">
                Asked for <b className="text-foreground">{weekdaysLabel(reg.preferredDays)}</b>
              </span>
              <Button
                type="button"
                size="sm"
                variant="tonal"
                onClick={() =>
                  form.setValue(
                    'trainingDays',
                    [...reg.preferredDays!].sort((a, b) => a - b),
                    {
                      shouldValidate: true,
                    },
                  )
                }
              >
                Use these days
              </Button>
            </div>
          ) : null}
          <EnrollmentFields
            control={form.control as unknown as Control<EnrollmentValues & Record<string, unknown>>}
            setValue={form.setValue as never}
            errors={form.formState.errors}
          />
        </form>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            type="submit"
            form="approve-form"
            variant="success"
            loading={form.formState.isSubmitting}
          >
            <CheckCircle2 /> Approve & enrol
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function RegistrationCard({
  r,
  onApprove,
  onReject,
}: {
  r: Registration;
  onApprove: () => void;
  onReject: () => void;
}) {
  const d = r.details;
  return (
    <Card className="p-4 sm:p-5">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
        <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
          {r.type === 'student' ? (
            <GraduationCap className="size-5" />
          ) : (
            <UserRound className="size-5" />
          )}
        </div>
        <div className="min-w-0 flex-1 space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="font-semibold">{r.fullName}</h3>
            <Badge variant="secondary" className="capitalize">
              {r.type}
            </Badge>
            <span className="text-xs text-muted-foreground">{formatInstant(r.createdAt)}</span>
          </div>
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
            <a
              href={`tel:${r.phone}`}
              className="inline-flex items-center gap-1 hover:text-foreground"
            >
              <Phone className="size-3.5" /> {formatPhone(r.phone)}
            </a>
            {r.email && (
              <span className="inline-flex items-center gap-1">
                <Mail className="size-3.5" /> {r.email}
              </span>
            )}
          </div>
          <dl className="grid gap-x-6 gap-y-1 text-sm sm:grid-cols-2">
            {r.type === 'student' ? (
              <>
                {d.guardianName && <Row k="Guardian" v={d.guardianName} />}
                {d.dateOfBirth && <Row k="Born" v={formatDate(d.dateOfBirth)} />}
                {r.preferredBatch && <Row k="Batch wanted" v={r.preferredBatch.name} />}
                {r.preferredDays?.length ? (
                  <Row k="Days wanted" v={weekdaysLabel(r.preferredDays)} />
                ) : null}
                {d.medicalNotes && (
                  <Row k="Medical" v={d.medicalNotes} className="text-destructive" />
                )}
              </>
            ) : (
              <>
                {d.specialization && <Row k="Specialisation" v={d.specialization} />}
                {d.experience && <Row k="Experience" v={d.experience} />}
              </>
            )}
          </dl>
          {r.message && <p className="rounded-lg bg-muted px-3 py-2 text-sm">“{r.message}”</p>}
          {r.reviewNote && (
            <p className="text-xs text-muted-foreground">Review note: {r.reviewNote}</p>
          )}
        </div>
        {r.status === 'pending' && (
          <div className="flex gap-2 sm:flex-col">
            <Button variant="success" size="sm" onClick={onApprove}>
              <CheckCircle2 /> Approve
            </Button>
            <Button variant="outline" size="sm" onClick={onReject}>
              <XCircle /> Reject
            </Button>
          </div>
        )}
      </div>
    </Card>
  );
}

function Row({ k, v, className }: { k: string; v: string; className?: string }) {
  return (
    <div className="flex gap-2">
      <dt className="text-muted-foreground">{k}:</dt>
      <dd className={className}>{v}</dd>
    </div>
  );
}

export function RegistrationsPage() {
  const [status, setStatus] = useState<'pending' | 'approved' | 'rejected'>('pending');
  const [page, setPage] = useState(1);
  const q = useRegistrations({ status, page, pageSize: 20 });
  const review = useReviewRegistration();
  const [approving, setApproving] = useState<Registration | null>(null);
  const [rejecting, setRejecting] = useState<Registration | null>(null);
  const [confirmCoach, setConfirmCoach] = useState<Registration | null>(null);
  const publicUrl = `${window.location.origin}/register`;
  const pending = q.data?.meta?.pending;

  return (
    <div>
      <PageHeader
        title="Registrations"
        description="Sign-ups from your public registration page. Nothing is created until you approve."
        actions={
          <Button
            variant="outline"
            onClick={() => {
              void navigator.clipboard.writeText(publicUrl);
              toast.success('Registration link copied', { description: publicUrl });
            }}
          >
            <Link2 /> Copy public link
          </Button>
        }
      />
      <Segmented
        ariaLabel="Registration status"
        value={status}
        onChange={(v) => {
          setStatus(v);
          setPage(1);
        }}
        className="mb-4 w-full sm:w-auto"
        options={[
          {
            value: 'pending',
            label: (
              <>
                Pending
                {pending && pending.pendingStudents + pending.pendingCoaches > 0 && (
                  <Badge className="ml-1">{pending.pendingStudents + pending.pendingCoaches}</Badge>
                )}
              </>
            ),
          },
          { value: 'approved', label: 'Approved' },
          { value: 'rejected', label: 'Rejected' },
        ]}
      />

      {q.isPending ? (
        <ListSkeleton rows={4} />
      ) : q.isError ? (
        <ErrorState error={q.error} onRetry={() => void q.refetch()} />
      ) : q.data.data.length === 0 ? (
        <EmptyState
          icon={<Inbox />}
          title={status === 'pending' ? 'No pending registrations' : `No ${status} registrations`}
          description={
            status === 'pending'
              ? 'Share your public registration link to receive sign-ups.'
              : undefined
          }
        />
      ) : (
        <div className="space-y-3">
          {q.data.data.map((r) => (
            <RegistrationCard
              key={r.id}
              r={r}
              onApprove={() => (r.type === 'student' ? setApproving(r) : setConfirmCoach(r))}
              onReject={() => setRejecting(r)}
            />
          ))}
          {q.data.meta && (
            <Pagination
              page={page}
              totalPages={q.data.meta.totalPages}
              total={q.data.meta.total}
              onPage={setPage}
            />
          )}
        </div>
      )}

      {approving && <ApproveStudentDialog reg={approving} onClose={() => setApproving(null)} />}
      <ConfirmDialog
        open={confirmCoach !== null}
        onOpenChange={(o) => !o && setConfirmCoach(null)}
        title={`Approve ${confirmCoach?.fullName} as a coach?`}
        description="They can sign in immediately with the password they chose. Assign them to a batch from Batches."
        confirmLabel="Approve coach"
        loading={review.isPending}
        onConfirm={() =>
          confirmCoach &&
          review.mutate(
            { id: confirmCoach.id, action: 'approve' },
            {
              onSuccess: () => (toast.success('Coach approved'), setConfirmCoach(null)),
              onError: (e) => toast.error(errorMessage(e)),
            },
          )
        }
      />
      <ConfirmDialog
        open={rejecting !== null}
        onOpenChange={(o) => !o && setRejecting(null)}
        title={`Reject ${rejecting?.fullName}?`}
        confirmLabel="Reject"
        destructive
        requireReason
        reasonLabel="Reason (internal)"
        loading={review.isPending}
        onConfirm={(reason) =>
          rejecting &&
          review.mutate(
            { id: rejecting.id, action: 'reject', body: { reason } },
            {
              onSuccess: () => (toast.success('Registration rejected'), setRejecting(null)),
              onError: (e) => toast.error(errorMessage(e)),
            },
          )
        }
      />
    </div>
  );
}
