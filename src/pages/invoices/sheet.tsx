import {
  ArrowLeftRight,
  Ban,
  ShieldAlert,
  Whistle,
  Download,
  FileText,
  MessageCircle,
  ChevronDown,
  Percent,
  RotateCcw,
  Undo2,
  Wallet,
  AlertTriangle,
  Banknote,
  CircleEllipsis,
  CreditCard,
  Landmark,
  ScrollText,
  Smartphone,
  CalendarClock,
  CalendarRange,
  ChevronRight,
  Layers,
  MapPin,
  MoreVertical,
  ReceiptText,
  UserRound,
} from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { Link } from 'react-router';
import { toast } from 'sonner';
import { useUser } from '@/app/auth';
import { saveFile } from '@/app/share-file';
import { Avatar, ConfirmDialog, Field, InvoiceStatusBadge, MoneyInput } from '@/components/common';
import { PdfViewer, type PdfFile } from '@/components/pdf-viewer';
import { SlideToConfirm } from '@/components/slide-to-confirm';
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
} from '@/components/ui/overlays';
import { Badge, Card, Input, Separator, Textarea } from '@/components/ui/primitives';
import { errorMessage, requestBlob } from '@/lib/api';
import {
  addDays,
  formatDate,
  formatInstant,
  formatShortDate,
  money,
  PAYMENT_MODE_LABELS,
  formatTimeRange,
  plural,
  today,
  WEEKDAYS,
} from '@/lib/format';
import { nullIfEmpty } from '@/lib/forms';
import {
  useAdjustInvoice,
  useCancelInvoice,
  useMarkPaid,
  useReversePayment,
  useShareInvoice,
} from '@/lib/queries';
import type { InvoiceDetail, Payment } from '@/lib/types';
import { cn } from '@/lib/utils';

/**
 * For someone who is both an admin and a coach, signed in as admin: payments they take as admin
 * go straight to academy cash, so we suggest receiving it as coach (counted in the cash they hold,
 * like any coach). Switching here only affects this payment; they stay signed in as admin.
 */
function ReceiveAsNotice({
  receivedAs,
  onChange,
}: {
  receivedAs: 'admin' | 'coach';
  onChange: (r: 'admin' | 'coach') => void;
}) {
  if (receivedAs === 'coach')
    return (
      <div
        role="status"
        className="flex animate-rise items-start gap-2.5 rounded-xl border border-success/30 bg-success/8 p-3"
      >
        <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-success/15 text-success">
          <Whistle className="size-4" />
        </span>
        <div className="min-w-0 flex-1 text-[12px] leading-snug">
          <p className="text-[13px] font-semibold text-foreground">Receiving as coach</p>
          <p className="text-muted-foreground">
            It’s counted with you, like any coach collection. You stay signed in as admin.
          </p>
          <button
            type="button"
            onClick={() => onChange('admin')}
            className="mt-1 cursor-pointer text-[12px] font-medium text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
          >
            Receive as admin instead
          </button>
        </div>
      </div>
    );
  return (
    <div
      role="alert"
      className="flex items-start gap-2.5 rounded-xl border border-warning/40 bg-warning/10 p-3"
    >
      <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-warning/20 text-warning-foreground dark:text-warning">
        <ShieldAlert className="size-4" />
      </span>
      <div className="min-w-0 flex-1 text-[12px] leading-snug">
        <p className="text-[13px] font-semibold text-foreground">You’re receiving this as admin</p>
        <p className="text-muted-foreground">
          As admin, it goes straight into academy cash. You also coach — if the money is with you,
          we suggest receiving it as coach so it’s counted in the cash you hold.
        </p>
        <Button
          size="sm"
          variant="outline"
          className="mt-2 h-8 border-warning/50 bg-card"
          onClick={() => onChange('coach')}
        >
          <ArrowLeftRight /> Receive as coach instead
        </Button>
      </div>
    </div>
  );
}

