import type { IdentitySnapshot, SessionGrant } from '../api/identity';

export const grant: SessionGrant = {
  accessToken: 'test-session-token',
  tokenType: 'Bearer',
  purpose: 'FULL',
  expiresAt: new Date(Date.now() + 3600000).toISOString(),
};
export const snapshot: IdentitySnapshot = {
  id: 1,
  first_name: 'Demo',
  last_name: 'Owner',
  email: 'owner@test.local',
  status: 'ACTIVE',
  email_verified: 1,
  mfa_enabled: 1,
  mfaRequired: true,
  purpose: 'FULL',
  operator: false,
  platformRole: null,
  businessId: 2,
  role: 'OWNER',
  activeMembershipId: 3,
  memberships: [
    {
      id: 3,
      business_id: 2,
      business_name: 'Auto Parts',
      role: 'OWNER',
      status: 'ACTIVE',
      job_title: 'Owner',
      all_branches: 1,
    },
  ],
};
