
export type RolePermissionKey = string;

// export type UserStatus = 'Active' | 'PendingApproval' | 'Suspended' | 'inactive';
// export type RolePermissionKey = string;

// export interface LoginRequest {
//   username: string;
//   password: string;
// }

// export interface AuthUserSummary {
//   id: string;
//   username: string | null;
//   displayName: string | null;
//   email: string | null;
//   status: string | null;
//   roleProfile: string | null;
//   groups: string[] | null;
// }

// export interface LoginResponse {
//   accessToken: string;
//   expiresIn: number;
//   user: AuthUserSummary;
// }

// export interface IntrospectResponse {
//   Active: boolean;
//   sub: string | null;
//   username: string | null;
//   groups: string[] | null;
//   roleProfile: string | null;
//   permissions: string[] | null;
//   exp: number | null;
// }

// // Tools Management
// export type ToolType = 'local_python' | 'remote_mcp';
// export type ToolApprovalStatus = 'draft' | 'pending_approval' | 'approved' | 'rejected';

// export interface ToolParameter {
//   name: string;
//   type: 'string' | 'number' | 'boolean' | 'array' | 'object';
//   description: string;
//   required: boolean;
//   default?: any;
// }

// export interface LocalPythonTool {
//   id: string;
//   name: string;
//   slug: string;
//   description: string;
//   category: 'Financial Analytics' | 'Data Science' | 'Security & Risk' | 'Customer Ops' | 'General Utility';
//   type: 'local_python';
//   code: string;
//   parameters: ToolParameter[];
//   returnType: string;
//   approvalStatus: ToolApprovalStatus;
//   authorId: string;
//   authorName: string;
//   reviewedBy?: string;
//   reviewedAt?: string;
//   reviewNotes?: string;
//   version: string;
//   executionTimeoutSec: number;
//   createdAt: string;
//   updatedAt: string;
//   sampleTestPayload?: Record<string, any>;
// }

// export interface MCPServerTool {
//   id: string;
//   name: string;
//   description: string;
//   parameters: ToolParameter[];
// }

// export interface RemoteMCPServer {
//   id: string;
//   name: string;
//   endpointUrl: string;
//   transport: 'sse' | 'stdio';
//   description: string;
//   status: 'online' | 'offline' | 'degraded';
//   authType: 'bearer_token' | 'api_key' | 'none';
//   maskedToken: string;
//   pingLatencyMs: number;
//   discoveredTools: MCPServerTool[];
//   registeredBy: string;
//   registeredAt: string;
//   lastPingAt: string;
// }

// // AI Gateway & Model Registry
// export interface AIGateway {
//   id: string;
//   name: string;
//   provider: 'Azure OpenAI' | 'AWS Bedrock' | 'Portkey AI Gateway' | 'Kong AI Gateway' | 'Internal LiteLLM';
//   endpoint: string;
//   maskedApiKey: string;
//   status: 'healthy' | 'warning' | 'offline';
//   rateLimitRpm: number;
//   activeModelsCount: number;
//   totalRequestsToday: number;
//   createdAt: string;
// }

// export interface RegisteredModel {
//   id: string;
//   gatewayId: string;
//   name: string;
//   modelIdentifier: string; // e.g. "gpt-4o", "claude-3-7-sonnet"
//   provider: string;
//   contextWindow: number; // e.g., 128000
//   costPer1MTokensIn: number; // in USD
//   costPer1MTokensOut: number;
//   avgLatencyMs: number;
//   capabilities: ('text' | 'vision' | 'function_calling' | 'json_mode' | 'code')[];
//   enabled: boolean;
//   departmentRestrictions: string[]; // empty for all
// }

// // Knowledge Management
// export type ChunkingType = 'recursive_character' | 'semantic' | 'markdown_header' | 'fixed_token';
// export type VectorDbType = 'qdrant' | 'milvus' | 'pgvector' | 'pinecone' | 'opensearch';

// export interface RAGStrategy {
//   id: string;
//   name: string;
//   description: string;
//   chunkingType: ChunkingType;
//   chunkSize: number;
//   chunkOverlap: number;
//   embeddingModel: string;
//   vectorDb: VectorDbType;
//   vectorDbMode: 'platform_managed' | 'custom_connection';
//   customDbConnectionUrl?: string;
//   topK: number;
//   topP: number;
//   similarityMetric: 'cosine' | 'dot_product' | 'euclidean';
//   minSimilarityThreshold: number;
//   enableHybridSearch: boolean;
//   enableReranking: boolean;
//   rerankingModel?: string;
//   createdAt: string;
// }

