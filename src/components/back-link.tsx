import { ArrowLeft } from 'lucide-react';
import type { ReactNode } from 'react';
import { useGoBack } from '@/app/go-back';

/** "← Batches" above a detail page's title: goes back, or up to `to` on a fresh visit. */
export function BackLink({ to, children }: { to: string; children: ReactNode }) {
  const goBack = useGoBack(to);
  return (
    <a
      href={to}
      onClick={(e) => {
        if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
        e.preventDefault();
        goBack();
      }}
      className="mb-1 inline-flex items-center gap-1 text-[13px] text-muted-foreground hover:text-foreground"
    >
      <ArrowLeft className="size-4" /> {children}
    </a>
  );
}
