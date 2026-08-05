import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '../auth/AuthProvider.tsx';
import type { AccessibleCentre } from '../auth/AuthProvider.tsx';
import { roomsAndBeds, type BedRow, type RoomRow } from '../../services/data-access.js';
import { Chip } from '../../components/ui.tsx';

/**
 * Room and bed configuration — the screen that makes "staff will fill it in themselves" possible.
 *
 * Two decisions closed by the centre owner rather than gathered by import: which bed is Primrose
 * Lodge's 19th, and the real bed counts for the other nine centres. Both were closed on the
 * understanding that this screen would exist for staff to answer them directly. Everything here
 * writes to the real `rooms` and `beds` tables — there is no demo data on this screen.
 *
 * Permission is enforced by RLS, not by this component. `can('rooms.manage')` only decides whether
 * the add/edit controls render; a user without it would have the write refused by the database even
 * if the button were shown, so hiding it is a courtesy, not the control.
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

function StatusChip({ status }: { status: 'available' | 'maintenance' | 'closed' }) {
  if (status === 'available') return <Chip icon="&#9679;" label="Available" tone="good" />;
  if (status === 'maintenance') return <Chip icon="&#128295;" label="Maintenance" tone="warn" />;
  return <Chip icon="&#10005;" label="Closed" tone="alert" />;
}

function AddRoomForm({
  centre,
  nextSortOrder,
  onAdded,
}: {
  centre: AccessibleCentre;
  nextSortOrder: number;
  onAdded: () => void;
}) {
  const [label, setLabel] = useState('');
  const [roomType, setRoomType] = useState<'single' | 'shared'>('single');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = label.trim();
    if (!trimmed) return;
    setBusy(true);
    setError(null);
    try {
      await roomsAndBeds.createRoom({
        centreId: centre.id,
        label: trimmed,
        roomType,
        sortOrder: nextSortOrder,
      });
      setLabel('');
      onAdded();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="flex flex-wrap items-end gap-2 rounded-lg border border-dashed border-[var(--color-line)] p-3">
      <label className="flex flex-col gap-1">
        <span className="text-[11px] font-medium text-[var(--color-ink-muted)]">Room label</span>
        <input
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          placeholder="e.g. 17"
          className="w-28 rounded-md border border-[var(--color-line)] bg-[var(--color-surface)] px-2 py-1.5 text-[13px] focus:border-[var(--color-accent)] focus:outline-none"
        />
      </label>
      <label className="flex flex-col gap-1">
        <span className="text-[11px] font-medium text-[var(--color-ink-muted)]">Type</span>
        <select
          value={roomType}
          onChange={(e) => setRoomType(e.target.value as 'single' | 'shared')}
          className="rounded-md border border-[var(--color-line)] bg-[var(--color-surface)] px-2 py-1.5 text-[13px] focus:border-[var(--color-accent)] focus:outline-none"
        >
          <option value="single">Single (one bed)</option>
          <option value="shared">Shared (add beds after)</option>
        </select>
      </label>
      <button
        type="submit"
        disabled={busy || !label.trim()}
        className="rounded-md bg-[var(--color-accent)] px-3 py-1.5 text-[13px] font-medium text-white disabled:opacity-50"
      >
        {busy ? 'Adding…' : 'Add room'}
      </button>
      {error ? <span className="text-[12px] text-red-600 dark:text-red-400">{error}</span> : null}
    </form>
  );
}

function AddBedForm({
  room,
  centreId,
  nextSortOrder,
  onAdded,
}: {
  room: RoomRow;
  centreId: string;
  nextSortOrder: number;
  onAdded: () => void;
}) {
  const [label, setLabel] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = label.trim();
    if (!trimmed) return;
    setBusy(true);
    setError(null);
    try {
      await roomsAndBeds.addBed({ roomId: room.id, centreId, label: trimmed, sortOrder: nextSortOrder });
      setLabel('');
      onAdded();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="flex items-center gap-1.5">
      <input
        value={label}
        onChange={(e) => setLabel(e.target.value)}
        placeholder={`e.g. ${room.label}A`}
        className="w-20 rounded-md border border-[var(--color-line)] bg-[var(--color-surface)] px-1.5 py-1 text-[12px] focus:border-[var(--color-accent)] focus:outline-none"
      />
      <button
        type="submit"
        disabled={busy || !label.trim()}
        className="rounded-md border border-[var(--color-line)] px-2 py-1 text-[11.5px] font-medium hover:bg-[var(--color-accent-soft)] disabled:opacity-50"
      >
        + Bed
      </button>
      {error ? <span className="text-[11px] text-red-600 dark:text-red-400">{error}</span> : null}
    </form>
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

  const nextRoomSortOrder = rooms.length ? Math.max(...rooms.map((r) => r.sort_order)) + 10 : 10;

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
            {rooms.length} rooms · {beds.length} bed spaces. Configured here, not hard-coded — this is
            how each centre's real layout gets entered.
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
                  <StatusChip status={room.status} />
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
                      <StatusChip status={bed.status} />
                    </span>
                  ))}
                  {roomBeds.length === 0 ? (
                    <span className="text-[11.5px] text-amber-600 dark:text-amber-400">
                      No beds yet — add at least one below
                    </span>
                  ) : null}
                </div>

                {canManage && room.room_type === 'shared' ? (
                  <div className="mt-2">
                    <AddBedForm
                      room={room}
                      centreId={centre.id}
                      nextSortOrder={roomBeds.length ? Math.max(...roomBeds.map((b) => b.sort_order)) + 1 : room.sort_order + 1}
                      onAdded={reload}
                    />
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      )}

      {canManage ? (
        <div className="mt-4">
          <AddRoomForm centre={centre} nextSortOrder={nextRoomSortOrder} onAdded={reload} />
        </div>
      ) : (
        <p className="mt-4 text-[12px] text-[var(--color-ink-muted)]">
          You do not have permission to add or edit rooms at this centre.
        </p>
      )}
    </div>
  );
}
