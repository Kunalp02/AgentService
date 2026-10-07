
import { authTokenStore } from "./authTokenStore";
import { serviceUrl } from "../config/api";
import { handleUnauthorized } from "./sessionGuard";

export interface ExecutionStep {
  name: string;
  detail?: string | null;
}

export interface MemorySnapshot {
  scope?: string | null;
  total_turns: number;
  turns_in_prompt: number;
  truncated_for_context_window: boolean;
  persisted: boolean;
}

export interface RetrievedEvidenceItem {
  n?: number | string | null;
  claim: string;
  source?: string | null;
  trust?: number | null;
  score?: number | null;
  status?: string | null;
}

export interface RetrievedKnowledgeBase {
  knowledge_base_id: string;
  knowledge_base_name?: string | null;
  evidence: RetrievedEvidenceItem[];
  answer?: string | null;
}

export interface ExecutionResult {
  agent_id: string;
  session_id: string;
  output: string;
  steps: ExecutionStep[];
  memory: MemorySnapshot;
  retrieved_context: RetrievedKnowledgeBase[];
  metadata: Record<string, unknown>;
}

export interface ModelConfig {
  model_id: string;
  name?: string | null;
  model_identifier: string;
  provider: string;
  base_url?: string | null;
  group_ids: string[];
}

export interface AgentToolRef {
  tool_id: string;
  tool_name?: string | null;
  tool_type: "Remote" | "Local" | string;
}

export interface KnowledgeBaseRef {
  knowledge_base_id: string;
  knowledge_base_name?: string | null;
  mode: "Context" | "Tool" | string;
}

export interface MemoryConfig {
  enabled: boolean;
  scope?: string | null;
  retention?: string | null;
  instructions?: string | null;
}

export interface RuntimeManifest {
  agent_id: string;
  name: string;
  status: string;
  group_ids: string[];
  system_prompt: string;
  temperature: number;
  model: ModelConfig;
  tools: AgentToolRef[];
  knowledge_bases: KnowledgeBaseRef[];
  memory: MemoryConfig;
  manifest_hash: string;
}

export interface ExecutionRequestInput {
  input: string;
  /** Kept stable across turns to get multi-turn memory (see ConversationMemoryService). */
  sessionId?: string | null;
  orgId?: string | null;
}

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
  if (status === 404)
    return {
      message: "This agent is not known to the execution service (404).",
      code,
    };
  if (status === 502 || status === 503)
    return { message: "The model gateway is unavailable right now.", code };
  return { message: `Agent execution failed (${status}).`, code };
}

