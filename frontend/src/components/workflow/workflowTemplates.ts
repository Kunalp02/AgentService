import type { WorkflowDefinition } from "../../types/workflow";

/** Supervisor + condition + two specialist slots (assign agents in builder). */
export function supervisorSqlTemplate(): WorkflowDefinition {
  return {
    maxSteps: 30,
    nodes: [
      { id: "start", type: "start", position: { x: 80, y: 220 } },
      {
        id: "supervisor",
        type: "agent",
        role: "supervisor",
        input: "{{input}}",
        output: "supervisor_out",
        position: { x: 280, y: 200 },
      },
      {
        id: "route",
        type: "condition",
        on: "supervisor_out",
        position: { x: 480, y: 200 },
      },
      {
        id: "generator",
        type: "agent",
        role: "specialist",
        input:
          "User question:\n{{input}}\n\nGenerate SQL only. Use attached knowledge base schema.",
        output: "sql",
        position: { x: 700, y: 120 },
      },
      {
        id: "executor",
        type: "agent",
        role: "specialist",
        input: "Execute this SQL and return results:\n{{sql}}",
        output: "result",
        position: { x: 920, y: 120 },
      },
      { id: "end_ok", type: "end", position: { x: 1140, y: 120 } },
      { id: "end_stop", type: "end", position: { x: 700, y: 320 } },
    ],
    edges: [
      { from: "start", to: "supervisor" },
      { from: "supervisor", to: "route" },
      { from: "route", to: "generator", when: "generate" },
      { from: "route", to: "end_stop", when: "otherwise" },
      { from: "generator", to: "executor" },
      { from: "executor", to: "end_ok" },
    ],
  };
}

export function linearPipelineTemplate(): WorkflowDefinition {
  return {
    maxSteps: 20,
    nodes: [
      { id: "start", type: "start", position: { x: 80, y: 200 } },
      {
        id: "step_a",
        type: "agent",
        role: "specialist",
        input: "{{input}}",
        output: "step_a_out",
        position: { x: 300, y: 200 },
      },
      {
        id: "step_b",
        type: "agent",
        role: "specialist",
        input: "{{step_a_out}}",
        output: "output",
        position: { x: 520, y: 200 },
      },
      { id: "end", type: "end", position: { x: 740, y: 200 } },
    ],
    edges: [
      { from: "start", to: "step_a" },
      { from: "step_a", to: "step_b" },
      { from: "step_b", to: "end" },
    ],
  };
}
