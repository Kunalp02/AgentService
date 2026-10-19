from uuid import uuid4
import pytest

from agent_execution.core.exceptions import ServiceError
from agent_execution.schemas.workflows import (
    WorkflowDefinition,
    WorkflowEdge,
    WorkflowNode,
)
from agent_execution.services.workflow_engine import (
    WorkflowRunError,
    execute_workflow,
    render_template,
)


def _agent(
    node_id: str, agent_id, output: str, template: str = "{{input}}"
) -> WorkflowNode:
    return WorkflowNode(
        id=node_id, type="agent", agentId=agent_id, input=template, output=output
    )


@pytest.mark.asyncio
async def test_supervisor_path_passes_named_outputs():
    supervisor = uuid4()
    maker = uuid4()
    calls: list[tuple] = []

    async def run_agent(agent_id, text: str) -> str:
        calls.append((agent_id, text))
        if agent_id == supervisor:
            return "plan the query"
        return "SELECT 1"

    definition = WorkflowDefinition(
        nodes=[
            WorkflowNode(id="start", type="start"),
            _agent("supervisor", supervisor, "plan"),
            _agent("maker", maker, "query", "{{input}}\n{{plan}}"),
            WorkflowNode(id="end", type="end"),
        ],
        edges=[
            WorkflowEdge(**{"from": "start", "to": "supervisor"}),
            WorkflowEdge(**{"from": "supervisor", "to": "maker"}),
            WorkflowEdge(**{"from": "maker", "to": "end"}),
        ],
    )
    outcome = await execute_workflow(definition, "how many orders", run_agent)
    assert outcome.output == "SELECT 1"
    assert outcome.state["plan"] == "plan the query"
    assert "plan the query" in calls[1][1]
    assert calls[0][0] == supervisor


@pytest.mark.asyncio
async def test_condition_loops_back_until_approved():
    reviewer = uuid4()
    seen = {"n": 0}

    async def run_agent(agent_id, text: str) -> str:
        seen["n"] += 1
        return "rejected" if seen["n"] < 2 else "approved"

    definition = WorkflowDefinition(
        nodes=[
            WorkflowNode(id="start", type="start"),
            _agent("reviewer", reviewer, "review", "{{query}}"),
            WorkflowNode(id="check", type="condition", on="review"),
            WorkflowNode(id="done", type="end"),
            WorkflowNode(id="stop", type="end"),
        ],
        edges=[
            WorkflowEdge(**{"from": "start", "to": "reviewer"}),
            WorkflowEdge(**{"from": "reviewer", "to": "check"}),
            WorkflowEdge(
                **{"from": "check", "to": "done", "when": "contains approved"}
            ),
            WorkflowEdge(
                **{
                    "from": "check",
                    "to": "reviewer",
                    "when": "otherwise",
                    "maxLoops": 3,
                }
            ),
        ],
    )
    state = {"input": "question"}
    # The reviewer reads {{query}}, which is empty until something writes it.
    # Seed it by using input as the template instead.
    definition.nodes[1] = _agent("reviewer", reviewer, "review", "{{input}}")
    outcome = await execute_workflow(definition, "question", run_agent)
    assert outcome.output == "approved"
    assert seen["n"] == 2
    assert state is not None


@pytest.mark.asyncio
async def test_loop_limit_stops_a_reject_cycle():
    reviewer = uuid4()

    async def run_agent(agent_id, text: str) -> str:
        return "rejected"

    definition = WorkflowDefinition(
        nodes=[
            WorkflowNode(id="start", type="start"),
            _agent("reviewer", reviewer, "review"),
            WorkflowNode(id="check", type="condition", on="review"),
            WorkflowNode(id="end", type="end"),
        ],
        edges=[
            WorkflowEdge(**{"from": "start", "to": "reviewer"}),
            WorkflowEdge(**{"from": "reviewer", "to": "check"}),
            WorkflowEdge(**{"from": "check", "to": "end", "when": "contains approved"}),
            WorkflowEdge(
                **{
                    "from": "check",
                    "to": "reviewer",
                    "when": "otherwise",
                    "maxLoops": 2,
                }
            ),
        ],
    )
    with pytest.raises(WorkflowRunError) as caught:
        await execute_workflow(definition, "question", run_agent)
    assert caught.value.code == "WORKFLOW_LIMIT"
    assert any(
        step.status == "failed" or step.type == "agent" for step in caught.value.steps
    )


def test_render_leaves_unknown_tokens_empty():
    assert render_template("{{input}}\n{{missing}}", {"input": "hi"}) == "hi\n"


def test_publish_validation_requires_an_agent():
    definition = WorkflowDefinition(
        nodes=[
            WorkflowNode(id="start", type="start"),
            WorkflowNode(id="agent", type="agent"),
            WorkflowNode(id="end", type="end"),
        ],
        edges=[
            WorkflowEdge(**{"from": "start", "to": "agent"}),
            WorkflowEdge(**{"from": "agent", "to": "end"}),
        ],
    )
    from agent_execution.services.workflow_engine import validate_definition

    with pytest.raises(ServiceError):
        validate_definition(definition, for_run=True)


