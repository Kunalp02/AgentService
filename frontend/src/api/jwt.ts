
/**
 * Decodes a JWT payload without verifying the signature. This is safe to use
 * client-side ONLY for reading claims to pre-fill UI state — the backend is
 * still the actual security boundary on every API call via the Bearer token.
 */
export function decodeJwtPayload<T = Record<string, unknown>>(token: string): T | null {
  try {
    const [, payload] = token.split('.');
    if (!payload) return null;
    const normalized = payload.replace(/-/g, '+').replace(/_/g, '/');
    const padded = normalized.padEnd(normalized.length + (4 - (normalized.length % 4 || 4)) % 4, '=');
    const json = decodeURIComponent(
      atob(padded)
        .split('')
        .map((c) => '%' + c.charCodeAt(0).toString(16).padStart(2, '0'))
        .join('')
    );
    return JSON.parse(json) as T;
  } catch {
    return null;
  }
}

export function isJwtExpired(claims: { exp?: number } | null): boolean {
  if (!claims?.exp) return true;
  return Date.now() >= claims.exp * 1000;
}
