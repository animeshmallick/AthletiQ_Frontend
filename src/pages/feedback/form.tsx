import { Lock, Send } from 'lucide-react';
import { useState } from 'react';
import { useNavigate, useParams } from 'react-router';
import { toast } from 'sonner';
import { useUser } from '@/app/auth';
import { ErrorState, ListSkeleton, PageHeader, Progress } from '@/components/common';
import { BackLink } from '@/components/back-link';
import { Button } from '@/components/ui/button';
import { Checkbox, Switch } from '@/components/ui/controls';
import {
  Badge,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Input,
  Select,
  Textarea,
} from '@/components/ui/primitives';
import { ApiError, errorMessage } from '@/lib/api';
import { addDays, formatDate, formatLongDate, formatShortDate } from '@/lib/format';
import { useFeedbackReport, useSaveFeedback } from '@/lib/queries';
import type { AttendanceSummary, FeedbackField } from '@/lib/types';
import { cn } from '@/lib/utils';

type Answers = Record<string, unknown>;

function RatingInput({
  field,
  value,
  onChange,
  disabled,
}: {
  field: FeedbackField;
  value: number | undefined;
  onChange: (v: number) => void;
  disabled: boolean;
}) {
  const max = field.max ?? 5;
  return (
    <div>
      <div role="radiogroup" aria-label={field.label} className="flex gap-1.5">
        {Array.from({ length: max }, (_, i) => i + 1).map((n) => (
          <button
            key={n}
            type="button"
            role="radio"
            aria-checked={value === n}
            disabled={disabled}
            onClick={() => onChange(n)}
            className={cn(
              'tabular size-11 cursor-pointer rounded-lg border text-sm font-semibold transition-all disabled:cursor-not-allowed',
              value !== undefined && n <= value
                ? 'border-primary bg-primary text-primary-foreground'
                : 'bg-card hover:border-primary/50',
            )}
          >
            {n}
          </button>
        ))}
      </div>
      {value !== undefined && field.captions?.[value] && (
        <p className="mt-1.5 text-xs text-muted-foreground">{field.captions[value]}</p>
      )}
    </div>
  );
}

