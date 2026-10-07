
import { serviceUrl } from '../config/api';
import { store } from '../store';
import { authHeaders } from './session';
import { handleUnauthorized } from '../api/sessionGuard';

/** Optional legacy engine origin helper. The platform service URL resolver is
    now the source of truth for local direct URLs and deployed prefixes. */
function origin(configured: string | undefined, fallbackPort: number): string {
  const raw = (configured || '').trim();
  if (raw === '/' || raw === 'same-origin') return '';
  if (raw) return raw.replace(/\/+$/, '');
  return typeof location !== 'undefined' && location.hostname
    ? `${location.protocol}//${location.hostname}:${fallbackPort}`
    : `http://127.0.0.1:${fallbackPort}`;
}

const env = (import.meta as any).env || {};
export const RAG_ORIGIN = '';

export const ENGINE_ORIGIN = origin(env.VITE_ENGINE_ORIGIN ?? env.VITE_RAG_ORIGIN, 8000);

export const CONFIG_API = serviceUrl('rag', '/api/v1');

/* The engine's paths are its OWN - /ask, /documents, /sql - with no /api/v1 in
   front of them. `/engine-api` is the prefix the dev server proxies and strips;
   set VITE_ENGINE_ORIGIN to a real host and it is stripped there instead. */
export const ENGINE_API = serviceUrl('engine', '');
let ACTIVE_KB = '';

/* The active knowledge base rides on every engine request. Held here rather
   than in React state so a call made from a helper does not need the component
   tree to hand it down. RagContext keeps it in step. */

export const setActiveKb = (name: string) => {
  ACTIVE_KB = name || '';
};
export const getActiveKb = () => ACTIVE_KB;

function headers(): Record<string, string> {
  return { 'Content-Type': 'application/json', ...authHeaders() };
}

const currentToken = () => store.getState().auth.accessToken;

async function parseBody(r: Response): Promise<any> {
  const text = await r.text();
  try {
    return JSON.parse(text);
  } catch {
    return { detail: text.slice(0, 300) };
  }
}

/* A 401 is not a failed request, it is a signed-out session (expired, or the
   same user signed in somewhere else). `sentToken` is the token THIS request
   carried, so a late 401 from an older token cannot sign out a newer session.

   A 403 is NOT a signed-out session: clearing the session on a 403 would sign
   somebody out for clicking the wrong store. The service's own sentence is
   shown instead. */
function guard(status: number, detail: any, sentToken: string | null) {
  if (status === 401) {
    handleUnauthorized(sentToken);
    throw new Error('Your session has expired — sign in again.');
  }
  if (status === 403) {
    const said = detail && (detail.detail || detail.title);
    throw new Error(said || 'Your role profile does not allow this.');
  }
}

/** Appends ?kb= to any engine path, keeping an existing query string. */
export function withKb(path: string): string {
  // A CALLER THAT NAMES A BASE WINS (see git history: the engine reads the LAST kb=).
  if (!ACTIVE_KB || /(^|[?&])kb=/.test(path)) return ENGINE_API + path;
  const sep = path.indexOf('?') >= 0 ? '&' : '?';
  return `${ENGINE_API}${path}${sep}kb=${encodeURIComponent(ACTIVE_KB)}`;
}

/** Engine call (Python, proxied). `signal` lets pollers cancel on unmount. */
export async function call(
  method: string,
  path: string,
  body?: any,
  signal?: AbortSignal,
): Promise<any> {
  const sentToken = currentToken();
  const opt: RequestInit = { method, headers: headers(), signal };
  if (body !== undefined) opt.body = JSON.stringify(body);
  const r = await fetch(withKb(path), opt);
  const data = await parseBody(r);
  if (!r.ok) {
    guard(r.status, data && data.detail, sentToken);
    const d = data && data.detail;
    throw new Error(
      (d && (d.detail || d.title)) || (typeof d === 'string' ? d : `HTTP ${r.status}`),
    );
  }
  return data;
}

export const get = (p: string, signal?: AbortSignal) => call('GET', p, undefined, signal);
export const post = (p: string, b?: any) => call('POST', p, b);
export const del = (p: string) => call('DELETE', p);

/** Configuration service (.NET): strategies, knowledge bases, lookups, groups,
    embedding models, session. */
export async function cfg(method: string, path: string, body?: any): Promise<any> {
  const sentToken = currentToken();
  const opt: RequestInit = { method, headers: headers() };
  if (body !== undefined) opt.body = JSON.stringify(body);
  const r = await fetch(CONFIG_API + path, opt);
  const data = await parseBody(r);
  if (!r.ok) {
    guard(r.status, data && data.detail, sentToken);
    const d = data && data.detail;
    throw new Error(
      (d && (d.detail || d.title)) || (typeof d === 'string' ? d : `HTTP ${r.status}`),
    );
  }
  return data;
}

/** For the one call that returns a file, so the export button carries the
    token too — see AskDatabaseTab.download. */
export const fileHeaders = headers;

export const engineUrl = (path: string) => ENGINE_API + path;

/** Every error that reaches a screen goes through this, so a thrown string and
    a thrown Error read the same to the reader. */
export const msg = (e: any) => String((e && e.message) || e);
