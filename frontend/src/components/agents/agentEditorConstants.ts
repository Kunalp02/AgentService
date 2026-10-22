import type { AgentKnowledgeBaseRef, AgentToolRef } from "../../types/agent";

export const emptyAgentForm = {
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

export type AgentFormState = typeof emptyAgentForm;

export type AgentFormTabKey = "access" | "basics" | "knowledge" | "memory";

export const agentFieldClass =
  "w-full bg-slate-800 border border-slate-700 rounded-lg p-2.5 text-xs text-white placeholder-slate-500 " +
  "focus:outline-none focus:border-purple-500 disabled:opacity-50";

export const agentLabelClass = "block text-[11px] font-semibold text-slate-400 mb-1.5";

export function validateAgentForm(form: AgentFormState): {
  tab: AgentFormTabKey;
  message: string;
} | null {
  if (form.groupIds.length === 0) {
    return {
      tab: "access",
      message:
        "Select at least one group first. The available models, knowledge bases and tools depend on it.",
    };
  }
  if (!form.name.trim()) {
    return { tab: "basics", message: "Give the agent a name." };
  }
  if (!form.modelId) {
    return { tab: "basics", message: "Select a model." };
  }
  if (!form.systemPrompt.trim()) {
    return { tab: "basics", message: "System prompt is required." };
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
}
