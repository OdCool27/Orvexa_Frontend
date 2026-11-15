import { describe, expect, it, vi } from 'vitest';
import { ApiError, CommandIds, query, request } from '../api/client';
import { date, majorToCents, money } from '../lib/format';

describe('HTTP contracts', () => {
  it('keeps public tokens separate from employee credentials', async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValue(new Response(JSON.stringify({ id: 'order' }), { status: 200 }));
    vi.stubGlobal('fetch', fetcher);
    await request('/api/storefront/1/orders/order', { token: 'private-order-token' });
    const options = fetcher.mock.calls[0][1];
    expect(options.headers.get('X-Order-Token')).toBe('private-order-token');
    expect(options.headers.has('Authorization')).toBe(false);
    expect(options.credentials).toBe('omit');
  });
  it('sends explicit employee auth and JSON without inventing fields', async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response('{}'));
    vi.stubGlobal('fetch', fetcher);
    await request('/api/products', {
      method: 'POST',
      authorization: 'Bearer test-session',
      body: { itemName: 'Filter' },
    });
    const options = fetcher.mock.calls[0][1];
    expect(options.headers.get('Authorization')).toBe('Bearer test-session');
    expect(JSON.parse(options.body)).toEqual({ itemName: 'Filter' });
    expect(options.headers.has('X-Order-Token')).toBe(false);
  });
  it('accepts 204 and empty successful controller bodies', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValueOnce(new Response(null, { status: 204 }))
        .mockResolvedValueOnce(new Response('')),
    );
    expect(await request('/delete')).toBeUndefined();
    expect(await request('/link')).toBeUndefined();
  });
  it('reads receipt/CSV downloads as blobs', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue(
          new Response('SIMULATED RECEIPT', { headers: { 'Content-Type': 'text/plain' } }),
        ),
    );
    const blob = await request<Blob>('/receipt', { download: true });
    expect(await blob.text()).toBe('SIMULATED RECEIPT');
  });
  it('preserves ProblemDetail errors and conflict status', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue(
          new Response(
            JSON.stringify({ detail: 'Stock changed', errors: ['quantity: positive required'] }),
            { status: 409 },
          ),
        ),
    );
    await expect(request('/count')).rejects.toMatchObject({
      status: 409,
      message: 'Stock changed',
      fields: ['quantity: positive required'],
    });
  });
  it('handles security responses that have no JSON', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('', { status: 403 })));
    await expect(request('/restricted')).rejects.toMatchObject({
      status: 403,
      message: 'Your role cannot perform this action.',
    });
  });
  it('reports network uncertainty without automatically repeating a command', async () => {
    const fetcher = vi.fn().mockRejectedValue(new TypeError('Failed to fetch'));
    vi.stubGlobal('fetch', fetcher);
    await expect(request('/checkout', { method: 'POST' })).rejects.toBeInstanceOf(ApiError);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it('supports query encoding', () => {
    expect(
      query({ search: 'a&b', category: '', offset: 0, lowStock: false, locationId: undefined }),
    ).toBe('?search=a%26b&offset=0&lowStock=false');
  });
  it('preserves server correlation and rate-limit metadata, without retrying', async () => {
    const fetcher = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          detail: 'Try later',
          code: 'RATE_LIMITED',
          requestId: 'server-reference',
        }),
        { status: 429, headers: { 'Retry-After': '900' } },
      ),
    );
    vi.stubGlobal('fetch', fetcher);
    await expect(
      request('/api/v1/auth/login', {
        method: 'POST',
        body: { email: 'demo@test.local', password: 'example-password' },
      }),
    ).rejects.toMatchObject({
      status: 429,
      code: 'RATE_LIMITED',
      requestId: 'server-reference',
      retryAfter: '900',
    });
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(fetcher.mock.calls[0][1].headers.get('X-Request-ID')).toMatch(/^[0-9a-f-]{36}$/);
  });
  it('leaves multipart boundaries to the browser', async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response('{}'));
    vi.stubGlobal('fetch', fetcher);
    const body = new FormData();
    body.append('file', new Blob(['file']), 'catalogue.xlsx');
    await request('/api/v1/catalogue/imports/xlsx', { method: 'POST', body });
    expect(fetcher.mock.calls[0][1].body).toBe(body);
    expect(fetcher.mock.calls[0][1].headers.has('Content-Type')).toBe(false);
  });
  it('rejects mixed customer and employee authorization before sending', async () => {
    const fetcher = vi.fn();
    vi.stubGlobal('fetch', fetcher);
    await expect(
      request('/api/orders', { authorization: 'Bearer employee', token: 'customer' }),
    ).rejects.toThrow('cannot share');
    expect(fetcher).not.toHaveBeenCalled();
  });
  it('does not send writes while the browser reports offline', async () => {
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
    const fetcher = vi.fn();
    vi.stubGlobal('fetch', fetcher);
    await expect(request('/api/orders', { method: 'POST', body: {} })).rejects.toMatchObject({
      code: 'OFFLINE',
    });
    expect(fetcher).not.toHaveBeenCalled();
  });
  it('preserves cancellation rather than reporting a connection failure', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new DOMException('Cancelled', 'AbortError')));
    await expect(
      request('/api/products', { signal: new AbortController().signal }),
    ).rejects.toMatchObject({ name: 'AbortError' });
  });
  it('handles null and nonstring problem payloads safely', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValueOnce(new Response('null', { status: 503 }))
        .mockResolvedValueOnce(
          new Response('{"detail":{},"errors":["valid",null,1]}', { status: 400 }),
        ),
    );
    await expect(request('/api/products')).rejects.toMatchObject({ status: 503 });
    await expect(request('/api/products')).rejects.toMatchObject({
      fields: ['valid'],
      message: 'Request failed (400).',
    });
  });
});
describe('command and presentation boundaries', () => {
  it('retains command IDs for retries and changes IDs for a new action', () => {
    const ids = new CommandIds();
    const one = ids.for({ order: '1', action: 'PAY', successful: true });
    expect(ids.for({ order: '1', action: 'PAY', successful: true })).toBe(one);
    expect(ids.for({ order: '1', action: 'CANCEL' })).not.toBe(one);
    ids.clear();
    expect(ids.for({ order: '1', action: 'PAY', successful: true })).not.toBe(one);
  });
  it('converts catalog major units without rounding errors and rejects unsupported amounts', () => {
    expect(majorToCents('0.29')).toBe(29);
    expect(majorToCents(1234.5)).toBe(123450);
    expect(() => majorToCents('1.001')).toThrow();
    expect(() => majorToCents(-2)).toThrow();
    expect(money(123450, 'JMD')).toContain('1,234.50');
  });
  it('interprets SQLite timestamps as UTC', () => {
    expect(date('2026-11-13 12:30:00.000')).toBe(date('2026-11-13T12:30:00.000Z'));
    expect(date(null)).toBe('—');
  });
});
