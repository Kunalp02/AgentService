from __future__ import annotations

import re
from collections.abc import Awaitable, Callable
from dataclasses import dataclass, field
from uuid import UUID

from agent_execution.core.exceptions import ServiceError
from agent_execution.schemas.workflows import (
    WorkflowDefinition,
    WorkflowEdge,
    WorkflowNode,
    WorkflowStepTrace,
)


class WorkflowRunError(ServiceError):
    def __init__(
        self,
        code: str,
        message: str,
        status_code: int,
        steps: list[WorkflowStepTrace],
        state: dict[str, str],
    ) -> None:
        super().__init__(code, message, status_code)
        self.steps = steps
        self.state = state

_TOKEN = re.compile(r"\{\{\s*([A-Za-z0-9_]+)\s*\}\}")
_OTHERWISE = {"otherwise", "else", "default"}


@dataclass
class WorkflowOutcome:
    output: str
    steps: list[WorkflowStepTrace] = field(default_factory=list)
    state: dict[str, str] = field(default_factory=dict)


def render_template(template: str, state: dict[str, str]) -> str:
    def replace(match: re.Match[str]) -> str:
        return state.get(match.group(1), "")

    return _TOKEN.sub(replace, template or "")


def validate_definition(definition: WorkflowDefinition, *, for_run: bool) -> None:
    nodes = definition.nodes
    if not nodes:
        raise ServiceError("WORKFLOW_INVALID", "Add at least a start and an end.", 400)
    ids = [node.id for node in nodes]
    if len(ids) != len(set(ids)):
        raise ServiceError("WORKFLOW_INVALID", "Each node needs its own id.", 400)
    starts = [node for node in nodes if node.type == "start"]
    ends = [node for node in nodes if node.type == "end"]
    if len(starts) != 1 or len(ends) < 1:
        raise ServiceError(
            "WORKFLOW_INVALID", "A workflow needs one Start and at least one End.", 400
        )
    known = set(ids)
    for edge in definition.edges:
        if edge.from_node not in known or edge.to_node not in known:
            raise ServiceError(
                "WORKFLOW_INVALID", "A line points at a node that is not on the canvas.", 400
            )
    if not for_run:
        return
    for node in nodes:
        if node.type == "agent" and node.agent_id is None:
            raise ServiceError(
                "WORKFLOW_INVALID",
                f"Agent node '{node.id}' has no published agent selected.",
                400,
            )
        if node.type == "condition" and not node.on.strip():
            raise ServiceError(
                "WORKFLOW_INVALID",
                f"Condition '{node.id}' must name the output it reads.",
                400,
            )


def _outgoing(definition: WorkflowDefinition, node_id: str) -> list[WorkflowEdge]:
    return [edge for edge in definition.edges if edge.from_node == node_id]


def _single_edge(definition: WorkflowDefinition, node_id: str) -> WorkflowEdge:
    edges = _outgoing(definition, node_id)
    if len(edges) != 1:
        raise ServiceError(
            "WORKFLOW_INVALID",
            f"Node '{node_id}' must have exactly one next line.",
            400,
        )
    return edges[0]


def _matches(when: str, value: str) -> bool:
    text = when.strip()
    lowered = text.lower()
    if lowered.startswith("contains "):
        needle = text.split(" ", 1)[1].strip().lower()
        return needle in value.lower()
    return lowered in value.lower()


def _pick_condition(node: WorkflowNode, edges: list[WorkflowEdge], state: dict[str, str]) -> WorkflowEdge:
    value = state.get(node.on.strip(), "")
    specific = [edge for edge in edges if edge.when.strip().lower() not in _OTHERWISE and edge.when.strip()]
    fallback = [edge for edge in edges if not edge.when.strip() or edge.when.strip().lower() in _OTHERWISE]
    for edge in specific:
        if _matches(edge.when, value):
            return edge
    if fallback:
        return fallback[0]
    raise ServiceError(
        "WORKFLOW_INVALID",
        f"Condition '{node.id}' has no matching line for this result.",
        400,
    )


async def execute_workflow(
    definition: WorkflowDefinition,
    user_input: str,
    run_agent: Callable[[UUID, str], Awaitable[str]],
) -> WorkflowOutcome:
    validate_definition(definition, for_run=True)
    nodes = {node.id: node for node in definition.nodes}
    state: dict[str, str] = {"input": user_input}
    steps: list[WorkflowStepTrace] = []
    loops: dict[tuple[str, str], int] = {}
    last_key = "input"
    current = _single_edge(definition, next(node.id for node in definition.nodes if node.type == "start")).to_node

    for _ in range(max(1, definition.max_steps)):
        node = nodes.get(current)
        if node is None:
            raise ServiceError("WORKFLOW_INVALID", f"Missing node '{current}'.", 400)
        if node.type == "end":
            return WorkflowOutcome(output=state.get(last_key, ""), steps=steps, state=state)
        if node.type == "agent":
            assert node.agent_id is not None
            text = render_template(node.input or "{{input}}", state)
            try:
                output = await run_agent(node.agent_id, text)
            except ServiceError as exc:
                steps.append(
                    WorkflowStepTrace(
                        node_id=node.id,
                        type="agent",
                        agent_id=node.agent_id,
                        status="failed",
                        input=text,
                        error=exc.message,
                    )
                )
                raise WorkflowRunError(
                    exc.code,
                    f"Agent node '{node.id}' failed: {exc.message}",
                    exc.status_code,
                    steps,
                    state,
                ) from exc
            key = (node.output or "output").strip() or "output"
            state[key] = output
            last_key = key
            steps.append(
                WorkflowStepTrace(
                    node_id=node.id,
                    type="agent",
                    agent_id=node.agent_id,
                    status="succeeded",
                    input=text,
                    output=output,
                    output_key=key,
                )
            )
            current = _single_edge(definition, node.id).to_node
            continue
        if node.type == "condition":
            edge = _pick_condition(node, _outgoing(definition, node.id), state)
            loop_key = (node.id, edge.to_node)
            loops[loop_key] = loops.get(loop_key, 0) + 1
            if edge.max_loops is not None and loops[loop_key] > edge.max_loops:
                raise WorkflowRunError(
                    "WORKFLOW_LIMIT",
                    f"Condition '{node.id}' reached its loop limit of {edge.max_loops}.",
                    400,
                    steps,
                    state,
                )
            steps.append(
                WorkflowStepTrace(
                    node_id=node.id,
                    type="condition",
                    status="succeeded",
                    input=state.get(node.on.strip(), ""),
                    output=edge.when or "otherwise",
                )
            )
            current = edge.to_node
            continue
        raise ServiceError("WORKFLOW_INVALID", f"Node '{node.id}' cannot run.", 400)

    raise ServiceError(
        "WORKFLOW_LIMIT",
        "The workflow reached the maximum number of steps.",
        400,
    )