// export interface IngestedDocument {
//   id: string;
//   kbId: string;
//   title: string;
//   type: 'pdf' | 'docx' | 'markdown' | 'confluence' | 'db_schema';
//   sourceUri: string;
//   fileSizeBytes: number;
//   status: 'indexed' | 'processing' | 'failed';
//   totalChunks: number;
//   totalTokens: number;
//   ingestedAt: string;
//   ingestedBy: string;
//   metadata: Record<string, string>;
//   previewSnippet: string;
// }

// export interface KnowledgeBase {
//   id: string;
//   name: string;
//   code: string;
//   description: string;
//   groupId: string; // scoped to department or 'global'
//   strategyId: string;
//   documentCount: number;
//   totalChunks: number;
//   vectorDimension: number;
//   indexSizeBytes: number;
//   lastIngestedAt: string;
//   createdBy: string;
//   createdAt: string;
// }

// // Agent Management
// export interface AgentMemoryConfig {
//   type: 'buffer_window' | 'summary' | 'ephemeral';
//   windowSize: number;
// }

// export interface AgentGuardrails {
//   piiRedaction: boolean;
//   promptInjectionShield: boolean;
//   hallucinationGuard: boolean;
//   toxicityFilter: boolean;
// }

// export interface AgentConfig {
//   id: string;
//   name: string;
//   description: string;
//   groupId: string;
//   modelId: string;
//   systemPrompt: string;
//   temperature: number;
//   topP: number;
//   maxTokens: number;
//   knowledgeBaseIds: string[];
//   localToolIds: string[];
//   mcpServerIds: string[];
//   enableMemory: boolean;
//   enableStreaming: boolean;
//   enableCodeInterpreter: boolean;
//   status: 'Active' | 'draft' | 'archived';
//   createdBy?: string;
//   createdAt?: string;
// }

// export type AIAgent = AgentConfig;

// // Playground & Tracing
// export interface ThoughtStep {
//   id: string;
//   title: string;
//   type: 'thought' | 'tool_call' | 'rag_retrieval' | 'mcp_call';
//   content: string;
//   toolName?: string;
//   toolInput?: Record<string, any>;
//   toolOutput?: Record<string, any>;
//   ragMatches?: {
//     docTitle: string;
//     score: number;
//     contentSnippet: string;
//   }[];
// }

// export interface PlaygroundMessage {
//   id: string;
//   role: 'user' | 'assistant' | 'system';
//   content: string;
//   timestamp: string;
//   tokensUsed?: number;
//   thoughtSteps?: ThoughtStep[];
// }

// export interface ChatTraceStep {
//   id: string;
//   type: 'retrieval' | 'reasoning' | 'tool_call' | 'tool_result' | 'synthesis';
//   title: string;
//   timestamp: string;
//   durationMs: number;
//   details: {
//     retrievedChunks?: {
//       id: string;
//       sourceTitle: string;
//       similarityScore: number;
//       textSnippet: string;
//     }[];
//     toolName?: string;
//     toolInput?: Record<string, any>;
//     toolOutput?: Record<string, any>;
//     reasoningThought?: string;
//   };
// }

// export interface ChatMessage {
//   id: string;
//   role: 'user' | 'assistant' | 'system';
//   content: string;
//   timestamp: string;
//   traceSteps?: ChatTraceStep[];
//   citations?: {
//     id: string;
//     docTitle: string;
//     snippet: string;
//     score: number;
//   }[];
//   telemetry?: {
//     model: string;
//     totalTokens: number;
//     promptTokens: number;
//     completionTokens: number;
//     latencyMs: number;
//     estimatedCostUsd: number;
//   };
// }

// // Platform Telemetry & Audit
// export interface AuditLog {
//   id: string;
//   timestamp: string;
//   actorName: string;
//   actorEmail?: string;
//   actorWindowsId?: string;
//   userName: string;
//   userWindowsId: string;
//   action: string;
//   category?: 'AUTH' | 'USER_ADMIN' | 'TOOL_APPROVAL' | 'MODEL_CONFIG' | 'KB_INGEST' | 'AGENT_EXEC';
//   status?: 'SUCCESS' | 'WARNING' | 'DENIED' | 'ERROR';
//   details: string;
//   ipAddress: string;
// }

export type AgentStatus = "Draft" | "Published" | string;
export type KnowledgeBaseMode = "Context" | "Tool";
export type AgentToolType = "Remote" | "Local";

export interface AgentKnowledgeBaseRef {
  knowledgeBaseId: string;
  knowledgeBaseName?: string | null;
  mode: KnowledgeBaseMode | string;
}

