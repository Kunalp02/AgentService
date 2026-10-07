
const clean = (value: string | undefined): string => (value || '').trim().replace(/\/+$/, '');
const cleanPrefix = (value: string | undefined): string => {
  const v = (value || '').trim();
  if (!v || v === '/') return '';
  return `/${v.replace(/^\/+/, '').replace(/\/+$/, '')}`;
};

// One public base for Nginx. When a service prefix is empty, the matching
// local service target is used instead. This lets the same source run locally
// against separate ports and later run behind Nginx with /auth, /agent, etc.
export const API_BASE_URL = clean(import.meta.env.VITE_API_BASE_URL as string | undefined);

export const BACKEND_DISPLAY_URL =
  clean(import.meta.env.VITE_BACKEND_DISPLAY_URL as string | undefined) ||
  clean(import.meta.env.VITE_AUTH_BASE_URL as string | undefined) ||
  API_BASE_URL;

export const SERVICE_PREFIX = {
  auth: cleanPrefix(import.meta.env.VITE_AUTH_PREFIX as string | undefined),
  tools: cleanPrefix(import.meta.env.VITE_TOOLS_PREFIX as string | undefined),
  rag: cleanPrefix(import.meta.env.VITE_RAG_PREFIX as string | undefined),
  agent: cleanPrefix(import.meta.env.VITE_AGENT_PREFIX as string | undefined),
  gateway: cleanPrefix(import.meta.env.VITE_GATEWAY_PREFIX as string | undefined),
  workflow: cleanPrefix(import.meta.env.VITE_WORKFLOW_PREFIX as string | undefined),
  ml: cleanPrefix(import.meta.env.VITE_ML_PREFIX as string | undefined),
  engine: cleanPrefix(import.meta.env.VITE_ENGINE_PREFIX as string | undefined),
  execution: cleanPrefix(import.meta.env.VITE_EXECUTION_PREFIX as string | undefined)
} as const;

export const SERVICE_BASE_URL = {
  auth: clean(import.meta.env.VITE_AUTH_BASE_URL as string | undefined) || API_BASE_URL,
  tools: clean(import.meta.env.VITE_TOOLS_BASE_URL as string | undefined) || API_BASE_URL,
  rag: clean(import.meta.env.VITE_RAG_BASE_URL as string | undefined) || API_BASE_URL,
  agent: clean(import.meta.env.VITE_AGENT_BASE_URL as string | undefined) || API_BASE_URL,
  gateway: clean(import.meta.env.VITE_GATEWAY_BASE_URL as string | undefined) || API_BASE_URL,
  workflow: clean(import.meta.env.VITE_WORKFLOW_BASE_URL as string | undefined) || API_BASE_URL,
  ml: clean(import.meta.env.VITE_ML_BASE_URL as string | undefined) || API_BASE_URL,
  engine: clean(import.meta.env.VITE_ENGINE_BASE_URL as string | undefined) || API_BASE_URL,
  execution: cleanPrefix(import.meta.env.VITE_EXECUTION_BASE_URL as string | undefined)
} as const;

export type ServiceName = keyof typeof SERVICE_PREFIX;

export function serviceUrl(service: ServiceName, path = ''): string {
  const prefix = SERVICE_PREFIX[service];
  const base = prefix ? API_BASE_URL : SERVICE_BASE_URL[service];
  const normalizedPath = path.startsWith('/') ? path : `${path}`;
  return `${base}${prefix}${normalizedPath}`;
}
