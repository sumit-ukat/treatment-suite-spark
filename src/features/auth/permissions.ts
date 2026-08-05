/**
 * Permission codes, as constants rather than loose strings.
 *
 * There are forty of them and several are one character apart — `risk.view_indicator` versus
 * `risk.view_detail` differ only in the suffix that decides whether someone reads a safeguarding
 * narrative. A typo in a string literal fails *open* in the most dangerous direction: `can()` returns
 * false, a control disappears from the screen, and nobody notices because a missing button looks the
 * same as a withheld one.
 *
 * With a union type, the same typo is a compile error.
 *
 * These govern DISPLAY ONLY. Every read and write is independently evaluated by RLS against the
 * user's assignments, so a tampered client can neither hide nor unlock anything. Hiding a control is
 * a courtesy to the user; the database is the control.
 */

export const PERMISSIONS = [
  'centres.view',
  'centres.manage',
  'rooms.view',
  'rooms.manage',
  'rooms.allocate',
  'rooms.transfer',
  'clients.view_operational',
  'clients.view_identity',
  'clients.edit_identity',
  'photos.view',
  'photos.upload',
  'photos.verify',
  'admissions.create',
  'admissions.edit',
  'tasks.view',
  'tasks.create',
  'tasks.assign',
  'tasks.complete',
  'tasks.reopen',
  'treatment.view',
  'treatment.record',
  'family.view',
  'family.log_contact',
  'family.schedule_meeting',
  'medical.view_summary',
  'medical.view_detail',
  'medical.record',
  'risk.view_indicator',
  'risk.view_detail',
  'risk.record',
  'safeguarding.view_indicator',
  'safeguarding.view_detail',
  'safeguarding.record',
  'discharge.initiate',
  'discharge.approve',
  'discharge.finalise',
  'reports.view',
  'reports.export',
  'audit.view',
  'administration.manage_users',
] as const;

export type Permission = (typeof PERMISSIONS)[number];

/**
 * Sensitivity level per permission, mirroring the database.
 *
 * Level 3 is the line that matters: everything at 3 is content someone could be harmed by seeing
 * without cause. Kept here so a component can ask "is this restricted?" without a round trip.
 */
export const SENSITIVITY: Record<Permission, 1 | 2 | 3 | 4> = {
  'centres.view': 1,
  'centres.manage': 4,
  'rooms.view': 1,
  'rooms.manage': 1,
  'rooms.allocate': 1,
  'rooms.transfer': 1,
  'clients.view_operational': 1,
  'clients.view_identity': 1,
  'clients.edit_identity': 1,
  'photos.view': 1,
  'photos.upload': 1,
  'photos.verify': 1,
  'admissions.create': 1,
  'admissions.edit': 1,
  'tasks.view': 1,
  'tasks.create': 1,
  'tasks.assign': 1,
  'tasks.complete': 1,
  'tasks.reopen': 1,
  'treatment.view': 2,
  'treatment.record': 2,
  'family.view': 2,
  'family.log_contact': 2,
  'family.schedule_meeting': 2,
  'medical.view_summary': 2,
  'medical.view_detail': 3,
  'medical.record': 3,
  'risk.view_indicator': 1,
  'risk.view_detail': 3,
  'risk.record': 3,
  'safeguarding.view_indicator': 1,
  'safeguarding.view_detail': 3,
  'safeguarding.record': 3,
  'discharge.initiate': 1,
  'discharge.approve': 1,
  'discharge.finalise': 1,
  'reports.view': 1,
  'reports.export': 4,
  'audit.view': 4,
  'administration.manage_users': 4,
};

/**
 * Indicator/detail pairs.
 *
 * The product's central privacy rule lives here: a user may know a safeguarding concern exists
 * without being able to read it. Pairing them explicitly means a screen can ask
 * `restrictedPair('safeguarding')` rather than remembering which two strings go together.
 */
export const RESTRICTED_PAIRS = {
  safeguarding: { indicator: 'safeguarding.view_indicator', detail: 'safeguarding.view_detail' },
  risk: { indicator: 'risk.view_indicator', detail: 'risk.view_detail' },
  medical: { indicator: 'medical.view_summary', detail: 'medical.view_detail' },
} as const satisfies Record<string, { indicator: Permission; detail: Permission }>;

export type RestrictedArea = keyof typeof RESTRICTED_PAIRS;

/** Shown wherever detail is withheld. Wording comes from the brief. */
export const RESTRICTED_MESSAGE = 'Restricted alert — contact centre manager';

export interface PermissionSet {
  has: (permission: Permission) => boolean;
}

/**
 * How a restricted area should render for this user.
 *
 * Three outcomes, not two. "Hidden" and "indicator only" are different states and conflating them
 * is how a helpdesk user ends up seeing either too much or nothing at all.
 */
export function restrictedVisibility(
  perms: PermissionSet,
  area: RestrictedArea,
): 'hidden' | 'indicator' | 'full' {
  const pair = RESTRICTED_PAIRS[area];
  if (perms.has(pair.detail)) return 'full';
  if (perms.has(pair.indicator)) return 'indicator';
  return 'hidden';
}
