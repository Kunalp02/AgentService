
import type { IntrospectResponse, LoginRequest, LoginResponse } from '../types/auth';
import { serviceUrl } from '../config/api';

async function parseJsonSafe<T>(response: Response): Promise<T | null> {
  const text = await response.text();
  if (!text) return null;
  try { return JSON.parse(text) as T; } catch { return null; }
}

export class AuthLoginError extends Error {
  code?: string;
  constructor(message: string, code?: string) { super(message); this.name = 'AuthLoginError'; this.code = code; }
}

export class AuthRefreshError extends Error {
  status: number;
  constructor(message: string, status: number) { super(message); this.name = 'AuthRefreshError'; this.status = status; }
}
function messageOf(body: Record<string, unknown> | null): string | undefined {
  const candidates = body ? [body.Code, body.code, body.Message, body.message, body.title, body.error, body.detail] : [];
  return candidates.find((v): v is string => typeof v === 'string');
}

export const authApi = {
  login: async (username: string, password: string): Promise<LoginResponse> => {
    const response = await fetch(serviceUrl('auth', '/api/v1/auth/login'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password } satisfies LoginRequest),
    });
    if (!response.ok) {
      const body = await parseJsonSafe<Record<string, unknown>>(response);
      throw new AuthLoginError(messageOf(body) || `Login failed (${response.status}).`, String(body?.Code ?? body?.code ?? ''));
    }
    const data = await parseJsonSafe<LoginResponse>(response);
    if (!data?.accessToken || !data.user) throw new AuthLoginError('Unexpected response from authentication server.');
    return data;
  },
  logout: async (token: string | null) => {
    if (!token) return;
    try { await fetch(serviceUrl('auth', '/api/v1/auth/logout'), { method: 'POST', headers: { Authorization: `Bearer ${token}` } }); } catch {}
  },
  introspect: async (token: string): Promise<IntrospectResponse | null> => {
    const response = await fetch(serviceUrl('auth', '/api/v1/auth/introspect'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ token }),
    });
    if (response.status === 204) return null;
    if (!response.ok) throw new Error(`Session validation failed (${response.status}).`);
    const data = await parseJsonSafe<IntrospectResponse>(response);
    if (!data) throw new Error('Unexpected response from authentication server.');
    return data;
  },
  me: async (token: string) => {
    const response = await fetch(serviceUrl('auth', '/api/v1/auth/me'), { headers: { Authorization: `Bearer ${token}` } });
    if (!response.ok) throw new Error(`Failed to load current user (${response.status}).`);
    return parseJsonSafe(response);
  },
  refreshToken: async (
    username: string,
    currentToken: string,
  ): Promise<{ accessToken: string; expiresIn?: number }> => {
    let response: Response;
    try {
      response = await fetch(serviceUrl('auth', '/api/v1/auth/refresh-token'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${currentToken}` },
        body: JSON.stringify({ username }),
      });
    } catch {
      throw new AuthRefreshError('Network error while renewing the session.', 0);
    }
    if (!response.ok) throw new AuthRefreshError(`Refresh failed (${response.status}).`, response.status);
    const data = await parseJsonSafe<{ accessToken: string; expiresIn?: number }>(response);
    if (!data?.accessToken) throw new AuthRefreshError('Unexpected refresh response.', 0);
    return data;
  },
};
