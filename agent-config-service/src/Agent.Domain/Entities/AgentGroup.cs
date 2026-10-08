
namespace Agent.Domain.Entities;

/// <summary>Visibility/access scoping for the Agent itself - an Agent is only listable/
/// usable by users sharing at least one group with it, mirroring the Knowledge Base pattern.</summary>
public class AgentGroup
{
    public Guid AgentId { get; set; }
    public AgentDefinition Agent { get; set; } = default!;

    public Guid GroupId { get; set; }
    public string? GroupName { get; set; }
}
