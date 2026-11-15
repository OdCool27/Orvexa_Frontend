export interface Supplier {
  id: string;
  name: string;
  email: string | null;
  active: number | boolean;
}
export interface PurchaseLine {
  product_id: string;
  unit_code: string;
  unit_quantity: string;
  factor: string;
  unit_cost: string;
  ordered_quantity: number;
  received_quantity: number;
  total_value: string;
  received_value: string;
}
export interface PurchaseOrder {
  id: string;
  supplier_id: string;
  location_id: number;
  currency: string;
  status: 'OPEN' | 'PARTIAL' | 'RECEIVED' | 'CANCELLED';
  created_ms: number;
  lines?: PurchaseLine[];
  receipts?: { id: string; created_ms: number }[];
}
export interface Batch {
  id: string;
  product_id: string;
  location_id: number;
  code: string;
  expires_on: string | null;
  quantity_on_hand: number;
  quantity_reserved: number;
  available: number;
}
export interface TransferLine {
  product_id: string;
  quantity: number;
  received_quantity: number;
  batch_code: string | null;
  expires_on: string | null;
  dispatched_value: string;
  received_value: string;
  in_transit_quantity: number;
  in_transit_value: string;
}
export interface Transfer {
  id: string;
  source_id: number;
  destination_id: number;
  created_ms: number;
  status: 'REQUESTED' | 'DISPATCHED' | 'PARTIAL' | 'RECEIVED' | 'CANCELLED';
  lines?: TransferLine[];
}
