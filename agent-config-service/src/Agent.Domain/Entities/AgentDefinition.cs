
using Agent.Domain.Enums;
using ccil.ai.platform.common.Models;

namespace Agent.Domain.Entities;

public class AgentDefinition : AuditableEntity
{
    public string Name { get; set; } = default!;
    public string? Description { get; set; }
    public Guid ModelId { get; set; }
    public string? ModelNameCache { get; set; } 
    public double Temperature { get; set; } = 0.7;
    public string SystemPrompt { get; set; } = default!;

    public AgentStatus Status { get; set; } = AgentStatus.Draft;
    public Guid OwnerUserId { get; set; }
    public string OwnerUsername { get; set; } = default!;
    public bool IsDeleted { get; set; }

    public bool MemoryEnabled { get; set; }
    public AgentMemoryScope? MemoryScope { get; set; }
    public AgentMemoryRetention? MemoryRetention { get; set; }
    public string? MemoryInstructions { get; set; }

    public ICollection<AgentGroup> AgentGroups { get; set; } = new List<AgentGroup>();
    public ICollection<AgentKnowledgeBase> AgentKnowledgeBases { get; set; } = new List<AgentKnowledgeBase>();
    public ICollection<AgentTool> AgentTools { get; set; } = new List<AgentTool>();
    public ICollection<AgentAudit> Audits { get; set; } = new List<AgentAudit>();
}
