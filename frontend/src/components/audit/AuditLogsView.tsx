
// import React, { useState } from 'react';
// import {
//   FileCode,
//   ShieldCheck,
//   Search,
//   Filter,
//   Calendar,
//   User,
//   Clock,
//   CheckCircle2,
//   AlertTriangle,
//   ArrowDownRight,
// } from 'lucide-react';
// import { usePlatform } from '../../context/PlatformContext';

// export const AuditLogsView: React.FC = () => {
//   const { auditLogs, theme, setTheme } = usePlatform();
//   const [searchFilter, setSearchFilter] = useState('');
//   const [actionFilter, setActionFilter] = useState('ALL');

//   const filteredLogs = auditLogs.filter((log) => {
//     const matchesSearch =
//       log.userName.toLowerCase().includes(searchFilter.toLowerCase()) ||
//       log.userWindowsId.toLowerCase().includes(searchFilter.toLowerCase()) ||
//       log.details.toLowerCase().includes(searchFilter.toLowerCase()) ||
//       log.action.toLowerCase().includes(searchFilter.toLowerCase());

//     const matchesAction = actionFilter === 'ALL' || log.action === actionFilter;

//     return matchesSearch && matchesAction;
//   });

//   const uniqueActions = Array.from(new Set(auditLogs.map((l) => l.action)));

//   return (
//     <div id="audit-logs-view" className={`p-5 space-y-5 max-w-7xl mx-auto `}>
//       <div className={`panel ${theme === 'light' ? 'backdrop-blur-lg bg-slate-950/5 border-neutral-900/5 shadow-none' : 'backdrop-blur-lg bg-slate-100/5 border-neutral-100/10'}`}>
//       {/* View Header */}
//       <div className={`flex flex-col sm:flex-row sm:items-center justify-between gap-4`}>
//         <div>
//           <div className="flex items-center gap-2">
//             <span className={`text-xs font-semibold px-2 py-0.5 rounded-full bg-indigo-500/20 border border-indigo-500/30 ${theme === 'light' ? 'text-indigo-800' : 'text-indigo-300'}`}>
//               SOC-2 Type II Compliance
//             </span>
//             <span className={`text-xs ${theme === 'light' ? 'text-slate-600' : 'text-slate-400'}`}>Immutable Telemetry Logs</span>
//           </div>
//           <h1 className={`header ${theme === 'light' ? 'text-sky-950' : 'text-sky-50'}`}>
//             Enterprise Security & Audit Trail
//           </h1>
//           <p className={`header-disciption max-w-full ${theme === 'light' ? 'text-gray-800' : 'text-gray-200'}`}>
//             Comprehensive tamper-proof audit trail capturing Windows AD logins, role modifications, Python AST tool approvals, and agent dispatch events.
//           </p>
//         </div>

//         <div className={`text-right text-slate-400 text-xs  ${theme === 'light' ? 'text-slate-600' : 'text-slate-400'}`}>
//           Total Logged Events: <span className={`font-bold ${theme === 'light' ? 'text-gray-800' : 'text-gray-200'}`}>{auditLogs.length}</span>
//         </div>
//       </div>

//       {/* Filters Bar */}
//       <div className="flex flex-col sm:flex-row items-center justify-between gap-3 mt-2 ">
//         <div className="relative flex-1 w-full">
//           <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
//           <input
//             type="text"
//             value={searchFilter}
//             onChange={(e) => setSearchFilter(e.target.value)}
//             placeholder="Search by Windows ID, user name, action, or details..."
//             className={`${theme === 'light' ? 'input-base-light' : 'input-base-dark'}`} />
//         </div>

//         <div className="flex items-center gap-2 w-full sm:w-auto">
//           <select
//             value={actionFilter}
//             onChange={(e) => setActionFilter(e.target.value)}
//             className={`pl-3 ${theme === 'light' ? 'input-base-light' : 'input-base-dark'}`}
//           >
//             <option value="ALL">All Action Events ({auditLogs.length})</option>
//             {uniqueActions.map((action) => (
//               <option key={action} value={action}>
//                 {action}
//               </option>
//             ))}
//           </select>
//         </div>
//       </div>

//       {/* Audit Log Table */}
//       <div className="overflow-hidden mt-2 ">
//         <div className="overflow-x-auto">
//           <table className={`table-class`}>
//             <thead className={` ${theme === 'light' ? 'thead-light' : 'thead-dark'}`}>
//               <tr>
//                 <th>Timestamp</th>
//                 <th>Actor (Windows ID)</th>
//                 <th>Action Event</th>
//                 <th>IP / Host</th>
//                 <th>Event Details</th>
//               </tr>
//             </thead>
//             <tbody className={`divide-y ${theme === 'light' ? 'table-body-light' : 'table-body-dark'}`}>
//               {filteredLogs.map((log) => (
//                 <tr key={log.id} className={`transition-colors ${theme === 'light' ? 'hover:bg-slate-200/50' : 'hover:bg-slate-800/50'}`}>
//                   <td className="whitespace-nowrap">
//                     {new Date(log.timestamp).toLocaleString()}
//                   </td>

