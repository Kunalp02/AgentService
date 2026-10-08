
using Agent.Domain.Enums;

namespace Agent.Domain.Entities;

public class AgentKnowledgeBase
{
    public Guid AgentId { get; set; }
    public AgentDefinition Agent { get; set; } = default!;

    /// <summary>Knowledge Base id from ccil.aiplatform.rag_config (cross-service reference).</summary>
    public Guid KnowledgeBaseId { get; set; }
    public string? KnowledgeBaseNameCache { get; set; }
    public KnowledgeBaseMode Mode { get; set; }
}
