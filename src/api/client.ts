export const API_BASE = (import.meta.env.VITE_API_BASE_URL || 'http://localhost:8080').replace(
  /\/$/,
  '',
);

export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public fields: string[] = [],
    public code?: string,
    public requestId?: string,
    public retryAfter?: string,
  ) {
    super(message);
  }
}

export function query(values: Record<string, string | number | boolean | undefined | null>) {
  const params = new URLSearchParams();
  Object.entries(values).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') params.set(key, String(value));
  });
  return params.size ? `?${params}` : '';
}

// Authentication is supplied explicitly. Public requests never inherit staff credentials.
export async function request<T>(
  path: string,
  options: {
    method?: string;
    body?: unknown;
    authorization?: string;
    token?: string;
    signal?: AbortSignal;
    download?: boolean;
  } = {},
): Promise<T> {
  if (!path.startsWith('/') || path.startsWith('//')) {
    throw new ApiError('The API request path must be relative to the configured server.', 0);
  }
  if (options.authorization && options.token) {
    throw new ApiError('Employee sessions and customer order access cannot share a request.', 0);
  }
  const method = options.method || 'GET';
  if (typeof navigator !== 'undefined' && !navigator.onLine && method !== 'GET') {
    throw new ApiError(
      'You are offline. No changes were sent. Reconnect before continuing.',
      0,
      [],
      'OFFLINE',
    );
  }
  const headers = new Headers({ Accept: options.download ? '*/*' : 'application/json' });
  headers.set('X-Request-ID', crypto.randomUUID());
  if (options.authorization) headers.set('Authorization', options.authorization);
  if (options.token) headers.set('X-Order-Token', options.token);
  const multipart = options.body instanceof FormData;
  if (options.body !== undefined && !multipart) headers.set('Content-Type', 'application/json');
  let response: Response;
  try {
    response = await fetch(`${API_BASE}${path}`, {
      method,
      headers,
      body:
        options.body === undefined
          ? undefined
          : multipart
            ? (options.body as FormData)
            : JSON.stringify(options.body),
      signal: options.signal,
      credentials: 'omit',
    });
  } catch (error) {
    if (
      options.signal?.aborted ||
      (error && typeof error === 'object' && 'name' in error && error.name === 'AbortError')
    )
      throw error;
    throw new ApiError(
      'Cannot reach the server. Check that Spring is running and the API origin is allowed by CORS.',
      0,
    );
  }
  if (!response.ok) {
    const fallback =
      (
        {
          401: 'Please sign in again. Your credentials may be invalid or your account may be inactive.',
          403: 'Your role cannot perform this action.',
          404: 'This record is unavailable or inaccessible.',
          409: 'The record or stock changed. Refresh and review before continuing.',
          429: 'Too many requests. Wait before trying again.',
          503: 'The server is temporarily unavailable. Review the result before retrying a change.',
        } as Record<number, string>
      )[response.status] || `Request failed (${response.status}).`;
    const payload: unknown = await response.json().catch(() => null);
    const problem =
      payload && typeof payload === 'object' ? (payload as Record<string, unknown>) : {};
    throw new ApiError(
      typeof problem.detail === 'string' ? problem.detail : fallback,
      response.status,
      Array.isArray(problem.errors)
        ? problem.errors.filter((e): e is string => typeof e === 'string')
        : [],
      typeof problem.code === 'string' ? problem.code : undefined,
      typeof problem.requestId === 'string'
        ? problem.requestId
        : response.headers.get('X-Request-ID') || undefined,
      response.headers.get('Retry-After') || undefined,
    );
  }
  if (options.download) return (await response.blob()) as T;
  if (response.status === 204) return undefined as T;
  const text = await response.text();
  return (text ? JSON.parse(text) : undefined) as T;
}

export function saveDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// The same logical command retains its ID and payload across uncertain network retries.
export class CommandIds {
  private entries = new Map<string, string>();
  for(payload: unknown) {
    const key = JSON.stringify(payload);
    if (!this.entries.has(key)) this.entries.set(key, crypto.randomUUID());
    return this.entries.get(key)!;
  }
  clear() {
    this.entries.clear();
  }
}
