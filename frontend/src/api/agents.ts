
import { authTokenStore } from "./authTokenStore";
import { serviceUrl } from "../config/api";
import type {
  AgentDto,
  AgentEditorOptionsDto,
  AgentListItemDto,
  CreateAgentRequest,
  PagedResult,
  PatchAgentRequest,
} from "../types/agent";

async function parseBody(r: Response): Promise<any> {
  const text = await r.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return { detail: text };
  }
}

function messageOf(status: number, body: any): string {
  const detail =
    body?.detail ?? body?.Detail ?? body?.title ?? body?.Title ?? body?.message;
  const code = body?.code ?? body?.Code ?? body?.errorCode;
  if (typeof detail === "string" && detail.trim())
    return code ? `${code}: ${detail}` : detail;
  if (status === 401)
    return "Session expired or token missing (401). Sign in again.";
  if (status === 403)
    return "You do not have the required agent permission (403).";
  if (status === 404)
    return "Agent not found, or it is not visible to your groups (404).";
  if (status === 503)
    return body?.detail || "Tools or RAG service is unreachable (503).";
  return `Agent service request failed (${status})`;
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const token = authTokenStore.get();
  const r = await fetch(serviceUrl("agent", `/api/v1/agents${path}`), {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...init.headers,
    },
  });
  const data = await parseBody(r);
  if (!r.ok) throw new Error(messageOf(r.status, data));
  if (r.status === 204) return undefined as T;
  return data as T;
}

export const agentsApi = {
  getAgents: (
    page = 1,
    pageSize = 25,
    search?: string,
    status?: string,
    groupId?: string,
  ) => {
    const q = new URLSearchParams({
      Page: String(page),
      PageSize: String(pageSize),
    });
    if (search) q.set("Search", search);
    if (status) q.set("Status", status);
    if (groupId) q.set("GroupId", groupId);
    return request<PagedResult<AgentListItemDto>>(`?${q.toString()}`);
  },

  getAgent: (id: string) => request<AgentDto>(`/${id}`),

  getEditorOptions: (groupIds?: string[]) => {
    const q = new URLSearchParams();

    for (const id of groupIds ?? []) {
      if (id) q.append("groupIds", id);
    }

    const suffix = q.toString();

    return request<AgentEditorOptionsDto>(
      suffix ? `/editor-options?${suffix}` : "/editor-options",
    );
  },

  createAgent: (data: CreateAgentRequest) =>
    request<AgentDto>("", { method: "POST", body: JSON.stringify(data) }),

  patchAgent: (id: string, data: PatchAgentRequest) =>
    request<AgentDto>(`/${id}`, {
      method: "PATCH",
      body: JSON.stringify(data),
    }),

  deleteAgent: (id: string) => request<void>(`/${id}`, { method: "DELETE" }),

  publishAgent: (id: string) =>
    request<AgentDto>(`/${id}/publish`, { method: "POST" }),

  unpublishAgent: (id: string) =>
    request<AgentDto>(`/${id}/unpublish`, { method: "POST" }),
};
