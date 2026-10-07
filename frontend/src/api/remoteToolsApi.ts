
import { apiClient } from './client';
import type {
  CreateRemoteMcpServerRequest,
  InvokeRemoteMcpToolRequest,
  InvokeRemoteMcpToolResult,
  PagedResult,
  RemoteMcpServerDto,
  RemoteMcpServerListItemDto,
  RemoteMcpToolInvocationDetailsDto,
  SyncResultDto,
  TestRemoteMcpServerResult,
  ToolQueryParams,
  UpdateRemoteMcpServerRequest,
} from '../types/tools';

/**
 * ccil.aiplatform.tools_config -> RemoteMcpServersController
 *   GET    /remote-mcp-servers?Status&GroupId&Search&Page&PageSize
 *   GET    /remote-mcp-servers/{id}
 *   POST   /remote-mcp-servers                                  (201)
 *   PUT    /remote-mcp-servers/{id}
 *   DELETE /remote-mcp-servers/{id}                             (204)
 *   POST   /remote-mcp-servers/{id}/test                        re-discovery, not persisted
 *   POST   /remote-mcp-servers/{id}/sync                        diff + persist (400 {error} on failure)
 *   GET    /remote-mcp-servers/{id}/tools/{toolName}/invocation-details   (perm 104)
 *   POST   /remote-mcp-servers/{id}/tools/{toolName}/invoke               (perm 104)
 *   GET    /remote-mcp-servers/active                           management scope
 *   GET    /remote-mcp-servers/active-for-use                   agent-builder scope
 */
const BASE = '/remote-mcp-servers';

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

const toolPath = (id: string, toolName: string) => `${BASE}/${id}/tools/${encodeURIComponent(toolName)}`;

export const remoteToolsApi = {
  list: (query?: ToolQueryParams) =>
    apiClient.get<PagedResult<RemoteMcpServerListItemDto>>(`${BASE}${buildQuery(query)}`),

  get: (id: string) => apiClient.get<RemoteMcpServerDto>(`${BASE}/${id}`),

  create: (payload: CreateRemoteMcpServerRequest) => apiClient.post<RemoteMcpServerDto>(BASE, payload),

  update: (id: string, payload: UpdateRemoteMcpServerRequest) =>
    apiClient.put<RemoteMcpServerDto>(`${BASE}/${id}`, payload),

  remove: (id: string) => apiClient.delete<void>(`${BASE}/${id}`),

  test: (id: string) => apiClient.post<TestRemoteMcpServerResult>(`${BASE}/${id}/test`),

  sync: (id: string) => apiClient.post<SyncResultDto>(`${BASE}/${id}/sync`),

  /** Live schema straight from the remote MCP server (not the cached DB row). */
  invocationDetails: (id: string, toolName: string) =>
    apiClient.get<RemoteMcpToolInvocationDetailsDto>(`${toolPath(id, toolName)}/invocation-details`),

  invoke: (id: string, toolName: string, payload: InvokeRemoteMcpToolRequest) =>
    apiClient.post<InvokeRemoteMcpToolResult>(`${toolPath(id, toolName)}/invoke`, payload),

  active: () => apiClient.get<RemoteMcpServerListItemDto[]>(`${BASE}/active`),

  activeForUse: () => apiClient.get<RemoteMcpServerListItemDto[]>(`${BASE}/active-for-use`),
};
