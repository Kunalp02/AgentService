
/**
 * Mirrors ccil.aiplatform.tools_config (RemoteMcpServers + LocalTools controllers).
 */

export interface PagedResult<T> {
  items: T[] | null;
  totalCount: number;
  page: number;
  pageSize: number;
}

export interface ToolQueryParams {
  status?: string;
  groupId?: string;
  search?: string;
  page?: number;
  pageSize?: number;
}

export const TRANSPORT_TYPES = ['Sse', 'StreamableHttp', 'WebSocket'] as const;
export const AUTH_OPTIONS = ['None', 'ApiKey', 'SessionToken'] as const;
export const SERVER_STATUSES = ['Draft', 'Active', 'Disabled'] as const;
export const LOCAL_TOOL_STATUSES = ['Draft', 'PendingApproval', 'Approved', 'Rejected', 'Revoked'] as const;

// ---------------------------------------------------------------- Remote MCP

export interface RemoteMcpToolDto {
  id: string;
  name: string | null;
  description: string | null;
  inputSchemaJson: string | null;
}

export interface RemoteMcpServerDto {
  id: string;
  name: string | null;
  description: string | null;
  remoteMcpServerUrl: string | null;
  transportType: string | null;
  authOption: string | null;
  status: string | null;
  groupIds: string[] | null;
  tools: RemoteMcpToolDto[] | null;
  createdAt: string;
}

export interface RemoteMcpServerListItemDto {
  id: string;
  name: string | null;
  status: string | null;
  transportType: string | null;
  groupIds: string[] | null;
  toolCount: number;
}

export interface CreateRemoteMcpServerRequest {
  name: string;
  description?: string | null;
  remoteMcpServerUrl: string;
  transportType: string;
  authOption: string;
  apiKey?: string | null;
  groupIds: string[];
}

export interface UpdateRemoteMcpServerRequest extends CreateRemoteMcpServerRequest {
  status: string;
}

export interface TestRemoteMcpServerResult {
  success: boolean;
  error: string | null;
  discoveredTools: RemoteMcpToolDto[] | null;
}

export enum ChangeClassification {
  Initial = 0,
  NonBreaking = 1,
  Breaking = 2,
  Removed = 3,
}

export interface ChangedToolDto {
  toolId: string;
  toolName: string | null;
  fromVersion: string | null;
  toVersion: string | null;
  classification: ChangeClassification | string;
  notes: string | null;
}

export interface SyncResultDto {
  status: string | null;
  lastSyncedAtUtc: string | null;
  errorMessage: string | null;
  added: string[] | null;
  removedOrDisabled: string[] | null;
  changed: ChangedToolDto[] | null;
}

export interface RemoteMcpToolInvocationDetailsDto {
  serverName: string | null;
  toolName: string | null;
  description: string | null;
  inputSchemaJson: string | null;
}

export interface InvokeRemoteMcpToolRequest {
  argumentsJson: string | null;
}

export interface InvokeRemoteMcpToolResult {
  success: boolean;
  error: string | null;
  resultJson: string | null;
  isError: boolean | null;
}

// Backwards-compatible aliases (PlatformContext still imports these names).
export type RemoteToolDto = RemoteMcpServerDto;
export type RemoteToolListItemDto = RemoteMcpServerListItemDto;

// ---------------------------------------------------------------- Local tools

export interface LocalToolAuditDto {
  staticCheckPassed: boolean;
  staticCheckNotesJson: string | null;
  llmAuditPassed: boolean;
  llmAuditNotes: string | null;
}

export interface LocalToolDetailDto {
  id: string;
  name: string | null;
  description: string | null;
  pythonCode: string | null;
  llmGenerationFlag: boolean;
  status: string | null;
  submittedBy: string | null;
  reviewedBy: string | null;
  groupIds: string[] | null;
  auditResults: LocalToolAuditDto[] | null;
  parametersSchemaJson: string | null;
  createdAt: string;
}

export interface LocalToolListItemDto {
  id: string;
  name: string | null;
  status: string | null;
  submittedBy: string | null;
  llmGenerationFlag: boolean;
  groupIds: string[] | null;
  createdAt: string;
}

export interface LocalToolForUseDto {
  id: string;
  name: string | null;
  description: string | null;
  parametersSchemaJson: string | null;
}

export interface LocalToolExecutionDetailsDto {
  id: string;
  name: string | null;
  pythonCode: string | null;
  parametersSchemaJson: string | null;
}

export interface GenerateLocalToolCodeRequest {
  gatewayId: string;
  groupIds: string[];
  modelId: string;
  description: string;
}

export interface GenerateLocalToolCodeResponse {
  draftPythonCode: string | null;
  explanation: string | null;
}

export interface CreateLocalToolRequest {
  name: string;
  description?: string | null;
  pythonCode: string;
  llmGenerationFlag: boolean;
  groupIds: string[];
  parametersSchemaJson?: string | null;
}

export interface UpdateLocalToolRequest {
  name: string;
  description?: string | null;
  pythonCode: string;
  groupIds: string[];
  parametersSchemaJson?: string | null;
}

export interface RejectLocalToolRequest {
  reason: string;
}

export interface RevokeLocalToolRequest {
  reason: string;
}

export interface WorkspaceFileDto {
  id: string;
  fileName: string;
  contentType: string;
  sizeBytes: number;
  expiresAt: string;
  reference: string; // "workspace://<id>"
}

export interface LocalToolCheckResult {
  passed: boolean;
  findings: string[];
  runId?: string;
  ranAt?: string;
}

export interface LocalToolTestResult {
  success: boolean;
  result?: any;
  error?: string | null;
  runId?: string;
  ranAt?: string;
}

export interface LocalToolRunHistoryDto {
  id: string;
  kind: 'Check' | 'Test';
  passed: boolean;
  findingsJson?: string | null;
  argumentsJson?: string | null;
  resultJson?: string | null;
  error?: string | null;
  ranBy: string;
  ranAt: string;
}
