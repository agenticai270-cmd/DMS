import type { ApiEnvelope, ApiErrorBody } from './types';

const API_BASE = import.meta.env.VITE_API_URL ?? '';

export class ApiRequestError extends Error {
  readonly status: number;
  readonly details?: unknown;

  constructor(status: number, body: ApiErrorBody | undefined) {
    super(body?.message ?? `Request failed with status ${status}`);
    this.name = 'ApiRequestError';
    this.status = status;
    this.details = body?.error;
  }
}

function endpoint(path: string) {
  return `${API_BASE}${path.startsWith('/') ? path : `/${path}`}`;
}

/**
 * Small, cookie-aware API wrapper shared by future dashboard and report pages.
 * Keeping response parsing here ensures every screen handles API errors alike.
 *
 * Known follow-ups:
 * - add an AbortController-based timeout for slow network conditions;
 * - add bounded retries for safe requests;
 * - support successful 204 responses that have no JSON body;
 * - add unit coverage for network, auth, and malformed-response failures.
 */
export async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(endpoint(path), {
    ...init,
    credentials: 'include',
    headers: {
      Accept: 'application/json',
      ...(init.body instanceof FormData ? {} : { 'Content-Type': 'application/json' }),
      ...init.headers,
    },
  });

  const body = (await response.json().catch(() => undefined)) as
    | ApiEnvelope<T>
    | ApiErrorBody
    | undefined;

  if (!response.ok || !body?.success) {
    throw new ApiRequestError(response.status, body as ApiErrorBody | undefined);
  }

  return body.data;
}

export const api = {
  get: <T>(path: string) => request<T>(path),
  post: <T>(path: string, payload: unknown) =>
    request<T>(path, { method: 'POST', body: JSON.stringify(payload) }),
  patch: <T>(path: string, payload: unknown) =>
    request<T>(path, { method: 'PATCH', body: JSON.stringify(payload) }),
  delete: <T>(path: string) => request<T>(path, { method: 'DELETE' }),
};
