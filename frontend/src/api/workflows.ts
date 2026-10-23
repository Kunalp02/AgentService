import { authTokenStore } from "./authTokenStore";
import { serviceUrl } from "../config/api";
import { handleUnauthorized } from "./sessionGuard";
import type {
  WorkflowDefinition,
  WorkflowDocument,
  WorkflowRunRequest,
  WorkflowRunResponse,
  WorkflowSummary,
  WorkflowUpsert,
} from "../types/workflow";

async function parseBody(r: Response): Promise<any> {
  const text = await r.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return { message: text };
  }
}

function messageOf(status: number, body: any): string {
  const code = body?.code;
  const detail = body?.message ?? body?.detail ?? body?.title;
  if (typeof detail === "string" && detail.trim()) {
    return code ? `${code}: ${detail}` : detail;
  }
  if (status === 401) return "Session expired or token missing (401).";
  if (status === 404) return "Workflow not found (404).";
  if (status === 409) return detail || "Workflow conflict (409).";
  return `Workflow request failed (${status})`;
}

async function workflowFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  const sent = authTokenStore.get();
  const r = await fetch(serviceUrl("execution", `/api/v1${path}`), {
    ...init,
    headers: {
      Accept: "application/json",
      ...(init.body ? { "Content-Type": "application/json" } : {}),
      ...(sent ? { Authorization: `Bearer ${sent}` } : {}),
      ...(init.headers || {}),
    },
  });
  const data = await parseBody(r);
  if (r.status === 401) handleUnauthorized(sent);
  if (!r.ok) throw new Error(messageOf(r.status, data));
  return data as T;
}

function mapSummary(raw: any): WorkflowSummary {
  return {
    workflowId: String(raw.workflowId ?? raw.workflow_id ?? ""),
    name: String(raw.name ?? ""),
    status: String(raw.status ?? ""),
    updatedAt: String(raw.updatedAt ?? raw.updated_at ?? ""),
  };
}

function mapDocument(raw: any): WorkflowDocument {
  const def = raw.definition ?? {};
  return {
    ...mapSummary(raw),
    createdAt: String(raw.createdAt ?? raw.created_at ?? ""),
    definition: {
      maxSteps: def.maxSteps ?? def.max_steps ?? 30,
      nodes: (def.nodes ?? []).map((n: any) => ({
        id: n.id,
        type: n.type,
        agentId: n.agentId ?? n.agent_id,
        workflowId: n.workflowId ?? n.workflow_id,
        input: n.input,
        output: n.output,
        on: n.on,
        role: n.role,
        position: n.position,
      })),
      edges: (def.edges ?? []).map((e: any) => ({
        from: e.from ?? e.from_node,
        to: e.to ?? e.to_node,
        when: e.when ?? "",
        maxLoops: e.maxLoops ?? e.max_loops,
      })),
    },
  };
}

function toApiDefinition(def: WorkflowDefinition) {
  return {
    maxSteps: def.maxSteps ?? 30,
    nodes: def.nodes.map((n) => ({
      id: n.id,
      type: n.type,
      agentId: n.agentId,
      workflowId: n.workflowId,
      role: n.role,
      input: n.input,
      output: n.output,
      on: n.on,
      position: n.position,
    })),
    edges: def.edges.map((e) => ({
      from: e.from,
      to: e.to,
      when: e.when ?? "",
      maxLoops: e.maxLoops,
    })),
  };
}

export const workflowsApi = {
  list: () =>
    workflowFetch<any[]>("/workflows").then((rows) => rows.map(mapSummary)),

  get: (id: string) => workflowFetch<any>(`/workflows/${id}`).then(mapDocument),

  create: (body: WorkflowUpsert) =>
    workflowFetch<any>("/workflows", {
      method: "POST",
      body: JSON.stringify({
        name: body.name,
        definition: toApiDefinition(body.definition),
      }),
    }).then(mapDocument),

  update: (id: string, body: WorkflowUpsert) =>
    workflowFetch<any>(`/workflows/${id}`, {
      method: "PUT",
      body: JSON.stringify({
        name: body.name,
        definition: toApiDefinition(body.definition),
      }),
    }).then(mapDocument),

  publish: (id: string) =>
    workflowFetch<any>(`/workflows/${id}/publish`, { method: "POST" }).then(
      mapDocument,
    ),

  unpublish: (id: string) =>
    workflowFetch<any>(`/workflows/${id}/unpublish`, { method: "POST" }).then(
      mapDocument,
    ),

  run: (id: string, body: WorkflowRunRequest) =>
    workflowFetch<WorkflowRunResponse>(`/workflows/${id}/runs`, {
      method: "POST",
      body: JSON.stringify(body),
    }),

  resume: (id: string, runId: string, input: string) =>
    workflowFetch<WorkflowRunResponse>(
      `/workflows/${id}/runs/${encodeURIComponent(runId)}/resume`,
      { method: "POST", body: JSON.stringify({ input }) },
    ),
};
