# Workflow builder — supervisor & HITL

## Sidebar visibility

**Agent Workflows** uses the same gate as Agent Studio: **Agent View** (`200`). If the menu is missing, grant Agent View on the role profile and sign in again.


## Supervisor vs specialist agents

| | Supervisor agent | Specialist agents (generator, executor, …) |
|--|------------------|---------------------------------------------|
| **Created in** | Agent Studio (same as any agent) | Agent Studio |
| **KB / tools** | Usually **none** — routing & summary only | **KB, SQL tool**, etc. |
| **Attached on** | **Workflow canvas** — edges to specialists | **Workflow canvas** — agent node picks `agentId` |
| **Not** | Listing other agents as “tools” on supervisor record | — |

The workflow only stores **references** (`agentId`) and **templates** (`{{input}}`, `{{sql}}`). Runtime loads each published manifest per step.

Supervisor output should include routable text (e.g. `ROUTE: generate`) matched by **Route** node edges (`when`).

## Patterns the engine runs

| Canvas | Runtime |
|--------|---------|
| One outgoing line per agent | Pipeline (A → B → C) |
| Several outgoing lines + `when` | Orchestrator. Reply with `{"next":"node-id"}` or `ROUTE: node-id`. Workers can point back to the supervisor. |
| Route / condition | Rule branch on a state key (`when`, `contains …`, `otherwise`) |
| Parallel → agents + Join | Those agents run together, then the join continues |
| Human approval | Run status `PAUSED`. `POST /workflows/{id}/runs/{runId}/resume` with `{ "input": "..." }` |
| Sub-workflow | Node type `workflow` with a published `workflowId` |

## Human-in-the-loop

A **Human approval** node pauses the run. The test panel shows **Resume paused run**. The reply is stored in the node’s output key, then the single outgoing line continues. Put human nodes on the parent workflow, not inside a sub-workflow.

## Test a workflow

1. Publish all agents used on the canvas.
2. Save workflow → **Publish**.
3. **Run published workflow** with test input (uses `POST /api/v1/workflows/{id}/runs`).
