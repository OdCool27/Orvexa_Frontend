import type { IdentitySnapshot } from '../api/identity';
import type { Identity } from '../api/types';
import type { Classification, OnboardingStep } from '../api/configuration';

export function managesBusiness(user: Identity | null, identity: IdentitySnapshot | null) {
  return (
    !!user &&
    !user.operator &&
    ['OWNER', 'ADMINISTRATOR'].includes(user.role || '') &&
    !!identity?.memberships.some(
      (m) => m.id === user.membershipId && m.status === 'ACTIVE' && !!m.all_branches,
    )
  );
}
export function onboardingProgress(steps: OnboardingStep[]) {
  return {
    complete: steps.filter((s) => s.status === 'COMPLETE' && s.ready && !s.needsReview).length,
    skipped: steps.filter((s) => s.status === 'SKIPPED').length,
    review: steps.filter((s) => s.needsReview).length,
  };
}
export function effectiveVersion<T extends { effective_from_ms: number }>(
  versions: T[],
  now = Date.now(),
) {
  return versions
    .filter((v) => v.effective_from_ms <= now)
    .sort((a, b) => b.effective_from_ms - a.effective_from_ms)[0];
}
export function localDateTime(now = new Date()) {
  const adjusted = new Date(now.getTime() - now.getTimezoneOffset() * 60000);
  return adjusted.toISOString().slice(0, 19);
}
export function effectiveInstant(value: string) {
  const date = new Date(value);
  if (
    !/^\d{4}-\d\d-\d\dT\d\d:\d\d(:\d\d(\.\d{1,3})?)?$/.test(value) ||
    !Number.isFinite(date.getTime()) ||
    date.getTime() <= 0 ||
    date.getUTCFullYear() > 9999
  )
    throw new Error('Choose a valid effective date after 1970 and within year 9999.');
  // Reject nonexistent local times (for example, a daylight-saving clock jump).
  if (localDateTime(date).slice(0, Math.min(value.length, 19)) !== value.slice(0, 19))
    throw new Error('This local time does not exist. Choose another time.');
  return date.toISOString();
}
export function validateRate(value: string, classification: Classification) {
  if (!/^\d{1,3}(\.\d{1,4})?$/.test(value))
    throw new Error('Enter a percentage from 0 to 100, with at most four decimal places.');
  const [whole, fraction = ''] = value.split('.');
  const units = BigInt(whole) * 10000n + BigInt(fraction.padEnd(4, '0'));
  if (units > 1000000n) throw new Error('The percentage cannot exceed 100.');
  if (classification !== 'TAXABLE' && units !== 0n)
    throw new Error('Zero-rated and exempt profiles require a zero percentage.');
  return value;
}
