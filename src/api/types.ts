export type Role = 'OWNER' | 'ADMINISTRATOR' | 'MANAGER' | 'INVENTORY_CLERK' | 'CLERK' | 'CASHIER';
export type Status = 'ACTIVE' | 'SUSPENDED' | 'DEACTIVATED';
export type Row = Record<string, unknown>;
export interface Identity {
  id: number;
  firstName: string;
  lastName: string;
  email: string;
  role: Role | 'OPERATOR' | null;
  status: Status;
  businessId: number | null;
  operator: boolean;
  membershipId?: number | null;
  platformRole?: string | null;
}
export interface Business {
  id: number;
  name: string;
  currency: string;
  default_threshold: number;
}
export interface Location {
  id: number;
  name: string;
  active: number | boolean;
}
export interface Category {
  id: number;
  name: string;
}
export interface Product {
  productKind?: 'SIMPLE' | 'PARENT' | 'VARIANT';
  parentId?: string | null;
  variantKey?: string | null;
  itemId: string;
  sku: string;
  barcode: string | null;
  itemName: string;
  itemDescription: string;
  unitPrice: number;
  cost: number;
  categoryId: number | null;
  category: string | null;
  active: boolean;
  unitOfMeasure: string;
  minStockThreshold: number | null;
}
export interface PublicProduct {
  id: string;
  sku: string;
  barcode: string | null;
  name: string;
  description: string;
  price: number;
  available: number;
  category: string | null;
  unitOfMeasure: string;
}
export interface Stock {
  stock_value?: string;
  product_id: string;
  location_id: number;
  sku: string;
  item_name: string;
  quantity_on_hand: number;
  quantity_reserved: number;
  available_quantity: number;
  reorder_level: number;
  low_stock: number | boolean;
  unit_price?: number;
}
export interface CountLine {
  product_id: string;
  sku: string;
  barcode: string | null;
  expected_quantity: number;
  counted_quantity: number;
  variance: number;
}
export interface Count {
  id: string;
  location_id: number;
  status: 'DRAFT' | 'SUBMITTED' | 'APPROVED';
  created_at: string;
  lines?: CountLine[];
}
export interface ImportLine {
  row_number: number;
  sku: string;
  quantity: number | null;
  reorder_level: number | null;
  error: string | null;
}
export interface OpeningImport {
  id: string;
  status: string;
  location_id: number;
  lines: ImportLine[];
}
export interface CartLine {
  productId: string;
  quantity: number;
}
export interface Cart {
  lines: {
    id: string;
    sku: string;
    item_name: string;
    quantity: number;
    available: number;
    price_cents: number;
    total_cents?: number;
  }[];
  total_cents: number;
  currency: string;
  sufficientStock: boolean;
  reserved: boolean;
}
export type OrderStatus =
  'RESERVED' | 'COMPLETED' | 'PAYMENT_FAILED' | 'EXPIRED' | 'CANCELLED' | 'FULFILLED' | 'RETURNED';
export interface Order {
  id: string;
  location_id: number;
  channel: 'POS' | 'ONLINE';
  status: OrderStatus;
  total_cents: number;
  currency: string;
  expires_at_ms: number;
  created_at: string;
  accessToken?: string;
  lines?: {
    product_id: string;
    sku: string;
    item_name: string;
    quantity: number;
    price_cents: number;
    total_cents?: number;
  }[];
  events?: Row[];
  payments?: Row[];
  refunds?: Row[];
}
export interface Employee {
  id: number;
  first_name: string;
  last_name: string;
  email: string;
  job_title: string;
  role: Role;
  status: Status;
}
export interface Fitment {
  id: string;
  make: string;
  model: string;
  year_from: number;
  year_to: number;
  engine: string | null;
  trim: string | null;
  source: string;
}
export interface Reason {
  code: string;
  label: string;
}
export interface Summary {
  total_products: number;
  stocked_products: number;
  total_units: number;
  low_stock_products: number;
  out_of_stock_products: number;
  inventory_cost_estimate_cents: number;
}
export interface Sales {
  gross_revenue_cents: number;
  refunded_cents: number;
  net_revenue_cents: number;
  completed_simulated_payments: number;
  byDate: Row[];
  byChannel: Row[];
  byProduct: Row[];
}
