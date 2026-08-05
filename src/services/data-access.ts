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

  /**
   * Beds with no CURRENT open allocation. `beds.status` is a manual flag (maintenance/closed) and
   * does not track occupancy — a bed can say "available" and still have someone in it. This is a
   * read to populate a picker; it is not what stops a double-booking. `admit_client`'s insert into
   * `room_allocations` is what actually enforces that, via the exclusion constraint in migration
   * 0005, regardless of what this list shows.
   */
  async availableBeds(centreId: string): Promise<Array<RoomRow & { bed: BedRow }>> {
    const [rooms, beds, openAllocations] = await Promise.all([
      this.rooms(centreId),
      this.beds(centreId),
      run<Array<{ bed_id: string }>>(
        'roomsAndBeds.availableBeds.openAllocations',
        client().from('room_allocations').select('bed_id').eq('centre_id', centreId).is('ended_at', null),
      ),
    ]);
    const occupied = new Set(openAllocations.map((a) => a.bed_id));
    const roomsById = new Map(rooms.map((r) => [r.id, r]));

    const out: Array<RoomRow & { bed: BedRow }> = [];
    for (const bed of beds) {
      const room = roomsById.get(bed.room_id);
      if (!room || bed.status !== 'available' || room.status !== 'available' || occupied.has(bed.id)) continue;
      out.push({ ...room, bed });
    }
    return out;
  },
};

export interface SubstanceRow {
  id: string;
  name: string;
}

export const clinicalLookups = {
  substances(): Promise<SubstanceRow[]> {
    return run(
      'clinicalLookups.substances',
      client().from('substances').select('id,name').eq('is_active', true).order('name'),
    );
  },
};

export interface AdmitClientInput {
  centreId: string;
  bedId: string;
  admittedAt: string; // ISO timestamp
  plannedDuration: number;
  plannedDurationUnit: 'days' | 'weeks';
  firstName: string;
  lastName: string;
  preferredName?: string | undefined;
  treatmentGroup?: string | undefined;
  substanceName?: string | undefined;
  peepRequired: boolean;
  focalTherapistLabel?: string | undefined;
  buddyLabel?: string | undefined;
  doctorLabel?: string | undefined;
  reason?: string | undefined;
}

export const admissions = {
  /**
   * Calls the trusted `app.admit_client` RPC — the whole admission happens as one transaction on
   * the server, or none of it does. This client sends parameters; it does not perform the
   * business logic. See supabase/migrations/0022_substances_seed_and_admit_client.sql.
   */
  async admitClient(input: AdmitClientInput): Promise<string> {
    const { data, error } = await client().rpc('admit_client', {
      p_centre_id: input.centreId,
      p_bed_id: input.bedId,
      p_admitted_at: input.admittedAt,
      p_planned_duration: input.plannedDuration,
      p_planned_duration_unit: input.plannedDurationUnit,
      p_client_id: null,
      p_first_name: input.firstName,
      p_last_name: input.lastName,
      p_preferred_name: input.preferredName ?? null,
      p_treatment_group: input.treatmentGroup ?? null,
      p_substance_name: input.substanceName ?? null,
      p_peep_required: input.peepRequired,
      p_focal_therapist_label: input.focalTherapistLabel ?? null,
      p_buddy_label: input.buddyLabel ?? null,
      p_doctor_label: input.doctorLabel ?? null,
      p_reason: input.reason ?? null,
    });
    if (error) throw new DataAccessError('admissions.admitClient', error);
    return data as string;
  },
};

export interface AdmissionRow {
  id: string;
  client_id: string;
  admitted_at: string;
  planned_duration: number;
  planned_duration_unit: 'days' | 'weeks';
  current_planned_discharge_date: string;
  treatment_group: string | null;
  primary_substance_id: string | null;
  peep_required: boolean;
}

export interface ClientRow {
  client_id: string;
  reference: string;
  /** Null when the caller holds `clients.view_operational` but not `clients.view_identity` — see migration 0025. */
  display_name: string | null;
}

export interface RoomAllocationRow {
  admission_id: string;
  bed_id: string;
}

export interface StaffAssignmentRow {
  admission_id: string;
  role_code: string;
  display_label: string | null;
}

export interface ClientTaskRow {
  id: string;
  admission_id: string;
  template_id: string | null;
  code: string | null;
  category: string;
  title: string;
  due_at: string | null;
  completed_at: string | null;
  status: string;
}

