import { CloudRain, RotateCcw } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { ConfirmDialog } from '@/components/common';
import { Button } from '@/components/ui/button';
import { errorMessage } from '@/lib/api';
import { formatLongDate } from '@/lib/format';
import { useCancelSession, useRestoreSession } from '@/lib/queries';

/** Marks a session as not happening (rain, holiday…) — it then doesn't count as an absence. */
export function CancelSessionButton({
  batchId,
  date,
  compact = false,
}: {
  batchId: string;
  date: string;
  /** Icon-only, for tight rows. */
  compact?: boolean;
}) {
  const cancel = useCancelSession();
  const [open, setOpen] = useState(false);
  return (
    <>
      {compact ? (
        <Button
          variant="outline"
          size="icon-sm"
          aria-label="Cancel session"
          title="Cancel session (rain, holiday…)"
          className="size-7 rounded-lg text-muted-foreground pointer-coarse:size-7 [&_svg:not([class*=size-])]:size-3.5"
          onClick={() => setOpen(true)}
        >
          <CloudRain />
        </Button>
      ) : (
        <Button
          variant="ghost"
          size="sm"
          className="text-muted-foreground"
          onClick={() => setOpen(true)}
        >
          <CloudRain /> Cancel session
        </Button>
      )}
      <ConfirmDialog
        open={open}
        onOpenChange={setOpen}
        title="Cancel this session?"
        description={`No attendance will be taken for ${formatLongDate(date)}. Students won't be marked absent and it won't count in weekly reports. Fees are not affected. It then waits in Missed sessions to be rescheduled.`}
        confirmLabel="Cancel session"
        destructive
        requireReason
        reasonLabel="Reason (e.g. heavy rain, holiday)"
        loading={cancel.isPending}
        onConfirm={(reason) =>
          cancel.mutate(
            { batchId, date, reason },
            {
              onSuccess: () => {
                toast.success('Session cancelled');
                setOpen(false);
              },
              onError: (e) =>
                toast.error('Could not cancel session', { description: errorMessage(e) }),
            },
          )
        }
      />
    </>
  );
}

/** Puts a cancelled session back on. */
export function RestoreSessionButton({ batchId, date }: { batchId: string; date: string }) {
  const restore = useRestoreSession();
  return (
    <Button
      size="sm"
      variant="outline"
      loading={restore.isPending}
      onClick={() =>
        restore.mutate(
          { batchId, date },
          {
            onSuccess: () => toast.success('Session restored'),
            onError: (e) => toast.error(errorMessage(e)),
          },
        )
      }
    >
      <RotateCcw /> Restore session
    </Button>
  );
}
