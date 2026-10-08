
using Microsoft.AspNetCore.Mvc;

namespace Agent.Application.DTOs;
using ccil.ai.platform.common.Auth;

public record AgentKnowledgeBaseDto(Guid KnowledgeBaseId, string? KnowledgeBaseName, string Mode);
public record AgentToolDto(Guid ToolId, string? ToolName, string ToolType);

public record AgentDto(
    Guid Id, string Name, string? Description, Guid ModelId, string? ModelName, double Temperature,
    string SystemPrompt, string Status, Guid OwnerUserId, string OwnerUsername,
    IEnumerable<Guid> GroupIds,
    IEnumerable<AgentKnowledgeBaseDto> KnowledgeBases,
    IEnumerable<AgentToolDto> Tools,
    bool MemoryEnabled, string? MemoryScope, string? MemoryRetention, string? MemoryInstructions,
    DateTimeOffset CreatedAt, DateTimeOffset? UpdatedAt);

public record AgentListItemDto(
    Guid Id, string Name, string Status, string OwnerUsername,
    IEnumerable<Guid> GroupIds, DateTimeOffset CreatedAt);

public record AgentKnowledgeBaseInput(Guid KnowledgeBaseId, string Mode);
public record AgentToolInput(Guid ToolId, string ToolType);

public record CreateAgentRequest(
    string Name, string? Description, Guid ModelId, double Temperature, string SystemPrompt,
    IEnumerable<AgentKnowledgeBaseInput> KnowledgeBases, IEnumerable<AgentToolInput> Tools, IEnumerable<Guid> GroupIds,
    bool MemoryEnabled = false, string? MemoryScope = null, string? MemoryRetention = null, string? MemoryInstructions = null) : IGroupRequirementRequest;

public record UpdateAgentRequest(
    string Name, string? Description, Guid ModelId, double Temperature, string SystemPrompt,
    IEnumerable<AgentKnowledgeBaseInput> KnowledgeBases, IEnumerable<AgentToolInput> Tools, IEnumerable<Guid> GroupIds,
    bool MemoryEnabled = false, string? MemoryScope = null, string? MemoryRetention = null, string? MemoryInstructions = null) : IGroupRequirementRequest;

public record PatchAgentRequest(
    string? Name = null,
    string? Description = null,
    Guid? ModelId = null,
    double? Temperature = null,
    string? SystemPrompt = null,
    IEnumerable<AgentKnowledgeBaseInput>? KnowledgeBases = null,
    IEnumerable<AgentToolInput>? Tools = null,
    IEnumerable<Guid>? GroupIds = null,
    bool? MemoryEnabled = null,
    string? MemoryScope = null,
    string? MemoryRetention = null,
    string? MemoryInstructions = null) : IGroupRequirementRequest;

public record AgentQueryParams(string? Status, Guid? GroupId, string? Search, int Page = 1, int PageSize = 25) : IGroupRequirementRequest
{
    public IEnumerable<Guid> GroupIds => GroupId.HasValue ? new[] { GroupId.Value } : Array.Empty<Guid>();
}

public record AgentGroupContext : IGroupRequirementRequest
{
    [FromQuery(Name = "groupId")]
    public Guid? GroupId { get; init; }

    public IEnumerable<Guid> GroupIds => GroupId.HasValue ? new[] { GroupId.Value } : Array.Empty<Guid>();
}

public record PagedResult<T>(IEnumerable<T> Items, int TotalCount, int Page, int PageSize);
