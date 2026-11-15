import { request } from './client';
import type { Identity, Role, Status } from './types';

export type SessionPurpose = 'FULL' | 'VERIFY_EMAIL' | 'MFA_ENROLL' | 'MFA_CHALLENGE';
export interface SessionGrant {
  accessToken: string;
  tokenType: 'Bearer';
  purpose: SessionPurpose;
  expiresAt: string;
  emailVerified?: boolean;
  mfaRequired?: boolean;
  recoveryCodes?: string[];
}
export interface Membership {
  id: number;
  business_id: number;
  business_name: string;
  role: Role;
  status: 'ACTIVE' | 'DEACTIVATED';
  job_title: string;
  all_branches: boolean | number;
  branchIds?: number[];
}
export interface BusinessMember {
  id: number;
  user_id: number;
  email: string;
  first_name: string;
  last_name: string;
  role: Role;
  status: 'ACTIVE' | 'DEACTIVATED';
  job_title: string;
  all_branches: number | boolean;
}
export interface Invitation {
  id: string;
  email: string;
  role: Role;
  all_branches: number | boolean;
  status: 'PENDING' | 'ACCEPTED' | 'REVOKED' | 'EXPIRED';
  expires_ms: number;
  created_by?: number;
}
export interface InviteRequest {
  email: string;
  role: Role;
  allBranches: boolean;
  branchIds: number[];
}
export interface MfaSetup {
  secret: string;
  otpauthUri: string;
  expiresAt: string;
}
export interface ActiveSession {
  id: string;
  membership_id: number | null;
  created_ms: number;
  last_seen_ms: number;
  expires_ms: number;
}
export interface MailPreview {
  id: string;
  recipient: string;
  subject: string;
  body: string;
  kind: string;
  status: string;
  created_ms: number;
}
export interface Message {
  message: string;
}
export interface IdentitySnapshot {
  id: number;
  first_name: string;
  last_name: string;
  email: string;
  status: Status;
  email_verified: number | boolean;
  mfa_enabled: number | boolean;
  operator: boolean;
  platformRole: string | null;
  purpose: SessionPurpose;
  mfaRequired: boolean;
  memberships: Membership[];
  activeMembershipId: number | null;
  businessId: number | null;
  role: Role | 'OPERATOR' | null;
}

export const identityApi = {
  login: (email: string, password: string) =>
    request<SessionGrant>('/api/v1/auth/login', {
      method: 'POST',
      body: { email: email.trim(), password },
    }),
  me: (accessToken: string) =>
    request<IdentitySnapshot>('/api/v1/auth/me', { authorization: `Bearer ${accessToken}` }),
  logout: (accessToken: string) =>
    request<void>('/api/v1/auth/logout', {
      method: 'POST',
      authorization: `Bearer ${accessToken}`,
    }),
  register: (body: { firstName: string; lastName: string; email: string; password: string }) =>
    request<Message>('/api/v1/auth/register', { method: 'POST', body }),
  requestEmail: (email: string, reset = false) =>
    request<Message>(`/api/v1/auth/${reset ? 'password-reset' : 'email-verification'}`, {
      method: 'POST',
      body: { email: email.trim() },
    }),
  verifyEmail: (token: string) =>
    request<Message>('/api/v1/auth/email-verification/confirm', {
      method: 'POST',
      body: { token },
    }),
  resetPassword: (token: string, password: string) =>
    request<Message>('/api/v1/auth/password-reset/confirm', {
      method: 'POST',
      body: { token, password },
    }),
  acceptNewInvitation: (body: {
    token: string;
    firstName: string;
    lastName: string;
    password: string;
  }) =>
    request<{ reauthenticationRequired: boolean }>('/api/v1/invitations/accept', {
      method: 'POST',
      body,
    }),
};

// Partial authentication grants must never be promoted to workspace permissions.
export function workspaceIdentity(snapshot: IdentitySnapshot): Identity | null {
  if (snapshot.purpose !== 'FULL') return null;
  if (
    !snapshot.operator &&
    (!snapshot.activeMembershipId || !snapshot.businessId || !snapshot.role)
  )
    return null;
  return {
    id: snapshot.id,
    firstName: snapshot.first_name,
    lastName: snapshot.last_name,
    email: snapshot.email,
    status: snapshot.status,
    role: snapshot.role,
    businessId: snapshot.businessId,
    membershipId: snapshot.activeMembershipId,
    platformRole: snapshot.platformRole,
    operator: snapshot.operator,
  };
}
