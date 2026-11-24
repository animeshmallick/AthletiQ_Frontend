/**
 * Course pieces shown on batch and student pages: progress towards the course target, rounds,
 * certificates (download / share with parents) and, for admins, credit.
 */
import { Award, Download, GraduationCap, Share2 } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router';
import { toast } from 'sonner';
import { saveFile } from '@/app/share-file';
import { Progress } from '@/components/common';
import { ShareLinkDialog } from '@/components/share-link-dialog';
import { Button } from '@/components/ui/button';
import { Badge, Card, Skeleton } from '@/components/ui/primitives';
import { errorMessage, requestBlob } from '@/lib/api';
import {
  certificatePath,
  CREDIT_STATUS,
  ROUND_STATUS,
  shareCertificate,
  useBatchCourse,
  useStudentCourse,
  type RoundProgress,
} from '@/lib/courses';
import { formatDate, formatShortDate, money, plural } from '@/lib/format';
import type { Batch } from '@/lib/types';
import { cn } from '@/lib/utils';

/** "8 of 12 · month 1 of 1" with a bar; extension months in amber. */
function ProgressLine({ p, courseMonths }: { p: RoundProgress; courseMonths: number | null }) {
  if (p.attended === null || p.target === null) return null;
  const pct = p.target ? (p.attended / p.target) * 100 : 0;
  return (
    <div className="min-w-0 flex-1 space-y-0.5">
      <div className="flex items-center justify-between gap-2 text-[12px]">
        <span className="tabular font-medium">
          {p.attended} of {p.target}
        </span>
        <span className="text-muted-foreground">
          {p.month && courseMonths
            ? p.extension
              ? `Extension month ${p.month - courseMonths}`
              : `Month ${p.month} of ${courseMonths}`
            : ''}
        </span>
      </div>
      <Progress
        value={pct}
        tone={p.extension ? 'warning' : pct >= 100 ? 'success' : 'primary'}
        label={`${p.attended} of ${p.target} sessions`}
      />
    </div>
  );
}

// ─── Batch ───────────────────────────────────────────────────────────────────

export function CourseSection({ batch }: { batch: Batch & { courseMonths?: number | null } }) {
  const q = useBatchCourse(batch.id, !!batch.courseMonths);
  if (!batch.courseMonths)
    return (
      <Card className="flex items-start gap-2.5 p-3 text-[13px]">
        <GraduationCap className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
        <p>
          <b className="font-semibold">No course set up yet.</b>{' '}
          <span className="text-muted-foreground">
            Edit the batch to choose its course length in months. Until then students keep training
            month to month.
          </span>
        </p>
      </Card>
    );
  if (q.isPending) return <Skeleton className="h-32 w-full rounded-xl" />;
  if (q.isError) return null;
  const c = q.data;
  return (
    <section className="space-y-2" aria-label="Course">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3">
        <h2 className="flex items-center gap-1.5 text-[15px] font-semibold">
          <GraduationCap className="size-4" /> Course
        </h2>
        <p className="text-[12px] text-muted-foreground">
          {plural(c.batch.courseMonths ?? 0, 'month')} · {c.sessionsPerMonth} sessions a month ·{' '}
          {c.target} in all
        </p>
      </div>
      {c.awaiting.length > 0 && (
        <Card className="border-warning/40 bg-warning/8 p-3 text-[13px]">
          <p className="font-semibold">
            {plural(c.awaiting.length, 'student')} completed the course
          </p>
          <p className="text-muted-foreground">
            {c.awaiting.map((a) => a.student.fullName).join(', ')} · paused from the roster until an
            admin re-admits, moves or lets them go.
          </p>
          <Button asChild size="sm" variant="outline" className="mt-2">
            <Link to="/courses">Course decisions</Link>
          </Button>
        </Card>
      )}
      {c.students.length === 0 ? (
        <p className="py-3 text-center text-[13px] text-muted-foreground">
          No students in a course round.
        </p>
      ) : (
        <Card className="divide-y overflow-hidden">
          {c.students.map((s) => (
            <div key={s.round.id} className="flex items-center gap-3 px-3 py-2">
              <Link
                to={`/students/${s.student.id}`}
                className="w-36 shrink-0 truncate text-[13px] font-medium hover:underline"
              >
                {s.student.fullName}
                {s.round.roundNo > 1 && (
                  <span className="block text-[11px] font-normal text-muted-foreground">
                    Round {s.round.roundNo}
                  </span>
                )}
              </Link>
              <ProgressLine p={s} courseMonths={c.batch.courseMonths} />
            </div>
          ))}
        </Card>
      )}
    </section>
  );
}

// ─── Certificates ────────────────────────────────────────────────────────────

