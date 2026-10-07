
import { apiClient } from './client';
import type {
  CreateLocalToolRequest,
  GenerateLocalToolCodeRequest,
  GenerateLocalToolCodeResponse,
  LocalToolCheckResult,
  LocalToolDetailDto,
  LocalToolExecutionDetailsDto,
  LocalToolForUseDto,
  LocalToolListItemDto,
  LocalToolRunHistoryDto,
  LocalToolTestResult,
  PagedResult,
  RejectLocalToolRequest,
  RevokeLocalToolRequest,
  ToolQueryParams,
  UpdateLocalToolRequest,
} from '../types/tools';

const BASE = '/local-tools';

function buildQuery(q?: ToolQueryParams): string {
  if (!q) return '';
  const qs = new URLSearchParams();
  if (q.status) qs.set('Status', q.status);
  if (q.groupId) qs.set('GroupId', q.groupId);
  if (q.search) qs.set('Search', q.search);
  if (q.page !== undefined) qs.set('Page', String(q.page));
  if (q.pageSize !== undefined) qs.set('PageSize', String(q.pageSize));
  const s = qs.toString();
  return s ? `?${s}` : '';
}

export const localToolsApi = {
  list: (query?: ToolQueryParams) => apiClient.get<PagedResult<LocalToolListItemDto>>(`${BASE}${buildQuery(query)}`),
  get: (id: string) => apiClient.get<LocalToolDetailDto>(`${BASE}/${id}`),
  generate: (payload: GenerateLocalToolCodeRequest) => apiClient.post<GenerateLocalToolCodeResponse>(`${BASE}/generate`, payload),
  submit: (payload: CreateLocalToolRequest) => apiClient.post<LocalToolDetailDto>(BASE, payload),
  update: (id: string, payload: UpdateLocalToolRequest) => apiClient.put<LocalToolDetailDto>(`${BASE}/${id}`, payload),
  remove: (id: string) => apiClient.delete<void>(`${BASE}/${id}`),
  pending: (page = 1, pageSize = 25) => apiClient.get<PagedResult<LocalToolListItemDto>>(`${BASE}/pending?page=${page}&pageSize=${pageSize}`),
  approve: (id: string) => apiClient.post<LocalToolDetailDto>(`${BASE}/${id}/approve`),
  reject: (id: string, payload: RejectLocalToolRequest) => apiClient.post<LocalToolDetailDto>(`${BASE}/${id}/reject`, payload),
  revoke: (id: string, payload: RevokeLocalToolRequest) => apiClient.post<LocalToolDetailDto>(`${BASE}/${id}/revoke`, payload),
  approved: () => apiClient.get<LocalToolListItemDto[]>(`${BASE}/approved`),
  approvedForUse: () => apiClient.get<LocalToolForUseDto[]>(`${BASE}/approved-for-use`),
  executionDetails: (id: string) => apiClient.get<LocalToolExecutionDetailsDto>(`${BASE}/${id}/execution-details`),

  // sandbox: draft (no saved tool id)
  checkDraft: (pythonCode: string) => apiClient.post<LocalToolCheckResult>(`${BASE}/check-draft`, { pythonCode }),
  testDraft: (pythonCode: string, functionName: string | null, argumentsJson: string) =>
    apiClient.post<LocalToolTestResult>(`${BASE}/test-draft`, { pythonCode, functionName, argumentsJson }),

  // sandbox: against a saved tool (persists run history)
  check: (id: string) => apiClient.post<LocalToolCheckResult>(`${BASE}/${id}/check`),
  test: (id: string, argumentsJson: string) => apiClient.post<LocalToolTestResult>(`${BASE}/${id}/test`, { argumentsJson }),
  runs: (id: string) => apiClient.get<LocalToolRunHistoryDto[]>(`${BASE}/${id}/runs`),
};
