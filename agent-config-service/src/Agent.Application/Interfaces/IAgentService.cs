
using Agent.Application.DTOs;

namespace Agent.Application.Interfaces;

public interface IAgentService
{
    Task<PagedResult<AgentListItemDto>> ListAsync(AgentQueryParams query, CancellationToken ct = default);
    Task<AgentDto> GetAsync(Guid id, CancellationToken ct = default);
    Task<AgentDto> CreateAsync(CreateAgentRequest request, Guid ownerUserId, string ownerUsername, CancellationToken ct = default);
    Task<AgentDto> UpdateAsync(Guid id, UpdateAgentRequest request, string updatedBy, CancellationToken ct = default);
    Task<AgentDto> PatchAsync(Guid id, PatchAgentRequest request, string updatedBy, CancellationToken ct = default);
    Task DeleteAsync(Guid id, CancellationToken ct = default);
    Task<AgentDto> PublishAsync(Guid id, string publishedBy, CancellationToken ct = default);
    Task<AgentDto> UnpublishAsync(Guid id, string updatedBy, CancellationToken ct = default);
    Task<AgentEditorOptionsDto> GetEditorOptionsAsync(CancellationToken ct = default);
    Task<IReadOnlyList<CallerGroupDto>> GetCallerGroupsAsync(CancellationToken ct = default);
    Task<AgentRuntimeManifestDto> GetRuntimeManifestAsync(Guid id, CancellationToken ct = default);
}
