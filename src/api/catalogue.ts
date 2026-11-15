export interface ProductUnit {
  code: string;
  factor: string;
  purchase_allowed: number | boolean;
  sale_allowed: number | boolean;
}
export interface CatalogueImport {
  id: string;
  status: 'PREVIEW' | 'COMMITTED';
  duplicate_policy: 'REJECT' | 'SKIP' | 'UPDATE';
  created_ms: number;
  committed_ms: number | null;
  rows: {
    row_number: number;
    disposition: 'CREATE' | 'UPDATE' | 'SKIP' | 'ERROR';
    error: string | null;
  }[];
}
export const catalogueFields = [
  'sku',
  'barcode',
  'itemName',
  'itemDescription',
  'unitPrice',
  'categoryId',
  'cost',
  'unitOfMeasure',
  'minStockThreshold',
  'productKind',
  'parentId',
  'variantKey',
] as const;
export const requiredFields = ['sku', 'itemName', 'itemDescription', 'unitPrice'];
