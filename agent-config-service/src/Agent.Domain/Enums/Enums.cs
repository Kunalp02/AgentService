
namespace Agent.Domain.Enums;

public enum AgentStatus { Draft, Published }

public enum KnowledgeBaseMode { Context, Tool }

public enum ToolType { Remote, Local }

public enum AgentMemoryScope {Session, User, Agent, Organization}

public enum AgentMemoryRetention { Session, Days7, Days30, Days90, Years1, Forever }
