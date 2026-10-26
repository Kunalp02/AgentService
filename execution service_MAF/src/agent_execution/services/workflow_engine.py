from __future__ import annotations

import asyncio
import json
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

RunAgent = Callable[[UUID, str], Awaitable[str]]
RunWorkflow = Callable[[UUID, str, int], Awaitable[str]]

_TOKEN = re.compile(r"\{\{\s*([A-Za-z0-9_]+)\s*\}\}")
_OTHERWISE = {"otherwise", "else", "default"}
_MAX_DEPTH = 8


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


class WorkflowPaused(Exception):
    """Human node stopped the run. The service persists status PAUSED."""

    def __init__(
        self,
        node_id: str,
        message: str,
        steps: list[WorkflowStepTrace],
        state: dict[str, str],
    ) -> None:
        super().__init__(message)
        self.node_id = node_id
        self.message = message
        self.steps = steps
        self.state = state


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
                "WORKFLOW_INVALID",
                "A line points at a node that is not on the canvas.",
                400,
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
        if node.type == "workflow" and node.workflow_id is None:
            raise ServiceError(
                "WORKFLOW_INVALID",
                f"Sub-workflow node '{node.id}' needs a published workflow id.",
                400,
            )
        if node.type == "parallel":
            outs = _outgoing(definition, node.id)
            work = [edge for edge in outs if not _is_join_edge(definition, edge)]
            joins = [edge for edge in outs if _is_join_edge(definition, edge)]
            if len(work) < 2 or len(joins) != 1:
                raise ServiceError(
                    "WORKFLOW_INVALID",
                    f"Parallel '{node.id}' needs at least two branches and one join.",
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


def _is_join_edge(definition: WorkflowDefinition, edge: WorkflowEdge) -> bool:
    if edge.when.strip().lower() == "join":
        return True
    target = next((node for node in definition.nodes if node.id == edge.to_node), None)
    return target is not None and target.type == "join"


def _parse_next(output: str) -> str | None:
    text = (output or "").strip()
    data = _json_object(text)
    if isinstance(data, dict):
        for key in ("next", "route", "worker"):
            value = data.get(key)
            if isinstance(value, str) and value.strip():
                return value.strip()
    for line in text.splitlines():
        lowered = line.strip().lower()
        if lowered.startswith("route:") or lowered.startswith("next:"):
            return line.split(":", 1)[1].strip()
    return None


def _json_object(text: str) -> dict | None:
    try:
        parsed = json.loads(text)
    except json.JSONDecodeError:
        parsed = None
    if isinstance(parsed, dict):
        return parsed
    start = text.find("{")
    end = text.rfind("}")
    if start >= 0 and end > start:
        try:
            parsed = json.loads(text[start : end + 1])
        except json.JSONDecodeError:
            return None
        if isinstance(parsed, dict):
            return parsed
    return None


def _pick_condition(
    node: WorkflowNode, edges: list[WorkflowEdge], state: dict[str, str]
) -> WorkflowEdge:
    value = state.get(node.on.strip(), "")
    return _pick_labeled(node.id, edges, value, "Condition")


def _pick_labeled(
    node_id: str, edges: list[WorkflowEdge], value: str, kind: str
) -> WorkflowEdge:
    specific = [
        edge
        for edge in edges
        if edge.when.strip().lower() not in _OTHERWISE and edge.when.strip()
    ]
    fallback = [
        edge
        for edge in edges
        if not edge.when.strip() or edge.when.strip().lower() in _OTHERWISE
    ]
    target = value.strip()
    for edge in specific:
        if edge.when.strip() == target or edge.to_node == target:
            return edge
    for edge in specific:
        if _matches(edge.when, value):
            return edge
    if fallback:
        return fallback[0]
    raise ServiceError(
        "WORKFLOW_INVALID",
        f"{kind} '{node_id}' has no matching line for '{target or value}'.",
        400,
    )


def _choose_agent_edge(
    node: WorkflowNode, edges: list[WorkflowEdge], output: str
) -> WorkflowEdge:
    if len(edges) == 1:
        return edges[0]
    nxt = _parse_next(output)
    if nxt:
        return _pick_labeled(node.id, edges, nxt, "Orchestrator")
    return _pick_labeled(node.id, edges, output, "Orchestrator")


async def execute_workflow(
    definition: WorkflowDefinition,
    user_input: str,
    run_agent: RunAgent,
    *,
    run_workflow: RunWorkflow | None = None,
    state: dict[str, str] | None = None,
    steps: list[WorkflowStepTrace] | None = None,
    start_at: str | None = None,
    depth: int = 0,
) -> WorkflowOutcome:
    if depth > _MAX_DEPTH:
        raise ServiceError(
            "WORKFLOW_LIMIT", "Sub-workflow nesting is too deep.", 400
        )
    validate_definition(definition, for_run=True)
    nodes = {node.id: node for node in definition.nodes}
    memory: dict[str, str] = dict(state or {"input": user_input})
    if "input" not in memory:
        memory["input"] = user_input
    trace: list[WorkflowStepTrace] = list(steps or [])
    loops: dict[tuple[str, str], int] = {}
    last_key = memory.get("__last_key", "input")

    if start_at:
        current = start_at
    else:
        current = _single_edge(
            definition, next(node.id for node in definition.nodes if node.type == "start")
        ).to_node

    def take(edge: WorkflowEdge) -> str:
        loop_key = (edge.from_node, edge.to_node)
        loops[loop_key] = loops.get(loop_key, 0) + 1
        if edge.max_loops is not None and loops[loop_key] > edge.max_loops:
            raise WorkflowRunError(
                "WORKFLOW_LIMIT",
                f"Node '{edge.from_node}' reached its loop limit of {edge.max_loops}.",
                400,
                trace,
                memory,
            )
        return edge.to_node

    async def run_one_agent(node: WorkflowNode, *, remember: bool = True) -> str:
        nonlocal last_key
        assert node.agent_id is not None
        text = render_template(node.input or "{{input}}", memory)
        try:
            output = await run_agent(node.agent_id, text)
        except ServiceError as exc:
            trace.append(
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
                trace,
                memory,
            ) from exc
        key = (node.output or "output").strip() or "output"
        memory[key] = output
        if remember:
            last_key = key
            memory["__last_key"] = key
        trace.append(
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
        return output

    for _ in range(max(1, definition.max_steps)):
        node = nodes.get(current)
        if node is None:
            raise ServiceError("WORKFLOW_INVALID", f"Missing node '{current}'.", 400)
        if node.type == "end":
            return WorkflowOutcome(
                output=memory.get(last_key, ""), steps=trace, state=memory
            )
        if node.type == "agent":
            outgoing = _outgoing(definition, node.id)
            output = await run_one_agent(node, remember=len(outgoing) <= 1)
            current = take(_choose_agent_edge(node, outgoing, output))
            continue
        if node.type == "condition":
            edge = _pick_condition(node, _outgoing(definition, node.id), memory)
            trace.append(
                WorkflowStepTrace(
                    node_id=node.id,
                    type="condition",
                    status="succeeded",
                    input=memory.get(node.on.strip(), ""),
                    output=edge.when or "otherwise",
                )
            )
            current = take(edge)
            continue
        if node.type == "parallel":
            edges = _outgoing(definition, node.id)
            join_edges = [edge for edge in edges if _is_join_edge(definition, edge)]
            work = [edge for edge in edges if edge not in join_edges]
            if len(work) < 2 or len(join_edges) != 1:
                raise ServiceError(
                    "WORKFLOW_INVALID",
                    f"Parallel '{node.id}' needs at least two branches and one join.",
                    400,
                )

            async def branch(edge: WorkflowEdge) -> None:
                target = nodes.get(edge.to_node)
                if target is None or target.type != "agent":
                    raise ServiceError(
                        "WORKFLOW_INVALID",
                        f"Parallel '{node.id}' can only run agent branches.",
                        400,
                    )
                await run_one_agent(target)

            await asyncio.gather(*(branch(edge) for edge in work))
            trace.append(
                WorkflowStepTrace(
                    node_id=node.id,
                    type="parallel",
                    status="succeeded",
                    output=join_edges[0].to_node,
                )
            )
            current = take(join_edges[0])
            continue
        if node.type == "join":
            trace.append(
                WorkflowStepTrace(node_id=node.id, type="join", status="succeeded")
            )
            current = take(_single_edge(definition, node.id))
            continue
        if node.type == "human":
            prompt = render_template(node.input or "Approval required", memory)
            trace.append(
                WorkflowStepTrace(
                    node_id=node.id,
                    type="human",
                    status="waiting",
                    input=prompt,
                )
            )
            memory["__paused_node"] = node.id
            raise WorkflowPaused(node.id, prompt, trace, memory)
        if node.type == "workflow":
            if run_workflow is None or node.workflow_id is None:
                raise ServiceError(
                    "WORKFLOW_INVALID",
                    f"Sub-workflow '{node.id}' cannot run.",
                    400,
                )
            text = render_template(node.input or "{{input}}", memory)
            try:
                output = await run_workflow(node.workflow_id, text, depth + 1)
            except WorkflowPaused as exc:
                raise ServiceError(
                    "WORKFLOW_UNSUPPORTED",
                    "A human pause inside a sub-workflow is not supported. Put the human node on the parent workflow.",
                    400,
                ) from exc
            key = (node.output or "output").strip() or "output"
            memory[key] = output
            last_key = key
            memory["__last_key"] = key
            trace.append(
                WorkflowStepTrace(
                    node_id=node.id,
                    type="workflow",
                    status="succeeded",
                    input=text,
                    output=output,
                    output_key=key,
                )
            )
            current = take(
                _choose_agent_edge(node, _outgoing(definition, node.id), output)
            )
            continue
        raise ServiceError("WORKFLOW_INVALID", f"Node '{node.id}' cannot run.", 400)

    raise ServiceError(
        "WORKFLOW_LIMIT",
        "The workflow reached the maximum number of steps.",
        400,
    )