//                   <td>
//                     <div className={`font-semibold ${theme === 'light' ? 'text-gray-800' : 'text-gray-100'}`}>{log.userName}</div>
//                     <div className={`text-xs  ${theme === 'light' ? 'text-slate-600' : 'text-slate-400'}`}>{log.userWindowsId}</div>
//                   </td>

//                   <td>
//                     <span className={`px-2 py-0.5 rounded border font-bold ${theme === 'light' ? 'border-blue-400/50 bg-blue-200/50 ' : 'border-blue-500/50 bg-blue-600/30'}`}>
//                       {log.action}
//                     </span>
//                   </td>

//                   <td>
//                     {log.ipAddress}
//                   </td>

//                   <td className="max-w-md truncate">
//                     {log.details}
//                   </td>
//                 </tr>
//               ))}
//             </tbody>
//           </table>
//         </div>
//       </div>
//       </div>
//     </div>
//   );
// };

import React, { useEffect, useState } from "react";
import { RefreshCw, Search } from "lucide-react";
import { usePlatform } from "../../context/PlatformContext";
import {
  auditApi,
  AuditFilters,
  AuditRunDetail,
  AuditRunItem,
} from "../../api/execution";
import { useGetAgentsQuery } from "../../store/agentApi";
import { DataTable, Drawer, Panel } from "../../rag/Overlays";
import { BTN, HELP, INPUT, Pill } from "../../rag/RagUI";
import { PERMISSIONS } from "../../config/permissions";

const PAGE = 25;
const tone = (s: string) =>
  s === "SUCCEEDED"
    ? "good"
    : s === "FAILED"
      ? "crit"
      : s === "RUNNING"
        ? "info"
        : "muted";
const ms = (n?: number | null) =>
  n == null
    ? "—"
    : n < 1000
      ? `${Math.round(n)} ms`
      : `${(n / 1000).toFixed(1)} s`;
const when = (s?: string | null) => (s ? new Date(s).toLocaleString() : "—");
const dayStart = (d: string) =>
  d ? new Date(d + "T00:00:00").toISOString() : undefined;
const dayEnd = (d: string) =>
  d
    ? new Date(new Date(d + "T00:00:00").getTime() + 86400000).toISOString()
    : undefined;

const Block: React.FC<{ title: string; children: React.ReactNode }> = ({
  title,
  children,
}) => (
  <div>
    <h4 className="text-xs font-bold text-white mb-1.5">{title}</h4>
    {children}
  </div>
);
const Pre: React.FC<{ text?: string | null; tone?: string }> = ({
  text,
  tone: t,
}) => (
  <pre
    className={`p-3 rounded-lg bg-slate-950 border border-slate-800 text-[11px] whitespace-pre-wrap break-words max-h-64 overflow-auto ${t || "text-slate-200"}`}
  >
    {text || "—"}
  </pre>
);

