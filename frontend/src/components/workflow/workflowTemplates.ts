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

/**
 * Supervisor hub: workers connect back to the supervisor.
 * Supervisor output must be JSON `{"next":"generator"|"executor"|"finish"}`
 * or a line `ROUTE: generator`.
 */
export function supervisorHubTemplate(): WorkflowDefinition {
  return {
    maxSteps: 30,
    nodes: [
      { id: "start", type: "start", position: { x: 80, y: 240 } },
      {
        id: "supervisor",
        type: "agent",
        role: "supervisor",
        input: "{{input}}\n\nLast result:\n{{result}}",
        output: "decision",
        position: { x: 300, y: 220 },
      },
      {
        id: "generator",
        type: "agent",
        role: "specialist",
        input: "User question:\n{{input}}\n\nWrite SQL only.",
        output: "sql",
        position: { x: 560, y: 80 },
      },
      {
        id: "executor",
        type: "agent",
        role: "specialist",
        input: "Execute this SQL and return the rows:\n{{sql}}",
        output: "result",
        position: { x: 560, y: 240 },
      },
      {
        id: "gate",
        type: "human",
        input: "Approve running this SQL?\n{{sql}}",
        output: "human",
        position: { x: 560, y: 400 },
      },
      { id: "end", type: "end", position: { x: 860, y: 220 } },
    ],
    edges: [
      { from: "start", to: "supervisor" },
      { from: "supervisor", to: "generator", when: "generator" },
      { from: "supervisor", to: "executor", when: "executor" },
      { from: "supervisor", to: "gate", when: "approve" },
      { from: "supervisor", to: "end", when: "finish" },
      { from: "generator", to: "supervisor" },
      { from: "executor", to: "supervisor" },
      { from: "gate", to: "supervisor" },
    ],
  };
}

export function parallelFanInTemplate(): WorkflowDefinition {
  return {
    maxSteps: 20,
    nodes: [
      { id: "start", type: "start", position: { x: 40, y: 180 } },
      { id: "split", type: "parallel", position: { x: 220, y: 180 } },
      {
        id: "left",
        type: "agent",
        role: "specialist",
        input: "{{input}}",
        output: "left_out",
        position: { x: 440, y: 80 },
      },
      {
        id: "right",
        type: "agent",
        role: "specialist",
        input: "{{input}}",
        output: "right_out",
        position: { x: 440, y: 280 },
      },
      { id: "join", type: "join", position: { x: 680, y: 180 } },
      {
        id: "synth",
        type: "agent",
        role: "specialist",
        input: "Combine:\nA={{left_out}}\nB={{right_out}}",
        output: "output",
        position: { x: 880, y: 180 },
      },
      { id: "end", type: "end", position: { x: 1100, y: 180 } },
    ],
    edges: [
      { from: "start", to: "split" },
      { from: "split", to: "left" },
      { from: "split", to: "right" },
      { from: "split", to: "join" },
      { from: "join", to: "synth" },
      { from: "synth", to: "end" },
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
