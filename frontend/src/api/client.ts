
import type {} from 'redux-persist';
import { authTokenStore } from './authTokenStore';
import { serviceUrl } from '../config/api';
import { store } from '../store';
import { logout as logoutAction } from '../store/authSlice';
import { handleUnauthorized } from './sessionGuard';

export class ApiError extends Error {
  status: number;
  body: unknown;
  constructor(message: string, status: number, body?: unknown) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.body = body;
  }
}

function getAuthToken() {
  return authTokenStore.get() || (import.meta.env.VITE_DEV_BEARER_TOKEN as string | undefined) || null;
}

interface RequestOptions extends Omit<RequestInit, 'body'> {
  body?: unknown;
}

/** Pulls the most useful sentence out of an ApiError / ProblemDetails / FluentValidation body. */
function messageFrom(body: Record<string, unknown>, status: number): string {
  const base =
    [body.message, body.Message, body.detail, body.Detail, body.error, body.Error, body.title, body.Title].find(
      (v): v is string => typeof v === 'string' && v.trim().length > 0,
    ) || `Request failed with status ${status}`;

  const errors = body.errors ?? body.Errors;
  if (errors && typeof errors === 'object' && !Array.isArray(errors)) {
    const flat = Object.entries(errors as Record<string, unknown>)
      .map(([field, v]) => `${field}: ${Array.isArray(v) ? v.join(', ') : String(v)}`)
      .join(' · ');
    if (flat) return `${base} ${flat}`;
  }
  return base;
}

async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const token = getAuthToken();
  const res = await fetch(serviceUrl('tools', `/api/v1${path}`), {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers,
    },
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
  });

  if (res.status === 204) return undefined as T;

  const isJson = res.headers.get('content-type')?.includes('json');
  const raw = await res.text();
  let payload: unknown = raw || undefined;
  if (isJson && raw) {
    try {
      payload = JSON.parse(raw);
    } catch {
      /* keep raw text */
    }
  }

  if (!res.ok) {
    const body = payload && typeof payload === 'object' ? (payload as Record<string, unknown>) : {};
    let message = messageFrom(body, res.status);
    if (res.status === 403 && message.startsWith('Request failed')) {
      message = 'You do not have permission to perform this action (403).';
    }
      if (res.status === 401) {
      message = 'Your session has expired or was ended by another sign-in (401). Sign in again.';
      handleUnauthorized(token);
    }
    throw new ApiError(message, res.status, payload);
  }
  return payload as T;
}

export const apiClient = {
  get: <T>(path: string) => request<T>(path, { method: 'GET' }),
  post: <T>(path: string, body?: unknown) => request<T>(path, { method: 'POST', body }),
  put: <T>(path: string, body?: unknown) => request<T>(path, { method: 'PUT', body }),
  delete: <T>(path: string) => request<T>(path, { method: 'DELETE' }),
};
