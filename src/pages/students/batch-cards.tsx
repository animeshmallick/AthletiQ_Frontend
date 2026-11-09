/**
 * A student's current batches, one card each: when and with whom they train, what that batch
 * costs them, and when it next bills. Admins can change the fee, move to another batch or leave
 * it, and add the student to another batch.
 */
import {
  ArrowRightLeft,
  CalendarClock,
  LogOut,
  MoreHorizontal,
  Plus,
  SlidersHorizontal,
} from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/overlays';
import { Badge, Card } from '@/components/ui/primitives';
import { formatDate, money } from '@/lib/format';
import type { Membership, StudentDetail } from '@/lib/types';
import { AddBatchDialog, LeaveBatchDialog, MembershipFeeDialog, MoveBatchDialog } from './forms';
import { scheduleLabel } from '@/lib/batch-times';

type Action = { kind: 'fee' | 'move' | 'leave'; m: Membership } | { kind: 'add' } | null;

export function BatchCards({
  s,
  isAdmin,
  canManage,
}: {
  s: StudentDetail;
  isAdmin: boolean;
  canManage: boolean;
}) {
  const [action, setAction] = useState<Action>(null);
  const close = (o: boolean) => !o && setAction(null);
  const manage = isAdmin && canManage;

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold">
          {s.memberships.length > 1 ? `${s.memberships.length} batches` : 'Batch'}
        </h3>
        {manage && (
          <Button size="sm" variant="outline" onClick={() => setAction({ kind: 'add' })}>
            <Plus /> Add to batch
          </Button>
        )}
      </div>
      {s.memberships.length === 0 ? (
        <Card className="p-3 text-sm text-muted-foreground">
          Not in any batch{s.leftOn ? ` — left on ${formatDate(s.leftOn)}` : ''}.
        </Card>
      ) : (
        <div className="grid gap-2 sm:grid-cols-2">
          {s.memberships.map((m) => (
            <Card key={m.enrollmentId} className="space-y-2 p-3">
              <div className="flex items-start gap-2">
                <div className="min-w-0 flex-1">
                  <Link
                    to={`/batches/${m.batchId}`}
                    className="block truncate text-[15px] font-semibold hover:underline"
                  >
                    {m.batchName}
                  </Link>
                  <p className="text-[12px] text-muted-foreground">{scheduleLabel(m)}</p>
                  <p className="text-[12px] text-muted-foreground">
                    Coach {m.coachName} · {m.locationName}
                  </p>
                </div>
                {manage && (
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="size-8 shrink-0"
                        aria-label={`Manage ${m.batchName}`}
                      >
                        <MoreHorizontal />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onSelect={() => setAction({ kind: 'fee', m })}>
                        <SlidersHorizontal /> Change fee
                      </DropdownMenuItem>
                      <DropdownMenuItem onSelect={() => setAction({ kind: 'move', m })}>
                        <ArrowRightLeft /> Move to another batch
                      </DropdownMenuItem>
                      {s.memberships.length > 1 && (
                        <DropdownMenuItem
                          destructive
                          onSelect={() => setAction({ kind: 'leave', m })}
                        >
                          <LogOut /> Leave this batch
                        </DropdownMenuItem>
                      )}
                    </DropdownMenuContent>
                  </DropdownMenu>
                )}
              </div>
              <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 rounded-lg bg-muted/50 px-2.5 py-1.5 text-[12px]">
                <span className="min-w-0 truncate">
                  {m.plan.name}
                  {m.fee.discount > 0 && (
                    <Badge variant="success" className="ml-1.5 align-middle">
                      −{money(m.fee.discount)}
                    </Badge>
                  )}
                  {m.customMonthlyFee !== null && (
                    <Badge variant="muted" className="ml-1.5 align-middle">
                      Custom fee
                    </Badge>
                  )}
                </span>
                <span className="tabular text-[14px] font-semibold">
                  {money(m.fee.total)}
                  <span className="text-[11px] font-normal text-muted-foreground">/mo</span>
                </span>
              </div>
              <p className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                <CalendarClock className="size-3.5" />
                Since {formatDate(m.since)} ·{' '}
                {m.fee.total === 0
                  ? 'free, no invoices'
                  : `billed on day ${m.billingDay}${m.nextInvoice ? ` · next ${formatDate(m.nextInvoice.issueDate)}` : ''}`}
              </p>
            </Card>
          ))}
        </div>
      )}

      {action?.kind === 'add' && <AddBatchDialog student={s} open onOpenChange={close} />}
      {action?.kind === 'fee' && (
        <MembershipFeeDialog student={s} membership={action.m} open onOpenChange={close} />
      )}
      {action?.kind === 'move' && (
        <MoveBatchDialog student={s} membership={action.m} open onOpenChange={close} />
      )}
      {action?.kind === 'leave' && (
        <LeaveBatchDialog student={s} membership={action.m} open onOpenChange={close} />
      )}
    </div>
  );
}
