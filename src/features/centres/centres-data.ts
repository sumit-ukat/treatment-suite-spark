/**
 * The ten UKAT centres, for the group-level dashboard.
 *
 * Centre names and counties are real, taken from ukat.co.uk. Everything else needs care:
 *
 * - **Bed capacities are PLACEHOLDERS** except Primrose Lodge. Real capacity per centre has not been
 *   supplied, and inventing a number that looks authoritative is worse than flagging it — a wrong
 *   capacity silently corrupts every occupancy percentage computed from it. Each is marked
 *   `capacityConfirmed: false` and the UI says so.
 * - **The region grouping is a PLACEHOLDER**, arranged by geography. The real regional structure and
 *   who manages each region has not been confirmed.
 * - **All operational figures are fictional**, generated deterministically from the centre slug so
 *   the demo is stable across reloads rather than reshuffling on every render.
 *
 * Primrose Lodge is the exception: its figures come from the same tested domain functions that drive
 * the room board, so the one centre with real configuration behaves consistently in both views.
 */

import { buildBoard, summarise, NOW } from '../rooms/board-data.js';

export interface CentreSummary {
  slug: string;
  name: string;
  county: string;
  region: string;
  /** Total bed spaces. See the capacity caveat above. */
  capacity: number;
  capacityConfirmed: boolean;
  occupied: number;
  available: number;
  occupancyPercent: number;
  overdue: number;
  dueToday: number;
  dischargingThisWeek: number;
  pastPlannedDischarge: number;
  photoAttention: number;
  restrictedAlerts: number;
  /** Required actions completed by their due date, as a percentage. Fictional. */
  onTimePercent: number;
  /** Clients currently on an extended stay (approved extension to original discharge). */
  extendedStays: number;
  /** Clients without an assigned focal therapist — compliance and quality risk. */
  missingTherapist: number;
  /** Overdue items estimated to be older than 7 days — chronic backlog indicator. */
  agedOverdue: number;
  /** True only for the centre that is actually configured in the database. */
  isConfigured: boolean;
}

interface CentreSpec {
  slug: string;
  name: string;
  county: string;
  region: string;
  capacity: number;
  capacityConfirmed: boolean;
}

/** Region grouping — two zones only. */
export const REGIONS = ['South', 'North'] as const;

const SPECS: readonly CentreSpec[] = [
  // Primrose Lodge: 19 is confirmed. The room board still shows 18 because which bed is the
  // nineteenth is OPEN_QUESTIONS Q40 — so the group total and the board deliberately disagree by one
  // until that is answered, rather than papering over it.
  { slug: 'primrose-lodge',      name: 'Primrose Lodge',      county: 'Surrey',         region: 'South',    capacity: 19, capacityConfirmed: true },
  { slug: 'providence-projects', name: 'Providence Projects', county: 'Dorset',         region: 'South',    capacity: 32, capacityConfirmed: false },
  { slug: 'recovery-lighthouse', name: 'Recovery Lighthouse', county: 'West Sussex',    region: 'South',    capacity: 22, capacityConfirmed: false },
  { slug: 'sanctuary-lodge',     name: 'Sanctuary Lodge',     county: 'Essex',          region: 'North',    capacity: 26, capacityConfirmed: false },
  { slug: 'liberty-house',       name: 'Liberty House',       county: 'Bedfordshire',   region: 'North',    capacity: 20, capacityConfirmed: false },
  { slug: 'banbury-lodge',       name: 'Banbury Lodge',       county: 'Oxfordshire',    region: 'North',    capacity: 24, capacityConfirmed: false },
  { slug: 'bayberry-rehab',      name: 'Bayberry Rehab',      county: 'Warwickshire',   region: 'North',    capacity: 18, capacityConfirmed: false },
  { slug: 'linwood-house',       name: 'Linwood House',       county: 'South Yorkshire', region: 'North',   capacity: 21, capacityConfirmed: false },
  { slug: 'oasis-runcorn',       name: 'Oasis Runcorn',       county: 'Cheshire',       region: 'North',    capacity: 25, capacityConfirmed: false },
  { slug: 'oasis-bradford',      name: 'Oasis Bradford',      county: 'West Yorkshire', region: 'North',    capacity: 23, capacityConfirmed: false },
];

/**
 * Deterministic pseudo-random from a string.
 *
 * Stable across reloads on purpose: a dashboard whose numbers change every render is impossible to
 * discuss with a tester ("the one showing 4 overdue" has to still be showing 4 overdue).
 */
function seededValues(seed: string, count: number): number[] {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  const out: number[] = [];
  for (let i = 0; i < count; i++) {
    h ^= h << 13;
    h ^= h >>> 17;
    h ^= h << 5;
    out.push(Math.abs(h) / 2147483647);
  }
  return out;
}

