/**
 * Admins' "Users" hub: students, the team (coaches and admins) and payees under one tab, with a
 * compact switch at the top. Each section keeps its own filters and actions.
 */
import { Building2, GraduationCap, UsersRound } from 'lucide-react';
import { useSearchParams } from 'react-router';
import { Segmented } from '@/components/ui/controls';
import { CoachesPage } from './coaches';
import { PayeesPage } from './payees';
import { StudentsPage } from '../students/list';

type Tab = 'students' | 'team' | 'payees';
const TABS: { value: Tab; label: string; icon: typeof UsersRound }[] = [
  { value: 'students', label: 'Students', icon: GraduationCap },
  { value: 'team', label: 'Team', icon: UsersRound },
  { value: 'payees', label: 'Payees', icon: Building2 },
];

export function PeoplePage() {
  const [params, setParams] = useSearchParams();
  const raw = params.get('tab');
  const tab: Tab = raw === 'team' || raw === 'payees' ? raw : 'students';
  return (
    <div>
      <Segmented
        ariaLabel="Users"
        className="mb-2.5 w-full sm:w-auto"
        value={tab}
        // Switching sections starts clean (each section has its own filters).
        onChange={(v) => setParams(v === 'students' ? {} : { tab: v }, { replace: true })}
        options={TABS.map((t) => ({
          value: t.value,
          label: (
            <span className="inline-flex items-center gap-1.5">
              <t.icon className="size-4" /> {t.label}
            </span>
          ),
        }))}
      />
      {tab === 'students' ? <StudentsPage /> : tab === 'team' ? <CoachesPage /> : <PayeesPage />}
    </div>
  );
}
