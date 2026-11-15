import { query } from './client';

export type Flag = boolean | number;
export type PriceMode = 'INCLUSIVE' | 'EXCLUSIVE';
export type Classification = 'TAXABLE' | 'ZERO_RATED' | 'EXEMPT';
export interface Preferences {
  revision: number;
  receipt_name: string;
  receipt_footer: string;
  low_stock_notifications: Flag;
  allow_branch_price_mode: Flag;
}
export interface BranchPreferences {
  effective: Preferences & { price_mode: PriceMode; branch_revision: number };
  overrides: {
    revision: number;
    receipt_name?: string | null;
    receipt_footer?: string | null;
    low_stock_notifications?: Flag | null;
    price_mode?: PriceMode | null;
  };
}
export interface Policy {
  id: string;
  effective_from_ms: number;
  registration_status: 'NOT_REGISTERED' | 'REGISTERED';
  registration_number: string;
  price_mode: PriceMode;
  verified: Flag;
  verification_note: string;
}
export interface TaxTemplate {
  code: string;
  label: string;
  classification: Classification;
  rate_percent: string;
}
export interface TaxRate extends TaxTemplate {
  id: string;
  effective_from_ms: number;
  illustrative: Flag;
  verified: Flag;
  verification_note: string;
}
export interface TaxAssignment {
  id: string;
  code: string;
  effective_from_ms: number;
}
export type StepCode =
  | 'BUSINESS_DETAILS'
  | 'BRANCHES'
  | 'TAX_REVIEW'
  | 'CATALOG'
  | 'OPENING_STOCK'
  | 'STAFF'
  | 'POS_TEST';
export type StepStatus = 'NOT_STARTED' | 'IN_PROGRESS' | 'COMPLETE' | 'SKIPPED';
export interface OnboardingStep {
  step: StepCode;
  revision: number;
  status: StepStatus;
  notes: string;
  ready: boolean;
  needsReview: boolean;
}

// Version lists have no total or current-version endpoint. Read every page so a
// future schedule cannot hide the effective version beyond the first page.
export async function readVersions<T>(read: (path: string) => Promise<T[]>, path: string) {
  const result: T[] = [];
  for (let offset = 0; ; offset += 200) {
    const page = await read(path + query({ limit: 200, offset }));
    result.push(...page);
    if (page.length < 200) return result;
  }
}