export const AuditLogsView: React.FC = () => {
  const { theme, hasPermission } = usePlatform();
  const canViewAgents = hasPermission(PERMISSIONS.Agent.View);
  const {
    currentData: agentResult,
    isLoading: agentsLoading,
    isError: agentsError,
  } = useGetAgentsQuery(
    { page: 1, pageSize: 200 },
    { skip: !canViewAgents },
  );
  const agents = agentResult?.items ?? [];
  const [agentId, setAgentId] = useState("");
  const [f, setF] = useState({
    status: "",
    channel: "",
    executionType: "",
    from: "",
    to: "",
    search: "",
  });
  const [q, setQ] = useState(f); // applied filters
  const [page, setPage] = useState(0);
  const [rows, setRows] = useState<AuditRunItem[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [detail, setDetail] = useState<AuditRunDetail | null>(null);
  const [opening, setOpening] = useState(false);

  useEffect(() => {
    if (!agentId && agents.length) setAgentId(agents[0].id);
  }, [agents, agentId]);

  const load = async () => {
    if (!agentId) return;
    setLoading(true);
    setError("");
    const filters: AuditFilters = {
      status: q.status || undefined,
      channel: q.channel || undefined,
      executionType: q.executionType || undefined,
      search: q.search || undefined,
      from: dayStart(q.from),
      to: dayEnd(q.to),
    };
    try {
      const r = await auditApi.list(agentId, filters, PAGE, page * PAGE);
      setRows(r.items);
      setTotal(r.total);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load executions.");
      setRows([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load(); /* eslint-disable-next-line */
  }, [agentId, q, page]);

  const open = async (r: AuditRunItem) => {
    setOpening(true);
    setDetail(null);
    try {
      setDetail(await auditApi.get(r.agentId, r.runId));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load this run.");
    } finally {
      setOpening(false);
    }
  };

  const apply = () => {
    setPage(0);
    setQ(f);
  };
  const pages = Math.max(1, Math.ceil(total / PAGE));
  const light = theme === "light";

  return (
    <div id="audit-logs-view" className="p-5 space-y-5 max-w-7xl mx-auto">
      <div
        className={`panel space-y-4 ${light ? "bg-slate-950/5 border-neutral-900/5 shadow-none" : "bg-slate-100/5 border-neutral-100/10"}`}
      >
        <div>
          <h1 className={`header ${light ? "text-sky-950" : "text-sky-50"}`}>
            Agent Execution Audit
          </h1>
          <p
            className={`header-disciption ${light ? "text-gray-800" : "text-gray-200"}`}
          >
            Every run of an agent — studio tests and API calls — with status,
            timing, steps, knowledge-base evidence and tool calls.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-6 gap-2">
          <select
            className={INPUT}
            value={agentId}
            onChange={(e) => {
              setAgentId(e.target.value);
              setPage(0);
            }}
          >
            {!agents.length && (
              <option value="">
                {agentsLoading
                  ? "Loading agents…"
                  : agentsError
                    ? "Could not load agents"
                    : !canViewAgents
                      ? "Agent view permission required"
                    : "No agents available"}
              </option>
            )}
            {agents.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>
          <select
            className={INPUT}
            value={f.status}
            onChange={(e) => setF({ ...f, status: e.target.value })}
          >
            <option value="">All statuses</option>
            {["SUCCEEDED", "FAILED", "RUNNING", "QUEUED"].map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>
          <select
            className={INPUT}
            value={f.channel}
            onChange={(e) => setF({ ...f, channel: e.target.value })}
          >
            <option value="">Studio + API</option>
            <option value="STUDIO">Studio</option>
            <option value="API">API</option>
          </select>
          <select
            className={INPUT}
            value={f.executionType}
            onChange={(e) => setF({ ...f, executionType: e.target.value })}
          >
            <option value="">Test + Production</option>
            <option value="TEST">Test</option>
            <option value="PRODUCTION">Production</option>
          </select>
          <input
            type="date"
            className={INPUT}
            value={f.from}
            onChange={(e) => setF({ ...f, from: e.target.value })}
            title="From"
          />
          <input
            type="date"
            className={INPUT}
            value={f.to}
            onChange={(e) => setF({ ...f, to: e.target.value })}
            title="To"
          />
        </div>
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Search className="w-3.5 h-3.5 absolute left-2.5 top-2.5 text-slate-500" />
            <input
              className={`${INPUT} pl-8`}
              placeholder="Search input, output or user…"
              value={f.search}
              onChange={(e) => setF({ ...f, search: e.target.value })}
              onKeyDown={(e) => e.key === "Enter" && apply()}
            />
          </div>
          <button className={BTN} onClick={apply}>
            Apply
          </button>
          <button
            className={BTN}
            onClick={() => void load()}
            disabled={loading}
          >
            <RefreshCw
              className={`w-3.5 h-3.5 inline ${loading ? "animate-spin" : ""}`}
            />
          </button>
        </div>

        {error && (
          <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-xs text-rose-200">
            {error}
          </div>
        )}

        <Panel
          title="Executions"
          action={
            <span className="text-[11px] text-slate-400 font-mono">
              {total} total
            </span>
          }
        >
          <DataTable
            rows={rows}
            keyOf={(r: AuditRunItem) => r.runId}
            onRowClick={open}
            empty={loading ? "Loading…" : "No executions match these filters."}
            columns={[
              {
                head: "When",
                cell: (r: AuditRunItem) => (
                  <span className="text-xs text-slate-300 whitespace-nowrap">
                    {when(r.createdAt)}
                  </span>
                ),
              },
              {
                head: "Status",
                cell: (r: AuditRunItem) => (
                  <Pill tone={tone(r.status) as any}>{r.status}</Pill>
                ),
              },
              {
                head: "Source",
                hide: "sm",
                cell: (r: AuditRunItem) => (
                  <div className="text-xs text-slate-300">
                    {r.channel} · {r.executionType}
                    <div className="text-[10px] text-slate-500">
                      {r.deploymentSlug || r.triggeredBy || "—"}
                    </div>
                  </div>
                ),
              },
              {
                head: "Input",
                hide: "md",
                cell: (r: AuditRunItem) => (
                  <span className="text-xs text-slate-200 truncate block max-w-xs">
                    {r.inputPreview}
                  </span>
                ),
              },
              {
                head: "Duration",
                hide: "md",
                cell: (r: AuditRunItem) => (
                  <span className="text-xs font-mono text-slate-400">
                    {ms(r.durationMs)}
                  </span>
                ),
              },
            ]}
          />
        </Panel>

        {total > PAGE && (
          <div className="flex items-center justify-between text-[11px] text-slate-400">
            <span>
              Page {page + 1} of {pages}
            </span>
            <div className="flex gap-2">
              <button
                className={BTN}
                disabled={page === 0}
                onClick={() => setPage(page - 1)}
              >
                Previous
              </button>
              <button
                className={BTN}
                disabled={page + 1 >= pages}
                onClick={() => setPage(page + 1)}
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>

      <Drawer
        open={opening || !!detail}
        onClose={() => {
          setDetail(null);
          setOpening(false);
        }}
        title={detail ? `Run ${detail.runId.slice(0, 8)}` : "Loading…"}
        subtitle={
          detail ? (
            <Pill tone={tone(detail.status) as any}>{detail.status}</Pill>
          ) : undefined
        }
      >
        {detail && (
          <>
            <div className="rounded-xl bg-slate-950/80 border border-slate-800 divide-y divide-slate-800/70">
              {[
                ["Started", when(detail.startedAt)],
                ["Completed", when(detail.completedAt)],
                ["Duration", ms(detail.durationMs)],
                ["Channel", `${detail.channel} · ${detail.executionType}`],
                ["Triggered by", detail.triggeredBy || "—"],
                ["Deployment", detail.deploymentSlug || "—"],
                ["Attempt", String(detail.attempt)],
                ["Stop reason", detail.stopReason || "—"],
                ["Thread", detail.threadId],
              ].map(([k, v]) => (
                <div key={k} className="flex justify-between gap-4 px-3.5 py-2">
                  <span className="text-[11px] text-slate-400">{k}</span>
                  <span className="text-xs text-slate-200 font-mono text-right break-all">
                    {v}
                  </span>
                </div>
              ))}
            </div>

            <Block title="Input">
              <Pre text={detail.input} />
            </Block>
            <Block title="Output">
              <Pre text={detail.output} />
            </Block>
            {detail.error && (
              <Block title="Error">
                <Pre text={detail.error} tone="text-rose-300" />
              </Block>
            )}

            <Block title="Steps">
              <div className="flex flex-wrap gap-1.5">
                {detail.steps.length ? (
                  detail.steps.map((s, i) => (
                    <span
                      key={i}
                      className="px-2 py-0.5 rounded bg-slate-800 border border-slate-700 text-[10px] font-mono text-slate-300"
                    >
                      {s}
                    </span>
                  ))
                ) : (
                  <span className={HELP}>None recorded.</span>
                )}
              </div>
            </Block>

            <Block title={`Knowledge base (${detail.retrievedContext.length})`}>
              {detail.retrievedContext.length === 0 && (
                <span className={HELP}>No knowledge base was used.</span>
              )}
              <div className="space-y-2">
                {detail.retrievedContext.map((kb: any, i: number) => (
                  <div
                    key={i}
                    className="p-3 rounded-xl bg-slate-950/60 border border-slate-800"
                  >
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-semibold text-white">
                        {kb.knowledge_base_name || kb.knowledge_base_id}
                      </span>
                      {kb.error ? (
                        <Pill tone="crit">{kb.error}</Pill>
                      ) : (
                        <Pill tone="good">
                          {(kb.evidence || []).length} passages
                        </Pill>
                      )}
                    </div>
                    {(kb.evidence || [])
                      .slice(0, 5)
                      .map((e: any, j: number) => (
                        <div
                          key={j}
                          className="mt-1.5 text-[11px] text-slate-300"
                        >
                          {e.claim}
                          {e.source && (
                            <span className="block text-[10px] text-slate-500 font-mono">
                              {e.source}
                            </span>
                          )}
                        </div>
                      ))}
                  </div>
                ))}
              </div>
            </Block>

            <Block title={`Tool calls (${detail.toolCalls.length})`}>
              {detail.toolCalls.length === 0 && (
                <span className={HELP}>No tools were called.</span>
              )}
              <div className="space-y-2">
                {detail.toolCalls.map((t: any, i: number) => (
                  <div
                    key={i}
                    className="p-3 rounded-xl bg-slate-950/60 border border-slate-800"
                  >
                    <div className="text-xs font-mono text-indigo-300">
                      {t.name}
                    </div>
                    <Pre text={JSON.stringify(t.arguments ?? {}, null, 2)} />
                    <Pre text={t.output} tone="text-emerald-300" />
                  </div>
                ))}
              </div>
            </Block>
          </>
        )}
      </Drawer>
    </div>
  );
};
