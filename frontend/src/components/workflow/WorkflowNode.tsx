import React, { memo } from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import { CheckCircle2, Loader2, XCircle } from "lucide-react";
import { usePlatform } from "../../context/PlatformContext";
import { META, type WFNode } from "./WorkflowTypes";

/** One custom node type; the look and handles come from `data.kind`. */
export const WorkflowNode = memo(({ data, selected }: NodeProps<WFNode>) => {
  const { theme } = usePlatform();
  const light = theme === "light";
  const meta = META[data.kind];
  const Icon = meta.icon;

  const ring =
    data.status === "running"
      ? "ring-2 ring-sky-400/70 shadow-[0_0_0_6px_rgba(56,189,248,0.12)]"
      : data.status === "done"
        ? "ring-1 ring-emerald-500/60"
        : data.status === "error"
          ? "ring-1 ring-rose-500/70"
          : selected
            ? "ring-2 ring-indigo-400"
            : "";

  const handleClass = `!h-3 !w-3 !border-2 ${
    light ? "!border-white !bg-slate-500" : "!border-[#0f172a] !bg-slate-300"
  }`;

  // Short line under the title that shows what the node is configured with.
  const summary =
    data.kind === "agent"
      ? data.agentName || "No agent selected"
      : data.kind === "tool"
        ? data.toolName || "No tool selected"
        : data.kind === "knowledge"
          ? data.kbName || "No knowledge base selected"
          : data.kind === "condition"
            ? data.expression || "No expression"
            : data.kind === "approval"
              ? data.approverGroup
                ? `Approver: ${data.approverGroup}`
                : "Approver not set"
              : data.kind === "start"
                ? `Trigger: ${data.trigger ?? "manual"}`
                : `Format: ${data.outputFormat ?? "text"}`;

  return (
    <div
      className={`w-60 rounded-xl border shadow-lg transition-shadow ${ring} ${
        light
          ? "bg-white border-slate-300 shadow-slate-400/30"
          : "bg-[#0f172a] border-slate-600/70 shadow-black/40"
      }`}
    >
      {meta.inputs && (
        <Handle
          type="target"
          position={Position.Left}
          className={handleClass}
        />
      )}

      <div className="flex items-start gap-2.5 px-3 py-2.5">
        <div className={`mt-0.5 rounded-lg border p-1.5 ${meta.chip}`}>
          <Icon className={`h-4 w-4 ${meta.accent}`} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <span
              className={`truncate text-xs font-bold ${light ? "text-slate-900" : "text-white"}`}
            >
              {data.label}
            </span>
            {data.status === "running" && (
              <Loader2 className="h-3 w-3 shrink-0 animate-spin text-sky-400" />
            )}
            {data.status === "done" && (
              <CheckCircle2 className="h-3 w-3 shrink-0 text-emerald-400" />
            )}
            {data.status === "error" && (
              <XCircle className="h-3 w-3 shrink-0 text-rose-400" />
            )}
          </div>
          <div
            className={`text-[10px] ${light ? "text-slate-500" : "text-slate-400"}`}
          >
            {meta.title}
          </div>
          <div
            className={`mt-1 truncate font-mono text-[10px] ${light ? "text-slate-600" : "text-slate-300"}`}
          >
            {summary}
          </div>
        </div>
      </div>

      {data.kind === "condition" ? (
        <>
          <Handle
            id="true"
            type="source"
            position={Position.Right}
            style={{ top: "35%" }}
            className={handleClass}
          />
          <Handle
            id="false"
            type="source"
            position={Position.Right}
            style={{ top: "75%" }}
            className={handleClass}
          />
          <span className="pointer-events-none absolute -right-9 top-[35%] -translate-y-1/2 text-[10px] font-semibold text-emerald-400">
            true
          </span>
          <span className="pointer-events-none absolute -right-9 top-[75%] -translate-y-1/2 text-[10px] font-semibold text-rose-400">
            false
          </span>
        </>
      ) : (
        meta.outputs && (
          <Handle
            type="source"
            position={Position.Right}
            className={handleClass}
          />
        )
      )}
    </div>
  );
});
WorkflowNode.displayName = "WorkflowNode";

