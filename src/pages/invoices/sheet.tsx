import {
  Ban,
  CheckCircle2,
  Download,
  FileText,
  MessageCircle,
  ChevronDown,
  Percent,
  RotateCcw,
  Undo2,
  Wallet,
} from 'lucide-react';
import { Dialog as D } from 'radix-ui';
import { useState } from 'react';
import { Link } from 'react-router';
import { toast } from 'sonner';
import { useUser } from '@/app/auth';
import {
  ConfirmDialog,
  ErrorState,
  Field,
  InvoiceStatusBadge,
  ListSkeleton,
  MoneyInput,
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
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  SheetContent,
} from '@/components/ui/overlays';
import { Badge, Input, Select, Separator, Textarea } from '@/components/ui/primitives';
import { errorMessage, requestBlob } from '@/lib/api';
import { formatDate, formatInstant, money, PAYMENT_MODE_LABELS, today } from '@/lib/format';
import { nullIfEmpty } from '@/lib/forms';
import {
  useAdjustInvoice,
  useCancelInvoice,
  useInvoice,
  useMarkPaid,
  useReversePayment,
  useShareInvoice,
} from '@/lib/queries';
import type { InvoiceDetail, Payment } from '@/lib/types';
import { cn } from '@/lib/utils';

function MarkPaidDialog({
  invoice,
  open,
  onOpenChange,
}: {
  invoice: InvoiceDetail;
  open: boolean;
  onOpenChange: (o: boolean) => void;
}) {
  const markPaid = useMarkPaid(invoice.id);
  const isCoach = useUser().role === 'coach';
  const [heldBy, setHeldBy] = useState<'collector' | 'academy'>('collector');
  const [mode, setMode] = useState('upi');
  const [paidOn, setPaidOn] = useState(today());
  const [reference, setReference] = useState('');
  const [note, setNote] = useState('');

  async function submit() {
    try {
      await markPaid.mutateAsync({
        mode,
        paidOn,
        reference: nullIfEmpty(reference),
        note: nullIfEmpty(note),
        ...(isCoach ? { heldBy } : {}),
      });
      toast.success(`${money(invoice.totalAmount)} received from ${invoice.student.fullName}`);
      onOpenChange(false);
    } catch (err) {
      toast.error('Could not mark as paid', { description: errorMessage(err) });
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Confirm payment received</DialogTitle>
          <DialogDescription>
            {invoice.number} · {invoice.student.fullName}. The invoice is marked paid and the amount
            is counted as collected by you, and split as set in the fee plan.
          </DialogDescription>
        </DialogHeader>
        <div className="rounded-xl bg-success/10 px-4 py-3">
          <p className="text-xs font-medium text-success">Amount received</p>
          <p className="tabular text-2xl font-semibold">{money(invoice.totalAmount)}</p>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Payment mode" required>
            <Select value={mode} onChange={(e) => setMode(e.target.value)}>
              {Object.entries(PAYMENT_MODE_LABELS).map(([v, l]) => (
                <option key={v} value={v}>
                  {l}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Paid on" required>
            <Input
              type="date"
              value={paidOn}
              max={today()}
              min={invoice.periodStart}
              onChange={(e) => setPaidOn(e.target.value)}
            />
          </Field>
          <Field
            label={mode === 'upi' ? 'UPI reference / UTR' : 'Reference'}
            className="sm:col-span-2"
          >
            <Input
              value={reference}
              onChange={(e) => setReference(e.target.value)}
              placeholder="Optional"
            />
          </Field>
          {isCoach && (
            <Field
              label="Where is the money now?"
              className="sm:col-span-2"
              hint={
                heldBy === 'collector'
                  ? 'You keep your share; the rest is added to the cash you hold for the academy.'
                  : 'It went straight to the academy (e.g. its UPI or bank). The academy owes you your share.'
              }
            >
              <Segmented
                ariaLabel="Where is the money now?"
                className="w-full"
                value={heldBy}
                onChange={setHeldBy}
                options={[
                  { value: 'collector', label: 'With me' },
                  { value: 'academy', label: 'Academy’s account' },
                ]}
              />
            </Field>
          )}
          <Field label="Note" className="sm:col-span-2">
            <Textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} />
          </Field>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            variant="success"
            loading={markPaid.isPending}
            disabled={!paidOn}
            onClick={() => void submit()}
          >
            <CheckCircle2 /> I have received the payment
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Admin: one-off concession on this invoice only (the student's regular fee is unchanged). */
function AdjustDialog({ invoice, onClose }: { invoice: InvoiceDetail; onClose: () => void }) {
  const adjust = useAdjustInvoice(invoice.id);
  const [discount, setDiscount] = useState<number | null>(invoice.discountAmount);
  const [reason, setReason] = useState('');
  const total = Math.max(0, invoice.baseAmount - (discount ?? 0));
  const invalid = discount === null || discount > invoice.baseAmount || reason.trim().length < 3;

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Adjust invoice</DialogTitle>
          <DialogDescription>
            A one-off discount on {invoice.number} only. The student's monthly fee doesn't change.
          </DialogDescription>
        </DialogHeader>
        <Field
          label="Discount on this invoice"
          required
          hint={`Fee before discount: ${money(invoice.baseAmount)}`}
        >
          <MoneyInput value={discount} onChange={setDiscount} />
        </Field>
        <Field label="Reason" required hint="Recorded in the audit log.">
          <Textarea
            rows={2}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="e.g. Missed two weeks due to injury"
          />
        </Field>
        <div className="rounded-xl bg-accent px-4 py-3 text-accent-foreground">
          <p className="text-xs font-medium">New amount</p>
          <p className="tabular text-xl font-semibold">{money(total)}</p>
          {total === 0 && <p className="text-xs">A fully waived invoice is marked as settled.</p>}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            disabled={invalid}
            loading={adjust.isPending}
            onClick={() =>
              adjust.mutate(
                { discountAmount: discount ?? 0, reason: reason.trim() },
                {
                  onSuccess: () => {
                    toast.success('Invoice adjusted');
                    onClose();
                  },
                  onError: (e) =>
                    toast.error('Could not adjust invoice', { description: errorMessage(e) }),
                },
              )
            }
          >
            Save adjustment
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function PaymentRow({
  p,
  invoiceId,
  canReverse,
}: {
  p: Payment;
  invoiceId: string;
  canReverse: boolean;
}) {
  const reverse = useReversePayment(invoiceId);
  const [action, setAction] = useState<'revert' | 'refund' | null>(null);
  return (
    <li className={cn('rounded-xl border p-3 text-sm', p.status !== 'completed' && 'bg-muted/40')}>
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="font-medium">
            <span className="tabular">{money(p.amount)}</span> · {PAYMENT_MODE_LABELS[p.mode]}
          </p>
          <p className="text-xs text-muted-foreground">
            Paid {formatDate(p.paidOn)}
            {p.reference && ` · Ref ${p.reference}`} · received by {p.recordedBy.name}
          </p>
          {p.note && <p className="mt-1 text-xs text-muted-foreground">{p.note}</p>}
        </div>
        <div className="flex items-center gap-1">
          <Badge variant={p.status === 'completed' ? 'success' : 'muted'} className="capitalize">
            {p.status}
          </Badge>
          {canReverse && p.status === 'completed' && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm" aria-label="Reverse payment">
                  Reverse <ChevronDown />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent>
                <DropdownMenuItem onSelect={() => setAction('revert')}>
                  <Undo2 /> Revert (recorded by mistake)
                </DropdownMenuItem>
                <DropdownMenuItem destructive onSelect={() => setAction('refund')}>
                  <RotateCcw /> Refund to family
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
      </div>
      {p.reversalReason && (
        <p className="mt-2 border-t pt-2 text-xs text-muted-foreground">
          {p.status === 'refunded' ? 'Refunded' : 'Reverted'} {formatInstant(p.reversedAt)}:{' '}
          {p.reversalReason}
        </p>
      )}
      <ConfirmDialog
        open={action !== null}
        onOpenChange={(o) => !o && setAction(null)}
        title={action === 'refund' ? 'Refund this payment?' : 'Revert this payment?'}
        description={
          action === 'refund'
            ? 'The invoice will be marked as refunded and closed. Record this only after the money has been returned.'
            : 'The payment will be voided and the invoice becomes due again.'
        }
        confirmLabel={action === 'refund' ? 'Refund' : 'Revert payment'}
        destructive
        requireReason
        loading={reverse.isPending}
        onConfirm={(reason) =>
          reverse.mutate(
            { paymentId: p.id, action: action!, reason },
            {
              onSuccess: () => {
                toast.success(action === 'refund' ? 'Payment refunded' : 'Payment reverted');
                setAction(null);
              },
              onError: (e) => toast.error(errorMessage(e)),
            },
          )
        }
      />
    </li>
  );
}

function InvoiceBody({ inv }: { inv: InvoiceDetail }) {
  const user = useUser();
  const isAdmin = user.role === 'admin';
  const share = useShareInvoice();
  const cancel = useCancelInvoice(inv.id);
  const [paying, setPaying] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [adjusting, setAdjusting] = useState(false);
  const [downloading, setDownloading] = useState(false);

  async function openPdf(download: boolean) {
    setDownloading(true);
    try {
      const blob = await requestBlob(`/invoices/${inv.id}/pdf`);
      const url = URL.createObjectURL(blob);
      if (download) {
        const a = document.createElement('a');
        a.href = url;
        a.download = `${inv.number.replaceAll('/', '-')}.pdf`;
        a.click();
      } else {
        window.open(url, '_blank', 'noopener');
      }
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch (err) {
      toast.error('Could not open invoice PDF', { description: errorMessage(err) });
    } finally {
      setDownloading(false);
    }
  }

  async function whatsapp() {
    // Open the window synchronously (popup blockers), then point it at wa.me once the link is ready.
    const win = window.open('', '_blank');
    try {
      const res = await share.mutateAsync(inv.id);
      if (win) win.location.href = res.whatsappUrl;
      else window.location.href = res.whatsappUrl;
    } catch (err) {
      win?.close();
      toast.error('Could not create share link', { description: errorMessage(err) });
    }
  }

  return (
    <div className="flex h-full flex-col">
      <div className="border-b p-5 pr-14">
        <div className="flex items-center gap-2">
          <p className="font-mono text-sm text-muted-foreground">{inv.number}</p>
          <InvoiceStatusBadge status={inv.displayStatus} />
        </div>
        <p className="tabular mt-2 text-3xl font-semibold tracking-tight">
          {money(inv.totalAmount)}
        </p>
        <Link
          to={`/students/${inv.student.id}`}
          className="mt-1 inline-block text-sm font-medium hover:underline"
        >
          {inv.student.fullName}{' '}
          <span className="font-normal text-muted-foreground">· {inv.student.code}</span>
        </Link>
      </div>

      <div className="flex-1 space-y-6 overflow-y-auto p-5">
        <div className="grid grid-cols-2 gap-y-4 text-sm">
          <div>
            <p className="text-xs text-muted-foreground">Billing period</p>
            <p className="font-medium">
              {formatDate(inv.periodStart)} – {formatDate(inv.periodEnd)}
            </p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Cycle</p>
            <p className="font-medium">Month {inv.cycleNumber}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Issued</p>
            <p className="font-medium">{formatDate(inv.issueDate)}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Due</p>
            <p className={cn('font-medium', inv.displayStatus === 'overdue' && 'text-destructive')}>
              {formatDate(inv.dueDate)}
            </p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Batch</p>
            <p className="font-medium">{inv.batchName ?? '—'}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Plan</p>
            <p className="font-medium">{inv.feePlanName}</p>
          </div>
        </div>

        <div className="space-y-2 rounded-xl border p-4 text-sm">
          <div className="flex justify-between">
            <span className="text-muted-foreground">Coaching fee</span>
            <span className="tabular">{money(inv.baseAmount)}</span>
          </div>
          {inv.discountAmount > 0 && (
            <div className="flex justify-between text-success">
              <span>Discount</span>
              <span className="tabular">− {money(inv.discountAmount)}</span>
            </div>
          )}
          <Separator />
          <div className="flex justify-between font-semibold">
            <span>Total</span>
            <span className="tabular">{money(inv.totalAmount)}</span>
          </div>
        </div>

        {inv.cancelledReason && (
          <p className="rounded-lg bg-muted px-3 py-2 text-sm text-muted-foreground">
            Cancelled: {inv.cancelledReason}
          </p>
        )}

        <div>
          <h3 className="mb-2 text-sm font-semibold">Payment history</h3>
          {inv.payments.length === 0 ? (
            <p className="text-sm text-muted-foreground">No payments recorded yet.</p>
          ) : (
            <ul className="space-y-2">
              {inv.payments.map((p) => (
                <PaymentRow key={p.id} p={p} invoiceId={inv.id} canReverse={isAdmin} />
              ))}
            </ul>
          )}
        </div>

        {(inv.split?.length ?? 0) > 0 && (
          <div>
            <h3 className="mb-2 text-sm font-semibold">
              {isAdmin ? 'Where this fee went' : 'Your share of this fee'}
            </h3>
            <ul className="divide-y rounded-xl border">
              {inv.split!.map((l, i) => (
                <li key={`${l.label}-${i}`} className="flex items-center gap-2 px-3 py-2 text-sm">
                  <span className="min-w-0 flex-1 truncate">
                    {l.label}
                    <span className="text-muted-foreground"> → {l.name}</span>
                  </span>
                  <span className="tabular font-semibold">{money(l.amount)}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      <div className="space-y-2 border-t p-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
        <div className="flex flex-wrap gap-2">
          {inv.status === 'due' && (
            <Button variant="success" className="flex-1" onClick={() => setPaying(true)}>
              <Wallet /> I have received the payment
            </Button>
          )}
          {inv.status !== 'cancelled' && (
            <Button
              variant="outline"
              className="flex-1"
              loading={share.isPending}
              onClick={() => void whatsapp()}
            >
              <MessageCircle className="text-success" /> WhatsApp
            </Button>
          )}
        </div>
        <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
          <Button
            variant="outline"
            size="sm"
            loading={downloading}
            onClick={() => void openPdf(false)}
          >
            {!downloading && <FileText />} View PDF
          </Button>
          <Button variant="outline" size="sm" onClick={() => void openPdf(true)}>
            <Download /> Download PDF
          </Button>
          {isAdmin && inv.status === 'due' && (
            <Button variant="outline" size="sm" onClick={() => setAdjusting(true)}>
              <Percent /> Adjust amount
            </Button>
          )}
          {isAdmin && inv.status === 'due' && (
            <Button
              variant="outline"
              size="sm"
              className="text-destructive hover:bg-destructive/10 hover:text-destructive"
              onClick={() => setCancelling(true)}
            >
              <Ban /> Cancel invoice
            </Button>
          )}
        </div>
      </div>

      <MarkPaidDialog invoice={inv} open={paying} onOpenChange={setPaying} />
      {adjusting && <AdjustDialog invoice={inv} onClose={() => setAdjusting(false)} />}
      <ConfirmDialog
        open={cancelling}
        onOpenChange={setCancelling}
        title="Cancel this invoice?"
        description="Use this to waive a fee or void an invoice raised in error. It will no longer count as outstanding."
        confirmLabel="Cancel invoice"
        destructive
        requireReason
        loading={cancel.isPending}
        onConfirm={(reason) =>
          cancel.mutate(reason, {
            onSuccess: () => {
              toast.success('Invoice cancelled');
              setCancelling(false);
            },
            onError: (e) => toast.error(errorMessage(e)),
          })
        }
      />
    </div>
  );
}

/** Side drawer showing one invoice with all actions. Pass `id = null` to close. */
export function InvoiceSheet({
  id,
  onOpenChange,
}: {
  id: string | null;
  onOpenChange: (open: boolean) => void;
}) {
  const q = useInvoice(id);
  return (
    <D.Root open={id !== null} onOpenChange={onOpenChange}>
      <SheetContent title="Invoice" className="p-0">
        {q.isPending ? (
          <div className="p-5">
            <ListSkeleton rows={4} />
          </div>
        ) : q.isError ? (
          <div className="p-5">
            <ErrorState error={q.error} onRetry={() => void q.refetch()} />
          </div>
        ) : (
          <InvoiceBody inv={q.data} />
        )}
      </SheetContent>
    </D.Root>
  );
}
