import { MapPin, Pencil, Plus } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { EmptyState, ErrorState, Field, ListSkeleton, PageHeader } from '@/components/common';
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
import type { Location } from '@/lib/types';

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
        <div className="grid gap-4 sm:grid-cols-2">
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

export function LocationsPage() {
  const q = useLocations();
  const [editing, setEditing] = useState<Location | 'new' | null>(null);
  return (
    <div>
      <PageHeader
        title="Locations"
        description="Training grounds and the radius coaches must be within to check in."
        actions={
          <Button onClick={() => setEditing('new')}>
            <Plus /> New location
          </Button>
        }
      />
      {q.isPending ? (
        <ListSkeleton rows={3} />
      ) : q.isError ? (
        <ErrorState error={q.error} onRetry={() => void q.refetch()} />
      ) : q.data.length === 0 ? (
        <EmptyState
          icon={<MapPin />}
          title="No locations yet"
          description="Add your training grounds, then create batches at them."
          action={
            <Button onClick={() => setEditing('new')}>
              <Plus /> New location
            </Button>
          }
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {q.data.map((l) => (
            <Card key={l.id} className="overflow-hidden">
              {hasMapbox && (
                <StaticMap
                  center={l}
                  radiusMeters={l.radiusMeters}
                  className="rounded-none border-0 border-b"
                />
              )}
              <div className="space-y-1 p-4">
                <div className="flex items-center justify-between gap-2">
                  <h3 className="font-semibold">{l.name}</h3>
                  {!l.isActive && <Badge variant="muted">Inactive</Badge>}
                </div>
                {l.address && <p className="text-sm text-muted-foreground">{l.address}</p>}
                <p className="text-xs text-muted-foreground">
                  Radius {l.radiusMeters} m · {l.activeBatches ?? 0} active batches
                </p>
              </div>
              <div className="border-t px-3 py-2">
                <Button variant="ghost" size="sm" onClick={() => setEditing(l)}>
                  <Pencil /> Edit
                </Button>
              </div>
            </Card>
          ))}
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
