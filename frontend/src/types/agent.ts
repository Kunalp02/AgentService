
export type AgentStatus = "Draft" | "Published" | string;
export type KnowledgeBaseMode = "Context" | "Tool";
export type AgentToolType = "Remote" | "Local";
export type AgentMemoryScope = "Session" | "User" | "Agent" | "Organization";
export type AgentMemoryRetention =
  | "Session"
  | "Days7"
  | "Days30"
  | "Days90"
  | "Years1"
  | "Forever";

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
  memoryEnabled: boolean;
  memoryScope?: string | null;
  memoryRetention?: string | null;
  memoryInstructions?: string | null;
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
  memoryEnabled?: boolean;
  memoryScope?: string | null;
  memoryRetention?: string | null;
  memoryInstructions?: string | null;
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
  memoryEnabled: boolean;
  memoryScope: string | null;
  memoryRetention: string | null;
  memoryInstructions: string | null;
}>;

export interface ModelOptionDto {
  id: string;
  name: string;
  modelIdentifier: string;
  classification: string;
  /** Groups this model is restricted to. Empty = available to every group. */
  groupIds: string[];
}

export interface KnowledgeBaseOptionDto {
  id: string;
  name: string;
  strategyName: string;
  /** Groups this knowledge base is restricted to. Empty = available to every group. */
  groupIds: string[];
}

export interface ToolOptionDto {
  id: string;
  name: string;
  toolType: AgentToolType | string;
  /** Groups this tool is restricted to. Empty = available to every group. */
  groupIds: string[];
}

export interface RemoteMcpToolOptionDto {
  id: string;
  name: string;
  description?: string | null;
}

export interface RemoteMcpServerOptionDto {
  id: string;
  name: string;
  remoteMcpServerUrl?: string | null;
  transportType?: string | null;
  authOption?: string | null;
  groupIds: string[];
  tools: RemoteMcpToolOptionDto[];
}

export interface AgentEditorOptionsDto {
  models: ModelOptionDto[];
  knowledgeBases: KnowledgeBaseOptionDto[];
  tools: ToolOptionDto[];
  remoteMcpServers: RemoteMcpServerOptionDto[];
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
  memoryEnabled: boolean;
  memoryScope: string;
  memoryRetention: string;
  memoryInstructions: string;
  createdAt?: string;
  updatedAt?: string;
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
    memoryEnabled: Boolean(raw?.memoryEnabled ?? raw?.MemoryEnabled ?? false),
    memoryScope: String(raw?.memoryScope ?? raw?.MemoryScope ?? ""),
    memoryRetention: String(raw?.memoryRetention ?? raw?.MemoryRetention ?? ""),
    memoryInstructions: String(
      raw?.memoryInstructions ?? raw?.MemoryInstructions ?? "",
    ),
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
  memoryEnabled: boolean;
  memoryScope: string;
  memoryRetention: string;
  memoryInstructions: string;
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
    memoryEnabled: form.memoryEnabled,
    memoryScope: form.memoryEnabled ? form.memoryScope || null : null,
    memoryRetention: form.memoryEnabled ? form.memoryRetention || null : null,
    memoryInstructions: form.memoryInstructions.trim() || null,
  };
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
    groupIds: asIdList(
      raw?.groupIds ??
        raw?.GroupIds ??
        raw?.ownerGroupIds ??
        raw?.OwnerGroupIds,
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
  const remoteMcpServers = Array.isArray(
    raw?.remoteMcpServers ?? raw?.RemoteMcpServers,
  )
    ? (raw.remoteMcpServers ?? raw.RemoteMcpServers)
    : [];
  const availability = raw?.availability ?? raw?.Availability ?? {};
  return {
    models: models
      .map((m: any) => ({
        id: String(m.id ?? m.Id ?? ""),
        name: String(m.name ?? m.Name ?? ""),
        modelIdentifier: String(m.modelIdentifier ?? m.ModelIdentifier ?? ""),
        classification: String(m.classification ?? m.Classification ?? ""),
        groupIds: asIdList(m.groupIds ?? m.GroupIds),
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
        groupIds: asIdList(t.groupIds ?? t.GroupIds),
      }))
      .filter((t: ToolOptionDto) => t.id),
    remoteMcpServers: remoteMcpServers
      .map((server: any) => {
        const id = String(server?.id ?? server?.Id ?? "").trim();
        if (!id) return null;
        const nested = Array.isArray(server?.tools ?? server?.Tools)
          ? (server.tools ?? server.Tools)
          : [];
        return {
          id,
          name: String(server?.name ?? server?.Name ?? id),
          remoteMcpServerUrl:
            server?.remoteMcpServerUrl ?? server?.RemoteMcpServerUrl ?? null,
          transportType: server?.transportType ?? server?.TransportType ?? null,
          authOption: server?.authOption ?? server?.AuthOption ?? null,
          groupIds: asIdList(server?.groupIds ?? server?.GroupIds),
          tools: nested
            .map((tool: any) => {
              const toolId = String(tool?.id ?? tool?.Id ?? "").trim();
              if (!toolId) return null;
              return {
                id: toolId,
                name: String(tool?.name ?? tool?.Name ?? toolId),
                description: tool?.description ?? tool?.Description ?? null,
              };
            })
            .filter(Boolean),
        };
      })
      .filter(Boolean) as RemoteMcpServerOptionDto[],
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
