import { describe, expect, it } from 'vitest';
import { can } from '../auth/permissions';
import type { Identity, Role } from '../api/types';
const identity = (role: Role, operator = false): Identity => ({
  id: 1,
  firstName: 'Demo',
  lastName: 'User',
  email: 'test@local.test',
  role,
  status: 'ACTIVE',
  businessId: operator ? null : 1,
  operator,
});
describe('role-specific frontend actions', () => {
  it('recognizes administrator operations and canonical inventory-clerk roles', () => {
    expect(can(identity('ADMINISTRATOR'), 'settings')).toBe(true);
    expect(can(identity('ADMINISTRATOR'), 'checkout')).toBe(true);
    expect(can(identity('INVENTORY_CLERK'), 'counts')).toBe(true);
    expect(can(identity('INVENTORY_CLERK'), 'checkout')).toBe(false);
  });
  it('does not interpret the operator employee role as tenant access', () => {
    expect(can(identity('OWNER', true), 'manage')).toBe(false);
    expect(can(identity('OWNER', true), 'reports')).toBe(false);
  });
  it('allows cashier payment but not fulfillment, counts, or reports', () => {
    const u = identity('CASHIER');
    expect(can(u, 'checkout')).toBe(true);
    expect(can(u, 'fulfill')).toBe(false);
    expect(can(u, 'counts')).toBe(false);
    expect(can(u, 'reports')).toBe(false);
  });
  it('allows clerk counts and fulfillment but no checkout or stock edits', () => {
    const u = identity('CLERK');
    expect(can(u, 'counts')).toBe(true);
    expect(can(u, 'fulfill')).toBe(true);
    expect(can(u, 'checkout')).toBe(false);
    expect(can(u, 'manage')).toBe(false);
  });
  it('allows manager operations but reserves business settings for owners', () => {
    expect(can(identity('MANAGER'), 'manage')).toBe(true);
    expect(can(identity('MANAGER'), 'settings')).toBe(false);
    expect(can(identity('OWNER'), 'settings')).toBe(true);
  });
  it('grants no action without a signed-in employee', () => {
    expect(can(null, 'checkout')).toBe(false);
  });
});
