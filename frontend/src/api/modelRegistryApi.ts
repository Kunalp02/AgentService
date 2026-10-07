
import { apiClient } from './client';
import {
  ModelRegistryDto,
  CreateModelRegistryRequest,
  UpdateModelRegistryRequest,
  ModelRegistryListParams,
  ModelClassificationDto,
  ModelUsageDto
} from '../types/gatewayModelRegistry';

/**
 * Matches ccil.aiplatform.tools_config -> ModelRegistry controller:
 *   GET    /api/v1/model-registry?classification=&activeOnly=
 *   GET    /api/v1/model-registry/{id}
 *   POST   /api/v1/model-registry
 *   PUT    /api/v1/model-registry/{id}
 *   DELETE /api/v1/model-registry/{id}
 *
 * Note: `activeOnly` defaults to true server-side. Pass activeOnly:false
 * explicitly if you want deactivated models included (e.g. an admin view).
 */
function buildQuery(params?: ModelRegistryListParams): string {
  if (!params) return '';
  const qs = new URLSearchParams();
  if (params.classification) qs.set('classification', params.classification);
  if (params.activeOnly !== undefined) qs.set('activeOnly', String(params.activeOnly));
  const s = qs.toString();
  return s ? `?${s}` : '';
}

export const modelRegistryApi = {
  list: (params?: ModelRegistryListParams) =>
    apiClient.get<ModelRegistryDto[]>(`/model-registry${buildQuery(params)}`),

  get: (id: string) => apiClient.get<ModelRegistryDto>(`/model-registry/${id}`),

  create: (payload: CreateModelRegistryRequest) =>
    apiClient.post<ModelRegistryDto>('/model-registry', payload),

  update: (id: string, payload: UpdateModelRegistryRequest) =>
    apiClient.put<ModelRegistryDto>(`/model-registry/${id}`, payload),

  remove: (id: string) => apiClient.delete<void>(`/model-registry/${id}`),
  getUsage: (id: string) => apiClient.get<ModelUsageDto>(`/model-registry/${id}/usage`),

  /** GET /api/v1/model-registry/classifications — lookup list for the classification dropdown. */
  listClassifications: () => apiClient.get<ModelClassificationDto[]>('/model-registry/classifications'),
};
