export type WorkflowNodeType =
  | "start"
  | "end"
  | "agent"
  | "condition"
  | "human"
  | "parallel"
  | "join"
  | "workflow";

export interface WorkflowNode {
  id: string;
  type: WorkflowNodeType;
  agentId?: string;
  workflowId?: string;
  input?: string;
  output?: string;
  on?: string;
  position?: { x: number; y: number };
  role?: "supervisor" | "specialist" | "default";
}

export interface WorkflowEdge {
  from: string;
  to: string;
  when?: string;
  maxLoops?: number;
}

export interface WorkflowDefinition {
  nodes: WorkflowNode[];
  edges: WorkflowEdge[];
  maxSteps?: number;
}

export interface WorkflowUpsert {
  name: string;
  definition: WorkflowDefinition;
}

export interface WorkflowSummary {
  workflowId: string;
  name: string;
  status: string;
  updatedAt: string;
}

export interface WorkflowDocument extends WorkflowSummary {
  definition: WorkflowDefinition;
  createdAt: string;
}

export interface WorkflowRunRequest {
  input: string;
  sessionId?: string;
  userId?: string;
  orgId?: string;
}

export interface WorkflowStepTrace {
  nodeId: string;
  type: string;
  agentId?: string;
  status: string;
  input?: string;
  output?: string;
  outputKey?: string;
  error?: string;
}

export interface WorkflowRunResponse {
  workflowRunId: string;
  workflowId: string;
  status: string;
  output?: string;
  error?: string;
  sessionId: string;
  userId: string;
  steps: WorkflowStepTrace[];
  state: Record<string, unknown>;
}
