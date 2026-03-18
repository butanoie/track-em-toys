import { z } from 'zod';
import { authStore } from './auth-store';
import { ApiErrorSchema, TokenResponseSchema } from './zod-schemas';

export const API_BASE = import.meta.env.VITE_API_URL ?? 'http://localhost:3000';

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly body: { error: string }
  ) {
    super(body.error);
    this.name = 'ApiError';
  }
}

// Shared refresh mutex — prevents multiple simultaneous refresh calls.
// Used by both attemptRefresh (React Strict Mode double-mount) and the
// apiFetch 401 interceptor. Without this, concurrent calls send duplicate
// POST /auth/refresh requests that trigger server-side token reuse detection,
// which revokes ALL refresh tokens for the user.
let refreshPromise: Promise<boolean> | null = null;

export async function attemptRefresh(): Promise<boolean> {
  if (refreshPromise) return refreshPromise;

  refreshPromise = doRefresh().finally(() => {
    refreshPromise = null;
  });
  return refreshPromise;
}

async function doRefresh(): Promise<boolean> {
  try {
    const response = await fetch(`${API_BASE}/auth/refresh`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      // Empty body: the refresh token comes from the httpOnly cookie.
      // An explicit {} body + Content-Type is required so Fastify's AJV schema
      // validation (type: 'object') passes. A truly body-less POST results in
      // request.body = undefined, which fails AJV validation with 400 before
      // the route handler can read the cookie.
      body: '{}',
    });

    if (!response.ok) {
      return false;
    }

    const json: unknown = await response.json();
    const parsed = TokenResponseSchema.parse(json);
    authStore.setToken(parsed.access_token);
    return true;
  } catch {
    return false;
  }
}

function buildHeaders(url: string, init?: RequestInit): Headers {
  const headers = new Headers(init?.headers);

  // Set Content-Type on POST/PUT/PATCH requests only when a body is present
  if (
    init?.method &&
    ['POST', 'PUT', 'PATCH'].includes(init.method.toUpperCase()) &&
    init.body !== undefined &&
    !headers.has('Content-Type')
  ) {
    headers.set('Content-Type', 'application/json');
  }

  // Attach access token to all requests except auth endpoints
  const isAuthEndpoint = url.includes('/auth/signin') || url.includes('/auth/refresh');

  if (!isAuthEndpoint) {
    const token = authStore.getToken();
    if (token) {
      headers.set('Authorization', `Bearer ${token}`);
    }
  }

  return headers;
}

async function baseFetch(url: string, init?: RequestInit): Promise<Response> {
  return fetch(url, {
    ...init,
    credentials: 'include',
    headers: buildHeaders(url, init),
  });
}

export async function apiFetch(url: string, init?: RequestInit): Promise<Response> {
  const fullUrl = url.startsWith('http') ? url : `${API_BASE}${url}`;
  const response = await baseFetch(fullUrl, init);

  // Handle 401 with refresh — but not for /auth/refresh itself (avoid infinite loop)
  if (response.status === 401 && !fullUrl.includes('/auth/refresh')) {
    const refreshed = await attemptRefresh();
    if (refreshed) {
      return baseFetch(fullUrl, init);
    }

    // Refresh failed — notify AuthProvider via event so it can clear state and
    // navigate via the SPA router. Return a never-resolving promise so callers
    // are not handed the 401 response (the page will be replaced by navigation).
    window.dispatchEvent(new CustomEvent('auth:sessionexpired'));
    return new Promise<Response>(() => {
      /* intentionally pending */
    });
  }

  return response;
}

// Extract and throw a structured ApiError from a non-2xx response.
// Shared by apiFetchJson and callers handling void responses (e.g., 204 DELETE).
export async function throwApiError(response: Response): Promise<never> {
  let body: { error: string };
  try {
    const raw: unknown = await response.json();
    const parsed = ApiErrorSchema.safeParse(raw);
    body = parsed.success ? parsed.data : { error: `HTTP ${response.status}` };
  } catch {
    body = { error: `HTTP ${response.status}` };
  }
  throw new ApiError(response.status, body);
}

// Convenience method that throws ApiError on non-2xx responses.
// Requires a Zod schema to validate the response body before returning.
export async function apiFetchJson<T>(url: string, schema: z.ZodType<T>, init?: RequestInit): Promise<T> {
  const response = await apiFetch(url, init);

  if (!response.ok) {
    await throwApiError(response);
  }

  const json: unknown = await response.json();
  return schema.parse(json);
}
