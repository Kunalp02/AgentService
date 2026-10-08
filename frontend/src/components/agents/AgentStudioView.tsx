
import React, { useEffect, useMemo, useState } from "react";
import {
  AlertCircle,
  Bot,
  Check,
  Lock,
  Plus,
  RefreshCw,
  Save,
  Trash2,
  Upload,
  XCircle,
} from "lucide-react";
import { usePlatform } from "../../context/PlatformContext";
import { PERMISSIONS } from "../../config/permissions";
import { agentsApi } from "../../api/agents";
import { groupName, userGroupEntries } from "../../api/groupDirectory";
import {
  normalizeAgent,
  normalizeEditorOptions,
  toCreatePayload,
  type AgentEditorOptionsDto,
  type AgentKnowledgeBaseRef,
  type AgentToolRef,
  type AgentUi,
  type KnowledgeBaseMode,
} from "../../types/agent";
import { Modal } from "../../rag/Overlays";

const emptyForm = {
  name: "",
  description: "",
  modelId: "",
  temperature: 0.7,
  systemPrompt: "You are a helpful assistant.",
  groupIds: [] as string[],
  knowledgeBases: [] as AgentKnowledgeBaseRef[],
  tools: [] as AgentToolRef[],
  memoryEnabled: false,
  memoryScope: "User" as string,
  memoryRetention: "Days30" as string,
  memoryInstructions: "",
};

type FormState = typeof emptyForm;

type FormTabKey = "access" | "basics" | "knowledge" | "memory";

const fieldClass =
  "w-full bg-slate-800 border border-slate-700 rounded-lg p-2.5 text-xs text-white placeholder-slate-500 " +
  "focus:outline-none focus:border-purple-500 disabled:opacity-50";

const labelClass = "block text-[11px] font-semibold text-slate-400 mb-1.5";

