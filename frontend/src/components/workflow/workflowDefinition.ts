import type { WorkflowDefinition, WorkflowEdge, WorkflowNode } from "../../api/workflows";
import { defaultDataFor, type NodeKind, type WFEdge, type WFNode, type WFNodeData } from "./WorkflowTypes";

const SERVER_KINDS = new Set<NodeKind>(["start", "agent", "condition", "end"]);
const FALLBACK = new Set(["otherwise", "else", "default", ""]);

export function outputKeyFor(data: WFNodeData, id: string): string {
  const named = (data.output ?? "").trim().replace(/\s+/g, "_");
  if (named) return named;
  const fromId = id.replace(/[^A-Za-z0-9_]/g, "");
  return fromId || "output";
}

function agentInput(data: WFNodeData): string {
  const prompt = (data.prompt ?? "").trim();
  if (!prompt) return "{{input}}";
  if (prompt.includes("{{")) return prompt;
  return `{{input}}\n${prompt}`;
}

function conditionReads(nodeId: string, nodes: WFNode[], edges: WFEdge[]): string {
  const incoming = edges.filter((edge) => edge.target === nodeId);
  for (const edge of incoming) {
    const source = nodes.find((node) => node.id === edge.source);
    if (source?.data.kind === "agent") return outputKeyFor(source.data, source.id);
  }
  return "input";
}

/** Map the canvas onto the execution-service workflow document. */
export function toWorkflowDefinition(
  nodes: WFNode[],
  edges: WFEdge[],
): { definition: WorkflowDefinition | null; errors: string[] } {
  const errors: string[] = [];
  const unsupported = nodes.filter((node) => !SERVER_KINDS.has(node.data.kind));
  if (unsupported.length) {
    errors.push(
      `The service runs Start, Agent, Condition, and End. Remove: ${unsupported
        .map((node) => node.data.label)
        .join(", ")}.`,
    );
  }
  const starts = nodes.filter((node) => node.data.kind === "start");
  const ends = nodes.filter((node) => node.data.kind === "end");
  if (starts.length !== 1) errors.push("A workflow needs exactly one Start.");
  if (ends.length < 1) errors.push("A workflow needs at least one End.");
  for (const node of nodes) {
    if (node.data.kind === "agent" && !node.data.agentId) {
      errors.push(`“${node.data.label}” needs a published agent.`);
    }
    if (node.data.kind === "condition") {
      const outgoing = edges.filter((edge) => edge.source === node.id);
      const handles = new Set(outgoing.map((edge) => edge.sourceHandle));
      if (!handles.has("true") || !handles.has("false")) {
        errors.push(`“${node.data.label}” needs both a true and a false path.`);
      }
    }
  }
  if (errors.length) return { definition: null, errors };

  const apiNodes: WorkflowNode[] = nodes.map((node) => {
    const kind = node.data.kind;
    const base: WorkflowNode = {
      id: node.id,
      type: kind as WorkflowNode["type"],
      position: { x: node.position.x, y: node.position.y },
    };
    if (kind === "agent") {
      return {
        ...base,
        agentId: node.data.agentId,
        input: agentInput(node.data),
        output: outputKeyFor(node.data, node.id),
      };
    }
    if (kind === "condition") {
      return { ...base, on: conditionReads(node.id, nodes, edges) };
    }
    return base;
  });

  const apiEdges: WorkflowEdge[] = edges.map((edge) => {
    const source = nodes.find((node) => node.id === edge.source);
    if (source?.data.kind !== "condition") {
      return { from: edge.source, to: edge.target };
    }
    const fallback = FALLBACK.has((edge.sourceHandle === "false" ? "otherwise" : "").toLowerCase())
      || edge.sourceHandle === "false";
    if (fallback) {
      return { from: edge.source, to: edge.target, when: "otherwise", maxLoops: 3 };
    }
    const expression = (source.data.expression ?? "").trim() || "contains approved";
    return { from: edge.source, to: edge.target, when: expression };
  });

  return {
    definition: { nodes: apiNodes, edges: apiEdges, maxSteps: 30 },
    errors: [],
  };
}

