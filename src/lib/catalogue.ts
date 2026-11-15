import { catalogueFields, requiredFields } from '../api/catalogue';
import { majorToCents } from './format';
import type { Product } from '../api/types';
import { query } from '../api/client';

export async function lookupCatalogueProduct(
  read: (path: string) => Promise<Product[]>,
  value: string,
) {
  const code = value.trim();
  if (!code) throw new Error('Scan or enter a SKU or barcode.');
  const barcode = await read('/api/products' + query({ barcode: code, limit: 2 }));
  if (barcode.length > 1) throw new Error('This code is ambiguous. Review the catalogue codes.');
  if (barcode.length === 1) return barcode[0];
  const matches: Product[] = [];
  for (let offset = 0; ; offset += 200) {
    const page = await read('/api/products' + query({ search: code, limit: 200, offset }));
    matches.push(...page.filter((p) => p.sku.toLowerCase() === code.toLowerCase()));
    if (page.length < 200) break;
  }
  if (matches.length !== 1)
    throw new Error(
      matches.length
        ? 'This SKU is ambiguous.'
        : 'No active product matches this exact SKU or barcode.',
    );
  return matches[0];
}

export function moneyText(value: string) {
  majorToCents(value);
  if (value.split('.')[0].length > 10)
    throw new Error('Amounts support at most ten integer digits.');
  return value;
}
export function unitDecimal(value: string, quantity = false) {
  if (!new RegExp(`^\\d{1,${quantity ? 9 : 7}}(\\.\\d{1,6})?$`).test(value))
    throw new Error('Use a positive decimal with at most six decimal places.');
  const [whole, fraction = ''] = value.split('.');
  const units = BigInt(whole) * 1000000n + BigInt(fraction.padEnd(6, '0'));
  if (units < 1n || (!quantity && units > 1000000000000n))
    throw new Error('A conversion factor must be between 0.000001 and 1000000.');
  return value;
}

// This preview reader follows Spring's CSV record/quoting rules, including blank
// record handling. Spring re-reads the original file and owns all validation.
export function parseCatalogueCsv(text: string) {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  let closed = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          quoted = false;
          closed = true;
        }
      } else field += c;
    } else if (c === ',' || c === '\n' || c === '\r') {
      row.push(field);
      field = '';
      closed = false;
      if (c !== ',') {
        if (!(row.length === 1 && !row[0].trim())) rows.push(row);
        row = [];
        if (c === '\r' && text[i + 1] === '\n') i++;
      }
    } else if (c === '"' && !field && !closed) quoted = true;
    else {
      if (closed || c === '"') throw new Error('Malformed CSV quoting.');
      field += c;
    }
  }
  if (quoted) throw new Error('Malformed CSV quoting.');
  if (field || closed || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}
export function validateSheet(rows: string[][]) {
  if (rows.length < 2 || rows.length > 1001)
    throw new Error('Choose a header and 1–1000 data rows.');
  const headers = Array.from(rows[0], (h) => (h || '').trim());
  if (headers.length > 20 || headers.some((h) => !h) || new Set(headers).size !== headers.length)
    throw new Error('Use 1–20 unique, nonempty column headers.');
  if (rows.some((r) => r.length > 20 || r.some((c) => c.length > 500)))
    throw new Error('Use at most 20 columns and 500 characters per cell.');
  return [headers, ...rows.slice(1)];
}
export function validateMapping(headers: string[], mapping: Record<string, string>) {
  for (const field of requiredFields)
    if (!headers.includes(mapping[field] || field))
      throw new Error(`Map the required ${field} column.`);
  if (
    Object.entries(mapping).some(
      ([field, source]) =>
        !catalogueFields.includes(field as (typeof catalogueFields)[number]) ||
        !headers.includes(source),
    )
  )
    throw new Error('Choose source headers from this file.');
}
export async function readCatalogueFile(file: File) {
  if (file.size > 1000000 || file.size === 0)
    throw new Error('Choose a nonempty CSV or XLSX file no larger than 1 MB.');
  const format = file.name.toLowerCase().endsWith('.csv')
    ? 'csv'
    : file.name.toLowerCase().endsWith('.xlsx')
      ? 'xlsx'
      : null;
  if (!format) throw new Error('Only .csv and .xlsx files are accepted.');
  let csv = '';
  let rows: string[][];
  if (format === 'csv') {
    csv = (await file.text()).replace(/^\uFEFF/, '');
    rows = parseCatalogueCsv(csv);
  } else {
    const { default: readWorkbook } = await import('read-excel-file/browser');
    const sheets = await readWorkbook(file, { trim: false, parseNumber: (value) => value });
    if (sheets.length !== 1) throw new Error('The workbook must contain exactly one sheet.');
    rows = sheets[0].data.map((row) =>
      Array.from(row, (cell) =>
        cell == null ? '' : cell instanceof Date ? cell.toISOString() : String(cell),
      ),
    );
  }
  const digest = [
    ...new Uint8Array(await crypto.subtle.digest('SHA-256', await file.arrayBuffer())),
  ]
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
  return { file, format, csv, rows: validateSheet(rows), digest };
}
