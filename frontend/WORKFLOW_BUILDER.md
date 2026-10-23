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

## Human-in-the-loop (planned)

Industry pattern: workflow run enters `WAITING`, UI prompts user, `POST .../runs/{id}/resume` continues.

- Builder shows **Human approval (soon)** — not saved to API yet.
- Next backend step: `human` node type + paused run state + resume endpoint.

## Test a workflow

1. Publish all agents used on the canvas.
2. Save workflow → **Publish**.
3. **Run published workflow** with test input (uses `POST /api/v1/workflows/{id}/runs`).