function authHeader(): Record<string, string> {
  const token = authTokenStore.get();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

// ------------------------------------------------------------------ api

// export const executionApi = {
//   getManifest: async (agentId: string): Promise<RuntimeManifest> => {
//     const r = await fetch(
//       serviceUrl(
//         "execution",
//         `/api/v1/agents/${encodeURIComponent(agentId)}/manifest`,
//       ),
//       {
//         headers: { ...authHeader() },
//       },
//     );
//     const data = await parseBody(r);
//     if (!r.ok) {
//       const { message, code } = messageOf(r.status, data);
//       throw new ExecutionApiError(message, r.status, code);
//     }
//     return data as RuntimeManifest;
//   },

//   execute: async (
//     agentId: string,
//     req: ExecutionRequestInput,
//   ): Promise<ExecutionResult> => {
//     const r = await fetch(
//       serviceUrl(
//         "execution",
//         `/api/v1/agents/${encodeURIComponent(agentId)}/execute`,
//       ),
//       {
//         method: "POST",
//         headers: {
//           "Content-Type": "application/json",
//           Accept: "application/json",
//           ...authHeader(),
//         },
//         body: JSON.stringify({
//           input: req.input,
//           sessionId: req.sessionId ?? undefined,
//           orgId: req.orgId ?? undefined,
//           stream: false,
//         }),
//       },
//     );
//     const data = await parseBody(r);
//     if (!r.ok) {
//       const { message, code } = messageOf(r.status, data);
//       throw new ExecutionApiError(message, r.status, code);
//     }
//     return data as ExecutionResult;
//   },

//   executeStream: async (
//     agentId: string,
//     req: ExecutionRequestInput,
//     onToken: (text: string) => void,
//   ): Promise<ExecutionResult> => {
//     const r = await fetch(
//       serviceUrl(
//         "execution",
//         `/api/v1/agents/${encodeURIComponent(agentId)}/execute`,
//       ),
//       {
//         method: "POST",
//         headers: {
//           "Content-Type": "application/json",
//           Accept: "text/event-stream",
//           ...authHeader(),
//         },
//         body: JSON.stringify({
//           input: req.input,
//           sessionId: req.sessionId ?? undefined,
//           orgId: req.orgId ?? undefined,
//           stream: false,
//         }),
//       },
//     );

//     if (!r.ok || !r.body) {
//       const data = await parseBody(r);
//       const { message, code } = messageOf(r.status, data);
//       throw new ExecutionApiError(message, r.status, code);
//     }

//     const reader = r.body.getReader();
//     const decoder = new TextDecoder();
//     let buffer = "";
//     let result: ExecutionResult | null = null;

//     // eslint-disable-next-line no-constant-condition
//     while (true) {
//       const { done, value } = await reader.read();
//       if (done) break;
//       buffer += decoder.decode(value, { stream: true });

//       // SSE frames (see _sse() on the backend) are separated by a blank line.
//       let sep: number;
//       while ((sep = buffer.indexOf("\n\n")) >= 0) {
//         const frame = buffer.slice(0, sep);
//         buffer = buffer.slice(sep + 2);
//         if (!frame.trim()) continue;

//         const lines = frame.split("\n");
//         const eventLine = lines.find((l) => l.startsWith("event:"));
//         const dataLine = lines.find((l) => l.startsWith("data:"));
//         const event = eventLine ? eventLine.slice(6).trim() : "message";
//         const dataStr = dataLine ? dataLine.slice(5).trim() : "";
//         if (!dataStr) continue;

//         let parsed: any;
//         try {
//           parsed = JSON.parse(dataStr);
//         } catch {
//           continue;
//         }

//         if (event === "token" && typeof parsed.text === "string") {
//           onToken(parsed.text);
//         } else if (event === "done") {
//           result = parsed as ExecutionResult;
//         }
//       }
//     }

//     if (!result)
//       throw new ExecutionApiError(
//         "The stream ended without a final result.",
//         0,
//       );
//     return result;
//   },
// };
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

export interface ActivityRun {
  runId: string;
  threadId: string;
  agentId: string;
  agentName: string;
  status: string;
  input: string;
  output: string;
  error: string;
  startedBy: string;
  clientIp: string;
  createdAt: string;
  steps: string[];
  executionType: string;
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

  loadActivity: async (
    agents: { id: string; name: string }[],
  ): Promise<ActivityRun[]> => {
    const rows: ActivityRun[] = [];
    await Promise.all(
      agents.map(async (agent) => {
        const threads = asList(
          await executionFetch(
            `/api/v1/agents/${encodeURIComponent(agent.id)}/threads`,
          ).catch(() => []),
        ).slice(0, 10);
        await Promise.all(
          threads.map(async (thread) => {
            const threadId = String(
              pick(thread, "threadId", "thread_id") || "",
            );
            if (!threadId) return;
            const runs = asList(
              await executionFetch(
                `/api/v1/agents/${encodeURIComponent(agent.id)}/threads/${encodeURIComponent(threadId)}/runs`,
              ).catch(() => []),
            ).slice(0, 15);
            for (const run of runs) {
              rows.push({
                runId: String(pick(run, "runId", "run_id") || ""),
                threadId,
                agentId: agent.id,
                agentName: agent.name,
                status: String(pick(run, "status") || ""),
                input: String(pick(run, "input") || ""),
                output: String(pick(run, "output") || ""),
                error: String(pick(run, "error") || ""),
                startedBy: String(
                  pick(run, "startedBy", "started_by") ||
                    pick(thread, "triggeredBy", "triggered_by") ||
                    "",
                ),
                clientIp: String(pick(run, "clientIp", "client_ip") || ""),
                createdAt: String(pick(run, "createdAt", "created_at") || ""),
                steps: asList(pick(run, "steps")).map((step) => String(step)),
                executionType: String(
                  pick(thread, "executionType", "execution_type") || "",
                ),
              });
            }
          }),
        );
      }),
    );
    rows.sort(
      (a, b) =>
        new Date(b.createdAt || 0).getTime() -
        new Date(a.createdAt || 0).getTime(),
    );
    return rows;
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
