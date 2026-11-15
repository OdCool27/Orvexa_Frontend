import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthProvider } from '../auth/Auth';
import { App } from '../app/App';
import {
  lookupCatalogueProduct,
  moneyText,
  parseCatalogueCsv,
  readCatalogueFile,
  unitDecimal,
  validateMapping,
  validateSheet,
} from '../lib/catalogue';
import { grant, snapshot } from './identity-fixtures';
import type { Product } from '../api/types';

const workbook = vi.hoisted(() => vi.fn());
vi.mock('read-excel-file/browser', () => ({ default: workbook }));
function file(text: string, name = 'products.csv') {
  const result = new File([text], name);
  Object.defineProperty(result, 'text', { value: async () => text });
  Object.defineProperty(result, 'arrayBuffer', {
    value: async () => new TextEncoder().encode(text).buffer,
  });
  return result;
}
const csv = 'Code,Name,Description,Price\r\n00001,Blue shirt,"Cotton, blue",12.50\r\n';
const parentId = '11111111-1111-4111-8111-111111111111';
const variantId = '22222222-2222-4222-8222-222222222222';
const simpleId = '33333333-3333-4333-8333-333333333333';
const jobId = '44444444-4444-4444-8444-444444444444';
const variant: Product = {
  itemId: variantId,
  sku: 'BLUE-01',
  itemName: 'Blue shirt',
  itemDescription: 'Cotton shirt',
  productKind: 'VARIANT',
  parentId,
  variantKey: 'BLUE',
  barcode: '001234',
  unitPrice: 12.5,
  cost: 6,
  unitOfMeasure: 'EACH',
  minStockThreshold: 3,
  categoryId: null,
  category: null,
  active: true,
};

describe('catalogue file and decimal rules', () => {
  it('preserves leading zeros, quoted commas, escaped quotes, newlines and CRLF', () => {
    expect(parseCatalogueCsv('SKU,Name\r\n0001,"A, ""quoted""\nname"\r\n')).toEqual([
      ['SKU', 'Name'],
      ['0001', 'A, "quoted"\nname'],
    ]);
  });
  it.each(['a\n"open', 'a\nx"bad', 'a\n"closed"extra'])('rejects malformed CSV %s', (text) =>
    expect(() => parseCatalogueCsv(text)).toThrow(/quoting/),
  );
  it('requires unique headers and bounded records/cells', () => {
    expect(() =>
      validateSheet([
        ['sku', 'sku'],
        ['a', 'b'],
      ]),
    ).toThrow(/unique/);
    expect(() => validateSheet([['sku'], ['x'.repeat(501)]])).toThrow(/500/);
    expect(() => validateSheet(Array.from({ length: 1002 }, () => ['a']))).toThrow(/1000/);
    expect(() => validateSheet([[''], ['a']])).toThrow(/nonempty/);
  });
  it('requires mapped mandatory fields and rejects unknown mappings', () => {
    const headers = ['Code', 'Name', 'Description', 'Price'];
    expect(() => validateMapping(headers, {})).toThrow(/sku/);
    expect(() =>
      validateMapping(headers, {
        sku: 'Code',
        itemName: 'Name',
        itemDescription: 'Description',
        unitPrice: 'Price',
      }),
    ).not.toThrow();
    expect(() =>
      validateMapping(['sku', 'itemName', 'itemDescription', 'unitPrice'], { stock: 'sku' }),
    ).toThrow(/source headers/);
  });
  it('keeps decimal strings exact and rejects invalid conversion factors', () => {
    expect(moneyText('0.10')).toBe('0.10');
    expect(unitDecimal('0.000001')).toBe('0.000001');
    expect(unitDecimal('999999999.123456', true)).toBe('999999999.123456');
    for (const value of ['0', '1e3', '0.0000001', '1000000.000001', '-2'])
      expect(() => unitDecimal(value)).toThrow();
    expect(() => moneyText('1.005')).toThrow();
  });
  it('validates file types/size and strips a UTF-8 CSV BOM before upload', async () => {
    await expect(readCatalogueFile(file(csv, 'data.xls'))).rejects.toThrow(/Only/);
    await expect(readCatalogueFile(file('x'.repeat(1000001)))).rejects.toThrow(/1 MB/);
    const parsed = await readCatalogueFile(file('\uFEFF' + csv));
    expect(parsed.csv).toBe(csv);
    expect(parsed.rows[1][0]).toBe('00001');
  });
  it('reads XLSX sheets for mapping and rejects multiple sheets', async () => {
    workbook.mockResolvedValueOnce([
      {
        sheet: 'Products',
        data: [
          ['sku', 'itemName', 'itemDescription', 'unitPrice'],
          ['00001', 'Shirt', 'Cotton', '12.50'],
        ],
      },
    ]);
    expect((await readCatalogueFile(file('xlsx', 'catalogue.xlsx'))).rows[1][0]).toBe('00001');
    workbook.mockResolvedValueOnce([
      { sheet: 'One', data: [] },
      { sheet: 'Two', data: [] },
    ]);
    await expect(readCatalogueFile(file('xlsx', 'catalogue.xlsx'))).rejects.toThrow(/one sheet/);
  });
  it('checks every SKU search page and never accepts a fuzzy match', async () => {
    const read = vi.fn(async (path: string) =>
      path.includes('barcode=')
        ? []
        : path.includes('offset=200')
          ? [variant]
          : Array.from({ length: 200 }, () => ({ ...variant, sku: 'OTHER' })),
    );
    expect((await lookupCatalogueProduct(read, 'blue-01')).itemId).toBe(variantId);
    expect(read).toHaveBeenCalledTimes(3);
    await expect(lookupCatalogueProduct(async () => [], 'unknown')).rejects.toThrow(/No active/);
  });
});

