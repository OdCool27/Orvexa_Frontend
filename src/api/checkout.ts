export interface PosItem {
  id: string;
  sku: string;
  barcode: string | null;
  item_name: string;
  unit_of_measure: string;
  price_cents: number;
  list_price_cents: number;
  discount_percent: string;
  discount_reason: string;
  available: number;
  batch_tracked: number | boolean;
}
export interface PricedLine {
  id?: string;
  product_id?: string;
  sku: string;
  item_name: string;
  quantity: number;
  available?: number;
  price_cents: number;
  net_cents: number;
  tax_cents: number;
  total_cents: number;
  tax_classification: string;
  tax_rate_percent: string;
  tax_rule_label: string;
  tax_verified: number;
  tax_illustrative: number;
  list_price_cents?: number;
  discount_cents?: number;
  discount_percent: string;
  discount_reason: string;
  unit_code?: string;
  unit_quantity?: string;
  unit_factor?: string;
}
export interface SaleQuote {
  lines: PricedLine[];
  total_cents: number;
  net_cents: number;
  tax_cents: number;
  currency: string;
  sufficientStock: boolean;
  price_mode: string;
  seller_registration_status: string;
  seller_tax_verified: number;
}
export interface Sale extends Omit<SaleQuote, 'sufficientStock'> {
  id: string;
  location_id: number;
  channel: 'POS' | 'ONLINE';
  status: string;
  created_at: string;
  payment_state: 'NOT_STARTED' | 'PENDING' | 'UNKNOWN' | 'CONFIRMED' | 'DECLINED';
  expires_at_ms: number;
  simulated: boolean;
  discount_cents: number;
  tax_snapshot_version: number;
  payments: {
    provider: string;
    method: string;
    successful: number;
    amount_cents: number;
    created_at: string;
  }[];
  events: {
    action: string;
    actor_kind: string;
    actor_id: number | null;
    reason: string;
    created_at: string;
  }[];
}
export interface PaymentAttempt {
  id: string;
  provider: 'CASH' | 'MANUAL_TERMINAL' | 'SIMULATOR';
  status: 'PENDING' | 'UNKNOWN' | 'CONFIRMED' | 'DECLINED';
  amount_cents: number;
  currency: string;
  external_reference: string | null;
  created_ms: number;
}
export interface Reversal {
  id: string;
  order_id: string;
  type: 'RETURN' | 'REFUND' | 'CANCEL';
  status: 'REQUESTED' | 'APPROVED' | 'REJECTED' | 'COMPLETED';
  reason: string;
  resellable: number;
  amount_cents: number;
  net_cents: number;
  tax_cents: number;
  refund_method?: string;
  external_reference?: string | null;
  created_ms: number;
  lines?: {
    product_id: string;
    quantity: number;
    net_cents: number;
    tax_cents: number;
    total_cents: number;
  }[];
}
