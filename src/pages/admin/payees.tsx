/** Payees: outside parties that get a share of fees (a society, ground owner, federation…). */
import { Building2, Plus } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { EmptyState, ErrorState, ListSkeleton, PageHeader } from '@/components/common';
import { Button } from '@/components/ui/button';
import { Badge, Card, Input } from '@/components/ui/primitives';
import { errorMessage } from '@/lib/api';
import { usePayees, useSavePayee } from '@/lib/queries';
import { cn } from '@/lib/utils';

export function PayeesPage() {
  const q = usePayees();
  const save = useSavePayee();
  const [name, setName] = useState('');
  const list = [...(q.data ?? [])].sort(
    (a, b) => Number(b.isActive) - Number(a.isActive) || a.name.localeCompare(b.name),
  );

  async function add() {
    if (!name.trim()) return;
    try {
      await save.mutateAsync({ name: name.trim() });
      toast.success('Payee added');
      setName('');
    } catch (err) {
      toast.error('Could not add payee', { description: errorMessage(err) });
    }
  }

  return (
    <div>
      <PageHeader
        title="Payees"
        description="Outside parties that receive a share of fees. Use them in a fee plan’s split."
      />
      <form
        className="mb-2 flex gap-1.5"
        onSubmit={(e) => {
          e.preventDefault();
          void add();
        }}
      >
        <Input
          aria-label="New payee name"
          placeholder="e.g. Residents’ society"
          value={name}
          maxLength={80}
          onChange={(e) => setName(e.target.value)}
        />
        <Button type="submit" loading={save.isPending} disabled={!name.trim()}>
          <Plus /> Add
        </Button>
      </form>
      {q.isPending ? (
        <ListSkeleton rows={3} />
      ) : q.isError ? (
        <ErrorState error={q.error} onRetry={() => void q.refetch()} />
      ) : list.length === 0 ? (
        <EmptyState
          icon={<Building2 />}
          title="No payees yet"
          description="Add a society, ground owner or federation that takes a share of fees."
        />
      ) : (
        <Card className="divide-y overflow-hidden">
          {list.map((p) => (
            <div
              key={p.id}
              className={cn('flex items-center gap-2.5 px-2.5 py-2', !p.isActive && 'opacity-60')}
            >
              <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-amber-500/12 text-amber-700 dark:text-amber-300">
                <Building2 className="size-4" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[14px] font-semibold">{p.name}</span>
                {p.note && (
                  <span className="block truncate text-[12px] text-muted-foreground">{p.note}</span>
                )}
              </span>
              {!p.isActive && <Badge variant="muted">Retired</Badge>}
              <Button
                size="sm"
                variant="ghost"
                onClick={() =>
                  save.mutate(
                    { id: p.id, isActive: !p.isActive },
                    {
                      onSuccess: () =>
                        toast.success(p.isActive ? 'Payee retired' : 'Payee restored'),
                      onError: (err) => toast.error(errorMessage(err)),
                    },
                  )
                }
              >
                {p.isActive ? 'Retire' : 'Restore'}
              </Button>
            </div>
          ))}
        </Card>
      )}
    </div>
  );
}
