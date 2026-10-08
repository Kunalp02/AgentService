
using Microsoft.EntityFrameworkCore;
using Agent.Domain.Entities;

namespace Agent.Application.Interfaces;

public interface IAgentDbContext
{
    DbSet<AgentDefinition> Agents { get; }
    DbSet<AgentGroup> AgentGroups { get; }
    DbSet<AgentKnowledgeBase> AgentKnowledgeBases { get; }
    DbSet<AgentTool> AgentTools { get; }
    DbSet<AgentAudit> AgentAudits { get; }

    Task<int> SaveChangesAsync(CancellationToken ct = default);
}
