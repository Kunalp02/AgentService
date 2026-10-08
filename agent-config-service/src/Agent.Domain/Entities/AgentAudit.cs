
namespace Agent.Domain.Entities;

public class AgentAudit
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid AgentId { get; set; }
    public AgentDefinition Agent { get; set; } = default!;
    public string Action { get; set; } = default!; 
    public string ChangedBy { get; set; } = default!;
    public DateTimeOffset ChangedAt { get; set; } = DateTimeOffset.UtcNow;
    public string? DetailsJson { get; set; }
}
