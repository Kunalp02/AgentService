
import React, { useEffect, useState } from "react";
import { Activity } from "lucide-react";
import { usePlatform } from "../../context/PlatformContext";
import { ActivityRun, executionApi } from "../../api/execution";

export const ExecutionActivity: React.FC = () => {
  const { agents, theme } = usePlatform();
  const [rows, setRows] = useState<ActivityRun[]>([]);
  const [error, setError] = useState("");
  const [selected, setSelected] = useState<ActivityRun | null>(null);

  useEffect(() => {
    let stop = false;
    const load = async () => {
      try {
        const next = await executionApi.loadActivity(
          agents.map((agent) => ({ id: agent.id, name: agent.name })),
        );
        if (!stop) {
          setRows(next);
          setError("");
        }
      } catch (err) {
        if (!stop)
          setError(
            err instanceof Error ? err.message : "Could not load executions.",
          );
      }
    };
        let timer: ReturnType<typeof setTimeout> | undefined;
    const loop = async () => {
      await load();
      if (!stop) timer = setTimeout(loop, 10000);
    };
    void loop();
    return () => {
      stop = true;
      if (timer) clearTimeout(timer);
    };
  }, [agents]);

  const light = theme === "light";

  return (
    <div
      className={`panel space-y-3 ${light ? "backdrop-blur-sm bg-slate-950/5 border-neutral-900/5 shadow-none" : "backdrop-blur-sm bg-slate-100/5 border-neutral-100/10"}`}
    >
      <h3
        className={`text-sm font-bold flex items-center gap-2 ${light ? "text-sky-950" : "text-sky-50"}`}
      >
        <Activity className="w-4 h-4 text-cyan-400" /> Agent executions
      </h3>
      {error && <p className="text-xs text-amber-400">{error}</p>}
      <div className="overflow-x-auto max-h-80">
        <table className="w-full text-xs">
          <thead>
            <tr className={light ? "text-slate-600" : "text-slate-400"}>
              <th className="text-left p-2">When</th>
              <th className="text-left p-2">Agent</th>
              <th className="text-left p-2">Status</th>
              <th className="text-left p-2">Who</th>
              <th className="text-left p-2">Message</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr
                key={row.runId}
                className="cursor-pointer border-t border-slate-800/40"
                onClick={() => setSelected(row)}
              >
                <td className="p-2 whitespace-nowrap">
                  {row.createdAt
                    ? new Date(row.createdAt).toLocaleString()
                    : ""}
                </td>
                <td className="p-2">{row.agentName}</td>
                <td className="p-2">
                  {row.status}
                  {row.executionType ? ` · ${row.executionType}` : ""}
                </td>
                <td className="p-2">
                  {row.startedBy}
                  {row.clientIp ? ` · ${row.clientIp}` : ""}
                </td>
                <td className="p-2 truncate max-w-[240px]">{row.input}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {rows.length === 0 && (
          <p className="text-xs text-slate-500 p-2">No executions yet.</p>
        )}
      </div>
      {selected && (
        <div className="text-xs space-y-1 border-t border-slate-800 pt-2">
          <div>Run {selected.runId}</div>
          <div>Thread {selected.threadId}</div>
          <div className="whitespace-pre-wrap">
            Answer: {selected.output || "—"}
          </div>
          <div className="text-amber-300">Error: {selected.error || "—"}</div>
          <div>Steps: {selected.steps.join(" → ") || "—"}</div>
        </div>
      )}
    </div>
  );
};
