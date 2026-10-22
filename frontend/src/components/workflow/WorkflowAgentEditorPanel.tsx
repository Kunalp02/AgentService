import React, { useEffect, useState } from "react";
import { Plus } from "lucide-react";
import { AgentEditorForm } from "../agents/AgentEditorForm";
import { useAgentEditor } from "../agents/useAgentEditor";
import type { AgentUi } from "../../types/agent";

type Props = {
  agentId: string | null;
  publishedAgents: { id: string; name: string }[];
  allAgents: { id: string; name: string }[];
  onAgentLinked: (agentId: string, agent?: AgentUi) => void;
  canCreate: boolean;
};

export const WorkflowAgentEditorPanel: React.FC<Props> = ({
  agentId,
  publishedAgents,
  allAgents,
  onAgentLinked,
  canCreate,
}) => {
  const [panelMode, setPanelMode] = useState<"edit" | "create">("edit");

  const editor = useAgentEditor({
    agentId: panelMode === "edit" ? agentId : null,
    mode: panelMode,
    autoLoad: panelMode === "edit" && Boolean(agentId),
  });

  useEffect(() => {
    if (agentId) setPanelMode("edit");
  }, [agentId]);

  const startCreate = () => {
    editor.resetCreate();
    setPanelMode("create");
  };

  const handleCreateAndLink = async () => {
    const saved = await editor.save();
    if (saved?.id) {
      onAgentLinked(saved.id, saved);
      setPanelMode("edit");
    }
  };

  return (
    <div className="rounded-xl border border-slate-700/80 bg-slate-950/90 p-3 space-y-3 shadow-inner">
      <div className="flex items-start justify-between gap-2">
        <div>
          <h3 className="text-xs font-semibold text-white">Agent configuration</h3>
          <p className="text-[10px] text-slate-400 mt-0.5">
            Same fields as Agent Studio — access, prompt, knowledge, tools, memory.
          </p>
        </div>
        {editor.detail && (
          <span className="text-[9px] uppercase tracking-wide px-2 py-0.5 rounded bg-slate-800 text-slate-300 shrink-0">
            {editor.detail.status}
          </span>
        )}
      </div>

      <div className="space-y-2">
        <label className="text-[10px] text-slate-400">Linked agent</label>
        <div className="flex gap-2">
          <select
            className="flex-1 bg-slate-800 border border-slate-700 rounded-lg p-2 text-[11px] text-white"
            value={agentId || ""}
            onChange={(e) => {
              const id = e.target.value;
              if (id) {
                setPanelMode("edit");
                onAgentLinked(id);
              }
            }}
          >
            <option value="">Select agent…</option>
            {allAgents.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
                {publishedAgents.some((p) => p.id === a.id) ? "" : " (draft)"}
              </option>
            ))}
          </select>
          {canCreate && (
            <button
              type="button"
              onClick={startCreate}
              className="shrink-0 px-2 py-1.5 rounded-lg bg-purple-600 hover:bg-purple-500 text-white text-[10px] font-semibold flex items-center gap-1"
              title="Create a new agent"
            >
              <Plus className="h-3 w-3" />
              New
            </button>
          )}
        </div>
        {agentId &&
          !publishedAgents.some((p) => p.id === agentId) && (
            <p className="text-[10px] text-amber-300/90">
              This agent is not published. Publish it before running the workflow in production.
            </p>
          )}
      </div>

      {(panelMode === "create" || agentId) && (
        <div className="max-h-[min(52vh,520px)] overflow-y-auto pr-1">
          {panelMode === "create" ? (
            <>
              <AgentEditorForm
                editor={editor}
                formId="workflow-agent-create-form"
                showFooter={false}
                compact
              />
              <div className="flex gap-2 pt-2 border-t border-slate-800 mt-2">
                <button
                  type="button"
                  className="text-[10px] text-slate-400"
                  onClick={() => setPanelMode("edit")}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={editor.loading}
                  onClick={() => void handleCreateAndLink()}
                  className="ml-auto px-3 py-1.5 rounded bg-purple-600 text-white text-[10px] font-semibold"
                >
                  Create & link
                </button>
              </div>
            </>
          ) : editor.loading && !editor.detail ? (
            <p className="text-[10px] text-slate-500">Loading agent…</p>
          ) : (
            <AgentEditorForm
              editor={editor}
              formId="workflow-agent-edit-form"
              compact
            />
          )}
        </div>
      )}

      {!agentId && panelMode !== "create" && (
        <p className="text-[11px] text-slate-500">
          Choose a published agent or create one to edit its configuration here.
        </p>
      )}
    </div>
  );
};
