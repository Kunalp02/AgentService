import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  Background,
  BackgroundVariant,
  Controls,
  MarkerType,
  MiniMap,
  Panel,
  ReactFlow,
  ReactFlowProvider,
  addEdge,
  useEdgesState,
  useNodesState,
  useReactFlow,
  type Connection,
  type NodeTypes,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import {
  AlertTriangle,
  CheckCircle2,
  Download,
  Play,
  RotateCcw,
  Save,
  ShieldCheck,
  Upload,
  Square,
  Trash2,
  X,
} from "lucide-react";
import { usePlatform } from "../../context/PlatformContext";
import { workflowsApi, type WorkflowSummary } from "../../api/workflows";
import { WorkflowNode } from "./WorkflowNode";
import {
  KINDS,
  META,
  defaultDataFor,
  type NodeKind,
  type WFEdge,
  type WFNode,
  type WFNodeData,
} from "./WorkflowTypes";
import {
  canvasFromDefinition,
  supervisorCanvas,
  toWorkflowDefinition,
} from "./workflowDefinition";

const nodeTypes: NodeTypes = { wf: WorkflowNode };
const DRAG_MIME = "application/ccil-workflow-kind";
const STORAGE_KEY = "ai_platform_workflow_draft";

const arrow = { type: MarkerType.ArrowClosed, width: 18, height: 18 };

/* A small sample so the canvas is not empty on first open. "Clear" removes it. */
const seedNodes: WFNode[] = [
  {
    id: "n1",
    type: "wf",
    position: { x: 0, y: 140 },
    data: { ...defaultDataFor("start") },
  },
  {
    id: "n2",
    type: "wf",
    position: { x: 320, y: 140 },
    data: { ...defaultDataFor("agent"), label: "Draft reply" },
  },
  {
    id: "n3",
    type: "wf",
    position: { x: 640, y: 140 },
    data: { ...defaultDataFor("condition"), label: "Confident enough?" },
  },
  {
    id: "n4",
    type: "wf",
    position: { x: 980, y: 40 },
    data: { ...defaultDataFor("end"), label: "Send answer" },
  },
  {
    id: "n5",
    type: "wf",
    position: { x: 980, y: 260 },
    data: { ...defaultDataFor("approval"), label: "Review by a person" },
  },
];
const seedEdges: WFEdge[] = [
  {
    id: "e1",
    source: "n1",
    target: "n2",
    type: "smoothstep",
    animated: true,
    markerEnd: arrow,
  },
  {
    id: "e2",
    source: "n2",
    target: "n3",
    type: "smoothstep",
    animated: true,
    markerEnd: arrow,
  },
  {
    id: "e3",
    source: "n3",
    sourceHandle: "true",
    target: "n4",
    label: "true",
    type: "smoothstep",
    animated: true,
    markerEnd: arrow,
  },
  {
    id: "e4",
    source: "n3",
    sourceHandle: "false",
    target: "n5",
    label: "false",
    type: "smoothstep",
    animated: true,
    markerEnd: arrow,
  },
];

/* ------------------------------------------------------------------ canvas */

