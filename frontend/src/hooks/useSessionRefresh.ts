
import { useEffect } from 'react';
import { useSelector } from 'react-redux';
import { store, persistor } from '../store';
import type { RootState } from '../store';
import { refreshSuccess, logout as logoutAction } from '../store/authSlice';
import { authApi, AuthRefreshError } from '../api/auth';
import { decodeJwtPayload } from '../api/jwt';

const ACTIVITY_KEY = 'auth_had_activity';
const LEAD_MS = 5 * 60_000;      // renew this long before expiry
const RETRY_MS = 15_000;         // retry after a network error
const JITTER_MS = 10_000;        // spreads tabs apart so they do not renew together
// company_name -> your company name. Must equal `key` in store/index.ts, with the "persist:" prefix.
const PERSIST_STORAGE_KEY = 'persist:ccil_ai_platform_auth';

type Claims = { exp?: number; iat?: number };
const getAuth = () => store.getState().auth;

// ---------------------------------------------------------------- activity
let lastMark = 0;
function markActivity() {
  const now = Date.now();
  if (now - lastMark < 10_000) return; // do not hit localStorage on every mouse move
  lastMark = now;
  try { localStorage.setItem(ACTIVITY_KEY, '1'); } catch {}
}
function hadActivity(): boolean {
  try { return localStorage.getItem(ACTIVITY_KEY) === '1'; } catch { return true; }
}
function clearActivity() {
  lastMark = 0;
  try { localStorage.removeItem(ACTIVITY_KEY); } catch {}
}

// ------------------------------------------------------------------ expiry
/** ms until the token expires, using the token's own lifetime measured from
    when THIS machine received it (immune to a wrong PC clock). */
function msLeft(token: string, receivedAt: number | null | undefined): number {
  const c = decodeJwtPayload<Claims>(token);
  if (!c?.exp) return Number.POSITIVE_INFINITY;
  if (receivedAt && c.iat) return receivedAt + (c.exp - c.iat) * 1000 - Date.now();
  return c.exp * 1000 - Date.now();
}
function leadFor(token: string): number {
  const c = decodeJwtPayload<Claims>(token);
  const life = c?.exp && c?.iat ? (c.exp - c.iat) * 1000 : 0;
  return life ? Math.min(LEAD_MS, life / 3) : LEAD_MS;
}

// --------------------------------------------------------- cross-tab state
function readPersistedAuth(): { accessToken?: string; userId?: string; receivedAt?: number } | null {
  try {
    const raw = localStorage.getItem(PERSIST_STORAGE_KEY);
    if (!raw) return null;
    const outer = JSON.parse(raw);
    const blob = outer?.auth ? JSON.parse(outer.auth) : null;
    if (!blob) return null;
    return {
      accessToken: blob.accessToken ?? undefined,
      userId: blob.user?.id,
      receivedAt: blob.tokenReceivedAt ?? undefined,
    };
  } catch {
    return null;
  }
}

/** Another tab renewed the token: take it. NEVER into a tab that is not signed
    in (that is what used to overwrite the real session in localStorage), and
    only for the same user. */
function adoptNewerPersisted(): boolean {
  const mine = getAuth();
  if (!mine.accessToken || !mine.user) return false;
  const p = readPersistedAuth();
  if (!p?.accessToken || p.accessToken === mine.accessToken) return false;
  if (p.userId !== mine.user.id) return false;
  const pIat = decodeJwtPayload<Claims>(p.accessToken)?.iat ?? 0;
  const myIat = decodeJwtPayload<Claims>(mine.accessToken)?.iat ?? 0;
  if (pIat <= myIat) return false;
  store.dispatch(refreshSuccess({ accessToken: p.accessToken, receivedAt: p.receivedAt }));
  return true;
}

/** One tab renews at a time (Web Locks needs https or localhost; without it we just run). */
function withLock<T>(fn: () => Promise<T>): Promise<T> {
  const locks = (navigator as any).locks;
  return locks?.request ? locks.request('auth-refresh', fn) : fn();
}

// ------------------------------------------------------------------ renewal
type Outcome = 'done' | 'retry' | 'logout' | 'idle';

function renew(): Promise<Outcome> {
  return withLock<Outcome>(async () => {
    if (adoptNewerPersisted()) return 'done';         // another tab already did it
    const { accessToken, user } = getAuth();
    if (!accessToken || !user?.username) return 'done';
    if (!hadActivity()) return 'idle';
    try {
      const r = await authApi.refreshToken(user.username, accessToken);
      store.dispatch(refreshSuccess({ accessToken: r.accessToken, expiresIn: r.expiresIn }));
      clearActivity();
      await persistor.flush();                         // other tabs must be able to read it before the lock is released
      return 'done';
    } catch (err) {
      if (err instanceof AuthRefreshError && (err.status === 401 || err.status === 403)) {
        return adoptNewerPersisted() ? 'done' : 'logout';
      }
      return 'retry';                                  // network blip / 5xx: do NOT log out
    }
  });
}

let timer: ReturnType<typeof setTimeout> | null = null;
let running = false;

function clearTimer() {
  if (timer) { clearTimeout(timer); timer = null; }
}

function schedule() {
  clearTimer();
  const { accessToken, tokenReceivedAt } = getAuth();
  if (!accessToken) return;
  const left = msLeft(accessToken, tokenReceivedAt);
  if (!Number.isFinite(left)) return;
  const delay = Math.max(0, left - leadFor(accessToken) - Math.random() * JITTER_MS);
  timer = setTimeout(() => void runRenew(), delay);
}

async function runRenew() {
  if (running) return;
  running = true;
  try {
    const before = getAuth().accessToken;
    if (!before) return;
    const outcome = await renew();
    if (outcome === 'idle') {
      await authApi.logout(before);
      store.dispatch(logoutAction());                  // LoginPage renders by itself; no redirect needed
    } else if (outcome === 'logout') {
      store.dispatch(logoutAction());
    } else if (outcome === 'retry') {
      clearTimer();
      timer = setTimeout(() => void runRenew(), RETRY_MS);
    } else {
      schedule();
    }
  } finally {
    running = false;
  }
}

// --------------------------------------------------------------------- hook
export function useSessionRefresh() {
  const accessToken = useSelector((s: RootState) => s.auth.accessToken);

  // user activity
  useEffect(() => {
    const events = ['mousedown', 'keydown', 'scroll', 'click', 'touchstart', 'mousemove'] as const;
    events.forEach((e) => window.addEventListener(e, markActivity, { passive: true }));
    return () => events.forEach((e) => window.removeEventListener(e, markActivity));
  }, []);

  // (re)schedule whenever our own token changes
  useEffect(() => {
    if (accessToken) schedule();
    else clearTimer();
    return clearTimer;
  }, [accessToken]);

  // another tab renewed: resync, never write anything back
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === PERSIST_STORAGE_KEY && e.newValue) adoptNewerPersisted();
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  // woke from sleep / tab came back / network came back: timers may have been late
  useEffect(() => {
    const check = (userDriven: boolean) => {
      if (document.visibilityState === 'hidden') return;
      if (userDriven) markActivity();
      const { accessToken: t, tokenReceivedAt } = getAuth();
      if (t && msLeft(t, tokenReceivedAt) <= leadFor(t)) void runRenew();
    };
    const onVisible = () => check(true);
    const onFocus = () => check(true);
    const onOnline = () => check(false);
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('focus', onFocus);
    window.addEventListener('online', onOnline);
    return () => {
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('focus', onFocus);
      window.removeEventListener('online', onOnline);
    };
  }, []);
}
