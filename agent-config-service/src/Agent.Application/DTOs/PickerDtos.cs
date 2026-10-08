
namespace Agent.Application.DTOs;

public record ModelOptionDto(
    Guid Id, string Name, string ModelIdentifier, string Classification,
    IReadOnlyCollection<Guid>? GroupIds = null);
public record KnowledgeBaseOptionDto(Guid Id, string Name, string StrategyName, IEnumerable<Guid> GroupIds);
public record ToolOptionDto(Guid Id, string Name, string ToolType, IEnumerable<Guid> GroupIds);

public record DownstreamAvailability(bool ToolsConfigReachable, bool RagConfigReachable);
public record CallerGroupDto(Guid Id);
public record AgentEditorOptionsDto(
    IEnumerable<ModelOptionDto> Models, IEnumerable<KnowledgeBaseOptionDto> KnowledgeBases,
    IEnumerable<ToolOptionDto> Tools, DownstreamAvailability Availability);
    
public record ModelDetailDto(
    Guid ModelId,
    string? Name,
    string ModelIdentifier,
    string Provider,
    string? BaseUrl,
    HashSet<Guid> GroupIds);
    
public record ModelResolveDto(
    string? ModelIdentifier,
    Guid GatewayId,
    string? GatewayUrl,
    string? ApiKey);
