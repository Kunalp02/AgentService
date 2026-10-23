import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  Handle,
  Position,
  ReactFlowProvider,
  addEdge,
  useReactFlow,
  type Connection,
  type Edge,
  type Node,
  useEdgesState,
  useNodesState,
  MarkerType,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import {
  GitBranch,
  Play,
  Plus,
  Save,
  Upload,
  UserCircle,
  Bot,
  Diamond,
  Circle,
  Square,
  Sun,
  Moon,
} from "lucide-react";
import { usePlatform } from "../../context/PlatformContext";
import { PERMISSIONS } from "../../config/permissions";
import { WorkflowAgentEditorPanel } from "./WorkflowAgentEditorPanel";
import { workflowsApi } from "../../api/workflows";
import type {
  WorkflowDefinition,
  WorkflowDocument,
  WorkflowNode,
  WorkflowRunResponse,
} from "../../types/workflow";
import {
  linearPipelineTemplate,
  parallelFanInTemplate,
  supervisorHubTemplate,
  supervisorSqlTemplate,
} from "./workflowTemplates";

type FlowData = {
  wfType: WorkflowNode["type"];
  label: string;
  agentId?: string;
  agentName?: string;
  input?: string;
  output?: string;
  on?: string;
  role?: WorkflowNode["role"];
  workflowId?: string;
};

const WF_DND = "application/x-workflow-dnd";

type WfDragPayload =
  | {
      kind: "palette";
      wfType: WorkflowNode["type"];
      role?: WorkflowNode["role"];
    }
  | { kind: "agent"; agentId: string; name: string };

function startDrag(e: React.DragEvent, payload: WfDragPayload) {
  e.dataTransfer.setData(WF_DND, JSON.stringify(payload));
  e.dataTransfer.effectAllowed = "move";
}

function displayLabel(data: FlowData): string {
  if (data.agentName?.trim()) return data.agentName.trim();
  return data.label;
}

function buildFlowData(
  wfType: WorkflowNode["type"],
  role?: WorkflowNode["role"],
  agent?: { id: string; name: string },
): FlowData {
  const baseLabel = nodeLabel({ id: "x", type: wfType, role });
  return {
    wfType,
    label: agent?.name ?? baseLabel,
    role,
    agentId: agent?.id,
    agentName: agent?.name,
    input:
      wfType === "agent"
        ? "{{input}}"
        : wfType === "human"
          ? "Approve this step?\n{{input}}"
          : wfType === "workflow"
            ? "{{input}}"
            : undefined,
    output:
      wfType === "agent"
        ? "output"
        : wfType === "human"
          ? "human"
          : wfType === "workflow"
            ? "output"
            : undefined,
    on: wfType === "condition" ? "supervisor_out" : undefined,
  };
}

function definitionToFlow(def: WorkflowDefinition): { nodes: Node[]; edges: Edge[] } {
  const nodes: Node[] = def.nodes.map((n) => ({
    id: n.id,
    type: "wfNode",
    position: n.position ?? { x: 0, y: 0 },
    data: {
      wfType: n.type,
      label: nodeLabel(n),
      agentId: n.agentId,
      input: n.input,
      output: n.output,
      on: n.on,
      role: n.role,
      workflowId: n.workflowId,
    } satisfies FlowData,
  }));
  const edges: Edge[] = def.edges.map((e, i) => ({
    id: `e-${e.from}-${e.to}-${i}`,
    source: e.from,
    target: e.to,
    label: e.when || undefined,
    markerEnd: { type: MarkerType.ArrowClosed },
    data: { when: e.when, maxLoops: e.maxLoops },
  }));
  return { nodes, edges };
}

function flowToDefinition(
  nodes: Node[],
  edges: Edge[],
  maxSteps: number,
): WorkflowDefinition {
  return {
    maxSteps,
    nodes: nodes.map((n) => {
      const d = n.data as FlowData;
      return {
        id: n.id,
        type: d.wfType,
        agentId: d.agentId,
        input: d.input,
        output: d.output,
        on: d.on,
        role: d.role,
        workflowId: d.workflowId,
        position: { x: n.position.x, y: n.position.y },
      };
    }),
    edges: edges.map((e) => ({
      from: e.source,
      to: e.target,
      when: String((e.data as { when?: string })?.when ?? e.label ?? ""),
      maxLoops: (e.data as { maxLoops?: number })?.maxLoops,
    })),
  };
}