const Canvas: React.FC = () => {
  const {
    theme,
    agents,
    knowledgeBases,
    localTools,
    mcpServers,
    groups,
    showNotification,
  } = usePlatform();
  const light = theme === "light";

  const [nodes, setNodes, onNodesChange] = useNodesState<WFNode>(seedNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState<WFEdge>(seedEdges);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [problems, setProblems] = useState<string[] | null>(null);
  const [running, setRunning] = useState(false);
  const [name, setName] = useState("Untitled workflow");
  const [workflowId, setWorkflowId] = useState<string | null>(null);
  const [workflowStatus, setWorkflowStatus] = useState("Draft");
  const [savedKey, setSavedKey] = useState("");
  const [catalog, setCatalog] = useState<WorkflowSummary[]>([]);
  const [saving, setSaving] = useState(false);
  const [runInput, setRunInput] = useState("");
  const [sessionId, setSessionId] = useState("");
  const [userId, setUserId] = useState("");
  const [orgId, setOrgId] = useState("");
  const [runOutput, setRunOutput] = useState("");

  const { screenToFlowPosition, fitView } = useReactFlow<WFNode, WFEdge>();
  const idCounter = useRef(100);
  const runToken = useRef(0);
  const wrapper = useRef<HTMLDivElement>(null);

  const selected = useMemo(
    () => nodes.find((n) => n.id === selectedId) ?? null,
    [nodes, selectedId],
  );

  const snapshot = useCallback(
    () => ({
      name,
      workflowId,
      status: workflowStatus,
      nodes: nodes.map(({ id, position, data }) => ({
        id,
        position,
        data: { ...data, status: undefined },
      })),
      edges: edges.map(({ id, source, sourceHandle, target, targetHandle, label }) => ({
        id,
        source,
        sourceHandle,
        target,
        targetHandle,
        label,
      })),
    }),
    [name, workflowId, workflowStatus, nodes, edges],
  );
  const graphKey = JSON.stringify({
    name: snapshot().name,
    nodes: snapshot().nodes,
    edges: snapshot().edges,
  });
  const dirty = graphKey !== savedKey;
  const publishedAgents = useMemo(
    () => agents.filter((agent) => (agent.status || "").toLowerCase() === "published"),
    [agents],
  );

  /* -------- graph editing */

  const onConnect = useCallback(
    (c: Connection) => {
      const label =
        c.sourceHandle === "true" || c.sourceHandle === "false"
          ? c.sourceHandle
          : undefined;
      setEdges((eds) =>
        addEdge(
          { ...c, label, type: "smoothstep", animated: true, markerEnd: arrow },
          eds,
        ),
      );
      setProblems(null);
    },
    [setEdges],
  );

  const addNode = useCallback(
    (kind: NodeKind, position?: { x: number; y: number }) => {
      const id = `n${++idCounter.current}`;
      const fallback = {
        x: 120 + (idCounter.current % 6) * 40,
        y: 80 + (idCounter.current % 6) * 40,
      };
      const node: WFNode = {
        id,
        type: "wf",
        position: position ?? fallback,
        data: defaultDataFor(kind),
        selected: true,
      };
      setNodes((ns) => [...ns.map((n) => ({ ...n, selected: false })), node]);
      setSelectedId(id);
      setProblems(null);
    },
    [setNodes],
  );

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      const kind = e.dataTransfer.getData(DRAG_MIME) as NodeKind;
      if (!kind || !META[kind]) return;
      addNode(kind, screenToFlowPosition({ x: e.clientX, y: e.clientY }));
    },
    [addNode, screenToFlowPosition],
  );

  const patchNode = (id: string, patch: Partial<WFNodeData>) =>
    setNodes((ns) =>
      ns.map((n) =>
        n.id === id ? { ...n, data: { ...n.data, ...patch } } : n,
      ),
    );

  const removeNode = (id: string) => {
    setNodes((ns) => ns.filter((n) => n.id !== id));
    setEdges((es) => es.filter((e) => e.source !== id && e.target !== id));
    setSelectedId(null);
  };

  const clearAll = () => {
    if (nodes.length && !window.confirm("Remove every step from the canvas?"))
      return;
    setNodes([]);
    setEdges([]);
    setSelectedId(null);
    setProblems(null);
  };

  /* -------- validation */

  const validate = useCallback((): string[] => {
    const out: string[] = [];
    const starts = nodes.filter((n) => n.data.kind === "start");
    const ends = nodes.filter((n) => n.data.kind === "end");
    if (nodes.length === 0)
      return ["The canvas is empty. Drag a Trigger onto it to begin."];
    if (starts.length === 0)
      out.push("Add a Trigger so the workflow knows how to begin.");
    if (starts.length > 1) out.push("Use only one Trigger per workflow.");
    if (ends.length === 0)
      out.push("Add an Output step so the result has somewhere to go.");

    for (const n of nodes) {
      const incoming = edges.filter((e) => e.target === n.id);
      const outgoing = edges.filter((e) => e.source === n.id);
      const meta = META[n.data.kind];
      if (meta.inputs && incoming.length === 0)
        out.push(`“${n.data.label}” has nothing leading into it.`);
      if (meta.outputs && outgoing.length === 0)
        out.push(`“${n.data.label}” does not lead anywhere.`);
      if (n.data.kind === "agent" && !n.data.agentId)
        out.push(`“${n.data.label}” needs an agent.`);
      if (n.data.kind === "tool" && !n.data.toolName)
        out.push(`“${n.data.label}” needs a tool.`);
      if (n.data.kind === "knowledge" && !n.data.kbName)
        out.push(`“${n.data.label}” needs a knowledge base.`);
      if (n.data.kind === "condition") {
        if (!n.data.expression?.trim())
          out.push(`“${n.data.label}” needs an expression.`);
        const handles = new Set(outgoing.map((e) => e.sourceHandle));
        if (!handles.has("true") || !handles.has("false"))
          out.push(`“${n.data.label}” needs both a true and a false path.`);
      }
    }
    return out;
  }, [nodes, edges]);

  const runValidate = () => {
    const found = validate();
    setProblems(found);
    if (found.length === 0) showNotification("Workflow looks good.");
  };

  const resetStatuses = () =>
    setNodes((ns) =>
      ns.map((n) => ({ ...n, data: { ...n.data, status: "idle" } })),
    );

  const stop = () => {
    runToken.current++;
    setRunning(false);
    resetStatuses();
  };

  const run = async () => {
    const found = validate();
    const mapped = toWorkflowDefinition(nodes, edges);
    const blockers = [...found, ...mapped.errors.filter((item) => !found.includes(item))];
    setProblems(blockers);
    if (blockers.length || !mapped.definition) return;
    if (!workflowId || dirty || workflowStatus.toLowerCase() !== "published") {
      setProblems(["Save and publish the workflow before a test run. A run uses the last published copy."]);
      return;
    }
    if (!runInput.trim()) {
      setProblems(["Enter the text the workflow should start from."]);
      return;
    }

    const token = ++runToken.current;
    setRunning(true);
    setRunOutput("");
    resetStatuses();
    try {
      const result = await workflowsApi.run(workflowId, {
        input: runInput.trim(),
        sessionId: sessionId.trim() || undefined,
        userId: userId.trim() || undefined,
        orgId: orgId.trim() || undefined,
      });
      if (token !== runToken.current) return;
      for (const step of result.steps ?? []) {
        patchNode(step.nodeId, { status: step.status === "failed" ? "error" : "done" });
      }
      setRunOutput(result.output || result.error || "");
      setProblems(result.error ? [result.error] : []);
      showNotification(result.error ? "Workflow run failed." : "Workflow run finished.");
    } catch (err) {
      if (token !== runToken.current) return;
      const message = err instanceof Error ? err.message : "Workflow run failed.";
      setProblems([message]);
      showNotification(message);
    } finally {
      if (token === runToken.current) setRunning(false);
    }
  };

  const rememberLocal = (nextId: string | null, nextStatus: string) => {
    const copy = { ...snapshot(), workflowId: nextId, status: nextStatus };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(copy));
  };

  const applyCanvas = (
    nextNodes: WFNode[],
    nextEdges: WFEdge[],
    nextName: string,
    nextId: string | null,
    nextStatus: string,
    markSaved = true,
  ) => {
    const styled = nextEdges.map((edge) => ({
      ...edge,
      type: "smoothstep" as const,
      animated: true,
      markerEnd: arrow,
    }));
    setNodes(nextNodes.map((node) => ({ ...node, type: "wf" as const, data: { ...node.data, status: "idle" as const } })));
    setEdges(styled);
    setName(nextName);
    setWorkflowId(nextId);
    setWorkflowStatus(nextStatus);
    const key = JSON.stringify({
      name: nextName,
      nodes: nextNodes.map(({ id, position, data }) => ({
        id,
        position,
        data: { ...data, status: undefined },
      })),
      edges: styled.map(({ id, source, sourceHandle, target, targetHandle, label }) => ({
        id,
        source,
        sourceHandle,
        target,
        targetHandle,
        label,
      })),
    });
    setSavedKey(markSaved ? key : "");
    const max = Math.max(
      100,
      ...nextNodes.map((node) => Number(String(node.id).replace(/\D/g, "")) || 0),
    );
    idCounter.current = max;
    setSelectedId(null);
    setProblems(null);
    setTimeout(() => fitView({ padding: 0.2 }), 50);
  };

  const saveDraft = async () => {
    const mapped = toWorkflowDefinition(nodes, edges);
    if (!name.trim()) {
      setProblems(["Give the workflow a name before saving."]);
      return;
    }
    if (mapped.errors.length || !mapped.definition) {
      try {
        rememberLocal(workflowId, workflowStatus);
      } catch {
        /* browser storage can be full or blocked */
      }
      setProblems(mapped.errors);
      showNotification("Saved in this browser. The service can store Start, Agent, Condition, and End only.");
      return;
    }
    setSaving(true);
    setProblems(null);
    try {
      const saved = workflowId
        ? await workflowsApi.update(workflowId, name.trim(), mapped.definition)
        : await workflowsApi.create(name.trim(), mapped.definition);
      setWorkflowId(saved.workflowId);
      setWorkflowStatus(saved.status);
      setSavedKey(graphKey);
      rememberLocal(saved.workflowId, saved.status);
      setCatalog((rows) => {
        const rest = rows.filter((row) => row.workflowId !== saved.workflowId);
        return [{ workflowId: saved.workflowId, name: saved.name, status: saved.status, updatedAt: saved.updatedAt }, ...rest];
      });
      showNotification(
        saved.status.toLowerCase() === "draft" && workflowStatus.toLowerCase() === "published"
          ? "Saved. Publish again before the next run."
          : "Workflow saved.",
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : "Could not save the workflow.";
      setProblems([message]);
      showNotification(message);
    } finally {
      setSaving(false);
    }
  };

  const publishWorkflow = async (publish: boolean) => {
    if (!workflowId || dirty) {
      setProblems(["Save the workflow before publishing."]);
      return;
    }
    setSaving(true);
    try {
      const saved = publish
        ? await workflowsApi.publish(workflowId)
        : await workflowsApi.unpublish(workflowId);
      setWorkflowStatus(saved.status);
      rememberLocal(saved.workflowId, saved.status);
      setCatalog((rows) =>
        rows.map((row) => (row.workflowId === saved.workflowId ? { ...row, status: saved.status } : row)),
      );
      showNotification(publish ? "Workflow published." : "Workflow unpublished.");
    } catch (err) {
      const message = err instanceof Error ? err.message : "Could not update publish status.";
      setProblems([message]);
      showNotification(message);
    } finally {
      setSaving(false);
    }
  };

  const loadSaved = async (id: string) => {
    if (!id) return;
    setSaving(true);
    try {
      const document = await workflowsApi.get(id);
      const canvas = canvasFromDefinition(document.definition);
      applyCanvas(canvas.nodes, canvas.edges, document.name, document.workflowId, document.status);
      showNotification(`Opened ${document.name}.`);
    } catch (err) {
      showNotification(err instanceof Error ? err.message : "Could not open that workflow.");
    } finally {
      setSaving(false);
    }
  };

  const loadSupervisor = () => {
    const sample = supervisorCanvas();
    applyCanvas(sample.nodes, sample.edges, sample.name, null, "Draft", false);
    showNotification("Supervisor flow added. Choose a published agent for each step, then save.");
  };

  const exportJson = () => {
    const blob = new Blob([JSON.stringify(snapshot(), null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${name.trim().replace(/\s+/g, "-").toLowerCase() || "workflow"}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 0);
  };

  // Restore a saved draft once, if there is one.
  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const d = JSON.parse(raw);
      if (Array.isArray(d.nodes) && Array.isArray(d.edges)) {
        setNodes(
          d.nodes.map((n: any) => ({
            ...n,
            type: "wf",
            data: { ...n.data, status: "idle" },
          })),
        );
        setEdges(
          d.edges.map((e: any) => ({
            ...e,
            type: "smoothstep",
            animated: true,
            markerEnd: arrow,
          })),
        );
        if (d.name) setName(d.name);
        if (typeof d.workflowId === "string") setWorkflowId(d.workflowId);
        if (typeof d.status === "string") setWorkflowStatus(d.status);
        setSavedKey(
          JSON.stringify({
            name: d.name || name,
            nodes: d.nodes.map((n: any) => ({
              id: n.id,
              position: n.position,
              data: { ...n.data, status: undefined },
            })),
            edges: d.edges.map((e: any) => ({
              id: e.id,
              source: e.source,
              sourceHandle: e.sourceHandle,
              target: e.target,
              targetHandle: e.targetHandle,
              label: e.label,
            })),
          }),
        );
        const max = Math.max(
          100,
          ...d.nodes.map(
            (n: any) => Number(String(n.id).replace(/\D/g, "")) || 0,
          ),
        );
        idCounter.current = max;
        setTimeout(() => fitView({ padding: 0.2 }), 50);
      }
    } catch {
      /* no usable draft — keep the sample */
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    void workflowsApi.list().then(setCatalog).catch(() => setCatalog([]));
  }, []);

  /* -------- styling helpers */

  const field = light
    ? "w-full bg-slate-100 border border-slate-300 rounded-lg px-3 py-2 text-xs text-slate-900 focus:outline-none focus:border-sky-500"
    : "w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-100 focus:outline-none focus:border-sky-500";
  const label = `block text-[11px] font-semibold mb-1.5 ${light ? "text-slate-700" : "text-slate-400"}`;
  const surface = light
    ? "bg-white/70 border-slate-300"
    : "bg-slate-950/50 border-slate-700/70";
  const btn = light
    ? "inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-200 hover:bg-slate-300 border border-slate-300 text-xs font-semibold text-slate-800 disabled:opacity-40"
    : "inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-xs font-semibold text-slate-200 disabled:opacity-40";

  const activeGroups = groups.filter((g) => g.isActive);

  /* -------- inspector content */

  const renderInspector = (n: WFNode) => {
    const d = n.data;
    const meta = META[d.kind];
    const Icon = meta.icon;
    return (
      <div className="space-y-4">
        <div className="flex items-center gap-2.5">
          <div className={`rounded-lg border p-1.5 ${meta.chip}`}>
            <Icon className={`h-4 w-4 ${meta.accent}`} />
          </div>
          <div className="min-w-0 flex-1">
            <div
              className={`text-sm font-bold ${light ? "text-slate-900" : "text-white"}`}
            >
              {meta.title}
            </div>
            <div className="font-mono text-[10px] text-slate-500">{n.id}</div>
          </div>
          <button
            title="Close"
            onClick={() => setSelectedId(null)}
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-700/40 hover:text-white"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div>
          <label className={label}>Step name</label>
          <input
            className={field}
            value={d.label}
            onChange={(e) => patchNode(n.id, { label: e.target.value })}
          />
        </div>

        {d.kind === "start" && (
          <div>
            <label className={label}>Starts when</label>
            <select
              className={field}
              value={d.trigger ?? "manual"}
              onChange={(e) =>
                patchNode(n.id, {
                  trigger: e.target.value as WFNodeData["trigger"],
                })
              }
            >
              <option value="manual">Someone runs it manually</option>
              <option value="api">An API call arrives</option>
              <option value="schedule">On a schedule</option>
            </select>
          </div>
        )}

        {d.kind === "agent" && (
          <>
            <div>
              <label className={label}>Agent</label>
              <select
                className={field}
                value={d.agentId ?? ""}
                onChange={(e) => {
                  const a = agents.find((x) => x.id === e.target.value);
                  patchNode(n.id, {
                    agentId: e.target.value || undefined,
                    agentName: a?.name,
                  });
                }}
              >
                <option value="">
                  {publishedAgents.length ? "Select a published agent" : "No published agents"}
                </option>
                {publishedAgents.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
                {d.agentId && !publishedAgents.some((a) => a.id === d.agentId) && (
                  <option value={d.agentId}>{d.agentName || d.agentId} (not published)</option>
                )}
              </select>
            </div>
            {(() => {
              const chosen = agents.find((agent) => agent.id === d.agentId);
              if (!chosen) return null;
              return (
                <div className={`rounded-lg border p-2 text-[11px] ${light ? "border-slate-300 text-slate-700" : "border-slate-700 text-slate-300"}`}>
                  <div className="font-semibold">{chosen.modelName || "Model not set"}</div>
                  <p className="mt-1 line-clamp-4 whitespace-pre-wrap text-slate-500">{chosen.systemPrompt}</p>
                  <p className="mt-1">Tools: {chosen.tools.map((tool) => tool.toolName || tool.toolId).join(", ") || "none"}</p>
                  <p>Knowledge: {chosen.knowledgeBases.map((kb) => kb.knowledgeBaseName || kb.knowledgeBaseId).join(", ") || "none"}</p>
                </div>
              );
            })()}
            <div>
              <label className={label}>Input template</label>
              <textarea
                rows={4}
                className={field}
                placeholder="{{input}}"
                value={d.prompt ?? ""}
                onChange={(e) => patchNode(n.id, { prompt: e.target.value })}
              />
              <p className="mt-1 text-[10px] text-slate-500">
                Use {"{{input}}"} for the workflow request and {"{{plan}}"} style names for earlier step results. A note without {"{{"} is appended to {"{{input}}"}.
              </p>
            </div>
            <div>
              <label className={label}>Output name</label>
              <input
                className={field}
                placeholder="plan"
                value={d.output ?? ""}
                onChange={(e) => patchNode(n.id, { output: e.target.value })}
              />
              <p className="mt-1 text-[10px] text-slate-500">
                Later steps read this result as {`{{${d.output?.trim() || "output"}}}`}.
              </p>
            </div>
          </>
        )}

        {d.kind === "tool" && (
          <>
            <div>
              <label className={label}>Tool type</label>
              <select
                className={field}
                value={d.toolType ?? "local"}
                onChange={(e) =>
                  patchNode(n.id, {
                    toolType: e.target.value as WFNodeData["toolType"],
                    toolName: undefined,
                  })
                }
              >
                <option value="local">Local Python tool</option>
                <option value="remote">Remote MCP server</option>
              </select>
            </div>
            <div>
              <label className={label}>Tool</label>
              {(d.toolType ?? "local") === "local" ? (
                localTools.length ? (
                  <select
                    className={field}
                    value={d.toolName ?? ""}
                    onChange={(e) =>
                      patchNode(n.id, { toolName: e.target.value || undefined })
                    }
                  >
                    <option value="">Select a tool</option>
                    {localTools.map((t) => (
                      <option key={t.id} value={t.name ?? t.id}>
                        {t.name ?? t.id}
                      </option>
                    ))}
                  </select>
                ) : (
                  <input
                    className={field}
                    placeholder="Tool name"
                    value={d.toolName ?? ""}
                    onChange={(e) =>
                      patchNode(n.id, { toolName: e.target.value || undefined })
                    }
                  />
                )
              ) : mcpServers.length ? (
                <select
                  className={field}
                  value={d.toolName ?? ""}
                  onChange={(e) =>
                    patchNode(n.id, { toolName: e.target.value || undefined })
                  }
                >
                  <option value="">Select a server</option>
                  {mcpServers.map((s) => (
                    <option key={s.id} value={s.name ?? s.id}>
                      {s.name ?? s.id}
                    </option>
                  ))}
                </select>
              ) : (
                <input
                  className={field}
                  placeholder="Server or tool name"
                  value={d.toolName ?? ""}
                  onChange={(e) =>
                    patchNode(n.id, { toolName: e.target.value || undefined })
                  }
                />
              )}
              <p className="mt-1 text-[10px] text-slate-500">
                Lists fill in after you have opened Tools Management once in
                this session.
              </p>
            </div>
          </>
        )}

        {d.kind === "knowledge" && (
          <>
            <div>
              <label className={label}>Knowledge base</label>
              {knowledgeBases.length ? (
                <select
                  className={field}
                  value={d.kbName ?? ""}
                  onChange={(e) =>
                    patchNode(n.id, { kbName: e.target.value || undefined })
                  }
                >
                  <option value="">Select a knowledge base</option>
                  {knowledgeBases.map((k: any) => (
                    <option key={k.id ?? k.name} value={k.name}>
                      {k.name}
                    </option>
                  ))}
                </select>
              ) : (
                <input
                  className={field}
                  placeholder="Knowledge base name"
                  value={d.kbName ?? ""}
                  onChange={(e) =>
                    patchNode(n.id, { kbName: e.target.value || undefined })
                  }
                />
              )}
            </div>
            <div>
              <label className={label}>Passages to retrieve (top-K)</label>
              <input
                type="number"
                min={1}
                max={20}
                className={field}
                value={d.topK ?? 5}
                onChange={(e) =>
                  patchNode(n.id, { topK: Number(e.target.value) || 5 })
                }
              />
            </div>
          </>
        )}

        {d.kind === "condition" && (
          <div>
            <label className={label}>Expression</label>
            <textarea
              rows={3}
              className={`${field} font-mono`}
              value={d.expression ?? ""}
              onChange={(e) => patchNode(n.id, { expression: e.target.value })}
            />
            <p className="mt-1 text-[10px] text-slate-500">
              The true path runs when the previous agent’s text contains this.
              Use <b className="text-emerald-400">contains approved</b> to match
              the word approved. The false path loops back up to 3 times.
            </p>
          </div>
        )}

        {d.kind === "approval" && (
          <div>
            <label className={label}>Who approves</label>
            <select
              className={field}
              value={d.approverGroup ?? ""}
              onChange={(e) =>
                patchNode(n.id, { approverGroup: e.target.value || undefined })
              }
            >
              <option value="">Select a group</option>
              {activeGroups.map((g) => (
                <option key={g.id} value={g.name ?? g.id}>
                  {g.name ?? g.id}
                </option>
              ))}
            </select>
          </div>
        )}

        {d.kind === "end" && (
          <div>
            <label className={label}>Deliver as</label>
            <select
              className={field}
              value={d.outputFormat ?? "text"}
              onChange={(e) =>
                patchNode(n.id, {
                  outputFormat: e.target.value as WFNodeData["outputFormat"],
                })
              }
            >
              <option value="text">Plain text</option>
              <option value="json">JSON</option>
              <option value="file">File</option>
            </select>
          </div>
        )}

        <div>
          <label className={label}>Notes</label>
          <textarea
            rows={2}
            className={field}
            placeholder="Optional — why this step exists"
            value={d.description ?? ""}
            onChange={(e) => patchNode(n.id, { description: e.target.value })}
          />
        </div>

        <button
          onClick={() => removeNode(n.id)}
          className="inline-flex w-full items-center justify-center gap-1.5 rounded-lg border border-rose-500/40 bg-rose-500/10 px-3 py-2 text-xs font-semibold text-rose-300 hover:bg-rose-500/20"
        >
          <Trash2 className="h-3.5 w-3.5" /> Delete step
        </button>
      </div>
    );
  };

  /* -------- render */

  return (
    <div id="workflow-view" className="mx-auto max-w-7xl space-y-5 p-5">
      <div
        className={`panel space-y-4 ${
          light
            ? "border-neutral-900/5 bg-slate-950/5 shadow-none backdrop-blur-sm"
            : "border-neutral-100/10 bg-slate-100/5 backdrop-blur-sm"
        }`}
      >
        {/* Header */}
        <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-end">
          <div className="min-w-0">
            <span
              className={`rounded-full border border-indigo-500/30 bg-indigo-500/20 px-2 py-0.5 text-xs font-semibold ${
                light ? "text-indigo-800" : "text-indigo-300"
              }`}
            >
              Workflow Service
            </span>
            <h1 className={`header ${light ? "text-sky-950" : "text-sky-50"}`}>
              Workflow Canvas
            </h1>
            <p
              className={`header-disciption ${light ? "text-gray-800" : "text-gray-200"}`}
            >
              Connect agents, tools and knowledge bases into a flow. Drag a step
              onto the canvas, then link them together.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              aria-label="Workflow name"
              className={`${field} w-52`}
            />
            <span className={`rounded-full px-2 py-1 text-[10px] font-semibold ${
              workflowStatus.toLowerCase() === "published"
                ? "bg-emerald-500/15 text-emerald-300"
                : "bg-slate-500/20 text-slate-300"
            }`}>
              {workflowStatus || "Draft"}
            </span>
            <select
              className={`${field} w-48`}
              value={workflowId ?? ""}
              aria-label="Saved workflows"
              onChange={(e) => void loadSaved(e.target.value)}
            >
              <option value="">Saved workflows</option>
              {catalog.map((item) => (
                <option key={item.workflowId} value={item.workflowId}>
                  {item.name} ({item.status})
                </option>
              ))}
            </select>
            <button className={btn} onClick={loadSupervisor}>
              Supervisor flow
            </button>
            <button className={btn} onClick={runValidate}>
              <ShieldCheck className="h-3.5 w-3.5" /> Validate
            </button>
            {running ? (
              <button
                onClick={stop}
                className="inline-flex items-center gap-1.5 rounded-lg bg-rose-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-rose-500"
              >
                <Square className="h-3.5 w-3.5" /> Stop
              </button>
            ) : (
              <button
                onClick={() => void run()}
                disabled={saving}
                title={workflowStatus.toLowerCase() === "published" ? "Run the published workflow" : "Publish before running"}
                className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-emerald-500 disabled:opacity-40"
              >
                <Play className="h-3.5 w-3.5" /> Test run
              </button>
            )}
            <button
              className={`${btn} ${dirty || !workflowId ? "ring-2 ring-purple-300" : ""}`}
              disabled={saving || (!dirty && !!workflowId)}
              onClick={() => void saveDraft()}
              title="Save before publishing"
            >
              <Save className="h-3.5 w-3.5" /> {dirty || !workflowId ? "Save draft" : "Saved"}
            </button>
            {workflowStatus.toLowerCase() === "published" ? (
              <button
                className={btn}
                disabled={saving || dirty || !workflowId}
                title={dirty ? "Save changes before unpublishing" : "Unpublish"}
                onClick={() => void publishWorkflow(false)}
              >
                Unpublish
              </button>
            ) : (
              <button
                className={`${btn} ${!dirty && workflowId ? "ring-2 ring-emerald-300" : ""}`}
                disabled={saving || dirty || !workflowId}
                title={dirty || !workflowId ? "Save the workflow before publishing" : "Publish"}
                onClick={() => void publishWorkflow(true)}
              >
                <Upload className="h-3.5 w-3.5" /> Publish
              </button>
            )}
            <button className={btn} onClick={exportJson}>
              <Download className="h-3.5 w-3.5" /> Export JSON
            </button>
          </div>
        </div>

        <div className="grid gap-2 md:grid-cols-4">
          <input
            className={field}
            placeholder="Run input"
            aria-label="Run input"
            value={runInput}
            onChange={(e) => setRunInput(e.target.value)}
          />
          <input
            className={field}
            placeholder="Session id (memory)"
            aria-label="Session id"
            value={sessionId}
            onChange={(e) => setSessionId(e.target.value)}
          />
          <input
            className={field}
            placeholder="User id"
            aria-label="User id"
            value={userId}
            onChange={(e) => setUserId(e.target.value)}
          />
          <input
            className={field}
            placeholder="Org id"
            aria-label="Org id"
            value={orgId}
            onChange={(e) => setOrgId(e.target.value)}
          />
        </div>
        {runOutput && (
          <pre className={`whitespace-pre-wrap rounded-xl border p-3 text-xs ${light ? "border-slate-300 text-slate-800" : "border-slate-700 text-slate-200"}`}>
            {runOutput}
          </pre>
        )}

        {/* Validation result */}
        {problems && (
          <div
            className={`rounded-xl border p-3 text-xs ${
              problems.length
                ? "border-amber-500/40 bg-amber-500/10 text-amber-200"
                : "border-emerald-500/40 bg-emerald-500/10 text-emerald-200"
            }`}
          >
            <div className="flex items-center gap-2 font-semibold">
              {problems.length ? (
                <>
                  <AlertTriangle className="h-4 w-4" /> {problems.length} thing
                  {problems.length === 1 ? "" : "s"} to fix before this can run
                </>
              ) : (
                <>
                  <CheckCircle2 className="h-4 w-4" /> Ready to run
                </>
              )}
              <button
                className="ml-auto text-slate-400 hover:text-white"
                onClick={() => setProblems(null)}
                aria-label="Dismiss"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
            {problems.length > 0 && (
              <ul className="mt-2 list-disc space-y-0.5 pl-5">
                {problems.map((p, i) => (
                  <li key={i}>{p}</li>
                ))}
              </ul>
            )}
          </div>
        )}

        {/* Workspace */}
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-[220px_minmax(0,1fr)_300px]">
          {/* Palette */}
          <aside className={`rounded-2xl border p-3 ${surface}`}>
            <div
              className={`mb-2 px-1 text-sm font-bold ${light ? "text-sky-950" : "text-sky-50"}`}
            >
              Steps
            </div>
            <p className="mb-3 px-1 text-[11px] text-slate-500">
              Drag onto the canvas, or click to add.
            </p>
            <div className="space-y-2">
              {KINDS.map((k) => {
                const Icon = k.icon;
                return (
                  <button
                    key={k.kind}
                    draggable
                    onDragStart={(e) => {
                      e.dataTransfer.setData(DRAG_MIME, k.kind);
                      e.dataTransfer.effectAllowed = "move";
                    }}
                    onClick={() => addNode(k.kind)}
                    className={`flex w-full cursor-grab items-center gap-2.5 rounded-xl border p-2 text-left transition-colors active:cursor-grabbing ${
                      light
                        ? "border-slate-300 bg-white hover:border-sky-500"
                        : "border-slate-700 bg-slate-900/60 hover:border-sky-500/60"
                    }`}
                  >
                    <span className={`rounded-lg border p-1.5 ${k.chip}`}>
                      <Icon className={`h-4 w-4 ${k.accent}`} />
                    </span>
                    <span className="min-w-0">
                      <span
                        className={`block text-xs font-semibold ${light ? "text-slate-900" : "text-slate-100"}`}
                      >
                        {k.title}
                      </span>
                      <span className="block truncate text-[10px] text-slate-500">
                        {k.hint}
                      </span>
                    </span>
                  </button>
                );
              })}
            </div>
          </aside>

          {/* Canvas */}
          <div
            ref={wrapper}
            className={`h-[calc(100vh-290px)] min-h-[520px] overflow-hidden rounded-2xl border ${
              light ? "border-slate-300" : "border-slate-700/70"
            }`}
          >
            <ReactFlow<WFNode, WFEdge>
              nodes={nodes}
              edges={edges}
              nodeTypes={nodeTypes}
              onNodesChange={onNodesChange}
              onEdgesChange={onEdgesChange}
              onConnect={onConnect}
              onNodeClick={(_, n) => setSelectedId(n.id)}
              onPaneClick={() => setSelectedId(null)}
              onDragOver={(e) => {
                e.preventDefault();
                e.dataTransfer.dropEffect = "move";
              }}
              onDrop={onDrop}
              colorMode={light ? "light" : "dark"}
              fitView
              fitViewOptions={{ padding: 0.2 }}
              deleteKeyCode={["Backspace", "Delete"]}
              proOptions={{ hideAttribution: true }}
              defaultEdgeOptions={{
                type: "smoothstep",
                animated: true,
                markerEnd: arrow,
              }}
            >
              <Background
                variant={BackgroundVariant.Dots}
                gap={20}
                size={1.4}
              />
              <Controls showInteractive={false} />
              <MiniMap
                pannable
                zoomable
                nodeColor={(n) =>
                  META[(n.data as WFNodeData).kind]?.hex ?? "#64748b"
                }
                maskColor={light ? "rgba(241,245,249,0.7)" : "rgba(2,6,23,0.7)"}
              />
              <Panel position="top-left">
                <div className="flex gap-2">
                  <button
                    className={btn}
                    onClick={() => fitView({ padding: 0.2, duration: 300 })}
                  >
                    <RotateCcw className="h-3.5 w-3.5" /> Fit view
                  </button>
                  <button
                    className={btn}
                    onClick={clearAll}
                    disabled={nodes.length === 0}
                  >
                    <Trash2 className="h-3.5 w-3.5" /> Clear
                  </button>
                </div>
              </Panel>
              {nodes.length === 0 && (
                <Panel position="top-center">
                  <div className="mt-24 rounded-xl border border-dashed border-slate-500/60 px-6 py-5 text-center">
                    <div
                      className={`text-sm font-semibold ${light ? "text-slate-800" : "text-slate-200"}`}
                    >
                      Nothing on the canvas yet
                    </div>
                    <p className="mt-1 text-xs text-slate-500">
                      Drag a Trigger from the left to start building.
                    </p>
                  </div>
                </Panel>
              )}
            </ReactFlow>
          </div>

          {/* Inspector */}
          <aside
            className={`rounded-2xl border p-4 ${surface} lg:max-h-[calc(100vh-290px)] lg:overflow-y-auto`}
          >
            {selected ? (
              renderInspector(selected)
            ) : (
              <div className="space-y-3">
                <div
                  className={`text-sm font-bold ${light ? "text-sky-950" : "text-sky-50"}`}
                >
                  Step settings
                </div>
                <p className="text-xs text-slate-500">
                  Select a step on the canvas to edit it.
                </p>
                <div
                  className={`rounded-xl border p-3 text-[11px] ${light ? "border-slate-300 text-slate-600" : "border-slate-700 text-slate-400"}`}
                >
                  <div className="mb-1 font-semibold">This workflow</div>
                  {nodes.length} step{nodes.length === 1 ? "" : "s"} ·{" "}
                  {edges.length} connection
                  {edges.length === 1 ? "" : "s"}
                </div>
                <ul className="list-disc space-y-1 pl-4 text-[11px] text-slate-500">
                  <li>
                    Drag from a step’s right dot to another step’s left dot to
                    connect them.
                  </li>
                  <li>
                    Press Delete to remove the selected step or connection.
                  </li>
                  <li>
                    Save, then publish. Test run calls the published workflow.
                  </li>
                  <li>
                    Tool, knowledge, and approval steps stay on the canvas but are not executed by the service.
                  </li>
                </ul>
              </div>
            )}
          </aside>
        </div>
      </div>
    </div>
  );
};

export const WorkflowView: React.FC = () => (
  <ReactFlowProvider>
    <Canvas />
  </ReactFlowProvider>
);

export default WorkflowView;

