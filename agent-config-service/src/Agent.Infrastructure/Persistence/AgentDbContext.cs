
using Microsoft.EntityFrameworkCore;
using Agent.Application.Interfaces;
using Agent.Domain.Entities;

namespace Agent.Infrastructure.Persistence;

public class AgentDbContext : DbContext, IAgentDbContext
{
    public AgentDbContext(DbContextOptions<AgentDbContext> options) : base(options) { }

    public DbSet<AgentDefinition> Agents => Set<AgentDefinition>();
    public DbSet<AgentGroup> AgentGroups => Set<AgentGroup>();
    public DbSet<AgentKnowledgeBase> AgentKnowledgeBases => Set<AgentKnowledgeBase>();
    public DbSet<AgentTool> AgentTools => Set<AgentTool>();
    public DbSet<AgentAudit> AgentAudits => Set<AgentAudit>();

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        modelBuilder.ApplyConfigurationsFromAssembly(typeof(AgentDbContext).Assembly);
        base.OnModelCreating(modelBuilder);
    }
}
