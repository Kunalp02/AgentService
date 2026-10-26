from __future__ import annotations

import json
from uuid import UUID, uuid4

from agent_execution.core.exceptions import ServiceError
from agent_execution.infrastructure.persistence.workflow_repository import (
    WorkflowRepository,
)
from agent_execution.schemas.runs import CreateRunRequest
from agent_execution.schemas.threads import Channel, CreateThreadRequest, ExecutionType
from agent_execution.schemas.workflows import (
    WorkflowDefinition,
    WorkflowDocument,
    WorkflowResumeRequest,
    WorkflowRunRequest,
    WorkflowRunResponse,
    WorkflowStepTrace,
    WorkflowSummary,
    WorkflowUpsert,
)
from agent_execution.services.agent_execution_service import AgentExecutionService
from agent_execution.services.thread_service import ThreadService
from agent_execution.services.workflow_engine import (
    WorkflowPaused,
    WorkflowRunError,
    _single_edge,
    execute_workflow,
    validate_definition,
)


class WorkflowService:
    def __init__(
        self,
        repository: WorkflowRepository,
        threads: ThreadService,
        execution: AgentExecutionService,
    ) -> None:
        self._repository = repository
        self._threads = threads
        self._execution = execution

    async def create(self, body: WorkflowUpsert) -> WorkflowDocument:
        name = body.name.strip()
        if not name:
            raise ServiceError("WORKFLOW_INVALID", "Give the workflow a name.", 400)
        validate_definition(body.definition, for_run=False)
        workflow_id = uuid4()
        await self._repository.insert(workflow_id, name, "Draft", body.definition)
        row = await self._repository.get(workflow_id)
        return _document(row)

    async def _require(self, workflow_id: UUID):
        return _require_row(await self._repository.get(workflow_id))

    async def update(self, workflow_id: UUID, body: WorkflowUpsert) -> WorkflowDocument:
        row = await self._require(workflow_id)
        name = body.name.strip()
        if not name:
            raise ServiceError("WORKFLOW_INVALID", "Give the workflow a name.", 400)
        validate_definition(body.definition, for_run=False)
        await self._repository.update(workflow_id, name, body.definition)
        if row["status"] == "Published":
            await self._repository.set_status(workflow_id, "Draft")
        return _document(await self._repository.get(workflow_id))

    async def publish(self, workflow_id: UUID, publish: bool) -> WorkflowDocument:
        row = await self._require(workflow_id)
        if publish:
            validate_definition(_definition(row), for_run=True)
            await self._repository.set_status(workflow_id, "Published")
        else:
            await self._repository.set_status(workflow_id, "Draft")
        return _document(await self._repository.get(workflow_id))

    async def get(self, workflow_id: UUID) -> WorkflowDocument:
        return _document(await self._require(workflow_id))

    async def list_workflows(self) -> list[WorkflowSummary]:
        rows = await self._repository.list_all()
        return [
            WorkflowSummary(
                workflow_id=row["workflow_id"],
                name=row["name"],
                status=row["status"],
                updated_at=row["updated_at"],
            )
            for row in rows
        ]

    async def run(
        self,
        workflow_id: UUID,
        body: WorkflowRunRequest,
        bearer_token: str | None,
        triggered_by: str,
    ) -> WorkflowRunResponse:
        row = await self._require(workflow_id)
        if row["status"] != "Published":
            raise ServiceError(
                "WORKFLOW_NOT_PUBLISHED",
                "Publish the workflow before running it.",
                409,
            )
        definition = _definition(row)
        session_id = (body.session_id or body.user_id or "").strip() or str(uuid4())
        user_id = (body.user_id or triggered_by or "").strip()
        run_id = uuid4()
        await self._repository.insert_run(
            workflow_run_id=run_id,
            workflow_id=workflow_id,
            status="RUNNING",
            user_input=body.input,
            session_id=session_id,
            user_id=user_id,
            org_id=body.org_id,
        )

        async def run_agent(agent_id: UUID, text: str) -> str:
            thread = await self._threads.create(
                agent_id,
                CreateThreadRequest(execution_type=ExecutionType.PRODUCTION),
                channel=Channel.API,
                bearer_token=bearer_token,
                triggered_by=user_id or "workflow",
            )
            result = await self._execution.start(
                agent_id,
                thread.thread_id,
                CreateRunRequest(
                    input=text,
                    org_id=body.org_id,
                    session_id=session_id,
                ),
                bearer_token,
            )
            return result.output or ""

        async def run_workflow(workflow_ref: UUID, text: str, depth: int) -> str:
            child = await self._require(workflow_ref)
            if child["status"] != "Published":
                raise ServiceError(
                    "WORKFLOW_NOT_PUBLISHED",
                    "A sub-workflow must be published before it can run.",
                    409,
                )
            outcome = await execute_workflow(
                _definition(child),
                text,
                run_agent,
                run_workflow=run_workflow,
                depth=depth,
            )
            return outcome.output

        try:
            outcome = await execute_workflow(
                definition, body.input, run_agent, run_workflow=run_workflow
            )
        except WorkflowPaused as paused:
            paused.state["__paused_node"] = paused.node_id
            await self._repository.finish_run(
                run_id,
                status="PAUSED",
                output="",
                error="",
                steps=paused.steps,
                state=paused.state,
            )
            return _response(
                run_id,
                workflow_id,
                "PAUSED",
                "",
                session_id,
                user_id,
                paused.steps,
                paused.state,
                paused.message,
            )
        except WorkflowRunError as exc:
            await self._repository.finish_run(
                run_id,
                status="FAILED",
                output="",
                error=exc.message,
                steps=exc.steps,
                state=exc.state,
            )
            raise
        except ServiceError as exc:
            await self._repository.finish_run(
                run_id,
                status="FAILED",
                output="",
                error=exc.message,
                steps=[],
                state={},
            )
            raise
        await self._repository.finish_run(
            run_id,
            status="SUCCEEDED",
            output=outcome.output,
            error="",
            steps=outcome.steps,
            state=outcome.state,
        )
        return _response(
            run_id,
            workflow_id,
            "SUCCEEDED",
            outcome.output,
            session_id,
            user_id,
            outcome.steps,
            outcome.state,
        )

    async def get_run(self, workflow_id: UUID, run_id: UUID) -> WorkflowRunResponse:
        row = await self._repository.get_run(run_id)
        if row is None or row["workflow_id"] != workflow_id:
            raise ServiceError("NOT_FOUND", "Workflow run not found.", 404)
        return _response_from_row(row)

    async def resume(
        self,
        workflow_id: UUID,
        run_id: UUID,
        body: WorkflowResumeRequest,
        bearer_token: str | None,
        triggered_by: str,
    ) -> WorkflowRunResponse:
        stored = await self._repository.get_run(run_id)
        if stored is None or stored["workflow_id"] != workflow_id:
            raise ServiceError("NOT_FOUND", "Workflow run not found.", 404)
        if stored["status"] != "PAUSED":
            raise ServiceError(
                "WORKFLOW_NOT_PAUSED",
                "Only a paused workflow run can be resumed.",
                409,
            )
        definition = _definition(await self._require(workflow_id))
        state = _json_dict(stored["state"])
        paused_id = str(state.get("__paused_node") or "")
        nodes = {node.id: node for node in definition.nodes}
        human = nodes.get(paused_id)
        if human is None or human.type != "human":
            raise ServiceError(
                "WORKFLOW_INVALID",
                "This run does not remember which human step to resume.",
                400,
            )
        key = (human.output or "human").strip() or "human"
        state[key] = body.input
        state["__last_key"] = key
        state.pop("__paused_node", None)
        nxt = _single_edge(definition, paused_id).to_node
        session_id = stored["session_id"] or ""
        user_id = (stored["user_id"] or triggered_by or "").strip()
        steps = _steps(stored["steps"])

        async def run_agent(agent_id: UUID, text: str) -> str:
            thread = await self._threads.create(
                agent_id,
                CreateThreadRequest(execution_type=ExecutionType.PRODUCTION),
                channel=Channel.API,
                bearer_token=bearer_token,
                triggered_by=user_id or "workflow",
            )
            result = await self._execution.start(
                agent_id,
                thread.thread_id,
                CreateRunRequest(
                    input=text,
                    org_id=stored["org_id"],
                    session_id=session_id,
                ),
                bearer_token,
            )
            return result.output or ""

        async def run_workflow(workflow_ref: UUID, text: str, depth: int) -> str:
            child = await self._require(workflow_ref)
            if child["status"] != "Published":
                raise ServiceError(
                    "WORKFLOW_NOT_PUBLISHED",
                    "A sub-workflow must be published before it can run.",
                    409,
                )
            outcome = await execute_workflow(
                _definition(child),
                text,
                run_agent,
                run_workflow=run_workflow,
                depth=depth,
            )
            return outcome.output

        try:
            outcome = await execute_workflow(
                definition,
                stored["input"],
                run_agent,
                run_workflow=run_workflow,
                state=state,
                steps=steps,
                start_at=nxt,
            )
        except WorkflowPaused as paused:
            paused.state["__paused_node"] = paused.node_id
            await self._repository.finish_run(
                run_id,
                status="PAUSED",
                output="",
                error="",
                steps=paused.steps,
                state=paused.state,
            )
            return _response(
                run_id,
                workflow_id,
                "PAUSED",
                "",
                session_id,
                user_id,
                paused.steps,
                paused.state,
                paused.message,
            )
        except WorkflowRunError as exc:
            await self._repository.finish_run(
                run_id,
                status="FAILED",
                output="",
                error=exc.message,
                steps=exc.steps,
                state=exc.state,
            )
            raise
        await self._repository.finish_run(
            run_id,
            status="SUCCEEDED",
            output=outcome.output,
            error="",
            steps=outcome.steps,
            state=outcome.state,
        )
        return _response(
            run_id,
            workflow_id,
            "SUCCEEDED",
            outcome.output,
            session_id,
            user_id,
            outcome.steps,
            outcome.state,
        )


