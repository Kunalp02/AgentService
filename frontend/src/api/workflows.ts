import { authTokenStore } from "./authTokenStore";
import { serviceUrl } from "../config/api";
import { handleUnauthorized } from "./sessionGuard";

export interface WorkflowNode {
  id: string;
  type: "start" | "agent" | "condition" | "end";
  agentId?: string | null;
  input?: string;
  output?: string;
  on?: string;
  position?: { x: number; y: number } | null;
}

export interface WorkflowEdge {
  from: string;
  to: string;
  when?: string;
  maxLoops?: number | null;
}

export interface WorkflowDefinition {
  nodes: WorkflowNode[];
  edges: WorkflowEdge[];
  maxSteps?: number;
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

export interface WorkflowStepTrace {
  nodeId: string;
  type: string;
  agentId?: string | null;
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
  output: string;
  error: string;
  sessionId: string;
  userId: string;
  steps: WorkflowStepTrace[];
  state: Record<string, string>;
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const token = authTokenStore.get();
  const response = await fetch(serviceUrl("execution", `/api/v1/workflows${path}`), {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...init.headers,
    },
  });
  if (response.status === 401) {
    handleUnauthorized(token);
  }
  const text = await response.text();
  const data = text ? JSON.parse(text) : null;
  if (!response.ok) {
    const detail = data?.message || data?.detail || data?.Message || response.statusText;
    throw new Error(typeof detail === "string" ? detail : `Workflow request failed (${response.status})`);
  }
  return data as T;
}

export const workflowsApi = {
  list: () => request<WorkflowSummary[]>(""),
  get: (id: string) => request<WorkflowDocument>(`/${id}`),
  create: (name: string, definition: WorkflowDefinition) =>
    request<WorkflowDocument>("", {
      method: "POST",
      body: JSON.stringify({ name, definition }),
    }),
  update: (id: string, name: string, definition: WorkflowDefinition) =>
    request<WorkflowDocument>(`/${id}`, {
      method: "PUT",
      body: JSON.stringify({ name, definition }),
    }),
  publish: (id: string) => request<WorkflowDocument>(`/${id}/publish`, { method: "POST" }),
  unpublish: (id: string) => request<WorkflowDocument>(`/${id}/unpublish`, { method: "POST" }),
  run: (
    id: string,
    body: { input: string; sessionId?: string; userId?: string; orgId?: string },
  ) =>
    request<WorkflowRunResponse>(`/${id}/runs`, {
      method: "POST",
      body: JSON.stringify(body),
    }),
};
