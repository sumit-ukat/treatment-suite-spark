import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '../auth/AuthProvider.tsx';
import type { AccessibleCentre } from '../auth/AuthProvider.tsx';
import { roomsAndBeds, type BedRow, type RoomRow } from '../../services/data-access.js';
import { Chip } from '../../components/ui.tsx';

/**
 * Room and bed status — lets staff put a room or bed on hold for maintenance (or closed) without
 * touching a migration. Rooms and beds themselves are configured directly, not through this screen;
 * this only ever changes `status` on the real `rooms` and `beds` tables — there is no demo data here.
 *
 * Permission is enforced by RLS, not by this component. `can('rooms.manage')` only decides whether
 * the status pickers render as editable selects instead of read-only chips; a user without it would
 * have the write refused by the database even if the control were shown, so hiding it is a courtesy,
 * not the control.
 */

function useCentreRoomsAndBeds(centreId: string | null) {
  const [rooms, setRooms] = useState<RoomRow[]>([]);
  const [beds, setBeds] = useState<BedRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reloadToken, setReloadToken] = useState(0);

  useEffect(() => {
    if (!centreId) {
      setRooms([]);
      setBeds([]);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    Promise.all([roomsAndBeds.rooms(centreId), roomsAndBeds.beds(centreId)])
      .then(([r, b]) => {
        if (cancelled) return;
        setRooms(r);
        setBeds(b);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : String(err));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [centreId, reloadToken]);

  return { rooms, beds, loading, error, reload: () => setReloadToken((t) => t + 1) };
}

type RoomOrBedStatus = 'available' | 'maintenance' | 'closed';

function StatusChip({ status }: { status: RoomOrBedStatus }) {
  if (status === 'available') return <Chip icon="&#9679;" label="Available" tone="good" />;
  if (status === 'maintenance') return <Chip icon="&#128295;" label="Maintenance" tone="warn" />;
  return <Chip icon="&#10005;" label="Closed" tone="alert" />;
}

const STATUS_SELECT_CLS: Record<RoomOrBedStatus, string> = {
  available:   'border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300',
  maintenance: 'border-amber-300 bg-amber-50 text-amber-700 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-300',
  closed:      'border-red-300 bg-red-50 text-red-700 dark:border-red-800 dark:bg-red-950/40 dark:text-red-300',
};

/** Read-only chip for anyone without `rooms.manage`; a live status picker for anyone with it — same
 * three values `availableBeds()` already checks, so choosing "Maintenance" or "Closed" here is what
 * actually takes a room/bed out of the admission picker, not just a display label. */
function StatusControl({
  status,
  canManage,
  onChange,
}: {
  status: RoomOrBedStatus;
  canManage: boolean;
  onChange: (status: RoomOrBedStatus) => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!canManage) return <StatusChip status={status} />;

  return (
    <span className="inline-flex flex-col gap-0.5">
      <select
        value={status}
        disabled={busy}
        onChange={(e) => {
          setBusy(true);
          setError(null);
          onChange(e.target.value as RoomOrBedStatus)
            .catch((err: unknown) => setError(err instanceof Error ? err.message : String(err)))
            .finally(() => setBusy(false));
        }}
        className={`rounded-md border px-1.5 py-0.5 text-[11px] font-medium transition disabled:opacity-50 ${STATUS_SELECT_CLS[status]}`}
      >
        <option value="available">Available</option>
        <option value="maintenance">Maintenance</option>
        <option value="closed">Closed</option>
      </select>
      {error ? <span className="text-[10px] text-red-600 dark:text-red-400">{error}</span> : null}
    </span>
  );
}

export function RoomsAndBedsAdmin({ centre }: { centre: AccessibleCentre }) {
  const { can } = useAuth();
  const { rooms, beds, loading, error, reload } = useCentreRoomsAndBeds(centre.id);
  const canManage = can('rooms.manage');

  const bedsByRoom = useMemo(() => {
    const map = new Map<string, BedRow[]>();
    for (const b of beds) {
      const list = map.get(b.room_id) ?? [];
      list.push(b);
      map.set(b.room_id, list);
    }
    return map;
  }, [beds]);

  if (loading) {
    return <div className="p-6 text-[13px] text-[var(--color-ink-muted)]">Loading rooms and beds…</div>;
  }

  if (error) {
    return (
      <div className="m-4 rounded-lg border border-red-300 bg-red-50 p-3 text-[13px] text-red-800 dark:border-red-800 dark:bg-red-950 dark:text-red-200">
        Could not load rooms and beds: {error}
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-6">
      <div className="mb-4 flex items-baseline justify-between">
        <div>
          <h2 className="text-[16px] font-semibold">{centre.name} — Rooms &amp; Beds</h2>
          <p className="mt-0.5 text-[12.5px] text-[var(--color-ink-muted)]">
            {rooms.length} rooms · {beds.length} bed spaces. Put a room or bed on hold for
            maintenance — real data, not hard-coded.
          </p>
        </div>
        <Chip label={canManage ? 'You can edit' : 'Read only'} tone={canManage ? 'accent' : 'neutral'} />
      </div>

      {rooms.length === 0 ? (
        <div className="rounded-lg border border-dashed border-[var(--color-line)] p-6 text-center text-[13px] text-[var(--color-ink-muted)]">
          No rooms configured for {centre.name} yet.
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {rooms.map((room) => {
            const roomBeds = bedsByRoom.get(room.id) ?? [];
            return (
              <div key={room.id} className="rounded-lg border border-[var(--color-line)] p-3">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="nums rounded-md bg-[var(--color-accent-soft)] px-2 py-0.5 text-[12px] font-bold text-[var(--color-accent)]">
                    {room.label}
                  </span>
                  <Chip label={room.room_type === 'shared' ? 'Shared room' : 'Single room'} />
                  <StatusControl
                    status={room.status}
                    canManage={canManage}
                    onChange={async (status) => { await roomsAndBeds.setRoomStatus(room.id, status); reload(); }}
                  />
                  <span className="nums ml-auto text-[11.5px] text-[var(--color-ink-muted)]">
                    {roomBeds.length} bed{roomBeds.length === 1 ? '' : 's'}
                  </span>
                </div>

                <div className="mt-2 flex flex-wrap items-center gap-1.5">
                  {roomBeds.map((bed) => (
                    <span
                      key={bed.id}
                      className="nums inline-flex items-center gap-1 rounded-md border border-[var(--color-line)] px-1.5 py-0.5 text-[11.5px]"
                    >
                      {bed.label}
                      <StatusControl
                        status={bed.status}
                        canManage={canManage}
                        onChange={async (status) => { await roomsAndBeds.setBedStatus(bed.id, status); reload(); }}
                      />
                    </span>
                  ))}
                  {roomBeds.length === 0 ? (
                    <span className="text-[11.5px] text-amber-600 dark:text-amber-400">
                      No beds configured for this room.
                    </span>
                  ) : null}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