function nodeLabel(n: WorkflowNode): string {
  if (n.type === "start") return "Start";
  if (n.type === "end") return "End";
  if (n.type === "condition") return "Route";
  if (n.type === "human") return "Human approval";
  if (n.type === "parallel") return "Parallel";
  if (n.type === "join") return "Join";
  if (n.type === "workflow") return "Sub-workflow";
  if (n.role === "supervisor") return "Supervisor";
  if (n.type === "agent") return "Agent";
  return n.type;
}

function workflowUi(light: boolean) {
  return {
    title: light ? "text-slate-900" : "text-white",
    subtitle: light ? "text-slate-600" : "text-slate-400",
    subtitleStrong: light ? "text-slate-700" : "text-slate-300",
    panel:
      light
        ? "rounded-xl border border-slate-200 bg-white shadow-sm"
        : "rounded-xl border border-slate-800 bg-slate-900/80",
    panelTitle: light ? "text-sm font-semibold text-slate-900" : "text-sm font-semibold text-white",
    listBtn:
      light
        ? "w-full flex justify-between items-center px-3 py-2 rounded-lg bg-slate-50 hover:bg-slate-100 border border-slate-200 text-xs text-left transition-colors"
        : "w-full flex justify-between items-center px-3 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs text-left",
    listBtnTitle: light ? "text-slate-900 font-medium" : "text-white font-medium",
    listBtnMeta: light ? "text-slate-500" : "text-slate-400",
    templateBtn:
      light
        ? "w-full text-left px-3 py-2 rounded-lg bg-slate-100 hover:bg-slate-200 border border-slate-200 text-xs text-slate-800 transition-colors"
        : "w-full text-left px-3 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs text-white",
    dashedBtn:
      light
        ? "flex items-center gap-2 px-3 py-2 rounded-lg border border-dashed border-slate-300 text-xs text-slate-600 hover:bg-slate-50"
        : "flex items-center gap-2 px-3 py-2 rounded-lg border border-dashed border-slate-600 text-xs text-slate-300",
    input:
      light
        ? "w-full bg-white border border-slate-200 rounded-lg px-2 py-1.5 text-xs text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-sky-500/30 focus:border-sky-400"
        : "w-full bg-slate-800 rounded-lg px-2 py-1.5 text-xs text-white",
    field:
      light
        ? "w-full bg-white border border-slate-200 rounded p-1.5 text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-sky-500/30 focus:border-sky-400"
        : "w-full bg-slate-800 rounded p-1.5 text-xs text-white",
    sidebarBtn:
      light
        ? "w-full text-xs px-2 py-1.5 rounded bg-slate-100 hover:bg-slate-200 border border-slate-200 text-slate-800 transition-colors"
        : "w-full text-xs px-2 py-1.5 rounded bg-slate-800 text-white",
    sidebarBtnDisabled:
      light
        ? "w-full text-xs px-2 py-1.5 rounded bg-slate-50 text-slate-400 border border-slate-200"
        : "w-full text-xs px-2 py-1.5 rounded bg-slate-900 text-slate-500 border border-slate-700",
    label: light ? "text-[10px] text-slate-500 uppercase font-semibold" : "text-[10px] text-slate-500 uppercase font-semibold",
    fieldLabel: light ? "text-[10px] text-slate-500" : "text-[10px] text-slate-400",
    hint: light ? "text-[10px] text-slate-500" : "text-[10px] text-slate-500",
    hintCode: light ? "text-slate-700" : "text-slate-500",
    supervisorHint: light ? "text-[10px] text-sky-800" : "text-[10px] text-cyan-200/80",
    supervisorCode: light ? "text-sky-700" : "text-cyan-300",
    canvas:
      light
        ? "flex-1 min-h-[480px] rounded-xl border border-slate-200 overflow-hidden bg-slate-50 shadow-inner [&_.react-flow__controls-button]:bg-white [&_.react-flow__controls-button]:border-slate-200 [&_.react-flow__controls-button]:fill-slate-600 [&_.react-flow__controls-button:hover]:bg-slate-100"
        : "flex-1 min-h-[480px] rounded-xl border border-slate-800 overflow-hidden bg-slate-950",
    error:
      light
        ? "text-xs text-amber-900 bg-amber-50 border border-amber-200 rounded-lg p-3"
        : "text-xs text-amber-200 bg-amber-500/10 border border-amber-500/30 rounded-lg p-3",
    themeToggle:
      light
        ? "inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 shadow-sm transition-colors"
        : "inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border border-slate-600 bg-slate-800 text-slate-200 hover:bg-slate-700 transition-colors",
    runMeta: light ? "text-[10px] text-slate-600 max-h-48 overflow-y-auto space-y-1" : "text-[10px] text-slate-300 max-h-48 overflow-y-auto space-y-1",
    runOk: light ? "text-emerald-700" : "text-emerald-300",
    runStepBorder: light ? "border-t border-slate-200 pt-1" : "border-t border-slate-700 pt-1",
    bgDot: light ? "#cbd5e1" : undefined,
  };
}

