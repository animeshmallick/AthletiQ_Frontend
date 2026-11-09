import { CalendarCheck2, ClipboardList, IndianRupee } from 'lucide-react';
import type { ReactNode } from 'react';
import { BrandMark } from '@/components/brand-mark';

const FEATURES = [
  {
    icon: CalendarCheck2,
    title: 'Attendance in seconds',
    text: 'Mark a whole batch with one tap, GPS check-ins for coaches.',
  },
  {
    icon: ClipboardList,
    title: 'Plans & progress',
    text: 'Daily lesson grids and weekly feedback every parent will love.',
  },
  {
    icon: IndianRupee,
    title: 'Billing on autopilot',
    text: 'Prepaid monthly invoices on each student’s cycle, shared on WhatsApp.',
  },
];

/** Split-screen layout for sign-in and token pages. */
export function AuthShell({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="grid min-h-dvh lg:grid-cols-2">
      <div className="relative hidden overflow-hidden bg-sidebar p-12 text-sidebar-foreground lg:flex lg:flex-col lg:justify-between">
        <div className="pointer-events-none absolute -top-32 -right-32 size-96 rounded-full bg-primary/30 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-40 -left-20 size-96 rounded-full bg-chart-2/20 blur-3xl" />
        <div className="relative flex items-center gap-2.5">
          <BrandMark className="size-9 rounded-xl" />
          <span className="text-lg font-semibold">AthletiQ</span>
        </div>
        <div className="relative max-w-md space-y-5">
          <h2 className="text-3xl leading-tight font-semibold tracking-tight">
            Run your academy, not spreadsheets.
          </h2>
          <ul className="space-y-3 sm:space-y-3.5">
            {FEATURES.map((f) => (
              <li key={f.title} className="flex gap-3">
                <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-sidebar-accent">
                  <f.icon className="size-5 text-primary" />
                </div>
                <div>
                  <p className="font-medium">{f.title}</p>
                  <p className="text-sm text-sidebar-muted">{f.text}</p>
                </div>
              </li>
            ))}
          </ul>
        </div>
        <p className="relative text-xs text-sidebar-muted">© {new Date().getFullYear()} AthletiQ</p>
      </div>

      <div className="flex items-center justify-center px-5 py-12 sm:px-8">
        <div className="w-full max-w-sm">
          <div className="mb-8 flex items-center gap-2.5 lg:hidden">
            <BrandMark className="size-9 rounded-xl" />
            <span className="text-lg font-semibold">AthletiQ</span>
          </div>
          <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
          {subtitle && <p className="mt-1.5 text-sm text-muted-foreground">{subtitle}</p>}
          <div className="mt-5">{children}</div>
        </div>
      </div>
    </div>
  );
}