function FieldInput({
  field,
  value,
  onChange,
  disabled,
}: {
  field: FeedbackField;
  value: unknown;
  onChange: (v: unknown) => void;
  disabled: boolean;
}) {
  switch (field.type) {
    case 'rating':
      return (
        <RatingInput
          field={field}
          value={typeof value === 'number' ? value : undefined}
          onChange={onChange}
          disabled={disabled}
        />
      );
    case 'textarea':
      return (
        <Textarea
          value={(value as string) ?? ''}
          onChange={(e) => onChange(e.target.value)}
          placeholder={field.placeholder}
          maxLength={field.maxLength}
          rows={3}
          disabled={disabled}
        />
      );
    case 'text':
      return (
        <Input
          value={(value as string) ?? ''}
          onChange={(e) => onChange(e.target.value)}
          placeholder={field.placeholder}
          maxLength={field.maxLength}
          disabled={disabled}
        />
      );
    case 'select':
      return (
        <Select
          value={(value as string) ?? ''}
          onChange={(e) => onChange(e.target.value || undefined)}
          disabled={disabled}
        >
          <option value="">Select…</option>
          {field.options?.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </Select>
      );
    case 'multiselect': {
      const arr = Array.isArray(value) ? (value as string[]) : [];
      return (
        <div className="flex flex-wrap gap-3">
          {field.options?.map((o) => (
            <label key={o.value} className="flex cursor-pointer items-center gap-2 text-sm">
              <Checkbox
                checked={arr.includes(o.value)}
                disabled={disabled}
                onCheckedChange={(c) =>
                  onChange(c ? [...arr, o.value] : arr.filter((x) => x !== o.value))
                }
              />
              {o.label}
            </label>
          ))}
        </div>
      );
    }
    case 'boolean':
      return (
        <Switch
          checked={value === true}
          onCheckedChange={(c) => onChange(c)}
          disabled={disabled}
          aria-label={field.label}
        />
      );
  }
}

function AttendanceSnapshot({ a }: { a: AttendanceSummary }) {
  const attended = a.present + a.late;
  const pct = a.scheduled ? Math.round((attended / a.scheduled) * 100) : null;
  const items = [
    { label: 'Present', value: a.present, className: 'text-success' },
    { label: 'Late', value: a.late },
    { label: 'Absent', value: a.absent, className: 'text-destructive' },
    { label: 'Excused', value: a.excused },
  ];
  return (
    <div className="space-y-3">
      <div>
        <div className="flex items-baseline justify-between gap-2">
          <p className="text-[15px] font-semibold">
            Attended{' '}
            <span className="tabular text-xl font-bold">
              {attended}/{a.scheduled}
            </span>{' '}
            <span className="text-muted-foreground">sessions</span>
          </p>
          {pct !== null && <span className="tabular text-sm font-semibold">{pct}%</span>}
        </div>
        <Progress
          value={pct ?? 0}
          label="Attendance this week"
          tone={pct !== null && pct >= 75 ? 'success' : 'warning'}
          className="mt-2 h-2"
        />
      </div>
      <div className="grid grid-cols-4 gap-2 rounded-xl border bg-muted/30 p-2.5 text-center">
        {items.map((i) => (
          <div key={i.label}>
            <p className={cn('tabular text-xl font-semibold', i.className)}>{i.value}</p>
            <p className="text-xs text-muted-foreground">{i.label}</p>
          </div>
        ))}
        {a.unmarked > 0 && (
          <p className="col-span-4 text-xs text-muted-foreground">
            {a.unmarked} session(s) not marked yet
          </p>
        )}
      </div>
    </div>
  );
}

export function FeedbackFormPage() {
  const { studentId = '', weekStart = '' } = useParams();
  const user = useUser();
  const navigate = useNavigate();
  const report = useFeedbackReport(studentId, weekStart);
  const save = useSaveFeedback(studentId, weekStart);
  const [answers, setAnswers] = useState<Answers>({});
  const [errors, setErrors] = useState<Record<string, string>>({});

  // Adopt saved answers when they change on the server (not on every refetch).
  const savedKey = report.data
    ? JSON.stringify([report.data.feedback?.status, report.data.feedback?.answers ?? {}])
    : null;
  const [syncedKey, setSyncedKey] = useState<string | null>(null);
  if (report.data && savedKey !== syncedKey) {
    setSyncedKey(savedKey);
    setAnswers(report.data.feedback?.answers ?? {});
  }

  if (report.isPending) return <ListSkeleton rows={6} />;
  if (report.isError)
    return <ErrorState error={report.error} onRetry={() => void report.refetch()} />;

  const { template, feedback, attendance, editable, student, weekCompleted, opensOn } = report.data;
  const canEdit = editable && user.role === 'coach';
  const submitted = feedback?.status === 'submitted';
  const fields = template.sections.flatMap((s) => s.fields);

  function validate(): boolean {
    const e: Record<string, string> = {};
    for (const f of fields) {
      const v = answers[f.id];
      const empty =
        v === undefined ||
        v === null ||
        v === '' ||
        (Array.isArray(v) && v.length === 0) ||
        (typeof v === 'string' && !v.trim());
      if (f.required && empty) e[f.id] = 'Required';
    }
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  async function submit(send: boolean) {
    if (send && !validate()) {
      toast.error('Please complete the required fields');
      return;
    }
    try {
      await save.mutateAsync({ answers, submit: send });
      toast.success(send ? (submitted ? 'Report updated' : 'Report sent') : 'Draft saved');
      if (send && !submitted) navigate(`/feedback?week=${weekStart}`);
    } catch (err) {
      if (err instanceof ApiError && err.fieldErrors.length) {
        setErrors(Object.fromEntries(err.fieldErrors.map((f) => [f.path, f.message])));
      }
      toast.error('Could not save report', { description: errorMessage(err) });
    }
  }

  return (
    <div className="mx-auto max-w-3xl pb-24">
      <PageHeader
        back={<BackLink to={`/feedback?week=${weekStart}`}>Weekly feedback</BackLink>}
        title={student.fullName}
        description={`${template.title} · ${formatShortDate(weekStart)} – ${formatShortDate(addDays(weekStart, 6))}`}
        actions={
          submitted ? (
            <Badge variant="success">
              Sent {feedback?.submittedAt ? formatDate(feedback.submittedAt.slice(0, 10)) : ''}
            </Badge>
          ) : feedback ? (
            <Badge variant="warning">Draft</Badge>
          ) : null
        }
      />

      {!canEdit && (
        <div className="mb-4 flex items-center gap-2 rounded-lg border bg-muted/50 px-3 py-2.5 text-sm text-muted-foreground">
          <Lock className="size-4" />{' '}
          {user.role === 'admin'
            ? 'Reports are written by the student’s coach.'
            : weekCompleted === false && opensOn
              ? `This week isn’t over yet. Feedback opens on ${formatLongDate(opensOn)}.`
              : 'This report is locked — it was due by the end of the following week.'}
        </div>
      )}

      <div className="space-y-3">
        <Card>
          <CardHeader>
            <CardTitle>Attendance this week</CardTitle>
          </CardHeader>
          <CardContent>
            <AttendanceSnapshot a={attendance} />
          </CardContent>
        </Card>

        {template.sections.map((section) => (
          <Card key={section.id}>
            <CardHeader>
              <CardTitle>{section.title}</CardTitle>
              {section.description && (
                <p className="text-sm text-muted-foreground">{section.description}</p>
              )}
            </CardHeader>
            <CardContent className="space-y-3 sm:space-y-3.5">
              {section.fields.map((f) => (
                <div
                  key={f.id}
                  className={cn(
                    'grid gap-2',
                    f.type === 'boolean' && 'flex items-center justify-between gap-3',
                  )}
                >
                  <p className="text-sm font-medium">
                    {f.label}
                    {f.required && <span className="ml-0.5 text-destructive">*</span>}
                  </p>
                  {f.help && <p className="-mt-1 text-xs text-muted-foreground">{f.help}</p>}
                  <FieldInput
                    field={f}
                    value={answers[f.id]}
                    disabled={!canEdit}
                    onChange={(v) => {
                      setAnswers((a) => ({ ...a, [f.id]: v }));
                      setErrors(({ [f.id]: _removed, ...rest }) => rest);
                    }}
                  />
                  {errors[f.id] && (
                    <p className="text-xs font-medium text-destructive">{errors[f.id]}</p>
                  )}
                </div>
              ))}
            </CardContent>
          </Card>
        ))}
      </div>

      {canEdit && (
        <div className="fixed inset-x-0 bottom-[calc(4rem+env(safe-area-inset-bottom))] z-20 animate-rise px-3 lg:bottom-6 lg:left-64">
          <div className="mx-auto flex max-w-3xl items-center justify-end gap-2 rounded-2xl border bg-card p-3 shadow-xl">
            {!submitted && (
              <Button
                variant="outline"
                loading={save.isPending && !save.variables?.submit}
                onClick={() => void submit(false)}
              >
                Save draft
              </Button>
            )}
            <Button
              loading={save.isPending && save.variables?.submit}
              onClick={() => void submit(true)}
            >
              <Send /> {submitted ? 'Update report' : 'Send report'}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