export interface AgentToolRef {
  toolId: string;
  toolName?: string | null;
  toolType: AgentToolType | string;
}

export interface AgentDto {
  id: string;
  name: string;
  description?: string | null;
  modelId: string;
  modelName?: string | null;
  temperature: number;
  systemPrompt: string;
  status: AgentStatus;
  ownerUserId: string;
  ownerUsername: string;
  groupIds: string[];
  knowledgeBases: AgentKnowledgeBaseRef[];
  tools: AgentToolRef[];
  createdAt: string;
  updatedAt?: string | null;
}

export interface AgentListItemDto {
  id: string;
  name: string;
  status: AgentStatus;
  ownerUsername: string;
  groupIds: string[];
  createdAt: string;
}

export interface PagedResult<T> {
  items: T[];
  totalCount: number;
  page: number;
  pageSize: number;
}

export interface CreateAgentRequest {
  name: string;
  description?: string | null;
  modelId: string;
  temperature: number;
  systemPrompt: string;
  knowledgeBases: { knowledgeBaseId: string; mode: KnowledgeBaseMode }[];
  tools: { toolId: string; toolType: AgentToolType }[];
  groupIds: string[];
}

export type PatchAgentRequest = Partial<{
  name: string;
  description: string | null;
  modelId: string;
  temperature: number;
  systemPrompt: string;
  knowledgeBases: { knowledgeBaseId: string; mode: KnowledgeBaseMode }[];
  tools: { toolId: string; toolType: AgentToolType }[];
  groupIds: string[];
}>;

export interface ModelOptionDto {
  id: string;
  name: string;
  modelIdentifier: string;
  classification: string;
}

export interface KnowledgeBaseOptionDto {
  id: string;
  name: string;
  strategyName: string;
}

export interface ToolOptionDto {
  id: string;
  name: string;
  toolType: AgentToolType | string;
}

export interface AgentEditorOptionsDto {
  models: ModelOptionDto[];
  knowledgeBases: KnowledgeBaseOptionDto[];
  tools: ToolOptionDto[];
  availability: {
    toolsConfigReachable: boolean;
    ragConfigReachable: boolean;
  };
}

export interface AgentUi {
  id: string;
  name: string;
  description: string;
  groupIds: string[];
  modelId: string;
  modelName: string;
  systemPrompt: string;
  temperature: number;
  knowledgeBases: AgentKnowledgeBaseRef[];
  tools: AgentToolRef[];
  status: string;
  ownerUsername: string;
  createdAt?: string;
  updatedAt?: string;
}

export function asKnowledgeBaseOption(raw: any): KnowledgeBaseOptionDto | null {
  const id = String(
    raw?.id ?? raw?.Id ?? raw?.knowledgeBaseId ?? raw?.KnowledgeBaseId ?? "",
  ).trim();
  if (!id) return null;
  return {
    id,
    name: String(raw?.name ?? raw?.Name ?? raw?.title ?? raw?.Title ?? id),
    strategyName: String(
      raw?.strategyName ??
        raw?.StrategyName ??
        raw?.strategyId ??
        raw?.StrategyId ??
        raw?.strategy?.name ??
        "",
    ),
  };
}

export function normalizeEditorOptions(raw: any): AgentEditorOptionsDto {
  const models = Array.isArray(raw?.models ?? raw?.Models)
    ? (raw.models ?? raw.Models)
    : [];
  const knowledgeBases = Array.isArray(
    raw?.knowledgeBases ?? raw?.KnowledgeBases,
  )
    ? (raw.knowledgeBases ?? raw.KnowledgeBases)
    : [];
  const tools = Array.isArray(raw?.tools ?? raw?.Tools)
    ? (raw.tools ?? raw.Tools)
    : [];
  const availability = raw?.availability ?? raw?.Availability ?? {};
  return {
    models: models
      .map((m: any) => ({
        id: String(m.id ?? m.Id ?? ""),
        name: String(m.name ?? m.Name ?? ""),
        modelIdentifier: String(m.modelIdentifier ?? m.ModelIdentifier ?? ""),
        classification: String(m.classification ?? m.Classification ?? ""),
      }))
      .filter((m: ModelOptionDto) => m.id),
    knowledgeBases: knowledgeBases
      .map(asKnowledgeBaseOption)
      .filter(Boolean) as KnowledgeBaseOptionDto[],
    tools: tools
      .map((t: any) => ({
        id: String(t.id ?? t.Id ?? ""),
        name: String(t.name ?? t.Name ?? ""),
        toolType: String(t.toolType ?? t.ToolType ?? "Local"),
      }))
      .filter((t: ToolOptionDto) => t.id),
    availability: {
      toolsConfigReachable: Boolean(
        availability.toolsConfigReachable ?? availability.ToolsConfigReachable,
      ),
      ragConfigReachable: Boolean(
        availability.ragConfigReachable ?? availability.RagConfigReachable,
      ),
    },
  };
}