const WfNode: React.FC<{ data: FlowData }> = ({ data }) => {
  const { theme } = usePlatform();
  const light = theme === "light";
  const showTarget = data.wfType !== "start";
  const showSource = data.wfType !== "end";
  const icon =
    data.wfType === "start" ? (
      <Circle className="h-3 w-3 text-emerald-400" />
    ) : data.wfType === "end" ? (
      <Square className="h-3 w-3 text-rose-400" />
    ) : data.wfType === "condition" ? (
      <Diamond className="h-3 w-3 text-amber-400" />
    ) : data.wfType === "human" ? (
      <UserCircle className="h-3 w-3 text-violet-400" />
    ) : data.role === "supervisor" ? (
      <GitBranch className="h-3 w-3 text-cyan-300" />
    ) : (
      <Bot className="h-3 w-3 text-sky-400" />
    );
  return (
    <div
      className={
        light
          ? "rounded-lg border border-slate-300 bg-white px-3 py-2 min-w-[120px] shadow-md"
          : "rounded-lg border border-slate-600 bg-slate-900 px-3 py-2 min-w-[120px] shadow-lg"
      }
    >
      {showTarget && (
        <Handle
          type="target"
          position={Position.Top}
          className="!h-2.5 !w-2.5 !border-2 !border-slate-500 !bg-white"
        />
      )}
      {showSource && (
        <Handle
          type="source"
          position={Position.Bottom}
          className="!h-2.5 !w-2.5 !border-2 !border-slate-500 !bg-white"
        />
      )}
      <div
        className={`flex items-center gap-2 text-xs font-semibold ${light ? "text-slate-800" : "text-white"}`}
      >
        {icon}
        <span className="truncate max-w-[140px]">{displayLabel(data)}</span>
      </div>
      {data.role && data.wfType === "agent" && (
        <div
          className={`mt-0.5 text-[9px] uppercase tracking-wide ${light ? "text-slate-500" : "text-slate-500"}`}
        >
          {data.role}
        </div>
      )}
      {data.agentId && !data.agentName && (
        <div
          className={`mt-1 truncate text-[10px] ${light ? "text-slate-500" : "text-slate-400"}`}
        >
          {data.agentId}
        </div>
      )}
      {data.wfType === "human" && (
        <div className={`mt-1 text-[9px] ${light ? "text-violet-600" : "text-violet-300"}`}>
          Preview only
        </div>
      )}
    </div>
  );
};

const nodeTypes = { wfNode: WfNode };

type WorkflowFlowCanvasProps = {
  nodes: Node[];
  edges: Edge[];
  onNodesChange: ReturnType<typeof useNodesState>[2];
  onEdgesChange: ReturnType<typeof useEdgesState>[2];
  onConnect: (c: Connection) => void;
  onNodeClick: (id: string) => void;
  onEdgeClick: (id: string) => void;
  onPlaceNode: (payload: WfDragPayload, position: { x: number; y: number }) => void;
  bgDot?: string;
  light: boolean;
};

const WorkflowFlowCanvas: React.FC<WorkflowFlowCanvasProps> = ({
  nodes,
  edges,
  onNodesChange,
  onEdgesChange,
  onConnect,
  onNodeClick,
  onEdgeClick,
  onPlaceNode,
  bgDot,
  light,
}) => {
  const { screenToFlowPosition } = useReactFlow();

  const onDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
  }, []);

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      const raw = e.dataTransfer.getData(WF_DND);
      if (!raw) return;
      try {
        const payload = JSON.parse(raw) as WfDragPayload;
        const position = screenToFlowPosition({
          x: e.clientX,
          y: e.clientY,
        });
        onPlaceNode(payload, position);
      } catch {
        /* ignore bad payload */
      }
    },
    [onPlaceNode, screenToFlowPosition],
  );

  return (
    <ReactFlow
      nodes={nodes}
      edges={edges}
      onNodesChange={onNodesChange}
      onEdgesChange={onEdgesChange}
      onConnect={onConnect}
      onDrop={onDrop}
      onDragOver={onDragOver}
      onNodeClick={(_, n) => onNodeClick(n.id)}
      onEdgeClick={(_, edge) => onEdgeClick(edge.id)}
      nodeTypes={nodeTypes}
      nodesDraggable
      nodesConnectable
      elementsSelectable
      fitView
      deleteKeyCode={["Backspace", "Delete"]}
      className="h-full w-full"
    >
      <Background color={bgDot} gap={20} size={1} />
      <Controls />
      <MiniMap
        className={light ? "!bg-white !border-slate-200" : undefined}
        maskColor={light ? "rgb(148 163 184 / 0.15)" : undefined}
      />
    </ReactFlow>
  );
};

