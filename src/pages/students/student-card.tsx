/**
 * A student as a card tile for the Students list: who they are, their batches (with coach for
 * admins), monthly fee, what they owe, attendance over the last 30 days and their level.
 */
import { CalendarCheck2, CheckCircle2, LayoutGrid, MessageCircle, Phone } from 'lucide-react';
import { Link } from 'react-router';
import { Avatar } from '@/components/common';
import { Badge, Card } from '@/components/ui/primitives';
import { formatDate, money } from '@/lib/format';
import type { StudentListItem } from '@/lib/types';
import { cn } from '@/lib/utils';
import { LevelBadge } from '../skills/ui';

export function StudentCard({
  s,
  isAdmin,
  onPrefetch,
}: {
  s: StudentListItem;
  isAdmin: boolean;
  onPrefetch?: () => void;
}) {
  const rate = s.attendanceRate ?? null;
  const digits = s.phone.replace(/\D/g, '');
  return (
    <Card
      className={cn(
        'relative flex min-w-0 flex-col gap-2 p-2.5 transition-shadow hover:shadow-e2',
        s.status === 'left' && 'opacity-60',
      )}
    >
      {/* The whole card opens the student; the quick actions sit above the link. */}
      <Link
        to={`/students/${s.id}`}
        onPointerEnter={onPrefetch}
        onTouchStart={onPrefetch}
        className="absolute inset-0 rounded-[inherit]"
        aria-label={`Open ${s.fullName}`}
      />
      <div className="flex items-center gap-2.5">
        <Avatar name={s.fullName} className="size-10" />
        <div className="min-w-0 flex-1">
          <p className="flex min-w-0 items-center gap-1.5">
            <span className="truncate text-[14px] font-semibold">{s.fullName}</span>
            {s.status === 'left' && (
              <Badge variant="muted" className="shrink-0">
                Left
              </Badge>
            )}
          </p>
          <p className="truncate text-[11px] text-muted-foreground">
            {s.code}
            {s.guardianName ? ` · ${s.guardianName}` : ''} · since {formatDate(s.joiningDate)}
          </p>
        </div>
        {s.level?.code && <LevelBadge name={s.level.name ?? ''} code={s.level.code} short />}
      </div>

      <div className="flex min-w-0 items-start gap-1.5 text-[12px]">
        <LayoutGrid className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" />
        <span className="min-w-0 flex-1 truncate">
          {s.batches.length
            ? s.batches
                .map((b) => (isAdmin ? `${b.name} (${b.coachName.split(' ')[0]})` : b.name))
                .join(', ')
            : 'No batch'}
        </span>
        <span className="tabular shrink-0 text-muted-foreground">
          {s.effectiveFee ? `${money(s.effectiveFee)}/mo` : 'Free'}
        </span>
      </div>

      <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
        {s.outstanding > 0 ? (
          <Badge variant={s.overdue > 0 ? 'destructive' : 'warning'}>
            {s.overdue > 0 ? 'Overdue' : 'Due'} · {money(s.outstanding)}
          </Badge>
        ) : (
          s.status === 'active' && (
            <span className="inline-flex items-center gap-0.5 font-medium text-success">
              <CheckCircle2 className="size-3.5" /> Paid up
            </span>
          )
        )}
        <span
          title="Attendance, last 30 days"
          className={cn(
            'inline-flex items-center gap-1 rounded-full px-2 py-0.5 font-semibold',
            rate === null
              ? 'bg-muted text-muted-foreground'
              : rate >= 80
                ? 'bg-success/12 text-success'
                : rate >= 60
                  ? 'bg-warning/15 text-warning-foreground dark:text-warning'
                  : 'bg-destructive/10 text-destructive',
          )}
        >
          <CalendarCheck2 className="size-3" />
          {rate === null ? 'No attendance' : `${rate}%`}
        </span>
        {digits && (
          <span className="relative z-10 ml-auto flex gap-1">
            <a
              href={`tel:${s.phone}`}
              aria-label={`Call ${s.fullName}`}
              className="flex size-7 items-center justify-center rounded-lg border bg-card text-muted-foreground hover:text-foreground"
            >
              <Phone className="size-3.5" />
            </a>
            <a
              href={`https://wa.me/${digits}`}
              target="_blank"
              rel="noreferrer"
              aria-label={`WhatsApp ${s.fullName}`}
              className="flex size-7 items-center justify-center rounded-lg border bg-card text-success hover:bg-success/10"
            >
              <MessageCircle className="size-3.5" />
            </a>
          </span>
        )}
      </div>
    </Card>
  );
}