type Call = { path: string; method: string; body: Record<string, unknown> | FormData };
function backend({
  role = 'OWNER',
  restricted = false,
  badRows = false,
  uncertainCommit = false,
  createLost = false,
  noBranches = false,
} = {}) {
  const calls: Call[] = [];
  let products: Product[] = [
    {
      ...variant,
      itemId: parentId,
      sku: 'SHIRT',
      itemName: 'Shirt family',
      productKind: 'PARENT',
      parentId: null,
      variantKey: null,
      barcode: null,
    },
    variant,
    {
      ...variant,
      itemId: simpleId,
      sku: 'SIMPLE',
      itemName: 'Simple product',
      productKind: 'SIMPLE',
      parentId: null,
      variantKey: null,
      barcode: null,
    },
  ];
  const units = [{ code: 'EACH', factor: '1', purchase_allowed: 1, sale_allowed: 1 }];
  let status = 'PREVIEW';
  let commits = 0;
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, options: RequestInit) => {
      const requestUrl = new URL(url);
      const path = requestUrl.pathname;
      const method = options.method || 'GET';
      const body =
        options.body instanceof FormData
          ? options.body
          : options.body
            ? JSON.parse(String(options.body))
            : {};
      calls.push({ path, method, body });
      let value: unknown = [];
      if (path.endsWith('/login')) value = grant;
      else if (path.endsWith('/me'))
        value = {
          ...snapshot,
          role,
          memberships: [{ ...snapshot.memberships[0], role, all_branches: restricted ? 0 : 1 }],
        };
      else if (path === '/api/business')
        value = { id: 2, name: 'Auto Parts', currency: 'JMD', default_threshold: 3 };
      else if (path === '/api/v1/branches')
        value = noBranches ? [] : [{ id: 7, name: 'Main', active: 1 }];
      else if (path === '/api/products') {
        if (method === 'POST') {
          if (createLost) throw new TypeError('Connection lost');
          value = { ...variant, ...body, itemId: 'new-product' };
        } else
          value = requestUrl.searchParams.has('barcode')
            ? products.filter((p) => p.barcode === requestUrl.searchParams.get('barcode'))
            : products;
      } else if (/^\/api\/products\/[^/]+$/.test(path)) {
        const id = path.split('/').pop();
        value = products.find((p) => p.itemId === id);
        if (method === 'PUT') {
          value = { ...(value as object), ...body };
          products = products.map((p) => (p.itemId === id ? (value as typeof p) : p));
        }
      } else if (path.endsWith('/barcode')) {
        products = products.map((p) => (p.itemId === simpleId ? { ...p, barcode: 'ORV-QA' } : p));
        value = { barcode: 'ORV-QA', namespace: 'ORVEXA_INTERNAL' };
      } else if (path.endsWith('/units')) {
        if (method === 'POST')
          units.push({
            code: body.code,
            factor: body.factor,
            purchase_allowed: +body.purchaseAllowed,
            sale_allowed: +body.saleAllowed,
          });
        value = units;
      } else if (path.endsWith('/convert')) value = { baseQuantity: 6, productId: variantId };
      else if (path.endsWith('/tracking'))
        value = { id: variantId, batch_tracked: body.enabled ? 1 : 0 };
      else if (path.endsWith('/label'))
        return new Response('PNG-test', { headers: { 'Content-Type': 'image/png' } });
      else if (path.includes('/catalogue/imports')) {
        if (path.endsWith('/commit')) {
          commits++;
          if (uncertainCommit && commits === 1) throw new TypeError('Connection lost');
          status = 'COMMITTED';
        }
        value = {
          id: jobId,
          status,
          duplicate_policy: 'REJECT',
          created_ms: Date.now(),
          committed_ms: status === 'COMMITTED' ? Date.now() : null,
          rows: [
            {
              row_number: 2,
              disposition: badRows ? 'ERROR' : 'CREATE',
              error: badRows ? 'Invalid fields or duplicate code' : null,
            },
          ],
        };
      }
      return new Response(JSON.stringify(value));
    }),
  );
  return calls;
}
function mount() {
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <MemoryRouter initialEntries={['/login']}>
        <AuthProvider>
          <App />
        </AuthProvider>
      </MemoryRouter>
    </QueryClientProvider>,
  );
  return userEvent.setup();
}
async function login(user: ReturnType<typeof mount>) {
  await user.type(screen.getByLabelText('Email address'), 'owner@test.local');
  await user.type(screen.getByLabelText('Password', { exact: true }), 'example-password');
  await user.click(screen.getByRole('button', { name: 'Sign in to workspace' }));
  await user.click(await screen.findByRole('link', { name: 'Products' }));
  await within(screen.getByRole('main')).findByRole('link', { name: /^Shirt family/ });
}
async function openVariant(user: ReturnType<typeof mount>) {
  await user.click(screen.getByRole('link', { name: /^Blue shirt/ }));
  await screen.findByRole('heading', { name: 'Purchase and sale units' });
}
async function importPage(user: ReturnType<typeof mount>) {
  await user.click(screen.getByRole('link', { name: 'Import catalogue' }));
  await screen.findByRole('heading', { name: 'Bring your products into Orvexa' });
}
async function preview(user: ReturnType<typeof mount>) {
  await user.upload(screen.getByLabelText('Catalogue file'), file(csv));
  await screen.findByRole('heading', { name: '2. Map your columns' });
  for (const [field, source] of Object.entries({
    sku: 'Code',
    itemName: 'Name',
    itemDescription: 'Description',
    unitPrice: 'Price',
  }))
    await user.selectOptions(screen.getByLabelText(`${field} *`), source);
  await user.click(screen.getByRole('button', { name: 'Validate and save preview' }));
  await screen.findByRole('heading', { name: '4. Commit the saved preview' });
}
beforeEach(() => {
  const NativeURL = URL;
  vi.stubGlobal(
    'URL',
    class extends NativeURL {
      static createObjectURL = vi.fn(() => 'blob:test-label');
      static revokeObjectURL = vi.fn();
    },
  );
});
describe('F3 product workflows', () => {
  it('uses a new command for each confirmed tracking change, including a later return to the same mode', async () => {
    const calls = backend();
    const user = mount();
    await login(user);
    await openVariant(user);
    for (const mode of ['true', 'false', 'true']) {
      await user.selectOptions(screen.getByLabelText('Requested tracking mode'), mode);
      await user.click(screen.getByRole('button', { name: 'Set tracking mode' }));
      await waitFor(() =>
        expect(screen.getByRole('button', { name: 'Set tracking mode' })).toBeEnabled(),
      );
    }
    const writes = calls.filter((c) => c.path.endsWith('/tracking'));
    expect(writes).toHaveLength(3);
    expect(writes[0].body).not.toEqual(writes[2].body);
  });
  it('creates a variant under its parent and keeps decimal request text', async () => {
    const calls = backend();
    const user = mount();
    await login(user);
    await user.click(screen.getByRole('link', { name: /^Shirt family/ }));
    await user.click(await screen.findByRole('button', { name: 'Add variant' }));
    const dialog = screen.getByRole('dialog');
    await user.type(within(dialog).getByLabelText(/^Variant key/), 'RED');
    await user.type(within(dialog).getByLabelText('Product name'), 'Red shirt');
    await user.type(within(dialog).getByLabelText('SKU'), 'RED-01');
    await user.clear(within(dialog).getByLabelText('Selling price'));
    await user.type(within(dialog).getByLabelText('Selling price'), '0.10');
    await user.type(within(dialog).getByLabelText('Description'), 'Red cotton shirt');
    await user.click(within(dialog).getByRole('button', { name: 'Create product' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(
      calls.find((c) => c.path === '/api/products' && c.method === 'POST')?.body,
    ).toMatchObject({ productKind: 'VARIANT', parentId, variantKey: 'RED', unitPrice: '0.10' });
  });
  it('keeps variant/base-unit identity fixed during an edit', async () => {
    const calls = backend();
    const user = mount();
    await login(user);
    await openVariant(user);
    await user.click(screen.getByRole('button', { name: 'Edit product' }));
    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByLabelText(/^Product type/)).toBeDisabled();
    expect(within(dialog).getByLabelText(/^Base unit/)).toHaveAttribute('readonly');
    expect(within(dialog).getByLabelText(/^Variant key/)).toHaveAttribute('readonly');
    await user.clear(within(dialog).getByLabelText('Selling price'));
    await user.type(within(dialog).getByLabelText('Selling price'), '15.25');
    await user.click(within(dialog).getByRole('button', { name: 'Save product' }));
    await waitFor(() =>
      expect(
        calls.find((c) => c.path === `/api/products/${variantId}` && c.method === 'PUT'),
      ).toBeTruthy(),
    );
    expect(
      calls.find((c) => c.path === `/api/products/${variantId}` && c.method === 'PUT')?.body,
    ).toMatchObject({
      parentId,
      variantKey: 'BLUE',
      unitOfMeasure: 'EACH',
      productKind: 'VARIANT',
      unitPrice: '15.25',
    });
  });
  it('adds a conversion factor and displays the server conversion result', async () => {
    const calls = backend();
    const user = mount();
    await login(user);
    await openVariant(user);
    await user.type(screen.getByLabelText('Unit code'), 'CASE_12');
    await user.type(screen.getByLabelText('Base units per conversion unit'), '12');
    await user.click(screen.getByRole('button', { name: 'Add unit' }));
    await screen.findByText('Conversion unit saved.');
    await user.selectOptions(screen.getByLabelText('Conversion unit'), 'CASE_12');
    await user.clear(screen.getByLabelText('Conversion quantity'));
    await user.type(screen.getByLabelText('Conversion quantity'), '0.5');
    await user.click(screen.getByRole('button', { name: 'Check conversion' }));
    expect(await screen.findByText(/0.5 CASE_12/)).toHaveTextContent('6 EACH');
    expect(calls.find((c) => c.path.endsWith('/convert'))?.body).toMatchObject({
      quantity: '0.5',
      unit: 'CASE_12',
      purpose: 'PURCHASE',
    });
  });
  it('keeps manufacturer barcodes and loads the authenticated label preview', async () => {
    const calls = backend();
    const user = mount();
    await login(user);
    await openVariant(user);
    expect(
      screen.queryByRole('button', { name: 'Generate internal barcode' }),
    ).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Preview label' }));
    expect(await screen.findByRole('img', { name: /CODE128 label/ })).toHaveAttribute(
      'src',
      'blob:test-label',
    );
    expect(calls.find((c) => c.path.endsWith('/label'))?.method).toBe('GET');
  });
  it('generates a missing internal barcode without implying GS1 issuance', async () => {
    const calls = backend();
    const user = mount();
    await login(user);
    await user.click(screen.getByRole('link', { name: /^Simple product/ }));
    await user.click(await screen.findByRole('button', { name: 'Generate internal barcode' }));
    await screen.findByText('Current code: ORV-QA');
    expect(screen.getByText(/not GS1-registered GTINs/)).toBeInTheDocument();
    expect(calls.filter((c) => c.path.endsWith('/barcode') && c.method === 'POST')).toHaveLength(1);
  });
  it('requires all-branch access for tracking and shows no fabricated current flag', async () => {
    backend({ role: 'MANAGER', restricted: true });
    const user = mount();
    await login(user);
    await openVariant(user);
    expect(screen.queryByRole('button', { name: 'Set tracking mode' })).not.toBeInTheDocument();
    expect(screen.getByText(/Current mode is unavailable here/)).toBeInTheDocument();
  });
  it('opens a leading-zero barcode with an Enter-terminated scan', async () => {
    backend();
    const user = mount();
    await login(user);
    await user.type(screen.getByLabelText('Scan catalogue SKU or barcode'), '001234{Enter}');
    await screen.findByRole('heading', { name: 'Blue shirt' });
  });
  it('blocks repeated creation after a lost non-idempotent response', async () => {
    const calls = backend({ createLost: true });
    const user = mount();
    await login(user);
    await user.click(screen.getByRole('button', { name: 'Add product' }));
    const dialog = screen.getByRole('dialog');
    await user.type(within(dialog).getByLabelText('Product name'), 'New item');
    await user.type(within(dialog).getByLabelText('SKU'), 'NEW');
    await user.type(within(dialog).getByLabelText('Description'), 'New description');
    await user.click(within(dialog).getByRole('button', { name: 'Create product' }));
    await within(dialog).findByText(/create result is uncertain/);
    expect(within(dialog).getByRole('button', { name: 'Create product' })).toBeDisabled();
    expect(calls.filter((c) => c.path === '/api/products' && c.method === 'POST')).toHaveLength(1);
  });
});
describe('F3 import workflows', () => {
  it('creates a fresh validation command after a confirmed preview so duplicate decisions are recomputed', async () => {
    const calls = backend();
    const user = mount();
    await login(user);
    await importPage(user);
    await preview(user);
    await user.click(screen.getByRole('button', { name: 'Validate and save preview' }));
    await waitFor(() =>
      expect(calls.filter((c) => c.path.endsWith('/imports/csv'))).toHaveLength(2),
    );
    const posts = calls.filter((c) => c.path.endsWith('/imports/csv'));
    expect((posts[0].body as { options: { requestId: string } }).options.requestId).not.toBe(
      (posts[1].body as { options: { requestId: string } }).options.requestId,
    );
  });
  it('uploads XLSX as a file and application/json options parts', async () => {
    workbook.mockResolvedValueOnce([
      {
        sheet: 'Products',
        data: [
          ['sku', 'itemName', 'itemDescription', 'unitPrice'],
          ['00001', 'Shirt', 'Cotton', '12.50'],
        ],
      },
    ]);
    const calls = backend();
    const user = mount();
    await login(user);
    await importPage(user);
    await user.upload(screen.getByLabelText('Catalogue file'), file('xlsx', 'products.xlsx'));
    await screen.findByRole('heading', { name: '2. Map your columns' });
    await user.click(screen.getByRole('button', { name: 'Validate and save preview' }));
    await screen.findByRole('heading', { name: '4. Commit the saved preview' });
    const body = calls.find((c) => c.path.endsWith('/imports/xlsx'))?.body as FormData;
    expect((body.get('file') as File).name).toBe('products.xlsx');
    expect((body.get('options') as Blob).type).toBe('application/json');
  });
  it('maps columns and preserves source values until explicit commit', async () => {
    const calls = backend();
    const user = mount();
    await login(user);
    await importPage(user);
    await preview(user);
    expect(calls.some((c) => c.path.endsWith('/commit'))).toBe(false);
    const body = calls.find((c) => c.path.endsWith('/imports/csv'))?.body as Record<
      string,
      unknown
    >;
    expect(body.csv).toBe(csv);
    expect(body.options).toMatchObject({
      duplicatePolicy: 'REJECT',
      mapping: { sku: 'Code', unitPrice: 'Price' },
    });
    await user.click(
      screen.getByLabelText('I reviewed this saved preview and its duplicate policy'),
    );
    await user.click(screen.getByRole('button', { name: 'Commit saved preview' }));
    await screen.findByText(/server confirms this import is committed/);
    expect(calls.filter((c) => c.path.endsWith('/commit'))).toHaveLength(1);
  });
  it('keeps invalid row results visible and prevents every commit', async () => {
    const calls = backend({ badRows: true });
    const user = mount();
    await login(user);
    await importPage(user);
    await preview(user);
    expect(screen.getByText('Invalid fields or duplicate code')).toBeInTheDocument();
    await user.click(
      screen.getByLabelText('I reviewed this saved preview and its duplicate policy'),
    );
    expect(screen.getByRole('button', { name: 'Commit saved preview' })).toBeDisabled();
    expect(calls.some((c) => c.path.endsWith('/commit'))).toBe(false);
  });
  it('reloads an uncertain commit before retrying the same command ID', async () => {
    const calls = backend({ uncertainCommit: true });
    const user = mount();
    await login(user);
    await importPage(user);
    await preview(user);
    await user.click(
      screen.getByLabelText('I reviewed this saved preview and its duplicate policy'),
    );
    await user.click(screen.getByRole('button', { name: 'Commit saved preview' }));
    await screen.findByText(/commit outcome is uncertain/);
    expect(screen.getByRole('button', { name: 'Commit saved preview' })).toBeDisabled();
    await user.click(screen.getByRole('button', { name: 'Reload saved status' }));
    await waitFor(() =>
      expect(screen.queryByText(/commit outcome is uncertain/)).not.toBeInTheDocument(),
    );
    await user.click(screen.getByRole('button', { name: 'Commit saved preview' }));
    await screen.findByText(/server confirms this import is committed/);
    const commits = calls.filter((c) => c.path.endsWith('/commit'));
    expect(commits).toHaveLength(2);
    expect(commits[0].body).toEqual(commits[1].body);
  });
  it('resumes a saved job without requiring the source file again', async () => {
    backend();
    const user = mount();
    await login(user);
    await importPage(user);
    await user.type(screen.getByLabelText('Saved import ID'), jobId);
    await user.click(screen.getByRole('button', { name: 'Load saved import' }));
    await screen.findByRole('heading', { name: '4. Commit the saved preview' });
    expect(screen.queryByRole('heading', { name: '2. Map your columns' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Commit saved preview' })).toBeDisabled();
  });
  it('keeps catalogue import available without an active branch', async () => {
    backend({ noBranches: true });
    const user = mount();
    await login(user);
    await importPage(user);
    expect(screen.getByLabelText('Catalogue file')).toBeEnabled();
  });
});
