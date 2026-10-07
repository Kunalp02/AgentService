
import { authTokenStore } from './authTokenStore';
import { serviceUrl } from '../config/api';
import { AiGatewayDto, AiGatewayPublicDto, CreateAiGatewayRequest, UpdateAiGatewayRequest } from '../types/gatewayModelRegistry';

import { handleUnauthorized } from './sessionGuard';
/**
 * A model as reported live by the external AI gateway (e.g. Azure OpenAI's
 * deployment list, Bedrock's model list, etc) — NOT a ModelRegistryDto.
 * These are candidates the user can pick from and then register via
 * POST /model-registry; they don't exist in our registry yet.
 *
 * IMPORTANT: the OpenAPI spec doesn't document a response schema for
 * /models/sync (just "200 OK", no content type/schema), so this shape
 * is a best-effort guess covering common field-naming conventions.
 * Once you've hit the real endpoint, tell me the actual JSON shape and
 * I'll replace normalizeDiscoveredModel() below with an exact mapping.
 */
export interface DiscoveredGatewayModel {
  modelIdentifier: string;
  name: string;
  raw: Record<string, unknown>; // full original object, in case the UI needs other fields later
}

function normalizeDiscoveredModel(item: unknown): DiscoveredGatewayModel | null {
  if (typeof item === 'string') {
    // Some provider APIs just return a bare list of model ID strings
    return { modelIdentifier: item, name: item, raw: { value: item } };
  }
  if (item && typeof item === 'object') {
    const obj = item as Record<string, unknown>;
    const modelIdentifier =
      (obj.modelIdentifier as string) ??
      (obj.id as string) ??
      (obj.modelId as string) ??
      (obj.model as string) ??
      (obj.deploymentId as string);
    const name = (obj.name as string) ?? (obj.displayName as string) ?? modelIdentifier;
    if (modelIdentifier) {
      return { modelIdentifier, name, raw: obj };
    }
  }
  return null;
}

/**
 * Matches ccil.aiplatform.tools_config -> AiGateways controller:
 *   GET    /api/v1/ai-gateways
 *   GET    /api/v1/ai-gateways/public         (no auth-sensitive fields, e.g. for pickers)
 *   GET    /api/v1/ai-gateways/{id}
 *   POST   /api/v1/ai-gateways
 *   PUT    /api/v1/ai-gateways/{id}
 *   DELETE /api/v1/ai-gateways/{id}
 *   POST   /api/v1/ai-gateways/{id}/models/sync
 */

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = authTokenStore.get();
  const res = await fetch(serviceUrl('gateway', `/api/v1${path}`), {
    ...options,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}), ...options.headers },
  });
  if (res.status === 204) return undefined as T;
  const raw = await res.text();
  let body: any = raw;
  try { body = raw ? JSON.parse(raw) : undefined; } catch {}
  if (res.status === 401) handleUnauthorized(token);
  if (!res.ok) throw new Error(body?.message || body?.title || body?.detail || `Gateway request failed (${res.status})`);
  return body as T;
}

export const gatewaysApi = {
  list: () => request<AiGatewayDto[]>('/ai-gateways'),

  listPublic: () => request<AiGatewayPublicDto[]>('/ai-gateways/public'),

  get: (id: string) => request<AiGatewayDto>(`/ai-gateways/${id}`),

  create: (payload: CreateAiGatewayRequest) => request<AiGatewayDto>('/ai-gateways', { method: 'POST', body: JSON.stringify(payload) }),

  update: (id: string, payload: UpdateAiGatewayRequest) =>
    request<AiGatewayDto>(`/ai-gateways/${id}`, { method: 'PUT', body: JSON.stringify(payload) }),

  remove: (id: string) => request<void>(`/ai-gateways/${id}`, { method: 'DELETE' }),

  /**
   * Pulls the live model list directly from the external gateway (e.g.
   * calls Azure OpenAI / Bedrock's own "list models" API server-side).
   * These are NOT registry entries — the user picks one and then
   * modelRegistryApi.create() actually registers it.
   */
  syncModels: async (id: string): Promise<DiscoveredGatewayModel[]> => {
    const result = await request<unknown>(`/ai-gateways/${id}/models/sync`, { method: 'POST' });
    if (!Array.isArray(result)) return [];
    return result.map(normalizeDiscoveredModel).filter((m): m is DiscoveredGatewayModel => m !== null);
  },
};
