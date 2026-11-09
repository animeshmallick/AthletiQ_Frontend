import { LayoutGrid, MapPin, Navigation, Pencil, Plus, Radar } from 'lucide-react';
import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import {
  EmptyState,
  ErrorState,
  Field,
  ListSkeleton,
  PageHeader,
  SearchInput,
} from '@/components/common';
import { hasMapbox, LocationPicker, StaticMap } from '@/components/map';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/controls';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/overlays';
import { Badge, Card, Input, Textarea } from '@/components/ui/primitives';
import { ApiError, errorMessage } from '@/lib/api';
import { useLocations, useSaveLocation } from '@/lib/queries';
import { plural } from '@/lib/format';
import type { Location } from '@/lib/types';
import { cn } from '@/lib/utils';

function LocationDialog({ location, onClose }: { location?: Location; onClose: () => void }) {
  const save = useSaveLocation();
  const [name, setName] = useState(location?.name ?? '');
  const [address, setAddress] = useState(location?.address ?? '');
  const [point, setPoint] = useState<{ latitude: number; longitude: number } | null>(
    location ? { latitude: location.latitude, longitude: location.longitude } : null,
  );
  const [radius, setRadius] = useState(location?.radiusMeters ?? 200);
  // Raw text for the manual coordinate inputs, so partially typed values like "12." are kept.
  const [latText, setLatText] = useState(location ? String(location.latitude) : '');
  const [lngText, setLngText] = useState(location ? String(location.longitude) : '');
  const setCoord = (lat: string, lng: string) => {
    setLatText(lat);
    setLngText(lng);
    const la = Number(lat);
    const lo = Number(lng);
    setPoint(
      lat.trim() &&
        lng.trim() &&
        Number.isFinite(la) &&
        Number.isFinite(lo) &&
        Math.abs(la) <= 90 &&
        Math.abs(lo) <= 180
        ? { latitude: la, longitude: lo }
        : null,
    );
  };
  const [active, setActive] = useState(location?.isActive ?? true);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setError(null);
    if (name.trim().length < 2) return setError('Enter a name');
    if (!point)
      return setError(
        hasMapbox ? 'Set the location on the map' : 'Enter a valid latitude and longitude',
      );
    try {
      await save.mutateAsync({
        id: location?.id,
        name: name.trim(),
        address: address.trim() || null,
        latitude: point.latitude,
        longitude: point.longitude,
        radiusMeters: radius,
        isActive: active,
      });
      toast.success(location ? 'Location updated' : 'Location added');
      onClose();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : errorMessage(err));
    }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{location ? 'Edit location' : 'New location'}</DialogTitle>
          <DialogDescription>
            Coaches’ GPS check-ins for batches here must fall within the radius.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Name" required>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Indiranagar Club"
              autoFocus
            />
          </Field>
          <Field label={`Check-in radius · ${radius} m`}>
            <input
              type="range"
              min={50}
              max={1000}
              step={25}
              value={radius}
              onChange={(e) => setRadius(Number(e.target.value))}
              className="mt-2 w-full accent-primary"
              aria-label="Radius in metres"
            />
          </Field>
          <Field label="Address" className="sm:col-span-2">
            <Textarea rows={2} value={address} onChange={(e) => setAddress(e.target.value)} />
          </Field>
          <div className="sm:col-span-2">
            {hasMapbox ? (
              <LocationPicker value={point} radiusMeters={radius} onChange={setPoint} />
            ) : (
              <div className="grid grid-cols-2 gap-3">
                <Field label="Latitude" required>
                  <Input
                    inputMode="decimal"
                    value={latText}
                    onChange={(e) => setCoord(e.target.value, lngText)}
                    placeholder="12.9716"
                  />
                </Field>
                <Field label="Longitude" required>
                  <Input
                    inputMode="decimal"
                    value={lngText}
                    onChange={(e) => setCoord(latText, e.target.value)}
                    placeholder="77.5946"
                  />
                </Field>
              </div>
            )}
            {point && (
              <p className="tabular mt-2 text-xs text-muted-foreground">
                {point.latitude.toFixed(6)}, {point.longitude.toFixed(6)}
              </p>
            )}
          </div>
          {location && (
            <label className="flex items-center gap-3 text-sm">
              <Switch checked={active} onCheckedChange={setActive} /> Active
            </label>
          )}
        </div>
        {error && (
          <p role="alert" className="text-sm font-medium text-destructive">
            {error}
          </p>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button loading={save.isPending} onClick={() => void submit()}>
            {location ? 'Save' : 'Add location'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

const directionsUrl = (l: Location) =>
  `https://www.google.com/maps/dir/?api=1&destination=${l.latitude},${l.longitude}`;

function LocationCard({ l, onEdit }: { l: Location; onEdit: () => void }) {
  const batches = l.activeBatches ?? 0;
  return (
    <Card
      className={cn(
        'relative flex items-stretch gap-3 p-2.5 transition-shadow hover:shadow-e2',
        !l.isActive && 'bg-muted/30',
      )}
    >
      {hasMapbox ? (
        <StaticMap
          center={l}
          radiusMeters={l.radiusMeters}
          className="aspect-auto h-[76px] w-[92px] shrink-0 overflow-hidden rounded-lg text-[10px]"
        />
      ) : (
        <div
          className={cn(
            'flex w-14 shrink-0 items-center justify-center rounded-xl',
            l.isActive ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground',
          )}
        >
          <MapPin className="size-5" />
        </div>
      )}
      <div className="min-w-0 flex-1 py-0.5">
        <div className="flex items-start gap-2 pr-8">
          <p className="min-w-0 truncate text-[14px] leading-tight font-semibold">{l.name}</p>
          {!l.isActive && (
            <Badge variant="muted" className="shrink-0">
              Inactive
            </Badge>
          )}
        </div>
        <p
          className="mt-0.5 line-clamp-1 text-[12px] text-muted-foreground"
          title={l.address ?? undefined}
        >
          {l.address || 'No address added'}
        </p>
        <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-[11px]">
          <span className="tabular inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 font-medium text-muted-foreground">
            <Radar className="size-3" /> {l.radiusMeters} m
          </span>
          <span
            className={cn(
              'tabular inline-flex items-center gap-1 rounded-full px-2 py-0.5 font-medium',
              batches ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground',
            )}
          >
            <LayoutGrid className="size-3" /> {plural(batches, 'batch', 'batches')}
          </span>
          <a
            href={directionsUrl(l)}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 font-medium text-primary hover:underline"
          >
            <Navigation className="size-3" /> Directions
          </a>
        </div>
      </div>
      <Button
        variant="ghost"
        size="icon"
        className="absolute top-1.5 right-1.5 size-8"
        aria-label={`Edit ${l.name}`}
        onClick={onEdit}
      >
        <Pencil />
      </Button>
    </Card>
  );
}

export function LocationsPage() {
  const q = useLocations();
  const [editing, setEditing] = useState<Location | 'new' | null>(null);
  const [search, setSearch] = useState('');
  const [showInactive, setShowInactive] = useState(false);
  const all = useMemo(
    () =>
      [...(q.data ?? [])].sort(
        (a, b) => Number(b.isActive) - Number(a.isActive) || a.name.localeCompare(b.name),
      ),
    [q.data],
  );
  const active = all.filter((l) => l.isActive);
  const inactive = all.length - active.length;
  const needle = search.trim().toLowerCase();
  const shown = (showInactive ? all : active).filter(
    (l) => !needle || [l.name, l.address ?? ''].some((v) => v.toLowerCase().includes(needle)),
  );
  const batches = active.reduce((n, l) => n + (l.activeBatches ?? 0), 0);
  const unused = active.filter((l) => !l.activeBatches).length;
  const avgRadius = active.length
    ? Math.round(active.reduce((n, l) => n + l.radiusMeters, 0) / active.length)
    : null;
  const newButton = (
    <Button onClick={() => setEditing('new')}>
      <Plus /> New location
    </Button>
  );

  return (
    <div>
      <PageHeader
        title="Locations"
        description="Training grounds and the radius coaches must be within to check in."
        actions={newButton}
      />
      {q.isPending ? (
        <ListSkeleton rows={3} />
      ) : q.isError ? (
        <ErrorState error={q.error} onRetry={() => void q.refetch()} />
      ) : all.length === 0 ? (
        <EmptyState
          icon={<MapPin />}
          title="No locations yet"
          description="Add your training grounds, then create batches at them."
          action={newButton}
        />
      ) : (
        <div className="space-y-3">
          <div className="grid grid-cols-4 gap-1.5 rounded-2xl border bg-card p-1.5 shadow-e1">
            {[
              { label: 'Locations', value: active.length },
              { label: 'Batches', value: batches },
              { label: 'Unused', value: unused },
              { label: 'Avg radius', value: avgRadius === null ? '—' : `${avgRadius} m` },
            ].map((x) => (
              <div key={x.label} className="rounded-xl bg-muted/40 px-1 py-1.5 text-center">
                <p className="tabular truncate text-base leading-tight font-bold">{x.value}</p>
                <p className="truncate text-[10px] font-medium text-muted-foreground">{x.label}</p>
              </div>
            ))}
          </div>
          {(all.length > 4 || inactive > 0) && (
            <div className="flex flex-wrap items-center gap-2">
              {all.length > 4 && (
                <SearchInput
                  value={search}
                  onChange={setSearch}
                  placeholder="Search name or address"
                  className="min-w-0 flex-1 basis-56"
                />
              )}
              {inactive > 0 && (
                <label className="ml-auto flex h-10 items-center gap-2 rounded-xl border bg-card px-3 text-[13px] text-muted-foreground">
                  <Switch checked={showInactive} onCheckedChange={setShowInactive} />
                  Inactive ({inactive})
                </label>
              )}
            </div>
          )}
          {shown.length === 0 ? (
            <EmptyState icon={<MapPin />} title="No locations match" />
          ) : (
            <div className="grid gap-2.5 sm:grid-cols-2 xl:grid-cols-3">
              {shown.map((l) => (
                <LocationCard key={l.id} l={l} onEdit={() => setEditing(l)} />
              ))}
            </div>
          )}
        </div>
      )}
      {editing && (
        <LocationDialog
          location={editing === 'new' ? undefined : editing}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  );
}
