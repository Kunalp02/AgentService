import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  addEdge,
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
} from "lucide-react";
import { usePlatform } from "../../context/PlatformContext";
import { workflowsApi } from "../../api/workflows";
import type {
  WorkflowDefinition,
  WorkflowDocument,
  WorkflowNode,
  WorkflowRunResponse,
} from "../../types/workflow";
import {
  linearPipelineTemplate,
  supervisorSqlTemplate,
} from "./workflowTemplates";

type FlowData = {
  wfType: WorkflowNode["type"];
  label: string;
  agentId?: string;
  input?: string;
  output?: string;
  on?: string;
  role?: WorkflowNode["role"];
};

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
  if (n.role === "supervisor") return "Supervisor";
  if (n.type === "agent") return "Agent";
  return n.type;
}

const WfNode: React.FC<{ data: FlowData }> = ({ data }) => {
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
    <div className="rounded-lg border border-slate-600 bg-slate-900 px-3 py-2 min-w-[120px] shadow-lg">
      <div className="flex items-center gap-2 text-xs font-semibold text-white">
        {icon}
        <span>{data.label}</span>
      </div>
      {data.agentId && (
        <div className="mt-1 truncate text-[10px] text-slate-400">{data.agentId}</div>
      )}
      {data.wfType === "human" && (
        <div className="mt-1 text-[9px] text-violet-300">Preview only</div>
      )}
    </div>
  );
};

const nodeTypes = { wfNode: WfNode };

function validateDefinition(def: WorkflowDefinition): string[] {
  const errors: string[] = [];
  const starts = def.nodes.filter((n) => n.type === "start");
  const ends = def.nodes.filter((n) => n.type === "end");
  if (starts.length !== 1) errors.push("Exactly one Start node is required.");
  if (ends.length < 1) errors.push("At least one End node is required.");
  if (def.nodes.some((n) => n.type === "human")) {
    errors.push("Human-in-the-loop nodes are not saved yet (coming soon).");
  }
  for (const n of def.nodes) {
    if (n.type === "agent" && !n.agentId) {
      errors.push(`Agent node "${n.id}" needs a published agent selected.`);
    }
    if (n.type === "condition" && !n.on?.trim()) {
      errors.push(`Route node "${n.id}" needs a state key (on).`);
    }
  }
  return errors;
}

