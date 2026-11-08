import {
  ArrowLeft,
  ArrowRightLeft,
  CalendarPlus,
  ChevronRight,
  HeartPulse,
  Mail,
  MapPin,
  MessageCircle,
  ChevronDown,
  Pencil,
  Phone,
  Trash2,
  UserMinus,
  UserPlus,
} from 'lucide-react';
import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip as ChartTooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { toast } from 'sonner';
import { useUser } from '@/app/auth';
import {
  ATTENDANCE_META,
  AttendanceBadge,
  Avatar,
  ConfirmDialog,
  EmptyState,
  ErrorState,
  InvoiceStatusBadge,
  ListSkeleton,
  StatCard,
} from '@/components/common';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/controls';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/overlays';
import {
  Badge,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Skeleton,
} from '@/components/ui/primitives';
import { errorMessage } from '@/lib/api';
import {
  addDays,
  formatDate,
  formatPhone,
  formatShortDate,
  formatTimeRange,
  money,
  plural,
  today,
  weekdaysLabel,
} from '@/lib/format';
import {
  useCancelMakeup,
  useDeleteStudent,
  useFeedbackHistory,
  useFeedbackTrends,
  useInvoices,
  useStudent,
  useStudentAttendance,
} from '@/lib/queries';
import type { StudentDetail } from '@/lib/types';
import { cn } from '@/lib/utils';
import { InvoiceSheet } from '../invoices/sheet';
import {
  LeaveDialog,
  MakeupDialog,
  RejoinDialog,
  StudentFormDialog,
  TransferDialog,
} from './forms';

const CHART_COLORS = [
  'var(--chart-1)',
  'var(--chart-2)',
  'var(--chart-3)',
  'var(--chart-4)',
  'var(--chart-5)',
  '#a855f7',
];

function InfoRow({
  icon: Icon,
  label,
  children,
}: {
  icon: typeof Phone;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex gap-3 py-2">
      <Icon className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
      <div className="min-w-0">
        <p className="text-xs text-muted-foreground">{label}</p>
        <div className="text-sm break-words">{children}</div>
      </div>
    </div>
  );
}

