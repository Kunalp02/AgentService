namespace Agent.Application.DTOs;

public record ModelOptionDto(
    Guid Id, string Name, string ModelIdentifier, string Classification,
    IReadOnlyCollection<Guid>? GroupIds = null);
public record KnowledgeBaseOptionDto(Guid Id, string Name, string StrategyName, IEnumerable<Guid> GroupIds);
public record ToolOptionDto(Guid Id, string Name, string ToolType, IEnumerable<Guid> GroupIds);

public record RemoteMcpToolOptionDto(Guid Id, string Name, string? Description);

public record RemoteMcpServerOptionDto(
    Guid Id,
    string Name,
    string? RemoteMcpServerUrl,
    string? TransportType,
    string? AuthOption,
    IEnumerable<Guid> GroupIds,
    IEnumerable<RemoteMcpToolOptionDto> Tools);

public record RemoteMcpServerDetailDto(
    Guid Id,
    string Name,
    string? RemoteMcpServerUrl,
    string? TransportType,
    string? AuthOption,
    string? ApiKey,
    IReadOnlyCollection<Guid> GroupIds,
    IReadOnlyList<RemoteMcpToolOptionDto> Tools);

public record DownstreamAvailability(bool ToolsConfigReachable, bool RagConfigReachable);
public record CallerGroupDto(Guid Id);
public record AgentEditorOptionsDto(
    IEnumerable<ModelOptionDto> Models,
    IEnumerable<KnowledgeBaseOptionDto> KnowledgeBases,
    IEnumerable<ToolOptionDto> Tools,
    IEnumerable<RemoteMcpServerOptionDto> RemoteMcpServers,
    DownstreamAvailability Availability);
    
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
    
public record LocalToolSpecDto(Guid Id, string Name, string? Description, string? ParametersSchemaJson);