export interface TaskTemplateRow {
  id: string;
  requires_completion_note: boolean;
}

export const tasks = {
  /**
   * Completing and reopening go through RPCs because they are the *only* way to do it: migration 0026
   * revoked UPDATE on `client_tasks` from `authenticated` after finding that the table's update policy
   * let any `tasks.complete` holder rewrite any column — including `due_at`, which would let someone
   * move their own deadline and erase being overdue. Every rule (permission, current state, the
   * template's note requirement, who gets recorded as having done it) lives in the database.
   */
  async complete(taskId: string, note?: string | undefined): Promise<void> {
    const { error } = await client().rpc('complete_client_task', {
      p_task_id: taskId,
      p_note: note?.trim() ? note.trim() : null,
    });
    if (error) throw new DataAccessError('tasks.complete', error);
  },

  /** Requires `tasks.reopen` and a reason, which the database records in the audit trail. */
  async reopen(taskId: string, reason: string): Promise<void> {
    const { error } = await client().rpc('reopen_client_task', {
      p_task_id: taskId,
      p_reason: reason,
    });
    if (error) throw new DataAccessError('tasks.reopen', error);
  },
};

export interface ClientPhotoRow {
  client_id: string;
}

/**
 * Everything needed to render the room board from real data, for one centre. Five independent
 * queries rather than one nested `select`, for the same reason the rest of this file avoids deep
 * embeds: a nested select's exact shape is easy to get wrong silently, and RLS already scopes every
 * one of these to what the signed-in user may see — there is nothing to join across a security
 * boundary here.
 */
export const roomBoard = {
  async forCentre(centreId: string) {
    // `clientTasks` rather than `tasks` — the module already exports a `tasks` service, and shadowing
    // it inside this function would be a trap for the next person adding a call here.
    const [admissions, allocations, staffAssignments, clientTasks, substances, taskTemplates] =
      await Promise.all([
      run<AdmissionRow[]>(
        'roomBoard.admissions',
        client()
          .from('admissions')
          .select(
            'id,client_id,admitted_at,planned_duration,planned_duration_unit,current_planned_discharge_date,treatment_group,primary_substance_id,peep_required',
          )
          .eq('centre_id', centreId)
          .eq('status', 'active'),
      ),
      run<RoomAllocationRow[]>(
        'roomBoard.allocations',
        client()
          .from('room_allocations')
          .select('admission_id,bed_id')
          .eq('centre_id', centreId)
          .is('ended_at', null),
      ),
      run<StaffAssignmentRow[]>(
        'roomBoard.staffAssignments',
        client()
          .from('staff_assignments')
          .select('admission_id,role_code,display_label')
          .eq('centre_id', centreId)
          .is('ended_at', null),
      ),
      run<ClientTaskRow[]>(
        'roomBoard.tasks',
        client()
          .from('client_tasks')
          .select('id,admission_id,template_id,code,category,title,due_at,completed_at,status')
          .eq('centre_id', centreId),
      ),
      clinicalLookups.substances(),
      // Only to know which tasks demand a completion note, so the UI can ask for it before submitting
      // rather than bouncing the user off a server error. The server still enforces it.
      run<TaskTemplateRow[]>(
        'roomBoard.taskTemplates',
        client().from('task_templates').select('id,requires_completion_note'),
      ),
    ]);

    // Clients are read via the `client_summary` RPC, not a direct `select` on `clients` — migration
    // 0025 tightened `clients` RLS to require `clients.view_identity`, so a role holding only
    // `clients.view_operational` (e.g. helpdesk) would get zero rows from a direct read even though
    // it is entitled to know a bed is occupied. The RPC returns every row the caller may see the
    // *existence* of, with `display_name` nulled out server-side when identity is withheld.
    const clientIds = [...new Set(admissions.map((a) => a.client_id))];
    const clients = clientIds.length
      ? await run<ClientRow[]>(
          'roomBoard.clients',
          client().rpc('client_summary', { p_client_ids: clientIds }),
        )
      : [];
    const photos = clientIds.length
      ? await run<ClientPhotoRow[]>(
          'roomBoard.photos',
          client().from('client_photos').select('client_id').eq('is_active', true).in('client_id', clientIds),
        )
      : [];

    return {
      admissions,
      clients,
      allocations,
      staffAssignments,
      tasks: clientTasks,
      substances,
      taskTemplates,
      photos,
    };
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