export function canvasFromDefinition(definition: WorkflowDefinition): {
  nodes: WFNode[];
  edges: WFEdge[];
} {
  const kindOf = new Map(definition.nodes.map((node) => [node.id, node.type]));
  const nodes: WFNode[] = definition.nodes.map((node, index) => {
    const kind = (SERVER_KINDS.has(node.type as NodeKind) ? node.type : "agent") as NodeKind;
    const data = defaultDataFor(kind);
    if (kind === "agent") {
      data.agentId = node.agentId ?? undefined;
      data.prompt = node.input && node.input !== "{{input}}" ? node.input : "";
      data.output = node.output || "";
      data.label = node.output || data.label;
    }
    if (kind === "condition") {
      const approved = definition.edges.find(
        (edge) => edge.from === node.id && !FALLBACK.has((edge.when ?? "").trim().toLowerCase()),
      );
      data.expression = approved?.when || "contains approved";
    }
    return {
      id: node.id,
      type: "wf",
      position: node.position ?? { x: 80 + index * 220, y: 140 },
      data,
    };
  });

  const edges: WFEdge[] = definition.edges.map((edge, index) => {
    const fromKind = kindOf.get(edge.from);
    const fallback = FALLBACK.has((edge.when ?? "").trim().toLowerCase());
    const sourceHandle = fromKind === "condition" ? (fallback ? "false" : "true") : undefined;
    return {
      id: `e-${edge.from}-${edge.to}-${index}`,
      source: edge.from,
      target: edge.to,
      sourceHandle,
      label: sourceHandle,
    };
  });

  return { nodes, edges };
}

export function supervisorCanvas(): { name: string; nodes: WFNode[]; edges: WFEdge[] } {
  const node = (
    id: string,
    kind: NodeKind,
    x: number,
    y: number,
    extra: Partial<WFNodeData> = {},
  ): WFNode => ({
    id,
    type: "wf",
    position: { x, y },
    data: { ...defaultDataFor(kind), ...extra },
  });
  const edge = (
    id: string,
    source: string,
    target: string,
    sourceHandle?: string,
  ): WFEdge => ({
    id,
    source,
    target,
    sourceHandle,
    label: sourceHandle,
  });
  return {
    name: "Query supervisor",
    nodes: [
      node("start", "start", 0, 180, { label: "Start" }),
      node("supervisor", "agent", 280, 180, {
        label: "Supervisor",
        output: "plan",
        prompt: "{{input}}",
      }),
      node("maker", "agent", 560, 180, {
        label: "Query maker",
        output: "query",
        prompt: "{{input}}\n{{plan}}\n{{review}}",
      }),
      node("reviewer", "agent", 840, 180, {
        label: "Query reviewer",
        output: "review",
        prompt: "{{query}}",
      }),
      node("check", "condition", 1120, 180, {
        label: "Approved?",
        expression: "contains approved",
      }),
      node("executor", "agent", 1400, 40, {
        label: "Query executor",
        output: "result",
        prompt: "{{query}}",
      }),
      node("response", "agent", 1680, 40, {
        label: "Response",
        output: "answer",
        prompt: "{{input}}\n{{query}}\n{{result}}",
      }),
      node("end", "end", 1960, 40, { label: "End" }),
    ],
    edges: [
      edge("s1", "start", "supervisor"),
      edge("s2", "supervisor", "maker"),
      edge("s3", "maker", "reviewer"),
      edge("s4", "reviewer", "check"),
      edge("s5", "check", "executor", "true"),
      edge("s6", "check", "maker", "false"),
      edge("s7", "executor", "response"),
      edge("s8", "response", "end"),
    ],
  };
}
