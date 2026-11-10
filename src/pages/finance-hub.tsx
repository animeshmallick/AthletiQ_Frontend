/**
 * Finance: one screen for everything money, with three tabs —
 *  - Finance: billing and collections dashboard,
 *  - Money: who holds what, who is owed, and every movement,
 *  - Invoices: every invoice, with the invoice sheet.
 * The same for admins and coaches (each sees what their role allows).
 */
import { BarChart3, Receipt, Wallet } from 'lucide-react';
import { useSearchParams } from 'react-router';
import { useUser } from '@/app/auth';
import { PageHeader } from '@/components/common';
import { Segmented } from '@/components/ui/controls';
import { FinancePage } from './finance';
import { InvoicesPage } from './invoices';
import { MoneyPage } from './money';

export type FinanceTab = 'overview' | 'money' | 'invoices';

const TABS: { value: FinanceTab; label: string; icon: typeof Wallet }[] = [
  { value: 'overview', label: 'Finance', icon: BarChart3 },
  { value: 'money', label: 'Money', icon: Wallet },
  { value: 'invoices', label: 'Invoices', icon: Receipt },
];

const DESCRIPTIONS: Record<FinanceTab, { admin: string; coach: string }> = {
  overview: {
    admin: 'Billing and collections across the academy.',
    coach: 'Billing and collections for your students.',
  },
  money: {
    admin: 'Who holds the money, who is owed, where fees went, and every movement.',
    coach: 'Cash you hold for the academy, what you are owed, and your purchases.',
  },
  invoices: {
    admin: 'Every invoice: what is due, overdue and paid.',
    coach: 'Invoices for your students.',
  },
};

export function FinanceHubPage() {
  const user = useUser();
  const [params, setParams] = useSearchParams();
  const raw = params.get('tab');
  const tab: FinanceTab = raw === 'money' || raw === 'invoices' ? raw : 'overview';
  const role = user.role === 'admin' ? 'admin' : 'coach';

  return (
    <div>
      <PageHeader
        className="mb-1.5 sm:mb-3"
        title="Finance"
        description={DESCRIPTIONS[tab][role]}
      />
      <Segmented
        ariaLabel="Finance view"
        className="mb-2 w-full sm:w-auto"
        value={tab}
        // Each tab keeps its own filters, so switching starts clean.
        onChange={(v) => setParams(v === 'overview' ? {} : { tab: v }, { replace: true })}
        options={TABS.map((t) => ({
          value: t.value,
          label: (
            <span className="inline-flex items-center gap-1.5">
              <t.icon className="size-4" /> {t.label}
            </span>
          ),
        }))}
      />
      {tab === 'overview' ? (
        <FinancePage embedded />
      ) : tab === 'money' ? (
        <MoneyPage embedded />
      ) : (
        <InvoicesPage embedded />
      )}
    </div>
  );
}