export const AgentStudioView: React.FC = () => {
  const {
    agents,
    currentUser,
    hasPermission,
    reloadPlatformData,
    showNotification,
  } = usePlatform();

  const canCreate = hasPermission(PERMISSIONS.Agent.Create);
  const canEdit = hasPermission(PERMISSIONS.Agent.Edit);
  const canDelete = hasPermission(PERMISSIONS.Agent.Delete);
  const canPublish = hasPermission(PERMISSIONS.Agent.Publish);

  /* GROUPS COME FROM THE SIGNED-IN TOKEN ONLY (U).
     `usePlatform().groups` is overwritten with the full admin directory once
     the Users / Groups screens are opened, so it can list groups this person
     does not belong to - even for a Super Admin. The login response is the
     one source that says which groups the caller is actually in. */
  const myGroups = useMemo(
    () =>
      userGroupEntries(currentUser?.groups).map((g) => ({
        id: g.id,
        name: g.name || groupName(g.id),
      })),
    [currentUser],
  );

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [options, setOptions] = useState<AgentEditorOptionsDto | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<AgentUi | null>(null);
  const [mode, setMode] = useState<"create" | "edit">("create");
  const [form, setForm] = useState<FormState>(emptyForm);
  const [formTab, setFormTab] = useState<FormTabKey>("access");
  const [modalOpen, setModalOpen] = useState(false);

  const readOnly = mode === "edit" && !canEdit;

  /* Groups offered on the Access tab: mine, plus any group already on the
     agent being edited (so an existing grant is shown, never silently
     dropped). */
  const groupOptions = useMemo(() => {
    const known = new Set(myGroups.map((g) => g.id));

    const extras = form.groupIds
      .filter((id) => !known.has(id))
      .map((id) => ({ id, name: groupName(id) }));

    return [...myGroups, ...extras];
  }, [myGroups, form.groupIds]);

  const singleGroup = groupOptions.length === 1;

  /*
   * The server is now authoritative for resource filtering.
   *
   * /editor-options?groupIds=... returns only the models, knowledge bases,
   * and tools available to the selected groups.
   *
   * Therefore the client does NOT perform another group-based filtering pass.
   */
  const visibleModels = useMemo(() => options?.models ?? [], [options]);

  const pickerKnowledgeBases = useMemo(
    () => options?.knowledgeBases ?? [],
    [options],
  );

  const remoteServers = useMemo(
    () => options?.remoteMcpServers ?? [],
    [options],
  );

  const remoteTools = useMemo(
    () =>
      remoteServers.length > 0
        ? remoteServers.flatMap((server) =>
            server.tools.map((tool) => ({
              id: tool.id,
              name: tool.name,
              toolType: "Remote",
              groupIds: server.groupIds,
            })),
          )
        : (options?.tools ?? []).filter((t) => t.toolType === "Remote"),
    [options, remoteServers],
  );

  const localTools = useMemo(
    () => (options?.tools ?? []).filter((t) => t.toolType !== "Remote"),
    [options],
  );

  const loadOptions = async (groupIds: string[]) => {
    try {
      const next = normalizeEditorOptions(
        await agentsApi.getEditorOptions(groupIds),
      );

      setOptions(next);

      setForm((current) => {
        const modelIds = new Set((next.models ?? []).map((m) => m.id));

        const kbIds = new Set((next.knowledgeBases ?? []).map((k) => k.id));

        const toolIds = new Set([
          ...(next.tools ?? []).map((t) => t.id),
          ...(next.remoteMcpServers ?? []).flatMap((server) =>
            server.tools.map((tool) => tool.id),
          ),
        ]);

        return {
          ...current,
          modelId: modelIds.has(current.modelId) ? current.modelId : "",
          knowledgeBases: current.knowledgeBases.filter((k) =>
            kbIds.has(k.knowledgeBaseId),
          ),
          tools: current.tools.filter((t) => toolIds.has(t.toolId)),
        };
      });
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "Failed to load editor options (models / KBs / tools).",
      );
    }
  };

  /*
   * The sorted group selection is used as the dependency key.
   * This means:
   *
   * [A, B] === [B, A]
   *
   * from the API-fetch perspective, so changing checkbox order does not
   * trigger an unnecessary reload.
   */
  const groupKey = form.groupIds.slice().sort().join(",");

  useEffect(() => {
    if (!modalOpen) return;

    void loadOptions(form.groupIds);

    // groupKey is the sorted selection, so order of clicks does not refetch.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [groupKey]);

  /*
   * One group available: pre-select it when creating.
   */
  useEffect(() => {
    if (mode === "create" && singleGroup && form.groupIds.length === 0) {
      setForm((f) => ({
        ...f,
        groupIds: [groupOptions[0].id],
      }));
    }
  }, [mode, singleGroup, groupOptions, form.groupIds.length]);

  const refresh = async () => {
    setLoading(true);
    setError("");

    try {
      await Promise.all([reloadPlatformData(), loadOptions(form.groupIds)]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load agents.");
    } finally {
      setLoading(false);
    }
  };

  const openCreate = () => {
    const initialGroups = myGroups[0]?.id ? [myGroups[0].id] : [];

    setMode("create");
    setSelectedId(null);
    setDetail(null);
    setFormTab("basics");

    setForm({
      ...emptyForm,
      groupIds: initialGroups,
    });

    setError("");
    setModalOpen(true);
  };

  const openEdit = async (id: string) => {
    setError("");
    setFormTab("basics");
    setModalOpen(true);
    setMode("edit");
    setSelectedId(id);
    setLoading(true);

    try {
      const dto = await agentsApi.getAgent(id);
      const agent = normalizeAgent(dto);

      setDetail(agent);

      setForm({
        name: agent.name,
        description: agent.description,
        modelId: agent.modelId,
        temperature: agent.temperature,
        systemPrompt: agent.systemPrompt,
        groupIds: agent.groupIds,
        knowledgeBases: agent.knowledgeBases,
        tools: agent.tools,
        memoryEnabled: agent.memoryEnabled,
        memoryScope: agent.memoryScope || "User",
        memoryRetention: agent.memoryRetention || "Days30",
        memoryInstructions: agent.memoryInstructions,
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load agent.");
    } finally {
      setLoading(false);
    }
  };

  const closeModal = () => {
    setModalOpen(false);
    setError("");
  };

  const toggleGroup = (id: string) => {
    setForm((f) => ({
      ...f,
      groupIds: f.groupIds.includes(id)
        ? f.groupIds.filter((g) => g !== id)
        : [...f.groupIds, id],
    }));
  };

  const toggleKb = (id: string) => {
    setForm((f) => {
      const exists = f.knowledgeBases.find((k) => k.knowledgeBaseId === id);

      if (exists) {
        return {
          ...f,
          knowledgeBases: f.knowledgeBases.filter(
            (k) => k.knowledgeBaseId !== id,
          ),
        };
      }

      return {
        ...f,
        knowledgeBases: [
          ...f.knowledgeBases,
          {
            knowledgeBaseId: id,
            mode: "Context",
          },
        ],
      };
    });
  };

  const setKbMode = (id: string, kbMode: KnowledgeBaseMode) => {
    setForm((f) => ({
      ...f,
      knowledgeBases: f.knowledgeBases.map((k) =>
        k.knowledgeBaseId === id ? { ...k, mode: kbMode } : k,
      ),
    }));
  };

  const toggleTool = (id: string, toolType: string) => {
    setForm((f) => {
      const exists = f.tools.find((t) => t.toolId === id);

      if (exists) {
        return {
          ...f,
          tools: f.tools.filter((t) => t.toolId !== id),
        };
      }

      return {
        ...f,
        tools: [
          ...f.tools,
          {
            toolId: id,
            toolType,
          },
        ],
      };
    });
  };

  const payload = () => toCreatePayload(form);

  /*
   * Which tab a validation problem lives on, so a failed save can jump the
   * reader straight to the field that needs fixing. Groups are checked first
   * because the resource lists depend on them.
   */
  const validate = (): {
    tab: FormTabKey;
    message: string;
  } | null => {
    if (form.groupIds.length === 0) {
      return {
        tab: "access",
        message:
          "Select at least one group first. The available models, knowledge bases and tools depend on it.",
      };
    }

    if (!form.name.trim()) {
      return {
        tab: "basics",
        message: "Give the agent a name.",
      };
    }

    if (!form.modelId) {
      return {
        tab: "basics",
        message: "Select a model.",
      };
    }

    if (!form.systemPrompt.trim()) {
      return {
        tab: "basics",
        message: "System prompt is required.",
      };
    }

    if (form.memoryEnabled && !form.memoryScope) {
      return {
        tab: "memory",
        message: "Choose a memory scope, or turn memory off.",
      };
    }

    if (form.memoryEnabled && !form.memoryRetention) {
      return {
        tab: "memory",
        message: "Choose a memory retention period, or turn memory off.",
      };
    }

    return null;
  };

  const save = async (e: React.FormEvent) => {
    e.preventDefault();

    const problem = validate();

    if (problem) {
      setFormTab(problem.tab);
      setError(problem.message);
      return;
    }

    setLoading(true);
    setError("");

    try {
      if (mode === "create") {
        const created = await agentsApi.createAgent(payload());

        showNotification?.(`Created ${created.name}`);

        await reloadPlatformData();
        await openEdit(created.id);
      } else if (selectedId) {
        const updated = await agentsApi.patchAgent(selectedId, payload());

        showNotification?.(`Saved ${updated.name}`);

        setDetail(normalizeAgent(updated));
        await reloadPlatformData();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed.");
    } finally {
      setLoading(false);
    }
  };

  const remove = async () => {
    if (!selectedId || !canDelete) return;

    if (!window.confirm("Delete this agent?")) return;

    setLoading(true);
    setError("");

    try {
      await agentsApi.deleteAgent(selectedId);

      showNotification?.("Agent deleted.");

      closeModal();

      await reloadPlatformData();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Delete failed.");
    } finally {
      setLoading(false);
    }
  };

  const publish = async (publish: boolean) => {
    if (!selectedId || !canPublish) return;

    setLoading(true);
    setError("");

    try {
      const dto = publish
        ? await agentsApi.publishAgent(selectedId)
        : await agentsApi.unpublishAgent(selectedId);

      setDetail(normalizeAgent(dto));

      await reloadPlatformData();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Publish failed.");
    } finally {
      setLoading(false);
    }
  };

  // Access comes first: the resources on the other tabs depend on it.
  const formTabs: {
    key: FormTabKey;
    label: string;
  }[] = [
    {
      key: "access",
      label: singleGroup ? "Access" : `Access (${form.groupIds.length})`,
    },
    {
      key: "basics",
      label: "Basics",
    },
    {
      key: "knowledge",
      label: `Knowledge & tools (${
        form.knowledgeBases.length + form.tools.length
      })`,
    },
    {
      key: "memory",
      label: form.memoryEnabled ? "Memory (on)" : "Memory",
    },
  ];

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <div className="text-xs font-semibold text-purple-300">
            Agent Service
          </div>

          <h1 className="text-2xl font-bold text-white">Agent Studio</h1>

          <p className="text-xs text-slate-400 mt-1">
            Create and configure agents against Agent Config. Models, knowledge
            bases, and tools are validated downstream using your session token.
          </p>
        </div>

        <div className="flex gap-2">
          {canCreate && (
            <button
              type="button"
              onClick={openCreate}
              className="px-3 py-2 rounded bg-purple-600 text-white text-xs"
            >
              <Plus className="w-4 h-4 inline mr-1" />
              New
            </button>
          )}

          <button
            type="button"
            onClick={refresh}
            disabled={loading}
            className="px-3 py-2 rounded bg-slate-800 text-slate-200 text-xs"
          >
            <RefreshCw
              className={`w-4 h-4 inline mr-1 ${loading ? "animate-spin" : ""}`}
            />
            Refresh
          </button>
        </div>
      </div>

      {options &&
        (!options.availability.toolsConfigReachable ||
          !options.availability.ragConfigReachable) && (
          <div className="p-3 rounded-lg border border-amber-500/40 bg-amber-500/10 text-xs text-amber-200">
            Downstream: Tools{" "}
            {options.availability.toolsConfigReachable ? "up" : "down"} · RAG{" "}
            {options.availability.ragConfigReachable ? "up" : "down"}.
            Create/save will fail with 503 while a required service is down.
          </div>
        )}

      <div className="space-y-3">
        {agents.length === 0 && (
          <div className="p-8 rounded-xl border border-dashed border-slate-800 text-center text-xs text-slate-500">
            No agents visible to your groups.
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {agents.map((agent) => (
            <button
              type="button"
              key={agent.id}
              onClick={() => void openEdit(agent.id)}
              className={`text-left p-4 rounded-xl border transition-colors ${
                selectedId === agent.id && modalOpen
                  ? "bg-slate-800 border-purple-500/50"
                  : "bg-slate-900 border-slate-800 hover:border-slate-700"
              }`}
            >
              <div className="flex items-start gap-3">
                <Bot className="w-5 h-5 text-purple-400 mt-0.5 shrink-0" />

                <div className="min-w-0">
                  <div className="font-semibold text-white text-sm truncate">
                    {agent.name}
                  </div>

                  <div className="text-[11px] text-slate-500">
                    {agent.status || "Draft"} · {agent.ownerUsername || "—"}
                  </div>
                </div>
              </div>
            </button>
          ))}
        </div>
      </div>

      <Modal
        open={modalOpen}
        onClose={closeModal}
        size="lg"
        title={
          mode === "create"
            ? "Create agent"
            : `Configure · ${detail?.name ?? ""}`
        }
        subtitle={
          detail ? (
            <span className="inline-flex items-center gap-1.5">
              <span className="text-[10px] uppercase tracking-wide px-2 py-0.5 rounded bg-slate-800 text-slate-300">
                {detail.status}
              </span>
            </span>
          ) : undefined
        }
        footer={
          !canCreate && mode === "create" ? undefined : (
            <>
              {mode === "edit" && !canEdit && (
                <span className="text-[11px] text-slate-500 self-center mr-auto">
                  <Check className="w-3 h-3 inline mr-1" />
                  Read-only
                </span>
              )}

              {mode === "edit" && canDelete && (
                <button
                  type="button"
                  disabled={loading}
                  onClick={() => void remove()}
                  className="px-3.5 py-2 rounded-lg bg-rose-800 hover:bg-rose-700 text-white text-xs transition-colors"
                >
                  <Trash2 className="w-3.5 h-3.5 inline mr-1" />
                  Delete
                </button>
              )}

              {mode === "edit" &&
                canPublish &&
                detail?.status === "Published" && (
                  <button
                    type="button"
                    disabled={loading}
                    onClick={() => void publish(false)}
                    className="px-3.5 py-2 rounded-lg bg-slate-700 hover:bg-slate-600 text-white text-xs transition-colors"
                  >
                    <XCircle className="w-3.5 h-3.5 inline mr-1" />
                    Unpublish
                  </button>
                )}

              {mode === "edit" &&
                canPublish &&
                detail?.status !== "Published" && (
                  <button
                    type="button"
                    disabled={loading}
                    onClick={() => void publish(true)}
                    className="px-3.5 py-2 rounded-lg bg-emerald-700 hover:bg-emerald-600 text-white text-xs transition-colors"
                  >
                    <Upload className="w-3.5 h-3.5 inline mr-1" />
                    Publish
                  </button>
                )}

              {(mode === "create" ? canCreate : canEdit) && (
                <button
                  type="submit"
                  form="agent-studio-form"
                  disabled={loading}
                  className="px-3.5 py-2 rounded-lg bg-purple-600 hover:bg-purple-500 text-white text-xs font-semibold transition-colors"
                >
                  <Save className="w-3.5 h-3.5 inline mr-1" />

                  {mode === "create" ? "Create" : "Save"}
                </button>
              )}
            </>
          )
        }
      >
        {!canCreate && mode === "create" ? (
          <div className="text-xs text-slate-500">
            <Lock className="w-4 h-4 inline mr-1" />
            You have view access only. Open an existing agent to inspect it.
          </div>
        ) : (
          <form id="agent-studio-form" onSubmit={save} className="space-y-3">
            {/* Tab strip */}
            <div className="flex items-center gap-4 border-b border-slate-800 overflow-x-auto -mt-1">
              {formTabs.map((t) => (
                <button
                  key={t.key}
                  type="button"
                  onClick={() => setFormTab(t.key)}
                  className={`py-2.5 text-xs font-semibold border-b-2 whitespace-nowrap ${
                    formTab === t.key
                      ? "border-purple-500 text-white"
                      : "border-transparent text-slate-400"
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>

            {error && (
              <div className="p-3 rounded-lg border border-rose-500/40 bg-rose-500/10 text-xs text-rose-200">
                <AlertCircle className="w-4 h-4 inline mr-1" />
                {error}
              </div>
            )}

            {formTab === "access" && (
              <div className="space-y-2">
                <div className="text-[11px] font-semibold text-slate-300">
                  {singleGroup ? "Group" : "Groups"}
                </div>

                <p className="text-[11px] text-slate-500">
                  Choose who can use this agent. Only groups you belong to are
                  listed. The models, knowledge bases and tools you can pick
                  depend on this choice.
                </p>

                {singleGroup ? (
                  <div className="px-2.5 py-1.5 rounded-lg border border-indigo-500/30 bg-indigo-500/10 text-[11px] text-indigo-200">
                    {groupOptions[0].name}

                    <span className="text-slate-500 ml-2">
                      Assigned from your sign-in
                    </span>
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
                          className={`px-2.5 py-1.5 rounded text-[11px] border transition-colors ${
                            on
                              ? "bg-purple-600/30 border-purple-400 text-white"
                              : "bg-slate-800 border-slate-700 text-slate-400 hover:text-slate-200"
                          }`}
                          disabled={readOnly}
                        >
                          {g.name}
                          {on ? " ✓" : ""}
                        </button>
                      );
                    })}

                    {groupOptions.length === 0 && (
                      <span className="text-[11px] text-slate-500">
                        No groups found for this account. Ask an administrator
                        to add you to a group, then sign in again.
                      </span>
                    )}
                  </div>
                )}

                {form.groupIds.length > 0 && (
                  <p className="text-[11px] text-slate-500">
                    Available for this selection: {visibleModels.length} model
                    {visibleModels.length === 1 ? "" : "s"},{" "}
                    {pickerKnowledgeBases.length} knowledge base
                    {pickerKnowledgeBases.length === 1 ? "" : "s"},{" "}
                    {localTools.length + remoteTools.length} tool
                    {localTools.length + remoteTools.length === 1 ? "" : "s"}.
                  </p>
                )}
              </div>
            )}

            {formTab === "basics" && (
              <div className="space-y-3">
                <div>
                  <label className={labelClass}>Agent name</label>

                  <input
                    value={form.name}
                    onChange={(e) =>
                      setForm((f) => ({
                        ...f,
                        name: e.target.value,
                      }))
                    }
                    placeholder="Agent name"
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
                      setForm((f) => ({
                        ...f,
                        description: e.target.value,
                      }))
                    }
                    placeholder="What this agent is for"
                    className={fieldClass}
                    rows={2}
                    disabled={readOnly}
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className={labelClass}>Model</label>

                    <select
                      value={form.modelId}
                      onChange={(e) =>
                        setForm((f) => ({
                          ...f,
                          modelId: e.target.value,
                        }))
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
                          {m.name} ({m.modelIdentifier}) ·{" "}
                          {m.groupIds?.length
                            ? m.groupIds.map(groupName).join(", ")
                            : "all groups"}
                        </option>
                      ))}
                    </select>

                    {form.groupIds.length === 0 && (
                      <button
                        type="button"
                        onClick={() => setFormTab("access")}
                        className="text-[10px] text-purple-300 hover:underline mt-1"
                      >
                        Go to Access
                      </button>
                    )}

                    {form.groupIds.length > 0 && visibleModels.length === 0 && (
                      <p className="text-[10px] text-amber-400 mt-1">
                        No models are available to the selected group(s).
                      </p>
                    )}
                  </div>

                  <div>
                    <label className={labelClass}>Temperature (0–2)</label>

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
                      setForm((f) => ({
                        ...f,
                        systemPrompt: e.target.value,
                      }))
                    }
                    className={fieldClass}
                    rows={8}
                    disabled={readOnly}
                  />
                </div>
              </div>
            )}
            {formTab === "knowledge" && (
              <div className="space-y-5">
                <div>
                  <div className="text-[11px] font-semibold text-slate-300 mb-1.5">
                    Knowledge bases
                  </div>

                  <div className="space-y-1 max-h-44 overflow-auto rounded-lg border border-slate-800 p-2">
                    {pickerKnowledgeBases.map((kb) => {
                      const attached = form.knowledgeBases.find(
                        (k) => k.knowledgeBaseId === kb.id,
                      );

                      return (
                        <div
                          key={kb.id}
                          className="flex items-center gap-2 text-[11px] text-slate-300 py-1"
                        >
                          <input
                            type="checkbox"
                            checked={Boolean(attached)}
                            onChange={() => toggleKb(kb.id)}
                            disabled={readOnly}
                          />

                          <span className="flex-1 truncate">
                            {kb.name} · {kb.strategyName}
                          </span>

                          {attached && (
                            <select
                              value={attached.mode}
                              onChange={(e) =>
                                setKbMode(
                                  kb.id,
                                  e.target.value as KnowledgeBaseMode,
                                )
                              }
                              className="bg-slate-800 rounded px-1 py-0.5 border border-slate-700"
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
                      <div className="text-[11px] text-slate-500 py-2">
                        No knowledge bases are available to the selected
                        group(s).
                      </div>
                    )}
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <div className="text-[11px] font-semibold text-slate-300 mb-1.5">
                      Local tools
                    </div>

                    <div className="space-y-1 max-h-40 overflow-auto rounded-lg border border-slate-800 p-2">
                      {localTools.map((t) => (
                        <label
                          key={t.id}
                          className="flex items-center gap-2 text-[11px] text-slate-300 py-1"
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

                      {localTools.length === 0 && (
                        <div className="text-[11px] text-slate-500 py-2">
                          No approved local tools for the selected group(s).
                        </div>
                      )}
                    </div>
                  </div>

                  <div>
                    <div className="text-[11px] font-semibold text-slate-300 mb-1.5">
                      Remote tools
                    </div>

                    <div className="space-y-2 max-h-64 overflow-auto rounded-lg border border-slate-800 p-2">
                      {remoteServers.map((server) => (
                        <div key={server.id} className="rounded-md border border-slate-800">
                          <div className="px-2 py-1 text-[11px] font-semibold text-slate-200 bg-slate-900/60">
                            {server.name}
                          </div>
                          <div className="space-y-1 p-2">
                            {server.tools.map((t) => (
                              <label
                                key={t.id}
                                className="flex items-center gap-2 text-[11px] text-slate-300 py-1"
                              >
                                <input
                                  type="checkbox"
                                  checked={form.tools.some((x) => x.toolId === t.id)}
                                  onChange={() => toggleTool(t.id, "Remote")}
                                  disabled={readOnly}
                                />
                                {t.name}
                              </label>
                            ))}
                          </div>
                        </div>
                      ))}

                      {remoteServers.length === 0 &&
                        remoteTools.map((t) => (
                          <label
                            key={t.id}
                            className="flex items-center gap-2 text-[11px] text-slate-300 py-1"
                          >
                            <input
                              type="checkbox"
                              checked={form.tools.some((x) => x.toolId === t.id)}
                              onChange={() => toggleTool(t.id, "Remote")}
                              disabled={readOnly}
                            />
                            {t.name}
                          </label>
                        ))}

                      {remoteTools.length === 0 && (
                        <div className="text-[11px] text-slate-500 py-2">
                          No active remote tools for the selected group(s).
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {formTab === "memory" && (
              <div className="space-y-3">
                <label className="flex items-center gap-2 text-xs font-semibold text-slate-300">
                  <input
                    type="checkbox"
                    checked={form.memoryEnabled}
                    onChange={(e) =>
                      setForm((f) => ({
                        ...f,
                        memoryEnabled: e.target.checked,
                      }))
                    }
                    disabled={readOnly}
                    className="rounded border-slate-700 bg-slate-800 accent-purple-500"
                  />
                  Enable memory
                </label>

                {form.memoryEnabled && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                    <div>
                      <label className={labelClass}>Scope</label>

                      <select
                        value={form.memoryScope}
                        onChange={(e) =>
                          setForm((f) => ({
                            ...f,
                            memoryScope: e.target.value,
                          }))
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
                          setForm((f) => ({
                            ...f,
                            memoryRetention: e.target.value,
                          }))
                        }
                        className={fieldClass}
                        disabled={readOnly}
                      >
                        <option value="Session">Session only</option>

                        <option value="Days7">7 days</option>

                        <option value="Days30">30 days</option>

                        <option value="Days90">90 days</option>

                        <option value="Years1">1 year</option>

                        <option value="Forever">Forever</option>
                      </select>
                    </div>

                    <div className="sm:col-span-2">
                      <label className={labelClass}>
                        Instructions (optional)
                      </label>

                      <textarea
                        value={form.memoryInstructions}
                        onChange={(e) =>
                          setForm((f) => ({
                            ...f,
                            memoryInstructions: e.target.value,
                          }))
                        }
                        placeholder="What should this agent remember?"
                        rows={4}
                        className={fieldClass}
                        disabled={readOnly}
                      />
                    </div>
                  </div>
                )}
              </div>
            )}
          </form>
        )}
      </Modal>
    </div>
  );
};
