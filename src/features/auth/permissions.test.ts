import { describe, expect, it } from 'vitest';
import {
  PERMISSIONS,
  RESTRICTED_PAIRS,
  SENSITIVITY,
  restrictedVisibility,
  type Permission,
} from './permissions.js';

const withPermissions = (...codes: Permission[]) => ({
  has: (p: Permission) => codes.includes(p),
});

/** The seven role sets as seeded in migration 0015. Kept in sync deliberately. */
const HELPDESK: Permission[] = [
  'centres.view',
  'rooms.view',
  'clients.view_operational',
  'tasks.view',
  'tasks.assign',
  'risk.view_indicator',
  'safeguarding.view_indicator',
];

const THERAPIST: Permission[] = [
  'centres.view',
  'rooms.view',
  'clients.view_operational',
  'clients.view_identity',
  'photos.view',
  'tasks.view',
  'tasks.complete',
  'treatment.view',
  'treatment.record',
  'family.view',
  'family.log_contact',
  'medical.view_summary',
  'risk.view_indicator',
  'safeguarding.view_indicator',
];

const CENTRE_MANAGER: Permission[] = [
  ...THERAPIST,
  'safeguarding.view_detail',
  'risk.view_detail',
  'medical.view_detail',
  'rooms.allocate',
];

describe('catalogue integrity', () => {
  it('every permission has a sensitivity level', () => {
    for (const p of PERMISSIONS) expect(SENSITIVITY[p]).toBeGreaterThanOrEqual(1);
    expect(Object.keys(SENSITIVITY)).toHaveLength(PERMISSIONS.length);
  });

  it('has no duplicates', () => {
    expect(new Set(PERMISSIONS).size).toBe(PERMISSIONS.length);
  });

  it('rates every indicator below its matching detail', () => {
    // The whole model rests on this: an indicator is operational, the narrative behind it is not.
    for (const { indicator, detail } of Object.values(RESTRICTED_PAIRS)) {
      expect(SENSITIVITY[indicator]).toBeLessThan(SENSITIVITY[detail]);
    }
  });

  it('rates every detail permission as sensitive', () => {
    for (const { detail } of Object.values(RESTRICTED_PAIRS)) {
      expect(SENSITIVITY[detail]).toBe(3);
    }
  });
});

describe('restrictedVisibility — three outcomes, not two', () => {
  it('returns hidden when neither permission is held', () => {
    expect(restrictedVisibility(withPermissions(), 'safeguarding')).toBe('hidden');
  });

  it('returns indicator when only the indicator is held', () => {
    expect(restrictedVisibility(withPermissions('safeguarding.view_indicator'), 'safeguarding')).toBe(
      'indicator',
    );
  });

  it('returns full when the detail is held', () => {
    expect(restrictedVisibility(withPermissions('safeguarding.view_detail'), 'safeguarding')).toBe(
      'full',
    );
  });

  it('treats detail as sufficient on its own', () => {
    // Someone granted detail without the indicator should still see everything, not nothing.
    expect(restrictedVisibility(withPermissions('risk.view_detail'), 'risk')).toBe('full');
  });
});

describe('helpdesk — the role the split exists for', () => {
  const helpdesk = withPermissions(...HELPDESK);

  it.each(['safeguarding', 'risk'] as const)('sees the %s indicator only', (area) => {
    expect(restrictedVisibility(helpdesk, area)).toBe('indicator');
  });

  it('cannot read any narrative', () => {
    expect(helpdesk.has('safeguarding.view_detail')).toBe(false);
    expect(helpdesk.has('risk.view_detail')).toBe(false);
    expect(helpdesk.has('medical.view_detail')).toBe(false);
  });

  it('sees a client reference but never a name', () => {
    expect(helpdesk.has('clients.view_operational')).toBe(true);
    expect(helpdesk.has('clients.view_identity')).toBe(false);
  });

  it('cannot see photographs, allocate rooms, or manage users', () => {
    expect(helpdesk.has('photos.view')).toBe(false);
    expect(helpdesk.has('rooms.allocate')).toBe(false);
    expect(helpdesk.has('administration.manage_users')).toBe(false);
  });

  it('holds nothing above sensitivity level 1', () => {
    for (const p of HELPDESK) expect(SENSITIVITY[p]).toBe(1);
  });
});

describe('therapist', () => {
  const therapist = withPermissions(...THERAPIST);

  it('sees client names', () => {
    expect(therapist.has('clients.view_identity')).toBe(true);
  });

  it('sees safeguarding as an indicator only', () => {
    expect(restrictedVisibility(therapist, 'safeguarding')).toBe('indicator');
  });

  it('cannot allocate rooms or manage users', () => {
    expect(therapist.has('rooms.allocate')).toBe(false);
    expect(therapist.has('administration.manage_users')).toBe(false);
  });
});

describe('centre manager', () => {
  const manager = withPermissions(...CENTRE_MANAGER);

  it.each(['safeguarding', 'risk', 'medical'] as const)('has full %s visibility', (area) => {
    expect(restrictedVisibility(manager, area)).toBe('full');
  });

  it('still cannot manage users — technical admin is separate from clinical access', () => {
    expect(manager.has('administration.manage_users')).toBe(false);
  });
});
