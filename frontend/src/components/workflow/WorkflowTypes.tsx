import type { Edge, Node } from "@xyflow/react";
import {
  Bot,
  BookOpen,
  Flag,
  GitBranch,
  PlayCircle,
  UserCheck,
  Wrench,
} from "lucide-react";

export type NodeKind =
  | "start"
  | "agent"
  | "tool"
  | "knowledge"
  | "condition"
  | "approval"
  | "end";

export type RunStatus = "idle" | "running" | "done" | "error";

/** Everything a node stores. Index signature is required by @xyflow/react v12. */
export interface WFNodeData extends Record<string, unknown> {
  kind: NodeKind;
  label: string;
  description?: string;
  status?: RunStatus;

  // start
  trigger?: "manual" | "api" | "schedule";
  // agent
  agentId?: string;
  agentName?: string;
  /** Input template. Tokens such as {{input}} and {{plan}} are filled at run time. */
  prompt?: string;
  /** Name of this step's result, used by later steps as {{name}}. */
  output?: string;
  // tool
  toolName?: string;
  toolType?: "local" | "remote";
  // knowledge
  kbName?: string;
  topK?: number;
  // condition
  expression?: string;
  // approval
  approverGroup?: string;
  // end
  outputFormat?: "text" | "json" | "file";
}

export type WFNode = Node<WFNodeData, "wf">;
export type WFEdge = Edge;

export interface KindMeta {
  kind: NodeKind;
  title: string;
  hint: string;
  icon: React.ComponentType<{ className?: string }>;
  /** Tailwind colour tokens, kept in one place so palette, node and minimap agree. */
  accent: string; // icon + border accent
  chip: string; // icon background
  hex: string; // minimap
  inputs: boolean;
  outputs: boolean;
}

export const KINDS: KindMeta[] = [
  {
    kind: "start",
    title: "Trigger",
    hint: "How the workflow begins",
    icon: PlayCircle,
    accent: "text-emerald-400",
    chip: "bg-emerald-500/15 border-emerald-500/40",
    hex: "#34d399",
    inputs: false,
    outputs: true,
  },
  {
    kind: "agent",
    title: "Agent",
    hint: "Run a published agent",
    icon: Bot,
    accent: "text-purple-400",
    chip: "bg-purple-500/15 border-purple-500/40",
    hex: "#c084fc",
    inputs: true,
    outputs: true,
  },
  {
    kind: "tool",
    title: "Tool",
    hint: "Call a local or MCP tool",
    icon: Wrench,
    accent: "text-sky-400",
    chip: "bg-sky-500/15 border-sky-500/40",
    hex: "#38bdf8",
    inputs: true,
    outputs: true,
  },
  {
    kind: "knowledge",
    title: "Knowledge",
    hint: "Retrieve from a knowledge base",
    icon: BookOpen,
    accent: "text-cyan-400",
    chip: "bg-cyan-500/15 border-cyan-500/40",
    hex: "#22d3ee",
    inputs: true,
    outputs: true,
  },
  {
    kind: "condition",
    title: "Condition",
    hint: "Branch on true / false",
    icon: GitBranch,
    accent: "text-amber-400",
    chip: "bg-amber-500/15 border-amber-500/40",
    hex: "#fbbf24",
    inputs: true,
    outputs: true,
  },
  {
    kind: "approval",
    title: "Human approval",
    hint: "Pause until someone signs off",
    icon: UserCheck,
    accent: "text-rose-400",
    chip: "bg-rose-500/15 border-rose-500/40",
    hex: "#fb7185",
    inputs: true,
    outputs: true,
  },
  {
    kind: "end",
    title: "Output",
    hint: "Where the result is delivered",
    icon: Flag,
    accent: "text-indigo-400",
    chip: "bg-indigo-500/15 border-indigo-500/40",
    hex: "#818cf8",
    inputs: true,
    outputs: false,
  },
];

export const META: Record<NodeKind, KindMeta> = Object.fromEntries(
  KINDS.map((k) => [k.kind, k]),
) as Record<NodeKind, KindMeta>;

export const defaultDataFor = (kind: NodeKind): WFNodeData => {
  const base: WFNodeData = { kind, label: META[kind].title, status: "idle" };
  switch (kind) {
    case "start":
      return { ...base, label: "Start", trigger: "manual" };
    case "agent":
      return { ...base, label: "Agent step" };
    case "tool":
      return { ...base, label: "Tool call", toolType: "local" };
    case "knowledge":
      return { ...base, label: "Look up knowledge", topK: 5 };
    case "condition":
      return {
        ...base,
        label: "Check result",
        expression: "output.confidence > 0.8",
      };
    case "approval":
      return { ...base, label: "Manager approval" };
    case "end":
      return { ...base, label: "Finish", outputFormat: "text" };
  }
};

