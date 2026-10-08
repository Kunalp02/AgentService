

using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using Agent.Domain.Entities;

namespace Agent.Infrastructure.Persistence.Configurations;

public class AgentDefinitionConfiguration : IEntityTypeConfiguration<AgentDefinition>
{
    public void Configure(EntityTypeBuilder<AgentDefinition> b)
    {
        b.ToTable("agents");
        b.HasKey(x => x.Id);
        b.Property(x => x.Name).HasMaxLength(128).IsRequired();
        b.Property(x => x.SystemPrompt).HasColumnType("text").IsRequired();
        b.Property(x => x.Status).HasConversion<string>().HasMaxLength(32);
        b.Property(x => x.OwnerUsername).HasMaxLength(256).IsRequired();
        b.HasIndex(x => x.Status);
        b.HasIndex(x => x.OwnerUserId);

        b.Property(x => x.MemoryEnabled).IsRequired().HasDefaultValue(false);
        b.Property(x => x.MemoryScope).HasConversion<string>().HasMaxLength(32);
        b.Property(x => x.MemoryRetention).HasConversion<string>().HasMaxLength(32);
        b.Property(x => x.MemoryInstructions).HasColumnType("text");

        b.HasMany(x => x.AgentGroups).WithOne(g => g.Agent).HasForeignKey(g => g.AgentId).OnDelete(DeleteBehavior.Cascade);
        b.HasMany(x => x.AgentKnowledgeBases).WithOne(k => k.Agent).HasForeignKey(k => k.AgentId).OnDelete(DeleteBehavior.Cascade);
        b.HasMany(x => x.AgentTools).WithOne(t => t.Agent).HasForeignKey(t => t.AgentId).OnDelete(DeleteBehavior.Cascade);
        b.HasMany(x => x.Audits).WithOne(a => a.Agent).HasForeignKey(a => a.AgentId).OnDelete(DeleteBehavior.Cascade);
    }
}

public class AgentGroupConfiguration : IEntityTypeConfiguration<AgentGroup>
{
    public void Configure(EntityTypeBuilder<AgentGroup> b)
    {
        b.ToTable("agent_groups");
        b.HasKey(x => new { x.AgentId, x.GroupId });
        b.HasIndex(x => x.GroupId);
    }
}

public class AgentKnowledgeBaseConfiguration : IEntityTypeConfiguration<AgentKnowledgeBase>
{
    public void Configure(EntityTypeBuilder<AgentKnowledgeBase> b)
    {
        b.ToTable("agent_knowledge_bases");
        b.HasKey(x => new { x.AgentId, x.KnowledgeBaseId });
        b.Property(x => x.Mode).HasConversion<string>().HasMaxLength(16);
    }
}

public class AgentToolConfiguration : IEntityTypeConfiguration<AgentTool>
{
    public void Configure(EntityTypeBuilder<AgentTool> b)
    {
        b.ToTable("agent_tools");
        b.HasKey(x => new { x.AgentId, x.ToolId, x.ToolType });
        b.Property(x => x.ToolType).HasConversion<string>().HasMaxLength(16);
    }
}

public class AgentAuditConfiguration : IEntityTypeConfiguration<AgentAudit>
{
    public void Configure(EntityTypeBuilder<AgentAudit> b)
    {
        b.ToTable("agent_audits");
        b.HasKey(x => x.Id);
        b.Property(x => x.Action).HasMaxLength(32).IsRequired();
        b.Property(x => x.ChangedBy).HasMaxLength(256).IsRequired();
        b.Property(x => x.DetailsJson).HasColumnType("jsonb");
    }
}
