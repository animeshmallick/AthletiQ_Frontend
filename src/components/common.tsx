import {
  AlertTriangle,
  ChevronLeft,
  ChevronRight,
  CircleAlert,
  RefreshCw,
  Search,
  X,
} from 'lucide-react';
import {
  cloneElement,
  isValidElement,
  useEffect,
  useId,
  useState,
  type ComponentProps,
  type ReactElement,
  type ReactNode,
} from 'react';
import { Link } from 'react-router';
import { errorMessage } from '@/lib/api';
import type { AttendanceStatus, InvoiceDisplayStatus } from '@/lib/types';
import { initials } from '@/lib/format';
import { cn } from '@/lib/utils';
import { Button } from './ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from './ui/overlays';
import { Badge, Card, Input, Label, Skeleton, Textarea, type BadgeVariant } from './ui/primitives';

// ─── Page scaffolding ────────────────────────────────────────────────────────

export function PageHeader({
  title,
  description,
  actions,
  back,
}: {
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  back?: ReactNode;
}) {
  return (
    <div className="mb-3.5 flex flex-wrap items-end justify-between gap-x-3 gap-y-2.5 sm:mb-6 sm:gap-4">
      <div className="min-w-0 flex-[1_1_13rem]">
        {back}
        <h1 className="truncate text-[22px] leading-tight font-bold tracking-tight sm:text-2xl">
          {title}
        </h1>
        {description && (
          <p className="mt-0.5 text-[13px] leading-snug text-muted-foreground sm:mt-1 sm:text-sm">
            {description}
          </p>
        )}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export function EmptyState({
  icon,
  title,
  description,
  action,
  className,
}: {
  icon?: ReactNode;
  title: string;
  description?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center rounded-2xl bg-muted/45 px-6 py-9 text-center sm:py-12',
        className,
      )}
    >
      {icon && (
        <div className="mb-3 flex size-12 items-center justify-center rounded-2xl bg-card text-primary shadow-e1 [&_svg]:size-6">
          {icon}
        </div>
      )}
      <h3 className="text-[15px] font-semibold">{title}</h3>
      {description && (
        <p className="mt-1 max-w-sm text-[13px] leading-snug text-muted-foreground sm:text-sm">
          {description}
        </p>
      )}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function ErrorState({
  error,
  onRetry,
  className,
}: {
  error: unknown;
  onRetry?: () => void;
  className?: string;
}) {
  return (
    <div
      role="alert"
      className={cn(
        'flex flex-col items-center gap-3 rounded-xl border border-destructive/30 bg-destructive/5 px-6 py-10 text-center',
        className,
      )}
    >
      <AlertTriangle className="size-6 text-destructive" />
      <p className="text-sm">{errorMessage(error)}</p>
      {onRetry && (
        <Button variant="outline" size="sm" onClick={onRetry}>
          <RefreshCw /> Try again
        </Button>
      )}
    </div>
  );
}

export function ListSkeleton({ rows = 5, className }: { rows?: number; className?: string }) {
  return (
    <div className={cn('space-y-2', className)} aria-busy aria-label="Loading">
      {Array.from({ length: rows }, (_, i) => (
        <Skeleton key={i} className="h-16 w-full rounded-xl" />
      ))}
    </div>
  );
}

const STAT_TONES = {
  default: { chip: 'bg-primary/12 text-primary', glow: 'bg-primary/20', bar: 'bg-primary' },
  success: { chip: 'bg-success/14 text-success', glow: 'bg-success/20', bar: 'bg-success' },
  warning: {
    chip: 'bg-warning/22 text-warning-foreground dark:text-warning',
    glow: 'bg-warning/25',
    bar: 'bg-warning',
  },
  destructive: {
    chip: 'bg-destructive/12 text-destructive',
    glow: 'bg-destructive/18',
    bar: 'bg-destructive',
  },
} as const;

/**
 * KPI tile: tinted icon chip, big number, one-line hint, and a soft colour glow so tiles read at a
 * glance. With `to`, the whole tile is a link (with press feedback) to the matching list.
 */
export function StatCard({
  label,
  value,
  hint,
  icon,
  tone = 'default',
  loading,
  to,
}: {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  icon?: ReactNode;
  tone?: keyof typeof STAT_TONES;
  loading?: boolean;
  to?: string;
}) {
  const t = STAT_TONES[tone];
  const body = (
    <Card
      className={cn(
        'relative h-full overflow-hidden p-2.5 sm:p-3.5',
        to && 'transition-[transform,box-shadow] duration-150 hover:shadow-e2 active:scale-[0.98]',
      )}
    >
      <div
        aria-hidden
        className={cn(
          'pointer-events-none absolute -top-10 -right-10 size-28 rounded-full blur-2xl',
          t.glow,
        )}
      />
      <div className="relative flex min-w-0 items-center gap-2">
        {icon && (
          <div
            className={cn(
              'flex size-7 shrink-0 items-center justify-center rounded-lg [&_svg]:size-4',
              t.chip,
            )}
          >
            {icon}
          </div>
        )}
        <p className="min-w-0 flex-1 truncate text-xs font-medium text-muted-foreground sm:text-[13px]">
          {label}
        </p>
        {to && <ChevronRight aria-hidden className="size-4 shrink-0 text-muted-foreground/60" />}
      </div>
      {loading ? (
        <Skeleton className="mt-2.5 h-6 w-20" />
      ) : (
        <p className="tabular relative mt-1.5 truncate text-[21px] leading-none font-bold tracking-tight sm:text-2xl">
          {value}
        </p>
      )}
      {hint && (
        <p className="relative mt-1 truncate text-[11px] font-medium text-muted-foreground sm:text-xs">
          {hint}
        </p>
      )}
    </Card>
  );
  return to ? (
    <Link to={to} aria-label={label} className="block rounded-2xl focus-visible:outline-2">
      {body}
    </Link>
  ) : (
    body
  );
}

const AVATAR_TONES = [
  'bg-indigo-500/12 text-indigo-700 dark:text-indigo-300',
  'bg-emerald-500/14 text-emerald-800 dark:text-emerald-300',
  'bg-amber-500/18 text-amber-800 dark:text-amber-300',
  'bg-rose-500/12 text-rose-700 dark:text-rose-300',
  'bg-sky-500/14 text-sky-800 dark:text-sky-300',
  'bg-violet-500/12 text-violet-700 dark:text-violet-300',
  'bg-teal-500/14 text-teal-800 dark:text-teal-300',
  'bg-orange-500/14 text-orange-700 dark:text-orange-300',
];

/** Same name → same colour, everywhere. */
function avatarTone(name: string) {
  let h = 0;
  for (const ch of name) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return AVATAR_TONES[h % AVATAR_TONES.length];
}

export function Avatar({ name, className }: { name: string; className?: string }) {
  return (
    <span
      aria-hidden
      className={cn(
        'inline-flex size-9 shrink-0 items-center justify-center rounded-full text-xs font-bold',
        avatarTone(name),
        className,
      )}
    >
      {initials(name)}
    </span>
  );
}

// ─── Forms ───────────────────────────────────────────────────────────────────

export function Field({
  label,
  error,
  hint,
  required,
  children,
  className,
  htmlFor,
}: {
  label: ReactNode;
  error?: string;
  hint?: ReactNode;
  required?: boolean;
  children: ReactNode;
  className?: string;
  htmlFor?: string;
}) {
  // Associate the label, hint and error with the control so screen readers announce them.
  const autoId = useId();
  const child = isValidElement<{ id?: string }>(children) ? children : null;
  const id = htmlFor ?? child?.props.id ?? `field-${autoId}`;
  const messageId = `${id}-message`;
  // With an explicit htmlFor the caller wires the control itself (it may be wrapped in a div).
  const control =
    child && !htmlFor
      ? cloneElement(child as ReactElement<Record<string, unknown>>, {
          id,
          'aria-describedby': error || hint ? messageId : undefined,
          ...(required ? { 'aria-required': true } : {}),
          ...(error ? { 'aria-invalid': true } : {}),
        })
      : children;

  return (
    <div className={cn('grid min-w-0 gap-1.5', className)}>
      <Label htmlFor={id}>
        {label}
        {required && <span className="ml-0.5 text-destructive">*</span>}
      </Label>
      {control}
      {error ? (
        <p
          id={messageId}
          role="alert"
          className="flex items-start gap-1.5 text-xs font-medium text-destructive"
        >
          <CircleAlert aria-hidden className="mt-px size-3.5 shrink-0" />
          {error}
        </p>
      ) : (
        hint && (
          <p id={messageId} className="text-xs text-muted-foreground">
            {hint}
          </p>
        )
      )}
    </div>
  );
}

/** Rupee input that stores paise. */
export function MoneyInput({
  value,
  onChange,
  ...props
}: Omit<ComponentProps<'input'>, 'value' | 'onChange'> & {
  value: number | null | undefined;
  onChange: (paise: number | null) => void;
}) {
  return (
    <Input
      leading="₹"
      inputMode="decimal"
      className="tabular"
      value={value === null || value === undefined ? '' : String(value / 100)}
      onChange={(e) => {
        const raw = e.target.value.replace(/[^\d.]/g, '');
        onChange(raw === '' ? null : Math.round(Number(raw) * 100));
      }}
      {...props}
    />
  );
}

export function SearchInput({
  value,
  onChange,
  placeholder = 'Search…',
  className,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  className?: string;
}) {
  const [local, setLocal] = useState(value);
  // Follow external changes (e.g. URL navigation) without an effect.
  const [prevValue, setPrevValue] = useState(value);
  if (value !== prevValue) {
    setPrevValue(value);
    setLocal(value);
  }
  // Debounce so typing does not fire a request per keystroke.
  useEffect(() => {
    const t = setTimeout(() => local !== value && onChange(local), 300);
    return () => clearTimeout(t);
  }, [local, value, onChange]);

  return (
    <div className={cn('relative', className)}>
      <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
      <Input
        type="search"
        value={local}
        onChange={(e) => setLocal(e.target.value)}
        placeholder={placeholder}
        className="pr-8 pl-9"
        aria-label={placeholder}
      />
      {local && (
        <button
          type="button"
          aria-label="Clear search"
          onClick={() => {
            setLocal('');
            onChange('');
          }}
          className="absolute top-1/2 right-2 -translate-y-1/2 cursor-pointer rounded p-1 text-muted-foreground hover:text-foreground"
        >
          <X className="size-3.5" />
        </button>
      )}
    </div>
  );
}

export function Pagination({
  page,
  totalPages,
  total,
  onPage,
}: {
  page: number;
  totalPages: number;
  total: number;
  onPage: (p: number) => void;
}) {
  if (totalPages <= 1) return null;
  return (
    <nav
      aria-label="Pagination"
      className="mt-4 flex items-center justify-between gap-2 text-sm text-muted-foreground"
    >
      <span className="tabular">
        Page {page} of {totalPages} · {total} total
      </span>
      <div className="flex gap-2">
        <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => onPage(page - 1)}>
          <ChevronLeft /> Previous
        </Button>
        <Button
          variant="outline"
          size="sm"
          disabled={page >= totalPages}
          onClick={() => onPage(page + 1)}
        >
          Next <ChevronRight />
        </Button>
      </div>
    </nav>
  );
}

// ─── Confirm dialog (optionally with a required reason) ──────────────────────

export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel = 'Confirm',
  destructive,
  requireReason,
  reasonLabel = 'Reason',
  loading,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: ReactNode;
  confirmLabel?: string;
  destructive?: boolean;
  requireReason?: boolean;
  reasonLabel?: string;
  loading?: boolean;
  onConfirm: (reason: string) => void;
}) {
  const [reason, setReason] = useState('');
  const id = useId();
  const invalid = requireReason && reason.trim().length < 3;
  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) setReason('');
        onOpenChange(o);
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description && <DialogDescription>{description}</DialogDescription>}
        </DialogHeader>
        {requireReason && (
          <Field label={reasonLabel} required htmlFor={id} hint="Recorded in the audit log.">
            <Textarea
              id={id}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={3}
              autoFocus
            />
          </Field>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            variant={destructive ? 'destructive' : 'default'}
            disabled={invalid}
            loading={loading}
            onClick={() => onConfirm(reason.trim())}
          >
            {confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Status badges ───────────────────────────────────────────────────────────

const INVOICE_STATUS: Record<InvoiceDisplayStatus, { label: string; variant: BadgeVariant }> = {
  due: { label: 'Due', variant: 'warning' },
  overdue: { label: 'Overdue', variant: 'destructive' },
  paid: { label: 'Paid', variant: 'success' },
  refunded: { label: 'Refunded', variant: 'muted' },
  cancelled: { label: 'Cancelled', variant: 'muted' },
};

export function InvoiceStatusBadge({ status }: { status: InvoiceDisplayStatus }) {
  const s = INVOICE_STATUS[status];
  return <Badge variant={s.variant}>{s.label}</Badge>;
}

export const ATTENDANCE_META: Record<
  AttendanceStatus,
  { label: string; short: string; className: string; active: string }
> = {
  present: {
    label: 'Present',
    short: 'P',
    className: 'text-success',
    active: 'bg-success text-success-foreground border-success',
  },
  late: {
    label: 'Late',
    short: 'L',
    className: 'text-warning-foreground dark:text-warning',
    active: 'bg-warning text-warning-foreground border-warning',
  },
  absent: {
    label: 'Absent',
    short: 'A',
    className: 'text-destructive',
    active: 'bg-destructive text-destructive-foreground border-destructive',
  },
  excused: {
    label: 'Excused',
    short: 'E',
    className: 'text-info',
    active: 'bg-info text-white border-info',
  },
};

export function AttendanceBadge({ status }: { status: AttendanceStatus | null }) {
  if (!status) return <Badge variant="muted">Not marked</Badge>;
  const v: Record<AttendanceStatus, BadgeVariant> = {
    present: 'success',
    late: 'warning',
    absent: 'destructive',
    excused: 'secondary',
  };
  return <Badge variant={v[status]}>{ATTENDANCE_META[status].label}</Badge>;
}

/** Thin progress bar. */
export function Progress({
  value,
  className,
  tone = 'primary',
  label = 'Progress',
}: {
  value: number;
  className?: string;
  tone?: 'primary' | 'success' | 'warning';
  /** What is measured, for screen readers (e.g. "Feedback sent"). */
  label?: string;
}) {
  const color = { primary: 'bg-primary', success: 'bg-success', warning: 'bg-warning' }[tone];
  return (
    <div
      className={cn('h-1.5 w-full overflow-hidden rounded-full bg-muted', className)}
      role="progressbar"
      aria-label={label}
      aria-valuenow={Math.round(value)}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      <div
        className={cn('h-full rounded-full transition-all duration-500', color)}
        style={{ width: `${Math.min(100, Math.max(0, value))}%` }}
      />
    </div>
  );
}