function fictionalCentre(spec: CentreSpec): CentreSummary {
  const [r0, r1, r2, r3, r4, r5, r6, r7, r8, r9, r10] = seededValues(spec.slug, 11) as [
    number, number, number, number, number, number, number, number, number, number, number,
  ];

  const occupied = Math.min(spec.capacity, Math.round(spec.capacity * (0.62 + r0 * 0.36)));
  const available = spec.capacity - occupied;
  const overdue = Math.round(r1 * 14);

  return {
    ...spec,
    occupied,
    available,
    occupancyPercent: Math.round((occupied / spec.capacity) * 100),
    overdue,
    dueToday: Math.round(r2 * 9),
    dischargingThisWeek: Math.round(r3 * 5),
    pastPlannedDischarge: r4 > 0.78 ? 1 : 0,
    photoAttention: Math.round(r5 * 4),
    restrictedAlerts: Math.round(r6 * 3),
    onTimePercent: Math.round(72 + r7 * 26),
    extendedStays: Math.round(r8 * occupied * 0.25),
    missingTherapist: Math.round(r9 * occupied * 0.15),
    agedOverdue: Math.round(overdue * (0.35 + r10 * 0.30)),
    isConfigured: false,
  };
}

/** Primrose Lodge from the real board, so both views agree. */
function primroseCentre(spec: CentreSpec): CentreSummary {
  const board = buildBoard(NOW);
  const s = summarise(board);
  const occupants = board.flatMap((b) => (b.occupant ? [b.occupant] : []));
  const onTime = board
    .flatMap((b) => (b.occupant ? b.occupant.tasks : []))
    .filter((t) => t.isComplete || t.isOverdue);
  const completedOnTime = onTime.filter((t) => t.isComplete).length;

  return {
    ...spec,
    occupied: s.bedsOccupied,
    // Against confirmed capacity, not the board's 18 — so the missing bed shows up as availability
    // the board cannot offer.
    available: spec.capacity - s.bedsOccupied,
    occupancyPercent: Math.round((s.bedsOccupied / spec.capacity) * 100),
    overdue: s.overdue,
    dueToday: s.dueToday,
    dischargingThisWeek: s.dischargingThisWeek,
    pastPlannedDischarge: s.pastPlannedDischarge,
    photoAttention: s.photoAttention,
    restrictedAlerts: s.restrictedAlerts,
    onTimePercent: onTime.length ? Math.round((completedOnTime / onTime.length) * 100) : 100,
    extendedStays: occupants.filter((o) => o.isExtendedStay).length,
    missingTherapist: s.missingTherapist,
    // No per-task age available at this level — use the same seeded estimate as fictional centres.
    agedOverdue: Math.round(s.overdue * 0.45),
    isConfigured: true,
  };
}

export function buildCentres(): readonly CentreSummary[] {
  return SPECS.map((spec) =>
    spec.slug === 'primrose-lodge' ? primroseCentre(spec) : fictionalCentre(spec),
  );
}

export interface GroupTotals {
  centres: number;
  capacity: number;
  occupied: number;
  available: number;
  occupancyPercent: number;
  overdue: number;
  dueToday: number;
  dischargingThisWeek: number;
  pastPlannedDischarge: number;
  photoAttention: number;
  restrictedAlerts: number;
  onTimePercent: number;
  extendedStays: number;
  missingTherapist: number;
  agedOverdue: number;
  capacityUnconfirmed: number;
}

export function groupTotals(centres: readonly CentreSummary[]): GroupTotals {
  const sum = (pick: (c: CentreSummary) => number) => centres.reduce((n, c) => n + pick(c), 0);
  const capacity = sum((c) => c.capacity);
  const occupied = sum((c) => c.occupied);
  return {
    centres: centres.length,
    capacity,
    occupied,
    available: capacity - occupied,
    occupancyPercent: capacity ? Math.round((occupied / capacity) * 100) : 0,
    overdue: sum((c) => c.overdue),
    dueToday: sum((c) => c.dueToday),
    dischargingThisWeek: sum((c) => c.dischargingThisWeek),
    pastPlannedDischarge: sum((c) => c.pastPlannedDischarge),
    photoAttention: sum((c) => c.photoAttention),
    restrictedAlerts: sum((c) => c.restrictedAlerts),
    // Weighted by each centre's action volume would be better; occupancy is the available proxy.
    onTimePercent: occupied
      ? Math.round(sum((c) => c.onTimePercent * c.occupied) / occupied)
      : 0,
    extendedStays: sum((c) => c.extendedStays),
    missingTherapist: sum((c) => c.missingTherapist),
    agedOverdue: sum((c) => c.agedOverdue),
    capacityUnconfirmed: centres.filter((c) => !c.capacityConfirmed).length,
  };
}
