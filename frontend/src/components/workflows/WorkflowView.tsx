import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  Background,
  Controls,
  MiniMap,
  ReactFlow,
  addEdge,
  useEdgesState,
  useNodesState,
  type Connection,
  type Edge,
  type Node,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { Play, Plus, Save, Upload } from "lucide-react";
import { usePlatform } from "../../context/PlatformContext";
import {
  workflowsApi,
  type WorkflowDefinition,
  type WorkflowDocument,
  type WorkflowRunResponse,
  type WorkflowSummary,
} from "../../api/workflows";

type NodeKind = "start" | "agent" | "condition" | "end";

type FlowData = {
  kind: NodeKind;
  label?: string;
  agentId?: string;
  input?: string;
  output?: string;
  on?: string;
};

type FlowEdgeData = {
  when?: string;
  maxLoops?: number | null;
};

const blankDefinition = (): WorkflowDefinition => ({
  maxSteps: 30,
  nodes: [
    { id: "start", type: "start", position: { x: 40, y: 160 } },
    { id: "end", type: "end", position: { x: 720, y: 160 } },
  ],
  edges: [{ from: "start", to: "end" }],
});

function toFlow(definition: WorkflowDefinition): { nodes: Node<FlowData>[]; edges: Edge<FlowEdgeData>[] } {
  return {
    nodes: definition.nodes.map((node, index) => ({
      id: node.id,
      position: node.position ?? { x: 80 + index * 180, y: 160 },
      data: {
        kind: node.type,
        agentId: node.agentId ?? undefined,
        input: node.input,
        output: node.output,
        on: node.on,
      },
      style: nodeStyle(node.type),
      dataLabel: node.type,
    })).map((node) => ({
      id: node.id,
      position: node.position,
      data: node.data,
      style: node.style,
    })),
    edges: definition.edges.map((edge, index) => ({
      id: `e-${edge.from}-${edge.to}-${index}`,
      source: edge.from,
      target: edge.to,
      label: edge.when || undefined,
      data: { when: edge.when || "", maxLoops: edge.maxLoops ?? null },
    })),
  };
}

function nodeStyle(kind: NodeKind): React.CSSProperties {
  if (kind === "start") return { border: "1px solid #34d399", borderRadius: 10, background: "#022c22", color: "#d1fae5" };
  if (kind === "end") return { border: "1px solid #fb7185", borderRadius: 10, background: "#4c0519", color: "#ffe4e6" };
  if (kind === "condition") return { border: "1px solid #fbbf24", borderRadius: 10, background: "#451a03", color: "#fef3c7" };
  return { border: "1px solid #a78bfa", borderRadius: 10, background: "#2e1065", color: "#ede9fe", minWidth: 140 };
}

function definitionFrom(nameNodes: Node<FlowData>[], flowEdges: Edge<FlowEdgeData>[]): WorkflowDefinition {
  return {
    maxSteps: 30,
    nodes: nameNodes.map((node) => ({
      id: node.id,
      type: node.data.kind,
      agentId: node.data.agentId || null,
      input: node.data.input || "{{input}}",
      output: node.data.output || "",
      on: node.data.on || "",
      position: { x: node.position.x, y: node.position.y },
    })),
    edges: flowEdges.map((edge) => ({
      from: edge.source,
      to: edge.target,
      when: edge.data?.when || "",
      maxLoops: edge.data?.maxLoops ?? null,
    })),
  };
}

