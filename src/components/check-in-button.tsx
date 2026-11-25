import { LogIn } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { errorMessage } from '@/lib/api';
import { getCurrentPosition } from '@/lib/geolocation';
import { useCheck } from '@/lib/queries';
import type { DayOverviewSession, TodaySession } from '@/lib/types';
import { cn } from '@/lib/utils';

/** Check in at the venue (GPS). Once checked in, the session's status shows Live instead. */
export function CheckInButton({
  item,
  compact = false,
}: {
  item: TodaySession;
  overview?: DayOverviewSession;
  /** Small button for dense lists (calendar cards). */
  compact?: boolean;
}) {
  const checkIn = useCheck();
  const [locating, setLocating] = useState(false);

  async function run() {
    setLocating(true);
    try {
      const pos = await getCurrentPosition();
      const res = await checkIn.mutateAsync({
        batchId: item.batch.id,
        latitude: pos.latitude,
        longitude: pos.longitude,
        accuracy: pos.accuracy,
      });
      (res.session.flagged ? toast.warning : toast.success)(res.message);
    } catch (err) {
      toast.error('Check-in failed', { description: errorMessage(err) });
    } finally {
      setLocating(false);
    }
  }

  if (item.session) return null;
  return (
    <Button
      size="sm"
      variant="success"
      className={cn(
        'shrink-0',
        compact
          ? 'h-6 gap-1 rounded-md px-2 text-[11px] pointer-coarse:h-6 pointer-coarse:text-[11px] [&_svg:not([class*=size-])]:size-3'
          : 'h-8 gap-1.5 rounded-lg px-3 text-[12px] pointer-coarse:h-8 [&_svg:not([class*=size-])]:size-3.5',
      )}
      loading={locating || checkIn.isPending}
      onClick={() => void run()}
    >
      <LogIn />
      {locating ? 'Locating…' : 'Check in'}
    </Button>
  );
}
