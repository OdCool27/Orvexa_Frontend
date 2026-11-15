import type { Identity, Role } from '../api/types';
export type Capability =
  'manage' | 'counts' | 'checkout' | 'fulfill' | 'reports' | 'employees' | 'settings';
const roles: Record<Capability, Role[]> = {
  manage: ['OWNER', 'ADMINISTRATOR', 'MANAGER'],
  counts: ['OWNER', 'ADMINISTRATOR', 'MANAGER', 'INVENTORY_CLERK', 'CLERK'],
  checkout: ['OWNER', 'ADMINISTRATOR', 'MANAGER', 'CASHIER'],
  fulfill: ['OWNER', 'ADMINISTRATOR', 'MANAGER', 'INVENTORY_CLERK', 'CLERK'],
  reports: ['OWNER', 'ADMINISTRATOR', 'MANAGER'],
  employees: ['OWNER', 'ADMINISTRATOR', 'MANAGER'],
  settings: ['OWNER', 'ADMINISTRATOR'],
};
export function can(user: Identity | null, capability: Capability) {
  return !!user && !user.operator && roles[capability].some((role) => role === user.role);
}
