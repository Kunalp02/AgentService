
﻿namespace Agent.Application.DTOs;

public record RuntimeModelConfigDto(
        Guid ModelId,
        string? Name,
        string ModelIdentifier,
        string Provider,
        string? BaseUrl,
        IReadOnlyCollection<Guid> GroupIds,
        Guid? GatewayId = null,
        string? ApiKey = null
);


public record RuntimeAgentToolRefDto
(
        Guid ToolId,
        string? ToolName,
        string ToolType
);

public record RuntimeRemoteMcpToolDto(Guid ToolId, string? ToolName);

public record RuntimeRemoteMcpServerDto(
        Guid Id,
        string? Name,
        string? RemoteMcpServerUrl,
        string? TransportType,
        string? AuthOption,
        string? ApiKey,
        IReadOnlyCollection<Guid> GroupIds,
        IReadOnlyList<RuntimeRemoteMcpToolDto> Tools);

public record RuntimeKnowledgeBaseRefDto(
        Guid KnowledgeBaseId,
        string? KnowledgeBaseName,
        string Mode
);


public record RuntimeMemoryConfigDto(
        bool Enabled,
        string? Scope,
        string? Retention,
        string? Instructions
);

public record AgentRuntimeManifestDto(
        Guid AgentId,
        string Name,
        string Status,
        IReadOnlyList<Guid> GroupIds,
        string SystemPrompt,
        double Temperature,
        RuntimeModelConfigDto Model,
        IReadOnlyList<RuntimeAgentToolRefDto> Tools,
        IReadOnlyList<RuntimeRemoteMcpServerDto> RemoteMcpServers,
        IReadOnlyList<RuntimeKnowledgeBaseRefDto> KnowledgeBases,
        RuntimeMemoryConfigDto Memory,
        string ManifestHash
);
