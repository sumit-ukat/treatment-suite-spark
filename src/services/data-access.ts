import type { PostgrestError } from '@supabase/supabase-js';
import { supabase, supabaseConfigError } from '../lib/supabase.js';

/**
 * The single place the application talks to Supabase.
 *
 * Two rules this exists to enforce:
 *
 * 1. **No raw queries in components.** Query strings drift, and a `select` written inline is a
 *    `select` nobody reviews. Everything goes through a named function here.
 *
 * 2. **Errors are never swallowed.** This was a real bug: a PostgREST 400 came back as
 *    `{ data: null, error: {...} }`, the calling code read `data ?? []`, and a user with 23
 *    permissions rendered as "No role / 0 permissions". A failed query looked identical to a user
 *    who genuinely had nothing. `run()` makes that impossible — a failure throws.
 *
 * Note what is NOT here: any filtering by user, centre or role. RLS does that. A query with no
 * `where user_id = me` is correct, because the database returns only what this user may see. Adding
 * a client-side filter would imply the boundary lives here, and it does not.
 */

export class DataAccessError extends Error {
  constructor(
    readonly operation: string,
    // `override` because Error already declares `cause`.
    override readonly cause: PostgrestError | { message: string },
  ) {
    super(`${operation}: ${cause.message}`);
    this.name = 'DataAccessError';
  }
}

function client() {
  if (!supabase) throw new DataAccessError('supabase', { message: supabaseConfigError ?? 'not configured' });
  return supabase;
}

/** Unwrap a Supabase response, throwing on error rather than degrading to empty. */
async function run<T>(
  operation: string,
  query: PromiseLike<{ data: T | null; error: PostgrestError | null }>,
): Promise<T> {
  const { data, error } = await query;
  if (error) throw new DataAccessError(operation, error);
  return (data ?? []) as T;
}

/* ------------------------------------------------------------------ types */

export interface ProfileRow {
  display_name: string;
  email: string;
  job_title: string | null;
}

export interface AccessRow {
  roles: {
    code: string;
    name: string;
    role_permissions: { permissions: { code: string } | null }[];
  } | null;
}

export interface CentreRow {
  id: string;
  name: string;
  slug: string;
  zones: { name: string } | null;
}

/* --------------------------------------------------------------- queries */
/*
 * Select strings carry no spaces. PostgREST parses `select` literally, so
 * 'roles(name, role_permissions(...))' asks for a column named " role_permissions" and 400s. That
 * cost an afternoon once; the comment is cheaper than the second afternoon.
 */

export const identity = {
  async profile(): Promise<ProfileRow | null> {
    const { data, error } = await client()
      .from('user_profiles')
      .select('display_name,email,job_title')
      .maybeSingle();
    if (error) throw new DataAccessError('identity.profile', error);
    return data as ProfileRow | null;
  },

  /** Roles and permissions for the signed-in user. RLS scopes it to them. */
  accessAssignments(): Promise<AccessRow[]> {
    return run(
      'identity.accessAssignments',
      client()
        .from('user_access_assignments')
        .select('roles(code,name,role_permissions(permissions(code)))'),
    );
  },
};

export const centres = {
  /** Every centre this user can reach. No filter: RLS returns only those, and none for the unassigned. */
  async listAccessible(): Promise<CentreRow[]> {
    // Without generated database types, PostgREST embeds infer as arrays even when the relationship
    // is many-to-one. The runtime shape is a single object. Narrowed here, once, rather than at
    // every call site — and this disappears entirely once `npm run db:types` is wired in.
    const rows = await run<Array<Omit<CentreRow, 'zones'> & { zones: { name: string } | { name: string }[] | null }>>(
      'centres.listAccessible',
      client().from('centres').select('id,name,slug,zones(name)').order('name'),
    );
    return rows.map((r) => ({
      id: r.id,
      name: r.name,
      slug: r.slug,
      zones: Array.isArray(r.zones) ? (r.zones[0] ?? null) : r.zones,
    }));
  },
};

export interface RoomRow {
  id: string;
  label: string;
  room_type: 'single' | 'shared';
  status: 'available' | 'maintenance' | 'closed';
  sort_order: number;
}

export interface BedRow {
  id: string;
  room_id: string;
  label: string;
  status: 'available' | 'maintenance' | 'closed';
  sort_order: number;
}

export const roomsAndBeds = {
  /** Every room for a centre, in display order. RLS confines this to centres the user can reach. */
  rooms(centreId: string): Promise<RoomRow[]> {
    return run(
      'roomsAndBeds.rooms',
      client()
        .from('rooms')
        .select('id,label,room_type,status,sort_order')
        .eq('centre_id', centreId)
        .eq('is_active', true)
        .order('sort_order'),
    );
  },

  beds(centreId: string): Promise<BedRow[]> {
    return run(
      'roomsAndBeds.beds',
      client()
        .from('beds')
        .select('id,room_id,label,status,sort_order')
        .eq('centre_id', centreId)
        .eq('is_active', true)
        .order('sort_order'),
    );
  },

  /**
   * Create a room, and for a single room its one bed sharing the room's label — mirroring how
   * Primrose Lodge was seeded, where a single room's bed label equals the room label. A shared room
   * is created empty; its beds (6A, 6B, ...) are added individually via `addBed` because their count
   * and labels are a judgement call, not something to guess.
   */
  async createRoom(input: {
    centreId: string;
    label: string;
    roomType: 'single' | 'shared';
    sortOrder: number;
  }): Promise<RoomRow> {
    const room = await run<RoomRow>(
      'roomsAndBeds.createRoom',
      client()
        .from('rooms')
        .insert({
          centre_id: input.centreId,
          label: input.label,
          room_type: input.roomType,
          sort_order: input.sortOrder,
        })
        .select('id,label,room_type,status,sort_order')
        .single(),
    );

    if (input.roomType === 'single') {
      await run(
        'roomsAndBeds.createRoom.bed',
        client()
          .from('beds')
          .insert({
            room_id: room.id,
            centre_id: input.centreId,
            label: input.label,
            sort_order: input.sortOrder,
          }),
      );
    }

    return room;
  },

  addBed(input: { roomId: string; centreId: string; label: string; sortOrder: number }): Promise<BedRow> {
    return run(
      'roomsAndBeds.addBed',
      client()
        .from('beds')
        .insert({
          room_id: input.roomId,
          centre_id: input.centreId,
          label: input.label,
          sort_order: input.sortOrder,
        })
        .select('id,room_id,label,status,sort_order')
        .single(),
    );
  },

  async setRoomStatus(roomId: string, status: RoomRow['status']): Promise<void> {
    const { error } = await client().from('rooms').update({ status }).eq('id', roomId);
    if (error) throw new DataAccessError('roomsAndBeds.setRoomStatus', error);
  },

  async setBedStatus(bedId: string, status: BedRow['status']): Promise<void> {
    const { error } = await client().from('beds').update({ status }).eq('id', bedId);
    if (error) throw new DataAccessError('roomsAndBeds.setBedStatus', error);
  },
};

type AuthChangeCallback = Parameters<
  ReturnType<typeof client>['auth']['onAuthStateChange']
>[0];

export const auth = {
  getSession: () => client().auth.getSession(),
  onAuthStateChange: (cb: AuthChangeCallback) => client().auth.onAuthStateChange(cb),
  signInWithPassword: (email: string, password: string) =>
    client().auth.signInWithPassword({ email, password }),
  signOut: () => client().auth.signOut(),
};

export const isConfigured = (): boolean => supabase !== null;
export const configError = (): string | null => supabaseConfigError;
