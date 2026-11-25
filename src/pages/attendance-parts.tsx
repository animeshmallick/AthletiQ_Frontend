import { CloudRain } from 'lucide-react';
import { RestoreSessionButton } from '@/components/cancel-session';
import { EmptyState } from '@/components/common';

export function CancelledBanner({
  batchId,
  date,
  reason,
}: {
  batchId: string;
  date: string;
  reason: string;
}) {
  return (
    <EmptyState
      icon={<CloudRain />}
      title="Session cancelled"
      description={reason}
      action={<RestoreSessionButton batchId={batchId} date={date} />}
    />
  );
}