const PAY_MODES = [
  { value: 'upi', label: 'UPI', icon: Smartphone },
  { value: 'cash', label: 'Cash', icon: Banknote },
  { value: 'bank_transfer', label: 'Bank', icon: Landmark },
  { value: 'card', label: 'Card', icon: CreditCard },
  { value: 'cheque', label: 'Cheque', icon: ScrollText },
  { value: 'other', label: 'Other', icon: CircleEllipsis },
] as const;

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
  const me = useUser();
  // Someone who is both admin and coach, signed in as admin: suggest receiving it as coach.
  const alsoCoach = me.role === 'admin' && (me.roles ?? []).includes('coach');
  const [receivedAs, setReceivedAs] = useState<'admin' | 'coach'>(me.role);
  const isCoach = receivedAs === 'coach';
  const [heldBy, setHeldBy] = useState<'collector' | 'academy'>('collector');
  const [mode, setMode] = useState('upi');
  const [paidOn, setPaidOn] = useState(today());
  const [reference, setReference] = useState('');
  const [note, setNote] = useState('');
  const [noteOpen, setNoteOpen] = useState(false);
  const [attempt, setAttempt] = useState(0);

  async function submit() {
    try {
      await markPaid.mutateAsync({
        mode,
        paidOn,
        reference: nullIfEmpty(reference),
        note: nullIfEmpty(note),
        ...(isCoach ? { heldBy } : {}),
        ...(alsoCoach ? { receivedAs } : {}),
      });
      toast.success(`${money(invoice.totalAmount)} received from ${invoice.student.fullName}`);
      onOpenChange(false);
    } catch (err) {
      setAttempt((n) => n + 1);
      toast.error('Could not mark as paid', { description: errorMessage(err) });
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="gap-3">
        <DialogHeader className="gap-0.5">
          <DialogTitle>Record payment</DialogTitle>
          <DialogDescription>
            {invoice.student.fullName} · <span className="font-mono">{invoice.number}</span>
          </DialogDescription>
        </DialogHeader>
        {alsoCoach && <ReceiveAsNotice receivedAs={receivedAs} onChange={setReceivedAs} />}

        {/* What's being paid. */}
        <div className="flex items-center gap-3 rounded-xl border border-success/25 bg-gradient-to-br from-success/12 to-success/4 px-3 py-2">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-success/15 text-success">
            <Wallet className="size-4.5" />
          </span>
          <span className="shrink-0 leading-tight">
            <span className="block text-[11px] font-medium whitespace-nowrap text-success">
              Amount received
            </span>
            <span className="tabular block text-[22px] font-bold tracking-tight">
              {money(invoice.totalAmount)}
            </span>
          </span>
          {/* Takes the space left and truncates, so it never runs into the amount. */}
          <span className="min-w-0 flex-1 text-right text-[11px] leading-tight text-muted-foreground">
            <span className="block truncate">
              {formatShortDate(invoice.periodStart)} – {formatShortDate(invoice.periodEnd)}
            </span>
            {invoice.batchName && <span className="block truncate">{invoice.batchName}</span>}
          </span>
        </div>

        {/* How it was paid: one tap. */}
        <div className="space-y-1">
          <p className="text-[12px] font-medium">Payment method</p>
          <div role="radiogroup" aria-label="Payment method" className="grid grid-cols-3 gap-1">
            {PAY_MODES.map((m) => {
              const on = mode === m.value;
              const Icon = m.icon;
              return (
                <button
                  key={m.value}
                  type="button"
                  role="radio"
                  aria-checked={on}
                  onClick={() => setMode(m.value)}
                  className={cn(
                    'flex h-9 cursor-pointer items-center justify-center gap-1.5 rounded-lg border text-[12.5px] font-medium transition-colors',
                    on
                      ? 'border-primary bg-primary/8 text-primary ring-1 ring-primary'
                      : 'bg-card text-muted-foreground hover:text-foreground',
                  )}
                >
                  <Icon className="size-3.5" />
                  {m.label}
                </button>
              );
            })}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <div className="space-y-1">
            <label htmlFor="paid-on" className="text-[12px] font-medium">
              Paid on
            </label>
            <Input
              id="paid-on"
              type="date"
              value={paidOn}
              max={today()}
              min={invoice.periodStart}
              onChange={(e) => setPaidOn(e.target.value)}
              className="h-9"
            />
            <div className="flex gap-1">
              {[
                { label: 'Today', value: today() },
                { label: 'Yesterday', value: addDays(today(), -1) },
              ]
                .filter((d) => d.value >= invoice.periodStart)
                .map((d) => (
                  <button
                    key={d.label}
                    type="button"
                    onClick={() => setPaidOn(d.value)}
                    className={cn(
                      'h-6 cursor-pointer rounded-full border px-2 text-[11px] transition-colors',
                      paidOn === d.value
                        ? 'border-primary/40 bg-primary/8 text-primary'
                        : 'text-muted-foreground hover:text-foreground',
                    )}
                  >
                    {d.label}
                  </button>
                ))}
            </div>
          </div>
          <div className="space-y-1">
            <label htmlFor="pay-ref" className="text-[12px] font-medium">
              {mode === 'upi' ? 'UPI reference / UTR' : 'Reference'}
            </label>
            <Input
              id="pay-ref"
              value={reference}
              onChange={(e) => setReference(e.target.value)}
              placeholder="Optional"
              className="h-9"
            />
          </div>
        </div>

        {isCoach && (
          <div className="space-y-1">
            <p className="text-[12px] font-medium">Where is the money now?</p>
            <Segmented
              ariaLabel="Where is the money now?"
              className="w-full"
              value={heldBy}
              onChange={setHeldBy}
              options={[
                { value: 'collector', label: 'With me', className: 'flex-1' },
                { value: 'academy', label: 'Academy’s account', className: 'flex-1' },
              ]}
            />
            <p className="text-[11px] leading-snug text-muted-foreground">
              {heldBy === 'collector'
                ? 'You keep your share; the rest is added to the cash you hold for the academy.'
                : 'It went straight to the academy (e.g. its UPI or bank). The academy owes you your share.'}
            </p>
          </div>
        )}

        {noteOpen || note ? (
          <div className="space-y-1">
            <label htmlFor="pay-note" className="text-[12px] font-medium">
              Note
            </label>
            <Textarea
              id="pay-note"
              rows={2}
              autoFocus={!note}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="e.g. paid by father, part of a family payment"
            />
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setNoteOpen(true)}
            className="-mt-1 w-fit cursor-pointer text-[12px] font-medium text-primary hover:underline"
          >
            + Add a note
          </button>
        )}

        {/* Slide to confirm: a deliberate gesture for money changing hands. */}
        <div className="space-y-1 border-t pt-2">
          <SlideToConfirm
            key={attempt}
            tone={alsoCoach && receivedAs === 'admin' ? 'warning' : 'success'}
            disabled={!paidOn}
            doneLabel="Recording payment…"
            label={
              alsoCoach && receivedAs === 'admin'
                ? `Slide to accept ${money(invoice.totalAmount)} as admin`
                : alsoCoach
                  ? `Slide to receive ${money(invoice.totalAmount)} as coach`
                  : `Slide to confirm ${money(invoice.totalAmount)} received`
            }
            onConfirm={() => void submit()}
          />
          <p className="text-center text-[10.5px] text-muted-foreground">
            Marks the invoice paid and splits it as set in the fee plan.
          </p>
          <Button variant="ghost" className="h-8 w-full" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
        </div>
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

/** One line of the details card: icon, small label, the value and an optional note. */
function DetailRow({
  icon,
  label,
  value,
  sub,
  subTone,
}: {
  icon: ReactNode;
  label: string;
  value: ReactNode;
  sub?: string;
  subTone?: string;
}) {
  return (
    // Compact: label on the left, the value (and its note) on the right.
    <li className="flex items-start gap-2 px-3 py-1">
      <span className="flex size-5 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground [&_svg]:size-3">
        {icon}
      </span>
      <span className="w-[5.75rem] shrink-0 pt-px text-[11px] leading-tight text-muted-foreground">
        {label}
      </span>
      <span className="min-w-0 flex-1 text-right leading-tight">
        <span className="block text-[13px] font-semibold">{value}</span>
        {sub && (
          <span className={cn('block text-[10.5px] text-muted-foreground', subTone)}>{sub}</span>
        )}
      </span>
    </li>
  );
}

const HERO_TINT: Record<InvoiceDetail['displayStatus'], string> = {
  overdue: 'from-destructive/10',
  due: 'from-warning/14',
  paid: 'from-success/10',
  refunded: 'from-muted',
  cancelled: 'from-muted',
};
const STANDING_TONE: Record<InvoiceDetail['displayStatus'], string> = {
  overdue: 'text-destructive',
  due: 'text-warning-foreground dark:text-warning',
  paid: 'text-success',
  refunded: 'text-muted-foreground',
  cancelled: 'text-muted-foreground',
};

/** The invoice page's content: amount and status up top with the actions, then the details. */
export function InvoiceBody({ inv }: { inv: InvoiceDetail }) {
  const user = useUser();
  const isAdmin = user.role === 'admin';
  const share = useShareInvoice();
  const cancel = useCancelInvoice(inv.id);
  const [paying, setPaying] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [adjusting, setAdjusting] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [viewing, setViewing] = useState<PdfFile | null>(null);

  async function openPdf(download: boolean) {
    setDownloading(true);
    try {
      const blob = await requestBlob(`/invoices/${inv.id}/pdf`);
      const name = `${inv.number.replaceAll('/', '-')}.pdf`;
      // Viewed in the app (works in the Android app and iPhone home-screen app too).
      if (download) await saveFile(blob, name, `Invoice ${inv.number}`);
      else setViewing({ blob, name, title: `Invoice ${inv.number}` });
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
      else window.location.assign(res.whatsappUrl);
    } catch (err) {
      win?.close();
      toast.error('Could not create share link', { description: errorMessage(err) });
    }
  }

  const days =
    inv.displayStatus === 'overdue'
      ? Math.max(1, Math.round((Date.parse(today()) - Date.parse(inv.dueDate)) / 86_400_000))
      : 0;
  const standing =
    inv.displayStatus === 'overdue'
      ? `Overdue by ${plural(days, 'day')} · was due ${formatDate(inv.dueDate)}`
      : inv.displayStatus === 'due'
        ? `Due ${formatDate(inv.dueDate)}`
        : inv.displayStatus === 'paid'
          ? `Paid${inv.paidAt ? ` on ${formatDate(inv.paidAt.slice(0, 10))}` : ''}`
          : inv.displayStatus === 'refunded'
            ? 'Refunded'
            : 'Cancelled';
  const paidSoFar = inv.payments
    .filter((p) => p.status === 'completed')
    .reduce((n, p) => n + p.amount, 0);
  const balance = inv.status === 'due' ? Math.max(inv.totalAmount - paidSoFar, 0) : 0;
  const tiles = [
    inv.status !== 'cancelled' && {
      key: 'wa',
      label: 'WhatsApp',
      icon: <MessageCircle />,
      tone: 'text-success bg-success/10',
      loading: share.isPending,
      onClick: () => void whatsapp(),
    },
    {
      key: 'view',
      label: 'View PDF',
      icon: <FileText />,
      tone: 'text-primary bg-primary/10',
      loading: downloading,
      onClick: () => void openPdf(false),
    },
    {
      key: 'dl',
      label: 'Download',
      icon: <Download />,
      tone: 'text-primary bg-primary/10',
      onClick: () => void openPdf(true),
    },
    isAdmin &&
      inv.status === 'due' && {
        key: 'adjust',
        label: 'Adjust',
        icon: <Percent />,
        tone: 'text-info bg-info/10',
        onClick: () => setAdjusting(true),
      },
    isAdmin &&
      inv.status === 'due' && {
        key: 'cancel',
        label: 'Cancel',
        icon: <Ban />,
        tone: 'text-destructive bg-destructive/10',
        onClick: () => setCancelling(true),
        aria: 'Cancel invoice',
      },
  ].filter(Boolean) as {
    key: string;
    label: string;
    icon: ReactNode;
    tone: string;
    loading?: boolean;
    onClick: () => void;
    aria?: string;
  }[];

  return (
    <div className="space-y-2">
      {/* Hero: amount, where it stands, who it's for, and what to do. */}
      <Card className="overflow-hidden">
        <div
          className={cn(
            'bg-gradient-to-b to-transparent px-3 pt-2 pb-2',
            HERO_TINT[inv.displayStatus],
          )}
        >
          <div className="flex items-center justify-between gap-2">
            <span className="leading-tight">
              <span className="block text-[10px] font-semibold tracking-[0.12em] text-muted-foreground uppercase">
                Invoice
              </span>
              <span className="block font-mono text-[12px] font-medium tracking-tight">
                {inv.number}
              </span>
            </span>
            <InvoiceStatusBadge status={inv.displayStatus} />
          </div>
          <p className="tabular mt-1 text-[30px] leading-none font-bold tracking-tight">
            {money(inv.totalAmount)}
          </p>
          <p className={cn('mt-1 text-[12.5px] font-medium', STANDING_TONE[inv.displayStatus])}>
            {standing}
          </p>
          <Link
            to={`/students/${inv.student.id}`}
            className="group mt-2 flex items-center gap-2 rounded-xl border bg-card/80 p-1 pr-2 backdrop-blur transition-colors hover:bg-muted/50"
          >
            <Avatar name={inv.student.fullName} className="size-7 text-[10px]" />
            <span className="min-w-0 flex-1 leading-tight">
              <span className="block truncate text-[13.5px] font-semibold">
                {inv.student.fullName}
              </span>
              <span className="block truncate text-[11px] text-muted-foreground">
                {inv.student.code}
                {inv.student.guardianName ? ` · ${inv.student.guardianName}` : ''} ·{' '}
                {inv.student.phone}
              </span>
            </span>
            <ChevronRight className="size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
          </Link>
        </div>
        {/* One compact row: the main action, then icon buttons (admin extras in a menu). */}
        <div className="flex items-center gap-1 border-t p-2">
          {inv.status === 'due' && (
            <Button
              variant="success"
              className="h-9 min-w-0 flex-1 gap-1 px-3 text-[13px]"
              onClick={() => setPaying(true)}
            >
              <Wallet /> <span className="truncate">Record payment</span>
            </Button>
          )}
          {tiles
            .filter((t) => t.key !== 'adjust' && t.key !== 'cancel')
            .map((t) =>
              inv.status === 'due' ? (
                <Button
                  key={t.key}
                  variant="outline"
                  size="icon"
                  className={cn('size-9 shrink-0 rounded-lg [&_svg]:size-4', t.tone.split(' ')[0])}
                  aria-label={t.label}
                  title={t.label}
                  loading={t.loading}
                  onClick={t.onClick}
                >
                  {!t.loading && t.icon}
                </Button>
              ) : (
                <Button
                  key={t.key}
                  variant="outline"
                  className="h-9 min-w-0 flex-1 gap-1 px-2 text-[12.5px]"
                  loading={t.loading}
                  onClick={t.onClick}
                >
                  {!t.loading && <span className={t.tone.split(' ')[0]}>{t.icon}</span>}
                  {t.label}
                </Button>
              ),
            )}
          {isAdmin && inv.status === 'due' && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="outline"
                  size="icon"
                  className="size-9 shrink-0 rounded-lg"
                  aria-label="More actions"
                >
                  <MoreVertical className="size-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onSelect={() => setAdjusting(true)}>
                  <Percent /> Adjust amount
                </DropdownMenuItem>
                <DropdownMenuItem destructive onSelect={() => setCancelling(true)}>
                  <Ban /> Cancel invoice
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
      </Card>
      <PdfViewer file={viewing} onClose={() => setViewing(null)} />

      {inv.cancelledReason && (
        <p className="rounded-xl border bg-muted/60 px-3 py-1 text-[13px] text-muted-foreground">
          <b className="font-semibold text-foreground">Cancelled:</b> {inv.cancelledReason}
        </p>
      )}

      {/* Details: what this invoice covers, for whom, where and when. */}
      <Card className="overflow-hidden">
        <h3 className="px-3 pt-2 pb-0.5 text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">
          Details
        </h3>
        <ul className="divide-y">
          <DetailRow
            icon={<CalendarRange />}
            label="Billing period"
            value={`${formatShortDate(inv.periodStart)} – ${formatDate(inv.periodEnd)}`}
            sub={`Month ${inv.cycleNumber} of billing`}
          />
          <DetailRow
            icon={<CalendarClock />}
            label="Issued · Due"
            value={
              <>
                {formatShortDate(inv.issueDate)} ·{' '}
                <span className={cn(inv.displayStatus === 'overdue' && 'text-destructive')}>
                  {formatDate(inv.dueDate)}
                </span>
              </>
            }
            sub={inv.displayStatus === 'overdue' ? `${plural(days, 'day')} overdue` : undefined}
            subTone={inv.displayStatus === 'overdue' ? 'text-destructive' : undefined}
          />
          <DetailRow
            icon={<Layers />}
            label="Batch"
            value={inv.batchName ?? '—'}
            sub={[
              inv.about?.startTime && inv.about.endTime
                ? formatTimeRange(inv.about.startTime, inv.about.endTime)
                : null,
              inv.about?.trainingDays?.length
                ? inv.about.trainingDays
                    .map((d) => WEEKDAYS.find((w) => w.value === d)?.short)
                    .join(', ')
                : null,
            ]
              .filter(Boolean)
              .join(' · ')}
          />
          {(inv.about?.locationName || inv.about?.coachName) && (
            <DetailRow
              icon={<MapPin />}
              label="Venue · Coach"
              value={inv.about.locationName ?? '—'}
              sub={inv.about.coachName ? `Coach ${inv.about.coachName}` : undefined}
            />
          )}
          <DetailRow icon={<ReceiptText />} label="Fee plan" value={inv.feePlanName} />
          {inv.about?.batchJoinedOn && (
            <DetailRow
              icon={<UserRound />}
              label="Batch enrollment"
              value={formatDate(inv.about.batchJoinedOn)}
              sub={[
                // The academy joining date, when it differs (e.g. moved from another batch).
                inv.student.joiningDate &&
                inv.about?.batchJoinedOn &&
                inv.student.joiningDate !== inv.about.batchJoinedOn
                  ? `In the academy since ${formatDate(inv.student.joiningDate)}`
                  : null,
                inv.about?.billingStartsOn
                  ? `Billing from ${formatDate(inv.about.billingStartsOn)}`
                  : null,
                inv.student.status === 'active' ? null : `Status: ${inv.student.status}`,
              ]
                .filter(Boolean)
                .join(' · ')}
            />
          )}
        </ul>
        {/* Anything else this student owes. */}
        {(inv.about?.otherDue.count ?? 0) > 0 && (
          <Link
            to={`/students/${inv.student.id}?tab=invoices`}
            className="flex items-center gap-2 border-t bg-warning/10 px-3 py-1 text-[12px] transition-colors hover:bg-warning/15"
          >
            <AlertTriangle className="size-4 shrink-0 text-warning-foreground dark:text-warning" />
            <span className="min-w-0 flex-1">
              <b className="font-semibold">
                {plural(inv.about!.otherDue.count, 'more unpaid invoice')}
              </b>{' '}
              · {money(inv.about!.otherDue.amount)}
            </span>
            <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
          </Link>
        )}
      </Card>

      {/* Amount */}
      <Card className="space-y-1 px-3.5 py-1 text-[13px]">
        <h3 className="text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">
          Amount
        </h3>
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
        {paidSoFar > 0 && (
          <div className="flex justify-between text-success">
            <span>Paid</span>
            <span className="tabular">{money(paidSoFar)}</span>
          </div>
        )}
        {balance > 0 && (
          <div
            className={cn(
              'flex justify-between rounded-lg px-2 py-1 font-semibold',
              inv.displayStatus === 'overdue'
                ? 'bg-destructive/8 text-destructive'
                : 'bg-warning/12 text-warning-foreground dark:text-warning',
            )}
          >
            <span>Balance due</span>
            <span className="tabular">{money(balance)}</span>
          </div>
        )}
      </Card>

      {/* Payments */}
      <Card className="px-3.5 py-1">
        <h3 className="mb-1 text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">
          Payments{inv.payments.length ? ` · ${inv.payments.length}` : ''}
        </h3>
        {inv.payments.length === 0 ? (
          <p className="text-[13px] text-muted-foreground">No payments recorded yet.</p>
        ) : (
          <ul className="space-y-1">
            {inv.payments.map((p) => (
              <PaymentRow key={p.id} p={p} invoiceId={inv.id} canReverse={isAdmin} />
            ))}
          </ul>
        )}
      </Card>

      {(inv.split?.length ?? 0) > 0 && (
        <Card className="px-3.5 py-1">
          <h3 className="mb-1 text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">
            {isAdmin ? 'Where this fee went' : 'Your share of this fee'}
          </h3>
          <ul className="divide-y">
            {inv.split!.map((l, i) => (
              <li key={`${l.label}-${i}`} className="flex items-center gap-2 py-1 text-[13px]">
                <span className="min-w-0 flex-1 truncate">
                  {l.label}
                  <span className="text-muted-foreground"> → {l.name}</span>
                </span>
                <span className="tabular font-semibold">{money(l.amount)}</span>
              </li>
            ))}
          </ul>
        </Card>
      )}

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
