import { useCallback, useEffect, useMemo, useState } from "react";
import { agentsApi } from "../../api/agents";
import { groupName, userGroupEntries } from "../../api/groupDirectory";
import {
  normalizeAgent,
  normalizeEditorOptions,
  toCreatePayload,
  type AgentEditorOptionsDto,
  type AgentUi,
  type KnowledgeBaseMode,
} from "../../types/agent";
import { usePlatform } from "../../context/PlatformContext";
import { PERMISSIONS } from "../../config/permissions";
import {
  agentFieldClass,
  agentLabelClass,
  emptyAgentForm,
  validateAgentForm,
  type AgentFormState,
  type AgentFormTabKey,
} from "./agentEditorConstants";

export type UseAgentEditorOptions = {
  agentId: string | null;
  mode: "create" | "edit";
  /** When true, load runs when agentId is set (edit mode). */
  autoLoad?: boolean;
};

export function useAgentEditor({
  agentId,
  mode,
  autoLoad = true,
}: UseAgentEditorOptions) {
  const {
    currentUser,
    hasPermission,
    reloadPlatformData,
    showNotification,
  } = usePlatform();

  const canCreate = hasPermission(PERMISSIONS.Agent.Create);
  const canEdit = hasPermission(PERMISSIONS.Agent.Edit);
  const canDelete = hasPermission(PERMISSIONS.Agent.Delete);
  const canPublish = hasPermission(PERMISSIONS.Agent.Publish);

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
  const [detail, setDetail] = useState<AgentUi | null>(null);
  const [form, setForm] = useState<AgentFormState>(emptyAgentForm);
  const [formTab, setFormTab] = useState<AgentFormTabKey>("basics");
  const [openRemoteServerIds, setOpenRemoteServerIds] = useState<string[]>([]);

  const readOnly = mode === "edit" && !canEdit;

  const groupOptions = useMemo(() => {
    const known = new Set(myGroups.map((g) => g.id));
    const extras = form.groupIds
      .filter((id) => !known.has(id))
      .map((id) => ({ id, name: groupName(id) }));
    return [...myGroups, ...extras];
  }, [myGroups, form.groupIds]);

  const singleGroup = groupOptions.length === 1;
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

  const loadOptions = useCallback(async (groupIds: string[]) => {
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
  }, []);

  const groupKey = form.groupIds.slice().sort().join(",");

  useEffect(() => {
    void loadOptions(form.groupIds);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [groupKey]);

  useEffect(() => {
    if (mode === "create" && singleGroup && form.groupIds.length === 0) {
      setForm((f) => ({ ...f, groupIds: [groupOptions[0].id] }));
    }
  }, [mode, singleGroup, groupOptions, form.groupIds.length]);

  const loadAgent = useCallback(async (id: string) => {
    setError("");
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
      setDetail(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!autoLoad || mode !== "edit" || !agentId) return;
    void loadAgent(agentId);
  }, [agentId, mode, autoLoad, loadAgent]);

  const resetCreate = useCallback(() => {
    const initialGroups = myGroups[0]?.id ? [myGroups[0].id] : [];
    setDetail(null);
    setFormTab("basics");
    setError("");
    setForm({ ...emptyAgentForm, groupIds: initialGroups });
  }, [myGroups]);

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
        knowledgeBases: [...f.knowledgeBases, { knowledgeBaseId: id, mode: "Context" }],
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
        return { ...f, tools: f.tools.filter((t) => t.toolId !== id) };
      }
      return { ...f, tools: [...f.tools, { toolId: id, toolType }] };
    });
  };

  const save = async (e?: React.FormEvent) => {
    e?.preventDefault();
    const problem = validateAgentForm(form);
    if (problem) {
      setFormTab(problem.tab);
      setError(problem.message);
      return null;
    }
    setLoading(true);
    setError("");
    try {
      const payload = toCreatePayload(form);
      if (mode === "create") {
        if (!canCreate) {
          setError("You do not have permission to create agents.");
          return null;
        }
        const created = await agentsApi.createAgent(payload);
        showNotification?.(`Created ${created.name}`);
        await reloadPlatformData();
        const ui = normalizeAgent(created);
        setDetail(ui);
        return ui;
      }
      if (!agentId) return null;
      const updated = await agentsApi.patchAgent(agentId, payload);
      showNotification?.(`Saved ${updated.name}`);
      const ui = normalizeAgent(updated);
      setDetail(ui);
      await reloadPlatformData();
      return ui;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed.");
      return null;
    } finally {
      setLoading(false);
    }
  };

  const remove = async () => {
    if (!agentId || !canDelete) return false;
    if (!window.confirm("Delete this agent?")) return false;
    setLoading(true);
    setError("");
    try {
      await agentsApi.deleteAgent(agentId);
      showNotification?.("Agent deleted.");
      await reloadPlatformData();
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Delete failed.");
      return false;
    } finally {
      setLoading(false);
    }
  };

  const publish = async (doPublish: boolean) => {
    if (!agentId || !canPublish) return;
    setLoading(true);
    setError("");
    try {
      const dto = doPublish
        ? await agentsApi.publishAgent(agentId)
        : await agentsApi.unpublishAgent(agentId);
      setDetail(normalizeAgent(dto));
      await reloadPlatformData();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Publish failed.");
    } finally {
      setLoading(false);
    }
  };

  const formTabs: { key: AgentFormTabKey; label: string }[] = [
    {
      key: "access",
      label: singleGroup ? "Access" : `Access (${form.groupIds.length})`,
    },
    { key: "basics", label: "Basics" },
    {
      key: "knowledge",
      label: `Knowledge & tools (${form.knowledgeBases.length + form.tools.length})`,
    },
    {
      key: "memory",
      label: form.memoryEnabled ? "Memory (on)" : "Memory",
    },
  ];

  return {
    loading,
    error,
    setError,
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
    loadAgent,
    resetCreate,
    fieldClass: agentFieldClass,
    labelClass: agentLabelClass,
  };
}

export type AgentEditorController = ReturnType<typeof useAgentEditor>;