export function asIdList(value: unknown): string[] {
  if (Array.isArray(value))
    return value
      .map(String)
      .map((v) => v.trim())
      .filter(Boolean);
  if (typeof value === "string")
    return value
      .split(/[,;]/)
      .map((v) => v.trim())
      .filter(Boolean);
  return [];
}

export function normalizeAgent(raw: any): AgentUi {
  const knowledgeBases: AgentKnowledgeBaseRef[] = Array.isArray(
    raw?.knowledgeBases ?? raw?.KnowledgeBases,
  )
    ? (raw.knowledgeBases ?? raw.KnowledgeBases).map((kb: any) => ({
        knowledgeBaseId: String(kb.knowledgeBaseId ?? kb.KnowledgeBaseId ?? ""),
        knowledgeBaseName: kb.knowledgeBaseName ?? kb.KnowledgeBaseName ?? null,
        mode: String(kb.mode ?? kb.Mode ?? "Context"),
      }))
    : asIdList(raw?.knowledgeBaseIds ?? raw?.KnowledgeBaseIds).map((id) => ({
        knowledgeBaseId: id,
        mode: "Context",
      }));

  const tools: AgentToolRef[] = Array.isArray(raw?.tools ?? raw?.Tools)
    ? (raw.tools ?? raw.Tools).map((t: any) => ({
        toolId: String(t.toolId ?? t.ToolId ?? ""),
        toolName: t.toolName ?? t.ToolName ?? null,
        toolType: String(t.toolType ?? t.ToolType ?? "Local"),
      }))
    : [
        ...asIdList(raw?.localToolIds ?? raw?.LocalToolIds).map((id) => ({
          toolId: id,
          toolType: "Local" as const,
        })),
        ...asIdList(raw?.mcpServerIds ?? raw?.McpServerIds).map((id) => ({
          toolId: id,
          toolType: "Remote" as const,
        })),
      ];

  const groupIds = asIdList(raw?.groupIds ?? raw?.GroupIds);
  const singleGroup = String(raw?.groupId ?? raw?.GroupId ?? "");
  if (singleGroup && !groupIds.includes(singleGroup))
    groupIds.push(singleGroup);

  return {
    id: String(raw?.id ?? raw?.Id ?? ""),
    name: String(raw?.name ?? raw?.Name ?? "Unnamed agent"),
    description: String(raw?.description ?? raw?.Description ?? ""),
    groupIds,
    modelId: String(raw?.modelId ?? raw?.ModelId ?? ""),
    modelName: String(raw?.modelName ?? raw?.ModelName ?? ""),
    systemPrompt: String(raw?.systemPrompt ?? raw?.SystemPrompt ?? ""),
    temperature: Number(raw?.temperature ?? raw?.Temperature ?? 0.7),
    knowledgeBases: knowledgeBases.filter((k) => k.knowledgeBaseId),
    tools: tools.filter((t) => t.toolId),
    status: String(raw?.status ?? raw?.Status ?? ""),
    ownerUsername: String(raw?.ownerUsername ?? raw?.OwnerUsername ?? ""),
    createdAt: raw?.createdAt ?? raw?.CreatedAt,
    updatedAt: raw?.updatedAt ?? raw?.UpdatedAt,
  };
}

export function toCreatePayload(form: {
  name: string;
  description: string;
  modelId: string;
  temperature: number;
  systemPrompt: string;
  groupIds: string[];
  knowledgeBases: AgentKnowledgeBaseRef[];
  tools: AgentToolRef[];
}): CreateAgentRequest {
  return {
    name: form.name.trim(),
    description: form.description.trim() || null,
    modelId: form.modelId,
    temperature: form.temperature,
    systemPrompt: form.systemPrompt,
    groupIds: form.groupIds,
    knowledgeBases: form.knowledgeBases.map((k) => ({
      knowledgeBaseId: k.knowledgeBaseId,
      mode: (k.mode === "Tool" ? "Tool" : "Context") as KnowledgeBaseMode,
    })),
    tools: form.tools.map((t) => ({
      toolId: t.toolId,
      toolType: (t.toolType === "Remote" ? "Remote" : "Local") as AgentToolType,
    })),
  };
}
