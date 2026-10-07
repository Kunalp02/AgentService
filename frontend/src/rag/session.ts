
import { store } from '../store';
import { logout as logoutAction } from '../store/authSlice';

export interface Session {
  token: string;
  expiresAt: number;
  username: string;
  displayName: string;
  email: string;
  roleProfile: string;
  groups: string[];
  permissions: string[];
}

/**
 * Returns the current authenticated session.
 */
export function getSession(): Session | null {
  const state = store.getState().auth;

  if (!state.accessToken || !state.user) {
    return null;
  }

  const expiresIn = Number(state.expiresIn || 0);

  return {
    token: state.accessToken,

    // expiresIn is normally a duration in seconds.
    // Convert it to an absolute timestamp.
    expiresAt:
      expiresIn > 0
        ? Date.now() + expiresIn * 1000
        : 0,

    username: state.user.username || '',
    displayName: state.user.displayName || '',
    email: state.user.email || '',
    roleProfile: state.user.roleProfile || '',
    groups: state.groupIds || [],
    permissions: state.permissions || [],
  };
}

/**
 * Session is maintained by Redux authSlice.
 *
 * Kept for backward compatibility with existing imports.
 */
export function setSession(session: Session) {
  if (!session?.token) {
    return;
  }

  const authState = store.getState().auth;

  // If the current Redux session already contains the same token,
  // there is nothing to do.
  if (authState.accessToken === session.token) {
    return;
  }

  // Do NOT silently clear the current authentication here.
  // The actual login/session state should be established by
  // authSlice.loginSuccess / PlatformContext.login().
}

/**
 * Adopt an existing token without destroying the current session.
 *
 * Actual Redux authentication should be performed by authSlice /
 * PlatformContext.login().
 *
 * This function is intentionally kept for backward compatibility.
 */
export function adoptToken(_token: string, _user?: any) {
  // Authentication is managed by Redux authSlice.
  // Do not clear or overwrite the existing token here.
}

/**
 * Clears the authenticated session.
 */
export function clearSession() {
  store.dispatch(logoutAction());
}

/**
 * Returns Authorization header for API requests.
 */
export function authHeaders(): Record<string, string> {
  const token = store.getState().auth.accessToken;

  return token
    ? {
        Authorization: `Bearer ${token}`,
      }
    : {};
}

/**
 * Returns whether the user currently has an access token.
 */
export const isSignedIn = () =>
  !!store.getState().auth.accessToken;

/**
 * Debug/helper hook for the RAG module.
 */
if (typeof window !== 'undefined') {
  (window as any).__ragSession = () => getSession();
}
