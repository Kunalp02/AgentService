import { authTokenStore } from "./authTokenStore";
import { serviceUrl } from "../config/api";
import { handleUnauthorized } from "./sessionGuard";

// ------------------------------------------------------------------ errors

export class ExecutionApiError extends Error {
  status: number;
  code?: string;
  constructor(message: string, status: number, code?: string) {
    super(message);
    this.name = "ExecutionApiError";
    this.status = status;
    this.code = code;
  }
}

async function parseBody(r: Response): Promise<any> {
  const text = await r.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return { message: text };
  }
}

/** Matches register_exception_handlers()'s {"code": ..., "message": ...} shape. */
function messageOf(
  status: number,
  body: any,
): { message: string; code?: string } {
  const code = body?.code;
  const detail = body?.message ?? body?.detail ?? body?.title;
  if (typeof detail === "string" && detail.trim()) {
    return { message: code ? `${code}: ${detail}` : detail, code };
  }
  if (status === 400)
    return {
      message: "The agent rejected this request — it may not be published.",
      code,
    };
  if (status === 401)
    return {
      message: "Session expired or token missing (401). Sign in again.",
      code,
    };
  if (status === 404) {
    const detail =
      typeof body?.message === "string" && body.message.trim()
        ? body.message.trim()
        : typeof body?.detail === "string"
          ? body.detail.trim()
          : "";
    if (detail.toLowerCase().includes("not found")) {
      return {
        message: detail.includes("Resource not found:")
          ? `${detail} — check execution service AGENT_CONFIG_BASE_URL and that this agent exists in agent-config.`
          : detail,
        code,
      };
    }
    return {
      message:
        detail ||
        "Not found (404). Check the execution service URL (VITE_EXECUTION_BASE_URL / proxy) and path /api/v1/...",
      code,
    };
  }
  if (status === 502 || status === 503)
    return { message: "The model gateway is unavailable right now.", code };
  return { message: `Agent execution failed (${status}).`, code };
}

function authHeader(): Record<string, string> {
  const token = authTokenStore.get();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

function pick(row: any, ...keys: string[]) {
  for (const key of keys) {
    if (row && row[key] != null && row[key] !== "") return row[key];
  }
  return undefined;
}

async function executionFetch(path: string, init: RequestInit = {}) {
  const sent = authTokenStore.get();
  const r = await fetch(serviceUrl("execution", path), {
    ...init,
    headers: {
      Accept: "application/json",
      ...(init.body ? { "Content-Type": "application/json" } : {}),
      ...authHeader(),
      ...(init.headers || {}),
    },
  });
  const data = await parseBody(r);
  if (r.status === 401) handleUnauthorized(sent);
  if (!r.ok) {
    const { message, code } = messageOf(r.status, data);
    throw new ExecutionApiError(message, r.status, code);
  }
  return data;
}

export interface TestRunResult {
  threadId: string;
  runId: string;
  output: string;
  status: string;
  error: string;
  steps: string[];
  startedBy: string;
  clientIp: string;
}

function asList(data: any): any[] {
  if (Array.isArray(data)) return data;
  if (Array.isArray(data?.items)) return data.items;
  return [];
}

export const executionApi = {
  /** Studio test only: one chat, then one message. */
  sendTestMessage: async (
    agentId: string,
    input: string,
    threadId?: string | null,
  ): Promise<TestRunResult> => {
    let id = threadId || "";
    if (!id) {
      const created = await executionFetch(
        `/api/v1/agents/${encodeURIComponent(agentId)}/threads`,
        {
          method: "POST",
          body: JSON.stringify({ executionType: "TEST" }),
        },
      );
      id = String(pick(created, "threadId", "thread_id") || "");
    }
    const run = await executionFetch(
      `/api/v1/agents/${encodeURIComponent(agentId)}/threads/${encodeURIComponent(id)}/runs`,
      {
        method: "POST",
        body: JSON.stringify({ input, stream: false, background: false }),
      },
    );
    const steps = asList(pick(run, "steps")).map((step) =>
      typeof step === "string"
        ? step
        : String(step?.name || step?.detail || ""),
    );
    return {
      threadId: String(pick(run, "threadId", "thread_id") || id),
      runId: String(pick(run, "runId", "run_id") || ""),
      output: String(pick(run, "output") || ""),
      status: String(pick(run, "status") || "SUCCEEDED"),
      error: String(pick(run, "error") || ""),
      steps,
      startedBy: String(pick(run, "startedBy", "started_by") || ""),
      clientIp: String(pick(run, "clientIp", "client_ip") || ""),
    };
  },
};

export interface AuditRunItem {
  runId: string;
  threadId: string;
  agentId: string;
  status: string;
  dispatch: string;
  channel: string;
  executionType: string;
  triggeredBy: string;
  deploymentSlug?: string | null;
  inputPreview: string;
  error?: string | null;
  stopReason?: string | null;
  attempt: number;
  createdAt: string;
  startedAt?: string | null;
  completedAt?: string | null;
  durationMs?: number | null;
}
export interface AuditRunDetail extends AuditRunItem {
  input: string;
  output?: string | null;
  steps: string[];
  retrievedContext: any[];
  toolCalls: any[];
  manifestHash: string;
  revisionId?: string | null;
}
export interface AuditFilters {
  status?: string;
  channel?: string;
  executionType?: string;
  from?: string;
  to?: string;
  search?: string;
}

export const auditApi = {
  list: (agentId: string, f: AuditFilters, limit: number, offset: number) => {
    const q = new URLSearchParams({
      limit: String(limit),
      offset: String(offset),
    });
    (Object.entries(f) as [string, string | undefined][]).forEach(
      ([k, v]) => v && q.set(k, v),
    );
    return executionFetch(
      `/api/v1/agents/${encodeURIComponent(agentId)}/audit/runs?${q}`,
    ) as Promise<{
      items: AuditRunItem[];
      total: number;
      limit: number;
      offset: number;
    }>;
  },
  get: (agentId: string, runId: string) =>
    executionFetch(
      `/api/v1/agents/${encodeURIComponent(agentId)}/audit/runs/${encodeURIComponent(runId)}`,
    ) as Promise<AuditRunDetail>,
};
