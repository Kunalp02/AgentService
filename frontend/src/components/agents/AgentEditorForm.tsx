import React from "react";
import {
  AlertCircle,
  ChevronDown,
  ChevronRight,
  Save,
  Trash2,
  Upload,
  XCircle,
  Lock,
} from "lucide-react";
import type { KnowledgeBaseMode } from "../../types/agent";
import type { AgentEditorController } from "./useAgentEditor";

type Props = {
  editor: AgentEditorController;
  formId?: string;
  showFooter?: boolean;
  compact?: boolean;
};

export const AgentEditorForm: React.FC<Props> = ({
  editor,
  formId = "agent-editor-form",
  showFooter = true,
  compact = false,
}) => {
  const {
    loading,
    error,
    options,
    detail,
    form,
    setForm,
    formTab,
    setFormTab,
    formTabs,
    readOnly,
    canCreate,
    canEdit,
    canDelete,
    canPublish,
    mode,
    groupOptions,
    singleGroup,
    visibleModels,
    pickerKnowledgeBases,
    remoteServers,
    remoteTools,
    localTools,
    openRemoteServerIds,
    setOpenRemoteServerIds,
    toggleGroup,
    toggleKb,
    setKbMode,
    toggleTool,
    save,
    remove,
    publish,
    fieldClass,
    labelClass,
  } = editor;

  const tabBtn = (active: boolean) =>
    compact
      ? `py-2 px-1 text-[10px] font-semibold border-b-2 whitespace-nowrap ${
          active
            ? "border-purple-500 text-white"
            : "border-transparent text-slate-400"
        }`
      : `py-2.5 text-xs font-semibold border-b-2 whitespace-nowrap ${
          active
            ? "border-purple-500 text-white"
            : "border-transparent text-slate-400"
        }`;

  if (!canCreate && mode === "create") {
    return (
      <div className="text-xs text-slate-500">
        <Lock className="w-4 h-4 inline mr-1" />
        You need create permission to add a new agent.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <form
        id={formId}
        onSubmit={(e) => void save(e)}
        className="space-y-3"
      >
        <div
          className={`flex items-center gap-3 border-b border-slate-800 overflow-x-auto ${compact ? "-mt-0.5" : "-mt-1"}`}
        >
          {formTabs.map((t) => (
            <button
              key={t.key}
              type="button"
              onClick={() => setFormTab(t.key)}
              className={tabBtn(formTab === t.key)}
            >
              {t.label}
            </button>
          ))}
        </div>

        {options &&
          (!options.availability.toolsConfigReachable ||
            !options.availability.ragConfigReachable) && (
            <div className="p-2 rounded-lg border border-amber-500/40 bg-amber-500/10 text-[10px] text-amber-200">
              Tools{" "}
              {options.availability.toolsConfigReachable ? "up" : "down"} · RAG{" "}
              {options.availability.ragConfigReachable ? "up" : "down"}.
            </div>
          )}

        {error && (
          <div className="p-2 rounded-lg border border-rose-500/40 bg-rose-500/10 text-[10px] text-rose-200">
            <AlertCircle className="w-3.5 h-3.5 inline mr-1" />
            {error}
          </div>
        )}

        {formTab === "access" && (
          <div className="space-y-2">
            <div className="text-[11px] font-semibold text-slate-300">
              {singleGroup ? "Group" : "Groups"}
            </div>
            <p className="text-[10px] text-slate-500">
              Models, knowledge bases, and tools depend on group access.
            </p>
            {singleGroup ? (
              <div className="px-2.5 py-1.5 rounded-lg border border-indigo-500/30 bg-indigo-500/10 text-[10px] text-indigo-200">
                {groupOptions[0].name}
              </div>
            ) : (
              <div className="flex flex-wrap gap-2">
                {groupOptions.map((g) => {
                  const on = form.groupIds.includes(g.id);
                  return (
                    <button
                      type="button"
                      key={g.id}
                      onClick={() => toggleGroup(g.id)}
                      className={`px-2 py-1 rounded text-[10px] border transition-colors ${
                        on
                          ? "bg-purple-600/30 border-purple-400 text-white"
                          : "bg-slate-800 border-slate-700 text-slate-400"
                      }`}
                      disabled={readOnly}
                    >
                      {g.name}
                      {on ? " ✓" : ""}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {formTab === "basics" && (
          <div className="space-y-2">
            <div>
              <label className={labelClass}>Agent name</label>
              <input
                value={form.name}
                onChange={(e) =>
                  setForm((f) => ({ ...f, name: e.target.value }))
                }
                className={fieldClass}
                required
                disabled={readOnly}
              />
            </div>
            <div>
              <label className={labelClass}>Description</label>
              <textarea
                value={form.description}
                onChange={(e) =>
                  setForm((f) => ({ ...f, description: e.target.value }))
                }
                className={fieldClass}
                rows={2}
                disabled={readOnly}
              />
            </div>
            <div className="grid grid-cols-1 gap-2">
              <div>
                <label className={labelClass}>Model</label>
                <select
                  value={form.modelId}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, modelId: e.target.value }))
                  }
                  className={fieldClass}
                  disabled={readOnly || form.groupIds.length === 0}
                >
                  <option value="">
                    {form.groupIds.length === 0
                      ? "Choose access first"
                      : "Select a model"}
                  </option>
                  {visibleModels.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className={labelClass}>Temperature</label>
                <input
                  type="number"
                  min={0}
                  max={2}
                  step={0.1}
                  value={form.temperature}
                  onChange={(e) =>
                    setForm((f) => ({
                      ...f,
                      temperature: Number(e.target.value),
                    }))
                  }
                  className={fieldClass}
                  disabled={readOnly}
                />
              </div>
            </div>
            <div>
              <label className={labelClass}>System prompt</label>
              <textarea
                value={form.systemPrompt}
                onChange={(e) =>
                  setForm((f) => ({ ...f, systemPrompt: e.target.value }))
                }
                className={fieldClass}
                rows={compact ? 6 : 8}
                disabled={readOnly}
              />
            </div>
          </div>
        )}

        {formTab === "knowledge" && (
          <div className="space-y-3">
            <div>
              <div className="text-[10px] font-semibold text-slate-300 mb-1">
                Knowledge bases
              </div>
              <div className="space-y-1 max-h-36 overflow-auto rounded-lg border border-slate-800 p-2">
                {pickerKnowledgeBases.map((kb) => {
                  const attached = form.knowledgeBases.find(
                    (k) => k.knowledgeBaseId === kb.id,
                  );
                  return (
                    <div
                      key={kb.id}
                      className="flex items-center gap-2 text-[10px] text-slate-300 py-0.5"
                    >
                      <input
                        type="checkbox"
                        checked={Boolean(attached)}
                        onChange={() => toggleKb(kb.id)}
                        disabled={readOnly}
                      />
                      <span className="flex-1 truncate">{kb.name}</span>
                      {attached && (
                        <select
                          value={attached.mode}
                          onChange={(e) =>
                            setKbMode(kb.id, e.target.value as KnowledgeBaseMode)
                          }
                          className="bg-slate-800 rounded px-1 border border-slate-700 text-[10px]"
                          disabled={readOnly}
                        >
                          <option value="Context">Context</option>
                          <option value="Tool">Tool</option>
                        </select>
                      )}
                    </div>
                  );
                })}
                {pickerKnowledgeBases.length === 0 && (
                  <div className="text-[10px] text-slate-500">No KBs for selected groups.</div>
                )}
              </div>
            </div>
            <div>
              <div className="text-[10px] font-semibold text-slate-300 mb-1">
                Local tools
              </div>
              <div className="space-y-1 max-h-28 overflow-auto rounded-lg border border-slate-800 p-2">
                {localTools.map((t) => (
                  <label
                    key={t.id}
                    className="flex items-center gap-2 text-[10px] text-slate-300"
                  >
                    <input
                      type="checkbox"
                      checked={form.tools.some((x) => x.toolId === t.id)}
                      onChange={() => toggleTool(t.id, "Local")}
                      disabled={readOnly}
                    />
                    {t.name}
                  </label>
                ))}
              </div>
            </div>
            <div>
              <div className="text-[10px] font-semibold text-slate-300 mb-1">
                Remote tools
              </div>
              <div className="space-y-1 max-h-28 overflow-auto rounded-lg border border-slate-800 p-2">
                {remoteServers.map((server) => {
                  const open = openRemoteServerIds.includes(server.id);
                  return (
                    <div key={server.id} className="rounded border border-slate-800">
                      <button
                        type="button"
                        onClick={() =>
                          setOpenRemoteServerIds((c) =>
                            c.includes(server.id)
                              ? c.filter((id) => id !== server.id)
                              : [...c, server.id],
                          )
                        }
                        className="flex w-full items-center gap-1 px-2 py-1 text-[10px] text-slate-200 bg-slate-900/60"
                      >
                        {open ? (
                          <ChevronDown className="h-3 w-3" />
                        ) : (
                          <ChevronRight className="h-3 w-3" />
                        )}
                        <span className="truncate flex-1 text-left">{server.name}</span>
                      </button>
                      {open &&
                        server.tools.map((tool) => (
                          <label
                            key={tool.id}
                            className="flex items-center gap-2 text-[10px] px-2 py-0.5 text-slate-300"
                          >
                            <input
                              type="checkbox"
                              checked={form.tools.some((x) => x.toolId === tool.id)}
                              onChange={() => toggleTool(tool.id, "Remote")}
                              disabled={readOnly}
                            />
                            {tool.name}
                          </label>
                        ))}
                    </div>
                  );
                })}
                {remoteServers.length === 0 &&
                  remoteTools.map((tool) => (
                    <label
                      key={tool.id}
                      className="flex items-center gap-2 text-[10px] text-slate-300"
                    >
                      <input
                        type="checkbox"
                        checked={form.tools.some((x) => x.toolId === tool.id)}
                        onChange={() => toggleTool(tool.id, "Remote")}
                        disabled={readOnly}
                      />
                      {tool.name}
                    </label>
                  ))}
              </div>
            </div>
          </div>
        )}

        {formTab === "memory" && (
          <div className="space-y-2">
            <label className="flex items-center gap-2 text-[10px] font-semibold text-slate-300">
              <input
                type="checkbox"
                checked={form.memoryEnabled}
                onChange={(e) =>
                  setForm((f) => ({ ...f, memoryEnabled: e.target.checked }))
                }
                disabled={readOnly}
              />
              Enable memory
            </label>
            {form.memoryEnabled && (
              <div className="grid grid-cols-1 gap-2">
                <div>
                  <label className={labelClass}>Scope</label>
                  <select
                    value={form.memoryScope}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, memoryScope: e.target.value }))
                    }
                    className={fieldClass}
                    disabled={readOnly}
                  >
                    <option value="Session">Session</option>
                    <option value="User">User</option>
                    <option value="Agent">Agent</option>
                    <option value="Organization">Organization</option>
                  </select>
                </div>
                <div>
                  <label className={labelClass}>Retention</label>
                  <select
                    value={form.memoryRetention}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, memoryRetention: e.target.value }))
                    }
                    className={fieldClass}
                    disabled={readOnly}
                  >
                    <option value="Days7">7 days</option>
                    <option value="Days30">30 days</option>
                    <option value="Days90">90 days</option>
                    <option value="Years1">1 year</option>
                    <option value="Forever">Forever</option>
                  </select>
                </div>
                <div>
                  <label className={labelClass}>Instructions</label>
                  <textarea
                    value={form.memoryInstructions}
                    onChange={(e) =>
                      setForm((f) => ({
                        ...f,
                        memoryInstructions: e.target.value,
                      }))
                    }
                    rows={3}
                    className={fieldClass}
                    disabled={readOnly}
                  />
                </div>
              </div>
            )}
          </div>
        )}
      </form>

      {showFooter && (
        <div className="flex flex-wrap gap-2 pt-1 border-t border-slate-800">
          {mode === "edit" && readOnly && (
            <span className="text-[10px] text-slate-500 self-center">Read-only</span>
          )}
          {mode === "edit" && canDelete && (
            <button
              type="button"
              disabled={loading}
              onClick={() => void remove()}
              className="px-2 py-1.5 rounded bg-rose-800 text-white text-[10px]"
            >
              <Trash2 className="w-3 h-3 inline" /> Delete
            </button>
          )}
          {mode === "edit" && canPublish && detail?.status === "Published" && (
            <button
              type="button"
              disabled={loading}
              onClick={() => void publish(false)}
              className="px-2 py-1.5 rounded bg-slate-700 text-white text-[10px]"
            >
              <XCircle className="w-3 h-3 inline" /> Unpublish
            </button>
          )}
          {mode === "edit" && canPublish && detail?.status !== "Published" && (
            <button
              type="button"
              disabled={loading}
              onClick={() => void publish(true)}
              className="px-2 py-1.5 rounded bg-emerald-700 text-white text-[10px]"
            >
              <Upload className="w-3 h-3 inline" /> Publish agent
            </button>
          )}
          {(mode === "create" ? canCreate : canEdit) && (
            <button
              type="submit"
              form={formId}
              disabled={loading}
              className="px-2 py-1.5 rounded bg-purple-600 text-white text-[10px] font-semibold ml-auto"
            >
              <Save className="w-3 h-3 inline" />
              {mode === "create" ? "Create" : "Save agent"}
            </button>
          )}
        </div>
      )}
    </div>
  );
};
