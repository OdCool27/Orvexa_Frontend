import type { Role } from '../api/types';
import { ApiError } from '../api/client';

export function uncertainSessionChange(
  error: unknown,
  requireSignIn: (message: string) => void,
  message: string,
): never {
  if (
    error instanceof ApiError &&
    error.code !== 'OFFLINE' &&
    (error.status === 0 || error.status >= 500)
  ) {
    requireSignIn(message);
    throw new Error(message);
  }
  throw error;
}

export const currentRoles: Role[] = [
  'OWNER',
  'ADMINISTRATOR',
  'MANAGER',
  'CASHIER',
  'INVENTORY_CLERK',
];
export function assignableRoles(actor: Role | 'OPERATOR' | null | undefined): Role[] {
  if (actor === 'OWNER') return currentRoles;
  if (actor === 'ADMINISTRATOR') return currentRoles.filter((r) => r !== 'OWNER');
  if (actor === 'MANAGER') return ['CASHIER', 'INVENTORY_CLERK'];
  return [];
}
export function validatePassword(password: string, confirmation?: string) {
  if (
    password.length < 12 ||
    password.length > 72 ||
    new TextEncoder().encode(password).length > 72
  )
    throw new Error('Use 12–72 characters and at most 72 UTF-8 bytes for the password.');
  if (confirmation !== undefined && password !== confirmation)
    throw new Error('Passwords do not match.');
  return password;
}
export function invitationStatus(
  invitation: { status: string; expires_ms: number },
  now = Date.now(),
) {
  return invitation.status === 'PENDING' && invitation.expires_ms <= now
    ? 'EXPIRED'
    : invitation.status;
}
