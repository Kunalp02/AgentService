
using Agent.Domain.Enums;

namespace Agent.Domain.Entities;

public class AgentTool
{
    public Guid AgentId { get; set; }
    public AgentDefinition Agent { get; set; } = default!;

    /// <summary>Tool id from ccil.aiplatform.tools_config (cross-service reference,
    /// either a RemoteToolConfig id or a LocalToolConfig id depending on ToolType).</summary>
    public Guid ToolId { get; set; }
    public string? ToolNameCache { get; set; }
    public ToolType ToolType { get; set; }
}
