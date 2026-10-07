
import { store } from '../store';
import { logout } from '../store/authSlice';

/**
 * Call when a service answers 401. `sentToken` is the Bearer token THAT request
 * carried. A late 401 from an older token (we have since renewed or signed in
 * again) is ignored, so it cannot kill the newer session.
 * Logging out shows LoginPage automatically — no redirect.
 */
export function handleUnauthorized(sentToken: string | null | undefined): void {
  const current = store.getState().auth.accessToken;
  if (!current) return;
  if (sentToken && sentToken !== current) return;
  store.dispatch(logout());
}