function validateDefinition(def: WorkflowDefinition): string[] {
  const errors: string[] = [];
  const starts = def.nodes.filter((n) => n.type === "start");
  const ends = def.nodes.filter((n) => n.type === "end");
  if (starts.length !== 1) errors.push("Exactly one Start node is required.");
  if (ends.length < 1) errors.push("At least one End node is required.");
  for (const n of def.nodes) {
    if (n.type === "agent" && !n.agentId) {
      errors.push(`Agent node "${n.id}" needs a published agent selected.`);
    }
    if (n.type === "workflow" && !n.workflowId) {
      errors.push(`Sub-workflow "${n.id}" needs a workflow id.`);
    }
    if (n.type === "condition" && !n.on?.trim()) {
      errors.push(`Route node "${n.id}" needs a state key (on).`);
    }
  }
  return errors;
}

export const WorkflowStudioView: React.FC = () => {
  const { agents, theme, setTheme, hasPermission } = usePlatform();
  const canCreateAgent = hasPermission(PERMISSIONS.Agent.Create);
  const light = theme === "light";
  const ui = workflowUi(light);
  const publishedAgents = useMemo(
    () =>
      agents.filter((a) => String(a.status).toLowerCase() === "published"),
    [agents],
  );

  const [workflows, setWorkflows] = useState<WorkflowDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [doc, setDoc] = useState<WorkflowDocument | null>(null);
  const [name, setName] = useState("New workflow");
  const [maxSteps, setMaxSteps] = useState(30);
  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedEdgeId, setSelectedEdgeId] = useState<string | null>(null);
  const [testInput, setTestInput] = useState("Show top 10 rows from sales");
  const [resumeNote, setResumeNote] = useState("approved");
  const [runResult, setRunResult] = useState<WorkflowRunResponse | null>(null);
  const [busy, setBusy] = useState(false);

  const selectedNode = nodes.find((n) => n.id === selectedId);
  const selectedData = selectedNode?.data as FlowData | undefined;
  const selectedEdge = edges.find((e) => e.id === selectedEdgeId);

  const refreshList = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const list = await workflowsApi.list();
      setWorkflows(
        list.map((s) => ({
          ...s,
          definition: { nodes: [], edges: [] },
          createdAt: "",
        })),
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load workflows.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refreshList();
  }, [refreshList]);

  const openNew = (template: WorkflowDefinition, title: string) => {
    const flow = definitionToFlow(template);
    setDoc(null);
    setName(title);
    setMaxSteps(template.maxSteps ?? 30);
    setNodes(flow.nodes);
    setEdges(flow.edges);
    setRunResult(null);
    setSelectedId(null);
  };

  const openWorkflow = async (id: string) => {
    setBusy(true);
    setError("");
    try {
      const full = await workflowsApi.get(id);
      setDoc(full);
      setName(full.name);
      setMaxSteps(full.definition.maxSteps ?? 30);
      const flow = definitionToFlow(full.definition);
      setNodes(flow.nodes);
      setEdges(flow.edges);
      setRunResult(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to open workflow.");
    } finally {
      setBusy(false);
    }
  };

  const onConnect = useCallback(
    (c: Connection) => setEdges((eds) => addEdge({ ...c, markerEnd: { type: MarkerType.ArrowClosed } }, eds)),
    [setEdges],
  );

  const placeNode = useCallback(
    (payload: WfDragPayload, position: { x: number; y: number }) => {
      const id = `node_${Math.random().toString(36).slice(2, 10)}`;
      let data: FlowData;
      if (payload.kind === "agent") {
        data = buildFlowData("agent", "specialist", {
          id: payload.agentId,
          name: payload.name,
        });
      } else {
        data = buildFlowData(payload.wfType, payload.role);
      }
      setNodes((nds) => [
        ...nds,
        { id, type: "wfNode", position, data },
      ]);
      setSelectedId(id);
      setSelectedEdgeId(null);
    },
    [setNodes],
  );

  const addNode = (wfType: WorkflowNode["type"], role?: WorkflowNode["role"]) => {
    placeNode({ kind: "palette", wfType, role }, {
      x: 120 + nodes.length * 40,
      y: 120 + nodes.length * 20,
    });
  };

  const updateSelected = (patch: Partial<FlowData>) => {
    if (!selectedId) return;
    setNodes((nds) =>
      nds.map((n) =>
        n.id === selectedId
          ? {
              ...n,
              data: {
                ...(n.data as FlowData),
                ...patch,
                label: patch.role
                  ? nodeLabel({
                      id: n.id,
                      type: (n.data as FlowData).wfType,
                      role: patch.role,
                    })
                  : (n.data as FlowData).label,
              },
            }
          : n,
      ),
    );
  };

  const save = async () => {
    const def = flowToDefinition(nodes, edges, maxSteps);
    const validation = validateDefinition(def);
    if (validation.length) {
      setError(validation.join(" "));
      return;
    }
    setBusy(true);
    setError("");
    try {
      const payload = { name: name.trim() || "Untitled workflow", definition: def };
      const saved = doc
        ? await workflowsApi.update(doc.workflowId, payload)
        : await workflowsApi.create(payload);
      setDoc(saved);
      await refreshList();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Save failed.");
    } finally {
      setBusy(false);
    }
  };

  const publish = async () => {
    if (!doc) {
      setError("Save the workflow before publishing.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const published = await workflowsApi.publish(doc.workflowId);
      setDoc(published);
      await refreshList();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Publish failed.");
    } finally {
      setBusy(false);
    }
  };

  const runTest = async () => {
    if (!doc) {
      setError("Save the workflow first.");
      return;
    }
    if (doc.status !== "Published") {
      setError("Publish the workflow before running a test.");
      return;
    }
    setBusy(true);
    setError("");
    setRunResult(null);
    try {
      const result = await workflowsApi.run(doc.workflowId, { input: testInput });
      setRunResult(result);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Test run failed.");
    } finally {
      setBusy(false);
    }
  };

  const resumeRun = async () => {
    if (!doc || !runResult?.workflowRunId) return;
    setBusy(true);
    setError("");
    try {
      const result = await workflowsApi.resume(
        doc.workflowId,
        runResult.workflowRunId,
        resumeNote,
      );
      setRunResult(result);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Resume failed.");
    } finally {
      setBusy(false);
    }
  };

  const inBuilder = nodes.length > 0;

  const toggleTheme = () => {
    setTheme(light ? "dark" : "light");
  };

  return (
    <div
      className={`p-6 space-y-4 max-w-[1600px] mx-auto ${light ? "text-slate-800" : ""}`}
    >
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
        <div>
          <h1 className={`text-2xl font-bold tracking-tight ${ui.title}`}>
            Agent workflows
          </h1>
          <p className={`text-xs mt-1 max-w-3xl ${ui.subtitle}`}>
            Design multi-agent flows using{" "}
            <strong className={ui.subtitleStrong}>published</strong> agents from
            Agent Studio. The supervisor is a normal agent (routing prompt only);
            specialists hold KB/tools. Wire them on the canvas — not as tools on
            the supervisor record.
          </p>
        </div>
        <button
          type="button"
          onClick={toggleTheme}
          className={ui.themeToggle}
          title={light ? "Switch to dark mode" : "Switch to light mode"}
          aria-pressed={light}
        >
          {light ? (
            <>
              <Moon className="h-3.5 w-3.5" aria-hidden />
              Dark
            </>
          ) : (
            <>
              <Sun className="h-3.5 w-3.5" aria-hidden />
              Light
            </>
          )}
        </button>
      </div>

      {error && <div className={ui.error}>{error}</div>}

      {!inBuilder ? (
        <div className="grid md:grid-cols-2 gap-4">
          <div className={`${ui.panel} p-4 space-y-3`}>
            <h2 className={ui.panelTitle}>New workflow</h2>
            <button
              type="button"
              className={ui.templateBtn}
              onClick={() => openNew(supervisorSqlTemplate(), "SQL supervisor workflow")}
            >
              Supervisor pattern (SQL: route → generator → executor)
            </button>
            <button
              type="button"
              className={ui.templateBtn}
              onClick={() => openNew(supervisorHubTemplate(), "Supervisor hub")}
            >
              Supervisor hub (workers return to supervisor)
            </button>
            <button
              type="button"
              className={ui.templateBtn}
              onClick={() => openNew(parallelFanInTemplate(), "Parallel fan-in")}
            >
              Parallel fan-out then join
            </button>
            <button
              type="button"
              className={ui.templateBtn}
              onClick={() => openNew(linearPipelineTemplate(), "Linear pipeline")}
            >
              Linear pipeline (A → B)
            </button>
            <button
              type="button"
              className={ui.dashedBtn}
              onClick={() =>
                openNew(
                  { nodes: [{ id: "start", type: "start", position: { x: 0, y: 0 } }, { id: "end", type: "end", position: { x: 300, y: 0 } }], edges: [{ from: "start", to: "end" }] },
                  "Empty workflow",
                )
              }
            >
              <Plus className="h-3 w-3" /> Blank canvas
            </button>
          </div>
          <div className={`${ui.panel} p-4`}>
            <h2 className={`${ui.panelTitle} mb-3`}>Saved workflows</h2>
            {loading ? (
              <p className={`text-xs ${ui.subtitle}`}>Loading…</p>
            ) : workflows.length === 0 ? (
              <p className={`text-xs ${ui.subtitle}`}>No workflows yet.</p>
            ) : (
              <ul className="space-y-2 max-h-64 overflow-y-auto">
                {workflows.map((w) => (
                  <li key={w.workflowId}>
                    <button
                      type="button"
                      className={ui.listBtn}
                      onClick={() => void openWorkflow(w.workflowId)}
                    >
                      <span className={ui.listBtnTitle}>{w.name}</span>
                      <span className={ui.listBtnMeta}>{w.status}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      ) : (
        <div className="flex flex-col lg:flex-row gap-4 min-h-[640px]">
          <div className="w-full lg:w-48 shrink-0 space-y-2">
            <input
              className={ui.input}
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Workflow name"
            />
            <p className={ui.label}>Drag onto canvas</p>
            <p className={`text-[9px] ${ui.subtitle} -mt-1 mb-1`}>
              Drag items below, or click to place. Drag nodes on the canvas to
              reposition. Connect with the dots on each node.
            </p>
            <div
              draggable
              onDragStart={(e) =>
                startDrag(e, {
                  kind: "palette",
                  wfType: "agent",
                  role: "supervisor",
                })
              }
              onClick={() => addNode("agent", "supervisor")}
              className={`${ui.sidebarBtn} cursor-grab active:cursor-grabbing`}
            >
              Supervisor agent
            </div>
            <div
              draggable
              onDragStart={(e) =>
                startDrag(e, {
                  kind: "palette",
                  wfType: "agent",
                  role: "specialist",
                })
              }
              onClick={() => addNode("agent", "specialist")}
              className={`${ui.sidebarBtn} cursor-grab active:cursor-grabbing`}
            >
              Specialist agent
            </div>
            <div
              draggable
              onDragStart={(e) =>
                startDrag(e, { kind: "palette", wfType: "condition" })
              }
              onClick={() => addNode("condition")}
              className={`${ui.sidebarBtn} cursor-grab active:cursor-grabbing`}
            >
              Route / condition
            </div>
            <div
              draggable
              onDragStart={(e) =>
                startDrag(e, { kind: "palette", wfType: "end" })
              }
              onClick={() => addNode("end")}
              className={`${ui.sidebarBtn} cursor-grab active:cursor-grabbing`}
            >
              End
            </div>
            {publishedAgents.length > 0 && (
              <>
                <p className={`${ui.label} pt-2`}>Published agents</p>
                <ul className="space-y-1 max-h-44 overflow-y-auto">
                  {publishedAgents.map((a) => (
                    <li key={a.id}>
                      <div
                        draggable
                        onDragStart={(e) =>
                          startDrag(e, {
                            kind: "agent",
                            agentId: a.id,
                            name: a.name,
                          })
                        }
                        onClick={() =>
                          placeNode(
                            { kind: "agent", agentId: a.id, name: a.name },
                            {
                              x: 160 + nodes.length * 36,
                              y: 200 + nodes.length * 24,
                            },
                          )
                        }
                        className={`${ui.sidebarBtn} cursor-grab active:cursor-grabbing flex items-center gap-1.5`}
                        title="Drop on canvas as specialist step"
                      >
                        <Bot className="h-3 w-3 shrink-0 opacity-70" />
                        <span className="truncate">{a.name}</span>
                      </div>
                    </li>
                  ))}
                </ul>
              </>
            )}
            <div
              draggable
              onDragStart={(e) =>
                startDrag(e, { kind: "palette", wfType: "parallel" })
              }
              onClick={() => addNode("parallel")}
              className={`${ui.sidebarBtn} cursor-grab active:cursor-grabbing`}
            >
              Parallel
            </div>
            <div
              draggable
              onDragStart={(e) => startDrag(e, { kind: "palette", wfType: "join" })}
              onClick={() => addNode("join")}
              className={`${ui.sidebarBtn} cursor-grab active:cursor-grabbing`}
            >
              Join
            </div>
            <div
              draggable
              onDragStart={(e) =>
                startDrag(e, { kind: "palette", wfType: "human" })
              }
              onClick={() => addNode("human")}
              className={`${ui.sidebarBtn} cursor-grab active:cursor-grabbing`}
            >
              Human approval
            </div>
            <div
              draggable
              onDragStart={(e) =>
                startDrag(e, { kind: "palette", wfType: "workflow" })
              }
              onClick={() => addNode("workflow")}
              className={`${ui.sidebarBtn} cursor-grab active:cursor-grabbing`}
            >
              Sub-workflow
            </div>
            <div className="pt-2 flex flex-col gap-2">
              <button type="button" disabled={busy} onClick={() => void save()} className="flex items-center justify-center gap-1 text-xs py-2 rounded bg-cyan-600 text-white font-semibold">
                <Save className="h-3 w-3" /> Save
              </button>
              <button type="button" disabled={busy || !doc} onClick={() => void publish()} className="flex items-center justify-center gap-1 text-xs py-2 rounded bg-emerald-700 text-white">
                <Upload className="h-3 w-3" /> Publish
              </button>
              {doc && (
                <span className={`text-[10px] text-center ${ui.subtitle}`}>
                  Status: {doc.status}
                </span>
              )}
            </div>
          </div>

          <div className={ui.canvas}>
            <ReactFlowProvider>
              <WorkflowFlowCanvas
                nodes={nodes}
                edges={edges}
                onNodesChange={onNodesChange}
                onEdgesChange={onEdgesChange}
                onConnect={onConnect}
                onNodeClick={(id) => {
                  setSelectedId(id);
                  setSelectedEdgeId(null);
                }}
                onEdgeClick={(id) => {
                  setSelectedEdgeId(id);
                  setSelectedId(null);
                }}
                onPlaceNode={placeNode}
                bgDot={ui.bgDot}
                light={light}
              />
            </ReactFlowProvider>
          </div>

          <div className="w-full lg:w-[min(420px,38vw)] shrink-0 space-y-3 max-h-[calc(100vh-10rem)] overflow-y-auto">
            <div className={`${ui.panel} p-3 space-y-2`}>
              <h3 className={`text-xs font-semibold ${ui.title}`}>
                {selectedData?.wfType === "agent" ? "Workflow step" : "Properties"}
              </h3>
              {selectedEdge ? (
                <>
                  <p className={ui.fieldLabel}>
                    Edge {selectedEdge.source} → {selectedEdge.target}
                  </p>
                  <label className={ui.fieldLabel}>when (route label)</label>
                  <input
                    className={ui.field}
                    value={String((selectedEdge.data as { when?: string })?.when ?? selectedEdge.label ?? "")}
                    onChange={(e) => {
                      const v = e.target.value;
                      setEdges((eds) =>
                        eds.map((edge) =>
                          edge.id === selectedEdgeId
                            ? { ...edge, label: v, data: { ...((edge.data as object) || {}), when: v } }
                            : edge,
                        ),
                      );
                    }}
                    placeholder="generate / otherwise"
                  />
                </>
              ) : !selectedData ? (
                <p className={`text-[11px] ${ui.hint}`}>
                  Select a node or edge on the canvas.
                </p>
              ) : selectedData.wfType === "agent" ? (
                <>
                  <p className={ui.fieldLabel}>
                    Node role:{" "}
                    <span className={ui.subtitleStrong}>
                      {selectedData.role === "supervisor" ? "Supervisor" : "Specialist"}
                    </span>
                  </p>
                  <label className={ui.fieldLabel}>Input template</label>
                  <textarea
                    className={`${ui.field} h-20`}
                    value={selectedData.input || ""}
                    onChange={(e) => updateSelected({ input: e.target.value })}
                  />
                  <label className={ui.fieldLabel}>Output state key</label>
                  <input
                    className={ui.field}
                    value={selectedData.output || ""}
                    onChange={(e) => updateSelected({ output: e.target.value })}
                  />
                  {selectedData.role === "supervisor" && (
                    <p className={ui.supervisorHint}>
                      With several outgoing lines, this agent is the orchestrator.
                      Return JSON{" "}
                      <code className={ui.supervisorCode}>
                        {`{"next":"worker-id"}`}
                      </code>{" "}
                      or <code className={ui.supervisorCode}>ROUTE: worker-id</code>.
                      Edge <code className={ui.supervisorCode}>when</code> must match
                      that value. One outgoing line stays a plain pipeline step.
                    </p>
                  )}
                </>
              ) : selectedData.wfType === "human" ? (
                <>
                  <label className={ui.fieldLabel}>Prompt shown at pause</label>
                  <textarea
                    className={`${ui.field} h-20`}
                    value={selectedData.input || ""}
                    onChange={(e) => updateSelected({ input: e.target.value })}
                  />
                  <label className={ui.fieldLabel}>State key for the reply</label>
                  <input
                    className={ui.field}
                    value={selectedData.output || ""}
                    onChange={(e) => updateSelected({ output: e.target.value })}
                  />
                  <p className={ui.hint}>
                    The run pauses here. Resume writes the reply into this key and
                    follows the single outgoing line.
                  </p>
                </>
              ) : selectedData.wfType === "workflow" ? (
                <>
                  <label className={ui.fieldLabel}>Published workflow id</label>
                  <input
                    className={ui.field}
                    value={selectedData.workflowId || ""}
                    onChange={(e) => updateSelected({ workflowId: e.target.value })}
                    placeholder="workflow uuid"
                  />
                  <label className={ui.fieldLabel}>Input template</label>
                  <textarea
                    className={`${ui.field} h-16`}
                    value={selectedData.input || ""}
                    onChange={(e) => updateSelected({ input: e.target.value })}
                  />
                  <label className={ui.fieldLabel}>Output state key</label>
                  <input
                    className={ui.field}
                    value={selectedData.output || ""}
                    onChange={(e) => updateSelected({ output: e.target.value })}
                  />
                </>
              ) : selectedData.wfType === "parallel" ? (
                <p className={ui.hint}>
                  Draw one line to each agent branch and one line to a Join node.
                  Those agents run together, then the join continues.
                </p>
              ) : selectedData.wfType === "join" ? (
                <p className={ui.hint}>
                  Merge point after parallel. One outgoing line to the next step.
                </p>
              ) : selectedData.wfType === "condition" ? (
                <>
                  <label className={ui.fieldLabel}>Read state key (on)</label>
                  <input
                    className={ui.field}
                    value={selectedData.on || ""}
                    onChange={(e) => updateSelected({ on: e.target.value })}
                  />
                  <p className={ui.hint}>
                    Edge labels are matched as <code className={ui.hintCode}>when</code> (e.g.
                    generate, otherwise).
                  </p>
                </>
              ) : (
                <p className={`text-[11px] ${ui.hint}`}>No properties for this node type.</p>
              )}
            </div>

            {selectedData?.wfType === "agent" && (
              <WorkflowAgentEditorPanel
                key={selectedId ?? "agent-panel"}
                agentId={selectedData.agentId || null}
                publishedAgents={publishedAgents}
                allAgents={agents.map((a) => ({ id: a.id, name: a.name }))}
                canCreate={canCreateAgent}
                onAgentLinked={(id, agent) =>
                  updateSelected({
                    agentId: id,
                    agentName: agent?.name,
                    label: agent?.name ?? selectedData?.label,
                  })
                }
              />
            )}

            <div className={`${ui.panel} p-3 space-y-2`}>
              <h3 className={`text-xs font-semibold flex items-center gap-1 ${ui.title}`}>
                <Play className="h-3 w-3" /> Test run
              </h3>
              <textarea
                className={`${ui.field} h-16 p-2`}
                value={testInput}
                onChange={(e) => setTestInput(e.target.value)}
              />
              <label className={ui.fieldLabel}>maxSteps</label>
              <input
                type="number"
                className={ui.field}
                value={maxSteps}
                onChange={(e) => setMaxSteps(Number(e.target.value) || 30)}
              />
              <button
                type="button"
                disabled={busy}
                onClick={() => void runTest()}
                className="w-full py-2 rounded bg-indigo-600 hover:bg-indigo-500 text-xs text-white font-semibold transition-colors disabled:opacity-50"
              >
                Run published workflow
              </button>
              {runResult && (
                <div className={ui.runMeta}>
                  <div className={ui.runOk}>Status: {runResult.status}</div>
                  {runResult.error && <div>{runResult.error}</div>}
                  <div className="whitespace-pre-wrap">{runResult.output}</div>
                  {runResult.steps.map((s, i) => (
                    <div key={i} className={ui.runStepBorder}>
                      {s.nodeId} ({s.type}) — {s.status}
                    </div>
                  ))}
                </div>
              )}
              {runResult?.status === "PAUSED" && (
                <div className="space-y-2">
                  <label className={ui.fieldLabel}>Resume reply</label>
                  <textarea
                    className={`${ui.field} h-16`}
                    value={resumeNote}
                    onChange={(e) => setResumeNote(e.target.value)}
                  />
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void resumeRun()}
                    className="w-full py-2 rounded bg-amber-600 text-xs text-white font-semibold"
                  >
                    Resume paused run
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
