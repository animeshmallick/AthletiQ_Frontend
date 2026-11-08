/**
 * Coaches: one "Fees" page combining their invoices and collection insights.
 * Admins keep separate Invoices and Finance pages (they have academy-wide tools on each).
 */
import { BarChart3, Receipt } from 'lucide-react';
import { useSearchParams } from 'react-router';
import { useUser } from '@/app/auth';
import { PageHeader } from '@/components/common';
import { Segmented } from '@/components/ui/controls';
import { FinancePage } from './finance';
import { InvoicesPage } from './invoices';

type View = 'invoices' | 'insights';

export function FeesPage() {
  const user = useUser();
  const [params, setParams] = useSearchParams();
  if (user.role === 'admin') return <InvoicesPage />;

  const view: View = params.get('view') === 'insights' ? 'insights' : 'invoices';
  const setView = (v: View) => {
    const p = new URLSearchParams();
    if (v === 'insights') p.set('view', 'insights');
    setParams(p, { replace: true });
  };

  return (
    <div>
      <PageHeader
        title="Fees"
        description="Invoices for your students and how collections are going."
      />
      <Segmented
        ariaLabel="Fees view"
        value={view}
        onChange={setView}
        className="mb-4 w-full sm:w-auto"
        options={[
          {
            value: 'invoices',
            label: (
              <>
                <Receipt className="size-4" /> Invoices
              </>
            ),
          },
          {
            value: 'insights',
            label: (
              <>
                <BarChart3 className="size-4" /> Insights
              </>
            ),
          },
        ]}
      />
      {view === 'invoices' ? <InvoicesPage embedded /> : <FinancePage embedded />}
    </div>
  );
}