export const WorkflowStudioView: React.FC = () => {
  const { agents } = usePlatform();
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

  const addNode = (wfType: WorkflowNode["type"], role?: WorkflowNode["role"]) => {
    const id = `${wfType}_${Math.random().toString(36).slice(2, 8)}`;
    const data: FlowData = {
      wfType,
      label: nodeLabel({ id, type: wfType, role }),
      role,
      input: wfType === "agent" ? "{{input}}" : undefined,
      output: wfType === "agent" ? "output" : undefined,
      on: wfType === "condition" ? "supervisor_out" : undefined,
    };
    setNodes((nds) => [
      ...nds,
      {
        id,
        type: "wfNode",
        position: { x: 120 + nds.length * 40, y: 120 + nds.length * 20 },
        data,
      },
    ]);
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

  const inBuilder = nodes.length > 0;

  return (
    <div className="p-6 space-y-4 max-w-[1600px] mx-auto">
      <div>
        <h1 className="text-2xl font-bold text-white">Agent workflows</h1>
        <p className="text-xs text-slate-400 mt-1 max-w-3xl">
          Design multi-agent flows using <strong className="text-slate-300">published</strong> agents
          from Agent Studio. The supervisor is a normal agent (routing prompt only); specialists
          hold KB/tools. Wire them on the canvas — not as tools on the supervisor record.
        </p>
      </div>

      {error && (
        <div className="text-xs text-amber-200 bg-amber-500/10 border border-amber-500/30 rounded-lg p-3">
          {error}
        </div>
      )}

      {!inBuilder ? (
        <div className="grid md:grid-cols-2 gap-4">
          <div className="rounded-xl border border-slate-800 bg-slate-900/80 p-4 space-y-3">
            <h2 className="text-sm font-semibold text-white">New workflow</h2>
            <button
              type="button"
              className="w-full text-left px-3 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs text-white"
              onClick={() => openNew(supervisorSqlTemplate(), "SQL supervisor workflow")}
            >
              Supervisor pattern (SQL: route → generator → executor)
            </button>
            <button
              type="button"
              className="w-full text-left px-3 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs text-white"
              onClick={() => openNew(linearPipelineTemplate(), "Linear pipeline")}
            >
              Linear pipeline (A → B)
            </button>
            <button
              type="button"
              className="flex items-center gap-2 px-3 py-2 rounded-lg border border-dashed border-slate-600 text-xs text-slate-300"
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
          <div className="rounded-xl border border-slate-800 bg-slate-900/80 p-4">
            <h2 className="text-sm font-semibold text-white mb-3">Saved workflows</h2>
            {loading ? (
              <p className="text-xs text-slate-500">Loading…</p>
            ) : workflows.length === 0 ? (
              <p className="text-xs text-slate-500">No workflows yet.</p>
            ) : (
              <ul className="space-y-2 max-h-64 overflow-y-auto">
                {workflows.map((w) => (
                  <li key={w.workflowId}>
                    <button
                      type="button"
                      className="w-full flex justify-between items-center px-3 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs text-left"
                      onClick={() => void openWorkflow(w.workflowId)}
                    >
                      <span className="text-white font-medium">{w.name}</span>
                      <span className="text-slate-400">{w.status}</span>
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
              className="w-full bg-slate-800 rounded-lg px-2 py-1.5 text-xs text-white"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Workflow name"
            />
            <p className="text-[10px] text-slate-500 uppercase font-semibold">Add node</p>
            <button type="button" className="w-full text-xs px-2 py-1.5 rounded bg-slate-800 text-white" onClick={() => addNode("agent", "supervisor")}>
              Supervisor agent
            </button>
            <button type="button" className="w-full text-xs px-2 py-1.5 rounded bg-slate-800 text-white" onClick={() => addNode("agent", "specialist")}>
              Specialist agent
            </button>
            <button type="button" className="w-full text-xs px-2 py-1.5 rounded bg-slate-800 text-white" onClick={() => addNode("condition")}>
              Route / condition
            </button>
            <button type="button" className="w-full text-xs px-2 py-1.5 rounded bg-slate-800 text-white" onClick={() => addNode("end")}>
              End
            </button>
            <button
              type="button"
              disabled
              title="Human-in-the-loop: runtime will pause for approval in a future release"
              className="w-full text-xs px-2 py-1.5 rounded bg-slate-900 text-slate-500 border border-slate-700"
              onClick={() => addNode("human")}
            >
              Human approval (soon)
            </button>
            <div className="pt-2 flex flex-col gap-2">
              <button type="button" disabled={busy} onClick={() => void save()} className="flex items-center justify-center gap-1 text-xs py-2 rounded bg-cyan-600 text-white font-semibold">
                <Save className="h-3 w-3" /> Save
              </button>
              <button type="button" disabled={busy || !doc} onClick={() => void publish()} className="flex items-center justify-center gap-1 text-xs py-2 rounded bg-emerald-700 text-white">
                <Upload className="h-3 w-3" /> Publish
              </button>
              {doc && <span className="text-[10px] text-slate-500 text-center">Status: {doc.status}</span>}
            </div>
          </div>

          <div className="flex-1 min-h-[480px] rounded-xl border border-slate-800 overflow-hidden bg-slate-950">
            <ReactFlow
              nodes={nodes}
              edges={edges}
              onNodesChange={onNodesChange}
              onEdgesChange={onEdgesChange}
              onConnect={onConnect}
              onNodeClick={(_, n) => {
                setSelectedId(n.id);
                setSelectedEdgeId(null);
              }}
              onEdgeClick={(_, e) => {
                setSelectedEdgeId(e.id);
                setSelectedId(null);
              }}
              nodeTypes={nodeTypes}
              fitView
            >
              <Background />
              <Controls />
              <MiniMap />
            </ReactFlow>
          </div>

          <div className="w-full lg:w-72 shrink-0 space-y-3">
            <div className="rounded-xl border border-slate-800 bg-slate-900/80 p-3 space-y-2">
              <h3 className="text-xs font-semibold text-white">Properties</h3>
              {selectedEdge ? (
                <>
                  <p className="text-[10px] text-slate-400">Edge {selectedEdge.source} → {selectedEdge.target}</p>
                  <label className="text-[10px] text-slate-400">when (route label)</label>
                  <input
                    className="w-full bg-slate-800 rounded p-1.5 text-xs text-white"
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
                <p className="text-[11px] text-slate-500">Select a node or edge on the canvas.</p>
              ) : selectedData.wfType === "agent" ? (
                <>
                  <label className="text-[10px] text-slate-400">Published agent</label>
                  <select
                    className="w-full bg-slate-800 rounded p-1.5 text-xs text-white"
                    value={selectedData.agentId || ""}
                    onChange={(e) => updateSelected({ agentId: e.target.value })}
                  >
                    <option value="">Select agent…</option>
                    {publishedAgents.map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.name}
                      </option>
                    ))}
                  </select>
                  <label className="text-[10px] text-slate-400">Input template</label>
                  <textarea
                    className="w-full bg-slate-800 rounded p-1.5 text-xs text-white h-20"
                    value={selectedData.input || ""}
                    onChange={(e) => updateSelected({ input: e.target.value })}
                  />
                  <label className="text-[10px] text-slate-400">Output state key</label>
                  <input
                    className="w-full bg-slate-800 rounded p-1.5 text-xs text-white"
                    value={selectedData.output || ""}
                    onChange={(e) => updateSelected({ output: e.target.value })}
                  />
                  {selectedData.role === "supervisor" && (
                    <p className="text-[10px] text-cyan-200/80">
                      Prompt this agent to emit <code className="text-cyan-300">ROUTE: generate</code> (or match your edge labels).
                    </p>
                  )}
                </>
              ) : selectedData.wfType === "condition" ? (
                <>
                  <label className="text-[10px] text-slate-400">Read state key (on)</label>
                  <input
                    className="w-full bg-slate-800 rounded p-1.5 text-xs text-white"
                    value={selectedData.on || ""}
                    onChange={(e) => updateSelected({ on: e.target.value })}
                  />
                  <p className="text-[10px] text-slate-500">
                    Edge labels are matched as <code>when</code> (e.g. generate, otherwise).
                  </p>
                </>
              ) : (
                <p className="text-[11px] text-slate-500">No properties for this node type.</p>
              )}
            </div>

            <div className="rounded-xl border border-slate-800 bg-slate-900/80 p-3 space-y-2">
              <h3 className="text-xs font-semibold text-white flex items-center gap-1">
                <Play className="h-3 w-3" /> Test run
              </h3>
              <textarea
                className="w-full bg-slate-800 rounded p-2 text-xs text-white h-16"
                value={testInput}
                onChange={(e) => setTestInput(e.target.value)}
              />
              <label className="text-[10px] text-slate-400">maxSteps</label>
              <input
                type="number"
                className="w-full bg-slate-800 rounded p-1.5 text-xs text-white"
                value={maxSteps}
                onChange={(e) => setMaxSteps(Number(e.target.value) || 30)}
              />
              <button
                type="button"
                disabled={busy}
                onClick={() => void runTest()}
                className="w-full py-2 rounded bg-indigo-600 text-xs text-white font-semibold"
              >
                Run published workflow
              </button>
              {runResult && (
                <div className="text-[10px] text-slate-300 max-h-48 overflow-y-auto space-y-1">
                  <div className="text-emerald-300">Status: {runResult.status}</div>
                  <div className="whitespace-pre-wrap">{runResult.output}</div>
                  {runResult.steps.map((s, i) => (
                    <div key={i} className="border-t border-slate-700 pt-1">
                      {s.nodeId} ({s.type}) — {s.status}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
