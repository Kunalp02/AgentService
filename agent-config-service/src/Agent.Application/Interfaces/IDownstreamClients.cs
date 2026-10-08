
// using Agent.Application.DTOs;
//
// namespace Agent.Application.Interfaces;
//
// public interface IToolsConfigClient
// {
//     Task<(bool Reachable, IReadOnlyList<ModelOptionDto> Models)> GetActiveModelsAsync(string? classification, CancellationToken ct = default);
//     Task<(bool Reachable, ModelDetailDto? Detail)> GetModelAsync(Guid modelId, CancellationToken ct = default);
//     Task<(bool Reachable, IReadOnlyList<ToolOptionDto> Tools)> GetAvailableToolsAsync(CancellationToken ct = default);
//     Task<ReferenceCheck> ValidateToolVisibleAsync(Guid toolId, string toolType, CancellationToken ct = default);
//     Task<ReferenceCheck> ValidateModelVisibleAsync(Guid modelId, IReadOnlyCollection<Guid> agentGroupIds, CancellationToken ct = default);
//     
//     Task<(bool Reachable, ModelResolveDto? Result)> ResolveModelAsync(Guid modelId, CancellationToken ct = default);
//
// }
//
// public interface IRagConfigClient
// {
//     Task<(bool Reachable, IReadOnlyList<KnowledgeBaseOptionDto> KnowledgeBases)> GetAvailableKnowledgeBasesAsync(CancellationToken ct = default);
//     Task<ReferenceCheck> ValidateKnowledgeBaseVisibleAsync(Guid knowledgeBaseId, CancellationToken ct = default);
// }

using Agent.Application.DTOs;

namespace Agent.Application.Interfaces;

public interface IToolsConfigClient
{
    Task<(bool Reachable, IReadOnlyList<ModelOptionDto> Models)> GetActiveModelsAsync(string? classification, CancellationToken ct = default);
    Task<(bool Reachable, ModelDetailDto? Detail)> GetModelAsync(Guid modelId, CancellationToken ct = default);
    Task<(bool Reachable, IReadOnlyList<ToolOptionDto> Tools)> GetAvailableToolsAsync(CancellationToken ct = default);

    // Task<ReferenceCheck> ValidateToolVisibleAsync(Guid toolId, string toolType, IReadOnlyCollection<Guid> agentGroupIds, CancellationToken ct = default);

    Task<ReferenceCheck> ValidateToolVisibleAsync(
        Guid toolId,
        string toolType,
        IReadOnlyCollection<Guid> agentGroupIds,
        CancellationToken ct = default);
    Task<ReferenceCheck> ValidateModelVisibleAsync(Guid modelId, IReadOnlyCollection<Guid> agentGroupIds, CancellationToken ct = default);

    Task<(bool Reachable, ModelResolveDto? Result)> ResolveModelAsync(Guid modelId, CancellationToken ct = default);
}

public interface IRagConfigClient
{
    Task<(bool Reachable, IReadOnlyList<KnowledgeBaseOptionDto> KnowledgeBases)> GetAvailableKnowledgeBasesAsync(CancellationToken ct = default);
    
    // Task<ReferenceCheck> ValidateKnowledgeBaseVisibleAsync(Guid knowledgeBaseId, IReadOnlyCollection<Guid> agentGroupIds, CancellationToken ct = default);
    Task<ReferenceCheck> ValidateKnowledgeBaseVisibleAsync(
        Guid knowledgeBaseId,
        IReadOnlyCollection<Guid> agentGroupIds,
        CancellationToken ct = default);
}