export function CertificateActions({
  roundId,
  studentName,
  phone,
}: {
  roundId: string;
  studentName: string;
  phone?: string | null;
}) {
  const [busy, setBusy] = useState<'download' | 'share' | null>(null);
  const [link, setLink] = useState<{ url: string } | null>(null);
  async function download() {
    setBusy('download');
    try {
      const blob = await requestBlob(certificatePath(roundId));
      await saveFile(blob, `${studentName.replace(/\W+/g, '-')}-certificate.pdf`, 'Certificate');
    } catch (err) {
      toast.error('Could not get the certificate', { description: errorMessage(err) });
    } finally {
      setBusy(null);
    }
  }
  async function share() {
    setBusy('share');
    try {
      setLink(await shareCertificate(roundId));
    } catch (err) {
      toast.error('Could not create a link', { description: errorMessage(err) });
    } finally {
      setBusy(null);
    }
  }
  return (
    <>
      <div className="flex gap-1.5">
        <Button
          size="sm"
          variant="outline"
          loading={busy === 'download'}
          onClick={() => void download()}
        >
          <Download /> Certificate
        </Button>
        <Button size="sm" variant="outline" loading={busy === 'share'} onClick={() => void share()}>
          <Share2 /> Share
        </Button>
      </div>
      <ShareLinkDialog
        link={
          link && {
            title: 'Share the certificate',
            description:
              'Opens the certificate after the student’s registration number is entered.',
            url: link.url,
            phone,
            message: `Congratulations! ${studentName} has completed the course. Here is the certificate:`,
          }
        }
        onClose={() => setLink(null)}
      />
    </>
  );
}

// ─── Student ─────────────────────────────────────────────────────────────────

export function StudentCourseCard({
  studentId,
  studentName,
  phone,
  isAdmin,
}: {
  studentId: string;
  studentName: string;
  phone?: string | null;
  isAdmin: boolean;
}) {
  const q = useStudentCourse(studentId);
  if (q.isPending) return <Skeleton className="h-24 w-full rounded-xl" />;
  if (q.isError || (!q.data.rounds.length && !q.data.credits?.length)) return null;
  const { rounds, credits } = q.data;
  const open = (credits ?? []).filter((c) => ['held', 'assigned', 'refund_due'].includes(c.status));
  return (
    <section className="space-y-2" aria-label="Course">
      <h2 className="flex items-center gap-1.5 text-[15px] font-semibold">
        <GraduationCap className="size-4" /> Course
      </h2>
      <Card className="divide-y overflow-hidden">
        {rounds.map((r) => {
          const st = ROUND_STATUS[r.status];
          const completed =
            r.completedOn && r.attended !== null && r.target !== null && r.attended >= r.target;
          return (
            <div key={r.id} className="space-y-1.5 px-3 py-2.5">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-[13px] font-semibold">{r.batch.name}</span>
                <span className="text-[12px] text-muted-foreground">Round {r.roundNo}</span>
                <Badge variant={r.status === 'left' && !completed ? 'muted' : st.badge}>
                  {r.status === 'left' && !completed
                    ? 'Left mid-course'
                    : r.status === 'left'
                      ? 'Completed · left'
                      : st.label}
                </Badge>
                {r.historical && <Badge variant="muted">Before the course was set up</Badge>}
              </div>
              <p className="text-[12px] text-muted-foreground">
                From {formatDate(r.startedOn)}
                {r.completedOn
                  ? ` · ${completed ? 'completed' : 'ended'} ${formatDate(r.completedOn)}`
                  : ''}
                {completed ? ` · ${r.attended} sessions` : ''}
              </p>
              {r.status === 'active' && <ProgressLine p={r} courseMonths={r.batch.courseMonths} />}
              {completed && !r.historical && (
                <div className="flex items-center gap-2">
                  <Award className="size-4 text-warning" />
                  <CertificateActions roundId={r.id} studentName={studentName} phone={phone} />
                </div>
              )}
            </div>
          );
        })}
      </Card>
      {isAdmin && open.length > 0 && (
        <Card className="space-y-1 p-3 text-[13px]">
          <p className="font-semibold">Credit</p>
          {open.map((c) => (
            <p key={c.id} className="flex flex-wrap items-center gap-2">
              <span className="tabular font-medium">{money(c.amount)}</span>
              <Badge variant={CREDIT_STATUS[c.status].badge}>{CREDIT_STATUS[c.status].label}</Badge>
              <span className={cn('min-w-0 flex-1 text-[12px] text-muted-foreground')}>
                {c.reason} · {formatShortDate(c.createdAt.slice(0, 10))}
              </span>
            </p>
          ))}
        </Card>
      )}
    </section>
  );
}