def _require_row(row):
    if row is None:
        raise ServiceError("NOT_FOUND", "Workflow not found.", 404)
    return row


def _definition(row) -> WorkflowDefinition:
    raw = row["definition"]
    if isinstance(raw, str):
        raw = json.loads(raw)
    return WorkflowDefinition.model_validate(raw)


def _response(
    run_id: UUID,
    workflow_id: UUID,
    status: str,
    output: str,
    session_id: str,
    user_id: str,
    steps: list[WorkflowStepTrace],
    state: dict,
    error: str = "",
) -> WorkflowRunResponse:
    return WorkflowRunResponse(
        workflow_run_id=run_id,
        workflow_id=workflow_id,
        status=status,
        output=output,
        error=error,
        session_id=session_id,
        user_id=user_id,
        steps=steps,
        state=state,
    )


def _json_dict(raw) -> dict:
    if isinstance(raw, str):
        raw = json.loads(raw)
    return dict(raw or {})


def _steps(raw) -> list[WorkflowStepTrace]:
    if isinstance(raw, str):
        raw = json.loads(raw)
    return [WorkflowStepTrace.model_validate(item) for item in (raw or [])]


def _response_from_row(row) -> WorkflowRunResponse:
    return _response(
        row["workflow_run_id"],
        row["workflow_id"],
        row["status"],
        row["output"] or "",
        row["session_id"] or "",
        row["user_id"] or "",
        _steps(row["steps"]),
        _json_dict(row["state"]),
        row["error"] or "",
    )


def _document(row) -> WorkflowDocument:
    row = _require_row(row)
    return WorkflowDocument(
        workflow_id=row["workflow_id"],
        name=row["name"],
        status=row["status"],
        updated_at=row["updated_at"],
        created_at=row["created_at"],
        definition=_definition(row),
    )



