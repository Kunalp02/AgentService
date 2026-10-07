
import { authTokenStore } from './authTokenStore';
import { serviceUrl } from '../config/api';
import { handleUnauthorized } from './sessionGuard';

export class AuthApiError extends Error {
  status: number; body: unknown;
  constructor(message: string, status: number, body?: unknown) { super(message); this.name = 'AuthApiError'; this.status = status; this.body = body; }
}
interface RequestOptions extends Omit<RequestInit, 'body'> { body?: unknown; }

async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const token = authTokenStore.get();
  const res = await fetch(serviceUrl('auth', path), {
    ...options,
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}), ...options.headers },
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
  });
  if (res.status === 204) return undefined as T;
  const type = res.headers.get('content-type') || '';
  const raw = await res.text();
  let payload: unknown = raw || undefined;
  if (type.includes('json') && raw) { try { payload = JSON.parse(raw); } catch {} }
  if (!res.ok) {
    if (res.status === 401) handleUnauthorized(token);
    const body = payload && typeof payload === 'object' ? payload as Record<string, unknown> : {};
    const message = [body.message, body.Message, body.title, body.error, body.detail].find((v): v is string => typeof v === 'string') || `Request failed with status ${res.status}`;
    throw new AuthApiError(message, res.status, payload);
  }
  return payload as T;
}

export const authApiClient = {
  get: <T>(path: string) => request<T>(path, { method: 'GET' }),
  post: <T>(path: string, body?: unknown) => request<T>(path, { method: 'POST', body }),
  put: <T>(path: string, body?: unknown) => request<T>(path, { method: 'PUT', body }),
  delete: <T>(path: string) => request<T>(path, { method: 'DELETE' }),
};