function Overview({ s, canManage }: { s: StudentDetail; canManage: boolean }) {
  const cancelMakeup = useCancelMakeup(s.id);
  const e = s.currentEnrollment;
  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <div className="space-y-4 lg:col-span-2">
        <Card>
          <CardHeader>
            <CardTitle>Training</CardTitle>
          </CardHeader>
          <CardContent>
            {e ? (
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <p className="text-xs text-muted-foreground">Batch</p>
                  <Link to={`/batches/${e.batchId}`} className="font-medium hover:underline">
                    {e.batchName}
                  </Link>
                  <p className="text-sm text-muted-foreground">
                    {formatTimeRange(e.startTime, e.endTime)} · {e.locationName}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Coach</p>
                  <p className="font-medium">{e.coachName}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Training days</p>
                  <p className="font-medium">{weekdaysLabel(e.trainingDays)}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">In this batch since</p>
                  <p className="font-medium">{formatDate(e.effectiveFrom)}</p>
                </div>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">
                Not enrolled in a batch{s.leftOn ? ` — left on ${formatDate(s.leftOn)}` : ''}.
              </p>
            )}
          </CardContent>
        </Card>

        {s.upcomingMakeups.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle>Upcoming makeups</CardTitle>
            </CardHeader>
            <CardContent className="divide-y">
              {s.upcomingMakeups.map((m) => (
                <div key={m.id} className="flex items-center gap-3 py-2.5">
                  <CalendarPlus className="size-4 text-primary" />
                  <div className="flex-1 text-sm">
                    <p className="font-medium">
                      {formatShortDate(m.date)} · {m.batchName}
                    </p>
                    {m.reason && <p className="text-xs text-muted-foreground">{m.reason}</p>}
                  </div>
                  {canManage && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                      aria-label={`Cancel makeup on ${formatShortDate(m.date)}`}
                      loading={cancelMakeup.isPending && cancelMakeup.variables === m.id}
                      onClick={() =>
                        cancelMakeup.mutate(m.id, {
                          onSuccess: () => toast.success('Makeup cancelled'),
                          onError: (err) => toast.error(errorMessage(err)),
                        })
                      }
                    >
                      Cancel
                    </Button>
                  )}
                </div>
              ))}
            </CardContent>
          </Card>
        )}

        <Card>
          <CardHeader>
            <CardTitle>Batch history</CardTitle>
          </CardHeader>
          <CardContent>
            <ol className="relative space-y-4 border-l pl-5">
              {s.enrollmentHistory.map((h) => (
                <li key={h.id} className="relative">
                  <span
                    className={cn(
                      'absolute top-1.5 -left-[25px] size-2.5 rounded-full border-2 border-card',
                      h.effectiveTo ? 'bg-muted-foreground/40' : 'bg-primary',
                    )}
                  />
                  <p className="text-sm font-medium">
                    {h.batchName}{' '}
                    <span className="font-normal text-muted-foreground">· {h.coachName}</span>
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {formatDate(h.effectiveFrom)} –{' '}
                    {h.effectiveTo ? formatDate(h.effectiveTo) : 'present'} ·{' '}
                    {weekdaysLabel(h.trainingDays)}
                  </p>
                  {h.reason && (
                    <p className="mt-0.5 text-xs text-muted-foreground italic">{h.reason}</p>
                  )}
                </li>
              ))}
            </ol>
          </CardContent>
        </Card>
      </div>

      <div className="space-y-4">
        <Card>
          <CardHeader>
            <CardTitle>Contact</CardTitle>
          </CardHeader>
          <CardContent className="divide-y">
            <InfoRow
              icon={Phone}
              label={s.guardianName ? `Guardian · ${s.guardianName}` : 'Mobile'}
            >
              <a href={`tel:${s.phone}`} className="hover:underline">
                {formatPhone(s.phone)}
              </a>
              <a
                href={`https://wa.me/${s.phone.replace(/\D/g, '')}`}
                target="_blank"
                rel="noreferrer"
                className="ml-2 inline-flex items-center gap-1 text-xs text-success hover:underline"
              >
                <MessageCircle className="size-3" /> WhatsApp
              </a>
            </InfoRow>
            {s.alternatePhone && (
              <InfoRow icon={Phone} label="Alternate">
                {formatPhone(s.alternatePhone)}
              </InfoRow>
            )}
            {s.email && (
              <InfoRow icon={Mail} label="Email">
                {s.email}
              </InfoRow>
            )}
            {s.address && (
              <InfoRow icon={MapPin} label="Address">
                {s.address}
              </InfoRow>
            )}
            {s.medicalNotes && (
              <InfoRow icon={HeartPulse} label="Medical notes">
                <span className="text-destructive">{s.medicalNotes}</span>
              </InfoRow>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Fees</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Plan</span>
              <span>{s.feePlan.name}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Base</span>
              <span className="tabular">{money(s.effectiveFee.base)}</span>
            </div>
            {s.effectiveFee.discount > 0 && (
              <div className="flex justify-between text-success">
                <span>Discount</span>
                <span className="tabular">− {money(s.effectiveFee.discount)}</span>
              </div>
            )}
            <div className="flex justify-between border-t pt-2 font-semibold">
              <span>Monthly</span>
              <span className="tabular">{money(s.effectiveFee.total)}</span>
            </div>
            <p className="pt-1 text-xs text-muted-foreground">
              Billed on day {Number((s.billingAnchorDate ?? s.joiningDate).slice(8))} of every month{' '}
              {s.billingAnchorDate
                ? `(rejoined ${formatDate(s.billingAnchorDate)}).`
                : `(joined ${formatDate(s.joiningDate)}).`}
            </p>
          </CardContent>
        </Card>
        {s.notes && (
          <Card>
            <CardHeader>
              <CardTitle>Notes</CardTitle>
            </CardHeader>
            <CardContent className="text-sm whitespace-pre-wrap text-muted-foreground">
              {s.notes}
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}

function AttendanceTab({ id }: { id: string }) {
  const [range, setRange] = useState(30);
  const to = today();
  const q = useStudentAttendance(id, { from: addDays(to, -(range - 1)), to });
  if (q.isPending) return <ListSkeleton rows={4} />;
  if (q.isError) return <ErrorState error={q.error} onRetry={() => void q.refetch()} />;
  const s = q.data.summary;
  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        {[30, 90, 180].map((d) => (
          <Button
            key={d}
            size="sm"
            variant={range === d ? 'default' : 'outline'}
            onClick={() => setRange(d)}
          >
            {d} days
          </Button>
        ))}
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard
          label="Attendance rate"
          value={s.attendanceRate === null ? '—' : `${s.attendanceRate}%`}
          tone="success"
        />
        <StatCard
          label="Present"
          value={s.present + s.late}
          hint={s.late ? `${s.late} late` : undefined}
        />
        <StatCard label="Absent" value={s.absent} tone="destructive" />
        <StatCard label="Excused" value={s.excused} />
      </div>
      {q.data.records.length === 0 ? (
        <EmptyState title="No attendance in this period" />
      ) : (
        <Card className="divide-y">
          {[...q.data.records].reverse().map((r) => (
            <div
              key={`${r.date}-${r.batchName}`}
              className="flex items-center gap-3 px-4 py-2.5 text-sm"
            >
              <span
                className={cn(
                  'tabular w-6 text-center font-bold',
                  ATTENDANCE_META[r.status].className,
                )}
              >
                {ATTENDANCE_META[r.status].short}
              </span>
              <span className="w-28 font-medium">{formatDate(r.date)}</span>
              <span className="flex-1 truncate text-muted-foreground">
                {r.batchName}
                {r.isMakeup && ' · makeup'}
                {r.note && ` · ${r.note}`}
              </span>
              <AttendanceBadge status={r.status} />
            </div>
          ))}
        </Card>
      )}
    </div>
  );
}

function InvoicesTab({ id }: { id: string }) {
  const q = useInvoices({ studentId: id, pageSize: 100 });
  const [open, setOpen] = useState<string | null>(null);
  if (q.isPending) return <ListSkeleton rows={4} />;
  if (q.isError) return <ErrorState error={q.error} onRetry={() => void q.refetch()} />;
  if (!q.data.data.length)
    return (
      <EmptyState
        title="No invoices yet"
        description="Fees are prepaid: the first invoice is created when the student is accepted, then at the start of each month."
      />
    );
  return (
    <>
      <Card className="divide-y">
        {q.data.data.map((inv) => (
          <button
            key={inv.id}
            onClick={() => setOpen(inv.id)}
            className="flex w-full cursor-pointer items-center gap-3 px-4 py-3 text-left text-sm hover:bg-muted/40"
          >
            <div className="min-w-0 flex-1">
              <p className="font-medium">{inv.number}</p>
              <p className="text-xs text-muted-foreground">
                {formatShortDate(inv.periodStart)} – {formatDate(inv.periodEnd)} · due{' '}
                {formatShortDate(inv.dueDate)}
              </p>
            </div>
            <span className="tabular font-medium">{money(inv.totalAmount)}</span>
            <InvoiceStatusBadge status={inv.displayStatus} />
            <ChevronRight className="size-4 text-muted-foreground" />
          </button>
        ))}
      </Card>
      <InvoiceSheet id={open} onOpenChange={(o) => !o && setOpen(null)} />
    </>
  );
}

function FeedbackTab({ id }: { id: string }) {
  const history = useFeedbackHistory(id);
  const trends = useFeedbackTrends(id);
  if (history.isPending) return <ListSkeleton rows={4} />;
  if (history.isError) return <ErrorState error={history.error} />;
  if (!history.data.length)
    return (
      <EmptyState
        title="No feedback yet"
        description="Weekly reports written by the coach appear here."
      />
    );

  const weeks = [
    ...new Set(trends.data?.flatMap((t) => t.points.map((p) => p.weekStart)) ?? []),
  ].sort();
  const chartData = weeks.map((w) => ({
    week: formatShortDate(w),
    ...Object.fromEntries(
      (trends.data ?? []).map((t) => [t.label, t.points.find((p) => p.weekStart === w)?.value]),
    ),
  }));

  return (
    <div className="space-y-4">
      {chartData.length > 1 && (
        <Card>
          <CardHeader>
            <CardTitle>Progress over time</CardTitle>
          </CardHeader>
          <CardContent className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData} margin={{ left: -20, right: 8 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                <XAxis
                  dataKey="week"
                  tick={{ fontSize: 12, fill: 'var(--muted-foreground)' }}
                  tickLine={false}
                  axisLine={false}
                />
                <YAxis
                  domain={[1, 5]}
                  ticks={[1, 2, 3, 4, 5]}
                  tick={{ fontSize: 12, fill: 'var(--muted-foreground)' }}
                  tickLine={false}
                  axisLine={false}
                />
                <ChartTooltip
                  contentStyle={{
                    background: 'var(--popover)',
                    border: '1px solid var(--border)',
                    borderRadius: 12,
                    fontSize: 12,
                  }}
                />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                {trends.data?.map((t, i) => (
                  <Line
                    key={t.id}
                    type="monotone"
                    dataKey={t.label}
                    stroke={CHART_COLORS[i % CHART_COLORS.length]}
                    strokeWidth={2}
                    dot={{ r: 3 }}
                    connectNulls
                  />
                ))}
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}
      <Card className="divide-y">
        {history.data.map((f) => (
          <Link
            key={f.id}
            to={`/feedback/${id}/${f.weekStart}`}
            className="flex items-center gap-3 px-4 py-3 text-sm hover:bg-muted/40"
          >
            <div className="flex-1">
              <p className="font-medium">Week of {formatDate(f.weekStart)}</p>
              <p className="text-xs text-muted-foreground">
                {f.coach.name} · {f.batchName}
                {typeof f.answers.overall === 'string' && ` · ${f.answers.overall}`}
              </p>
            </div>
            <Badge variant={f.status === 'submitted' ? 'success' : 'warning'}>
              {f.status === 'submitted' ? 'Sent' : 'Draft'}
            </Badge>
            <ChevronRight className="size-4 text-muted-foreground" />
          </Link>
        ))}
      </Card>
    </div>
  );
}

export function StudentDetailPage() {
  const { id = '' } = useParams();
  const user = useUser();
  const isAdmin = user.role === 'admin';
  const q = useStudent(id);
  const [dialog, setDialog] = useState<
    'edit' | 'transfer' | 'makeup' | 'leave' | 'rejoin' | 'delete' | null
  >(null);
  const deleteStudent = useDeleteStudent();
  const navigate = useNavigate();

  if (q.isPending)
    return (
      <div className="space-y-4">
        <Skeleton className="h-16 w-80" />
        <Skeleton className="h-64 w-full rounded-xl" />
      </div>
    );
  if (q.isError) return <ErrorState error={q.error} onRetry={() => void q.refetch()} />;
  const s = q.data;
  const active = s.status === 'active';

  return (
    <div>
      <Link
        to="/students"
        className="mb-3 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" /> Students
      </Link>
      <div className="mb-4 flex flex-wrap items-center gap-3 sm:mb-6 sm:gap-4">
        <Avatar name={s.fullName} className="size-12 text-base sm:size-14 sm:text-lg" />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
            <h1 className="text-xl leading-tight font-bold tracking-tight sm:text-2xl">
              {s.fullName}
            </h1>
            <Badge variant={active ? 'success' : 'muted'}>{active ? 'Active' : 'Left'}</Badge>
          </div>
          <p className="text-sm text-muted-foreground">
            {s.code} · Joined {formatDate(s.joiningDate)}
          </p>
        </div>
        {active && (
          <div className="flex w-full gap-2 sm:w-auto [&>*]:flex-1 sm:[&>*]:flex-none">
            <Button variant="tonal" onClick={() => setDialog('makeup')}>
              <CalendarPlus /> Makeup
            </Button>
            {isAdmin && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline">
                    Manage <ChevronDown />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent>
                  <DropdownMenuItem onSelect={() => setDialog('edit')}>
                    <Pencil /> Edit details & fee
                  </DropdownMenuItem>
                  <DropdownMenuItem onSelect={() => setDialog('transfer')}>
                    <ArrowRightLeft /> Change batch or days
                  </DropdownMenuItem>
                  <DropdownMenuItem destructive onSelect={() => setDialog('leave')}>
                    <UserMinus /> Mark as left
                  </DropdownMenuItem>
                  <DropdownMenuItem destructive onSelect={() => setDialog('delete')}>
                    <Trash2 /> Delete record
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </div>
        )}
        {!active && isAdmin && (
          <Button onClick={() => setDialog('rejoin')}>
            <UserPlus /> Rejoin
          </Button>
        )}
      </div>

      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard label="Monthly fee" value={money(s.effectiveFee.total)} />
        <StatCard
          label="Outstanding"
          value={money(s.billing.outstanding)}
          tone={s.billing.outstanding ? 'warning' : 'default'}
        />
        <StatCard
          label="Overdue"
          value={money(s.billing.overdue)}
          tone={s.billing.overdue ? 'destructive' : 'default'}
        />
        <StatCard
          label="Paid to date"
          value={money(s.billing.paid)}
          tone="success"
          hint={plural(s.billing.invoiceCount, 'invoice')}
        />
      </div>

      <Tabs defaultValue="overview">
        <TabsList className="mb-4">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="attendance">Attendance</TabsTrigger>
          <TabsTrigger value="invoices">Invoices</TabsTrigger>
          <TabsTrigger value="feedback">Feedback</TabsTrigger>
        </TabsList>
        <TabsContent value="overview">
          <Overview s={s} canManage={active} />
        </TabsContent>
        <TabsContent value="attendance">
          <AttendanceTab id={s.id} />
        </TabsContent>
        <TabsContent value="invoices">
          <InvoicesTab id={s.id} />
        </TabsContent>
        <TabsContent value="feedback">
          <FeedbackTab id={s.id} />
        </TabsContent>
      </Tabs>

      {isAdmin && dialog === 'edit' && (
        <StudentFormDialog open onOpenChange={(o) => !o && setDialog(null)} student={s} />
      )}
      {isAdmin && dialog === 'transfer' && (
        <TransferDialog open onOpenChange={(o) => !o && setDialog(null)} student={s} />
      )}
      {isAdmin && dialog === 'leave' && (
        <LeaveDialog open onOpenChange={(o) => !o && setDialog(null)} student={s} />
      )}
      {isAdmin && dialog === 'rejoin' && (
        <RejoinDialog open onOpenChange={(o) => !o && setDialog(null)} student={s} />
      )}
      <ConfirmDialog
        open={dialog === 'delete'}
        onOpenChange={(o) => !o && setDialog(null)}
        title={`Delete ${s.fullName}?`}
        description="Only for records created by mistake (e.g. duplicates). Students with invoices, attendance or feedback are kept — mark them as left instead."
        confirmLabel="Delete permanently"
        destructive
        loading={deleteStudent.isPending}
        onConfirm={() =>
          deleteStudent.mutate(s.id, {
            onSuccess: () => {
              toast.success('Student deleted');
              navigate('/students', { replace: true });
            },
            onError: (e) => {
              setDialog(null);
              toast.error('Could not delete', { description: errorMessage(e) });
            },
          })
        }
      />
      {dialog === 'makeup' && (
        <MakeupDialog open onOpenChange={(o) => !o && setDialog(null)} student={s} />
      )}
    </div>
  );
}