export const WorkflowView: React.FC = () => {
  const { agents } = usePlatform();
  const publishedAgents = useMemo(
    () => agents.filter((agent) => agent.status.toLowerCase() === "published"),
    [agents],
  );
  const [items, setItems] = useState<WorkflowSummary[]>([]);
  const [workflowId, setWorkflowId] = useState<string | null>(null);
  const [name, setName] = useState("Query supervisor");
  const [status, setStatus] = useState("Draft");
  const [nodes, setNodes, onNodesChange] = useNodesState<Node<FlowData>>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge<FlowEdgeData>>([]);
  const [saved, setSaved] = useState("");
  const [selectedNode, setSelectedNode] = useState<string | null>(null);
  const [selectedEdge, setSelectedEdge] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [runInput, setRunInput] = useState("");
  const [sessionId, setSessionId] = useState("");
  const [userId, setUserId] = useState("");
  const [orgId, setOrgId] = useState("");
  const [runResult, setRunResult] = useState<WorkflowRunResponse | null>(null);

  const snapshot = JSON.stringify({ name, definition: definitionFrom(nodes, edges) });
  const dirty = snapshot !== saved;

  useEffect(() => {
    setNodes((current) => {
      let changed = false;
      const next = current.map((node) => {
        const label = labelFor(node, publishedAgents);
        if (node.data.label === label) return node;
        changed = true;
        return { ...node, data: { ...node.data, label } };
      });
      return changed ? next : current;
    });
  }, [publishedAgents, nodes, setNodes]);

  const applyDocument = (document: WorkflowDocument) => {
    const flow = toFlow(document.definition);
    setWorkflowId(document.workflowId);
    setName(document.name);
    setStatus(document.status);
    setNodes(flow.nodes);
    setEdges(flow.edges);
    setSaved(JSON.stringify({ name: document.name, definition: definitionFrom(flow.nodes, flow.edges) }));
    setSelectedNode(null);
    setSelectedEdge(null);
    setRunResult(null);
  };

  const loadList = useCallback(async () => {
    const rows = await workflowsApi.list();
    setItems(rows);
  }, []);

  useEffect(() => {
    void loadList().catch((err: Error) => setError(err.message));
    const flow = toFlow(blankDefinition());
    setNodes(flow.nodes);
    setEdges(flow.edges);
    setSaved(JSON.stringify({ name: "Query supervisor", definition: definitionFrom(flow.nodes, flow.edges) }));
  }, [loadList, setEdges, setNodes]);

  const onConnect = useCallback(
    (connection: Connection) => {
      setEdges((current) =>
        addEdge({ ...connection, data: { when: "", maxLoops: null } }, current),
      );
    },
    [setEdges],
  );

  const addNode = (kind: NodeKind) => {
    const id = `${kind}-${crypto.randomUUID().slice(0, 8)}`;
    setNodes((current) => [
      ...current,
      {
        id,
        position: { x: 180 + current.length * 30, y: 80 + current.length * 24 },
        data: {
          kind,
          input: kind === "agent" ? "{{input}}" : undefined,
          output: kind === "agent" ? "output" : undefined,
          on: kind === "condition" ? "review" : undefined,
        },
        style: nodeStyle(kind),
      },
    ]);
    setSelectedNode(id);
    setSelectedEdge(null);
  };

  const loadSupervisorShape = () => {
    const flow = toFlow({
      maxSteps: 30,
      nodes: [
        { id: "start", type: "start", position: { x: 0, y: 180 } },
        { id: "supervisor", type: "agent", input: "{{input}}", output: "plan", position: { x: 180, y: 180 } },
        { id: "maker", type: "agent", input: "{{input}}\n{{plan}}\n{{review}}", output: "query", position: { x: 400, y: 80 } },
        { id: "reviewer", type: "agent", input: "{{query}}", output: "review", position: { x: 640, y: 80 } },
        { id: "check", type: "condition", on: "review", position: { x: 860, y: 180 } },
        { id: "executor", type: "agent", input: "{{query}}", output: "result", position: { x: 1080, y: 40 } },
        { id: "response", type: "agent", input: "{{input}}\n{{query}}\n{{result}}", output: "answer", position: { x: 1300, y: 40 } },
        { id: "end", type: "end", position: { x: 1520, y: 180 } },
      ],
      edges: [
        { from: "start", to: "supervisor" },
        { from: "supervisor", to: "maker" },
        { from: "maker", to: "reviewer" },
        { from: "reviewer", to: "check" },
        { from: "check", to: "executor", when: "contains approved" },
        { from: "check", to: "maker", when: "otherwise", maxLoops: 3 },
        { from: "executor", to: "response" },
        { from: "response", to: "end" },
      ],
    });
    setName("Query supervisor");
    setNodes(flow.nodes);
    setEdges(flow.edges);
    setWorkflowId(null);
    setStatus("Draft");
    setSaved("");
  };

  const save = async () => {
    setLoading(true);
    setError("");
    try {
      const definition = definitionFrom(nodes, edges);
      const document = workflowId
        ? await workflowsApi.update(workflowId, name.trim(), definition)
        : await workflowsApi.create(name.trim(), definition);
      applyDocument(document);
      await loadList();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed.");
    } finally {
      setLoading(false);
    }
  };

  const publish = async (next: boolean) => {
    if (!workflowId || dirty) return;
    setLoading(true);
    setError("");
    try {
      const document = next
        ? await workflowsApi.publish(workflowId)
        : await workflowsApi.unpublish(workflowId);
      applyDocument(document);
      await loadList();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Publish failed.");
    } finally {
      setLoading(false);
    }
  };

  const run = async () => {
    if (!workflowId || dirty || status !== "Published") return;
    setLoading(true);
    setError("");
    try {
      setRunResult(
        await workflowsApi.run(workflowId, {
          input: runInput,
          sessionId: sessionId || undefined,
          userId: userId || undefined,
          orgId: orgId || undefined,
        }),
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Run failed.");
    } finally {
      setLoading(false);
    }
  };

  const node = nodes.find((item) => item.id === selectedNode) ?? null;
  const edge = edges.find((item) => item.id === selectedEdge) ?? null;
  const selectedAgent = publishedAgents.find((agent) => agent.id === node?.data.agentId);

  const updateNode = (patch: Partial<FlowData>) => {
    if (!node) return;
    setNodes((current) =>
      current.map((item) => (item.id === node.id ? { ...item, data: { ...item.data, ...patch } } : item)),
    );
  };

  return (
    <div className="h-full min-h-[720px] flex text-slate-100">
      <aside className="w-56 shrink-0 border-r border-slate-800 p-3 space-y-2 overflow-y-auto">
        <button type="button" onClick={loadSupervisorShape} className="w-full text-left text-xs px-2 py-2 rounded-lg bg-purple-600/20 border border-purple-500/40">
          <Plus className="w-3.5 h-3.5 inline mr-1" />
          Supervisor flow
        </button>
        {items.map((item) => (
          <button
            key={item.workflowId}
            type="button"
            onClick={() => {
              void workflowsApi.get(item.workflowId).then(applyDocument).catch((err: Error) => setError(err.message));
            }}
            className={`w-full text-left px-2 py-2 rounded-lg border text-xs ${
              item.workflowId === workflowId ? "border-purple-400 bg-purple-500/10" : "border-slate-800"
            }`}
          >
            <div className="font-semibold truncate">{item.name}</div>
            <div className="text-[10px] text-slate-400">{item.status}</div>
          </button>
        ))}
      </aside>

      <div className="flex-1 min-w-0 flex flex-col">
        <div className="flex items-center gap-2 p-3 border-b border-slate-800">
          <input value={name} onChange={(event) => setName(event.target.value)} className="bg-slate-900 border border-slate-700 rounded-lg px-2 py-1.5 text-sm flex-1" />
          <span className="text-[10px] uppercase tracking-wide px-2 py-1 rounded bg-slate-800">{status}</span>
          <button type="button" disabled={loading || !dirty} onClick={() => void save()} className={`px-3 py-1.5 rounded-lg text-xs font-semibold ${dirty ? "bg-purple-600 text-white ring-2 ring-purple-300" : "bg-slate-800 text-slate-400"}`}>
            <Save className="w-3.5 h-3.5 inline mr-1" />
            Save
          </button>
          {status === "Published" ? (
            <button type="button" disabled={loading || dirty || !workflowId} onClick={() => void publish(false)} className="px-3 py-1.5 rounded-lg text-xs bg-slate-700 disabled:opacity-40">
              Unpublish
            </button>
          ) : (
            <button type="button" disabled={loading || dirty || !workflowId} onClick={() => void publish(true)} title={dirty ? "Save before publishing" : "Publish the saved workflow"} className={`px-3 py-1.5 rounded-lg text-xs font-semibold disabled:opacity-40 ${!dirty && workflowId ? "bg-emerald-600 text-white ring-2 ring-emerald-300" : "bg-slate-800 text-slate-400"}`}>
              <Upload className="w-3.5 h-3.5 inline mr-1" />
              Publish
            </button>
          )}
        </div>
        {dirty && <p className="px-3 py-1 text-[11px] text-amber-300">Save before publishing. A published workflow goes back to draft when you save changes.</p>}
        {error && <p className="px-3 py-1 text-[11px] text-rose-300">{error}</p>}
        <div className="flex gap-2 px-3 py-2 text-[11px]">
          {(["start", "agent", "condition", "end"] as NodeKind[]).map((kind) => (
            <button key={kind} type="button" onClick={() => addNode(kind)} className="px-2 py-1 rounded border border-slate-700 capitalize">
              {kind}
            </button>
          ))}
        </div>
        <div className="flex-1 min-h-[480px]">
          <ReactFlow
            nodes={nodes}
            edges={edges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            onNodeClick={(_, clicked) => {
              setSelectedNode(clicked.id);
              setSelectedEdge(null);
            }}
            onEdgeClick={(_, clicked) => {
              setSelectedEdge(clicked.id);
              setSelectedNode(null);
            }}
            fitView
          >
            <Background />
            <MiniMap />
            <Controls />
          </ReactFlow>
        </div>
      </div>

      <aside className="w-80 shrink-0 border-l border-slate-800 p-3 overflow-y-auto space-y-3 text-xs">
        {node && (
          <div className="space-y-2">
            <div className="font-semibold capitalize">{node.data.kind} node</div>
            {node.data.kind === "agent" && (
              <>
                <label className="block text-slate-400">Published agent</label>
                <select
                  value={node.data.agentId || ""}
                  onChange={(event) => updateNode({ agentId: event.target.value })}
                  className="w-full bg-slate-900 border border-slate-700 rounded p-2"
                >
                  <option value="">Select an agent</option>
                  {publishedAgents.map((agent) => (
                    <option key={agent.id} value={agent.id}>{agent.name}</option>
                  ))}
                </select>
                {selectedAgent && (
                  <div className="rounded-lg border border-slate-800 p-2 space-y-1 text-slate-300">
                    <div>Model: {selectedAgent.modelName || selectedAgent.modelId}</div>
                    <div>Tools: {selectedAgent.tools.map((tool) => tool.toolName || tool.toolId).join(", ") || "none"}</div>
                    <div>Knowledge: {selectedAgent.knowledgeBases.map((kb) => kb.knowledgeBaseName || kb.knowledgeBaseId).join(", ") || "none"}</div>
                    <p className="text-slate-400 whitespace-pre-wrap">{selectedAgent.systemPrompt}</p>
                  </div>
                )}
                <label className="block text-slate-400">Input template</label>
                <textarea value={node.data.input || ""} onChange={(event) => updateNode({ input: event.target.value })} rows={4} className="w-full bg-slate-900 border border-slate-700 rounded p-2" />
                <label className="block text-slate-400">Output name</label>
                <input value={node.data.output || ""} onChange={(event) => updateNode({ output: event.target.value })} className="w-full bg-slate-900 border border-slate-700 rounded p-2" />
              </>
            )}
            {node.data.kind === "condition" && (
              <>
                <label className="block text-slate-400">Read output</label>
                <input value={node.data.on || ""} onChange={(event) => updateNode({ on: event.target.value })} className="w-full bg-slate-900 border border-slate-700 rounded p-2" />
              </>
            )}
          </div>
        )}
        {edge && (
          <div className="space-y-2">
            <div className="font-semibold">Line</div>
            <label className="block text-slate-400">When</label>
            <input
              value={edge.data?.when || ""}
              placeholder="contains approved, or otherwise"
              onChange={(event) => {
                const when = event.target.value;
                setEdges((current) => current.map((item) => item.id === edge.id ? { ...item, label: when || undefined, data: { ...item.data, when } } : item));
              }}
              className="w-full bg-slate-900 border border-slate-700 rounded p-2"
            />
            <label className="block text-slate-400">Max loops</label>
            <input
              type="number"
              min={1}
              value={edge.data?.maxLoops ?? ""}
              onChange={(event) => {
                const maxLoops = event.target.value ? Number(event.target.value) : null;
                setEdges((current) => current.map((item) => item.id === edge.id ? { ...item, data: { ...item.data, maxLoops } } : item));
              }}
              className="w-full bg-slate-900 border border-slate-700 rounded p-2"
            />
          </div>
        )}

        <div className="border-t border-slate-800 pt-3 space-y-2">
          <div className="font-semibold">Run published workflow</div>
          <textarea value={runInput} onChange={(event) => setRunInput(event.target.value)} placeholder="User question" rows={3} className="w-full bg-slate-900 border border-slate-700 rounded p-2" />
          <input value={sessionId} onChange={(event) => setSessionId(event.target.value)} placeholder="sessionId" className="w-full bg-slate-900 border border-slate-700 rounded p-2" />
          <input value={userId} onChange={(event) => setUserId(event.target.value)} placeholder="userId" className="w-full bg-slate-900 border border-slate-700 rounded p-2" />
          <input value={orgId} onChange={(event) => setOrgId(event.target.value)} placeholder="orgId" className="w-full bg-slate-900 border border-slate-700 rounded p-2" />
          <button type="button" disabled={loading || dirty || status !== "Published" || !workflowId} onClick={() => void run()} className="px-3 py-1.5 rounded-lg bg-sky-700 disabled:opacity-40">
            <Play className="w-3.5 h-3.5 inline mr-1" />
            Run
          </button>
          {runResult && (
            <div className="space-y-2">
              <p className="whitespace-pre-wrap text-slate-200">{runResult.output}</p>
              {runResult.steps.map((step, index) => (
                <div key={`${step.nodeId}-${index}`} className="border border-slate-800 rounded p-2">
                  <div className="font-semibold">{step.nodeId} · {step.status}</div>
                  {step.output && <p className="text-slate-400 whitespace-pre-wrap">{step.output}</p>}
                  {step.error && <p className="text-rose-300">{step.error}</p>}
                </div>
              ))}
            </div>
          )}
        </div>
      </aside>
    </div>
  );
};

function labelFor(node: Node<FlowData>, agents: { id: string; name: string }[]): string {
  if (node.data.kind === "agent") {
    return agents.find((agent) => agent.id === node.data.agentId)?.name || node.data.output || "Agent";
  }
  if (node.data.kind === "condition") return node.data.on ? `If ${node.data.on}` : "Condition";
  return node.data.kind === "start" ? "Start" : "End";
}
