from __future__ import annotations

import json
from uuid import UUID, uuid4

from agent_execution.core.exceptions import ServiceError
from agent_execution.infrastructure.persistence.workflow_repository import WorkflowRepository
from agent_execution.schemas.runs import CreateRunRequest
from agent_execution.schemas.threads import Channel, CreateThreadRequest, ExecutionType
from agent_execution.schemas.workflows import (
    WorkflowDefinition,
    WorkflowDocument,
    WorkflowRunRequest,
    WorkflowRunResponse,
    WorkflowSummary,
    WorkflowUpsert,
)
from agent_execution.services.agent_execution_service import AgentExecutionService
from agent_execution.services.thread_service import ThreadService
from agent_execution.services.workflow_engine import (
    WorkflowRunError,
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

        try:
            outcome = await execute_workflow(definition, body.input, run_agent)
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
        return WorkflowRunResponse(
            workflow_run_id=run_id,
            workflow_id=workflow_id,
            status="SUCCEEDED",
            output=outcome.output,
            session_id=session_id,
            user_id=user_id,
            steps=outcome.steps,
            state=outcome.state,
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
