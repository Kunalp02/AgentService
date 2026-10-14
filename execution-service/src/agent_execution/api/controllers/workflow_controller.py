from __future__ import annotations

from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends

from agent_execution.api.controller import ApiController
from agent_execution.api.dependencies import (
    get_bearer_token,
    get_platform_principal,
    get_workflow_service,
)
from agent_execution.schemas.workflows import (
    WorkflowDocument,
    WorkflowRunRequest,
    WorkflowRunResponse,
    WorkflowSummary,
    WorkflowUpsert,
)
from agent_execution.services.workflow_service import WorkflowService
from platform_auth import PlatformPrincipal


class WorkflowController(ApiController):
    def register(self, router: APIRouter) -> None:
        router.post("/workflows", response_model=WorkflowDocument, tags=["workflows"])(self.create)
        router.get("/workflows", response_model=list[WorkflowSummary], tags=["workflows"])(self.list_workflows)
        router.get("/workflows/{workflow_id}", response_model=WorkflowDocument, tags=["workflows"])(self.get)
        router.put("/workflows/{workflow_id}", response_model=WorkflowDocument, tags=["workflows"])(self.update)
        router.post("/workflows/{workflow_id}/publish", response_model=WorkflowDocument, tags=["workflows"])(self.publish)
        router.post("/workflows/{workflow_id}/unpublish", response_model=WorkflowDocument, tags=["workflows"])(self.unpublish)
        router.post("/workflows/{workflow_id}/runs", response_model=WorkflowRunResponse, tags=["workflows"])(self.run)

    async def create(
        self,
        body: WorkflowUpsert,
        service: Annotated[WorkflowService, Depends(get_workflow_service)],
        _: Annotated[str, Depends(get_bearer_token)],
    ) -> WorkflowDocument:
        return await service.create(body)

    async def list_workflows(
        self,
        service: Annotated[WorkflowService, Depends(get_workflow_service)],
        _: Annotated[str, Depends(get_bearer_token)],
    ) -> list[WorkflowSummary]:
        return await service.list_workflows()

    async def get(
        self,
        workflow_id: UUID,
        service: Annotated[WorkflowService, Depends(get_workflow_service)],
        _: Annotated[str, Depends(get_bearer_token)],
    ) -> WorkflowDocument:
        return await service.get(workflow_id)

    async def update(
        self,
        workflow_id: UUID,
        body: WorkflowUpsert,
        service: Annotated[WorkflowService, Depends(get_workflow_service)],
        _: Annotated[str, Depends(get_bearer_token)],
    ) -> WorkflowDocument:
        return await service.update(workflow_id, body)

    async def publish(
        self,
        workflow_id: UUID,
        service: Annotated[WorkflowService, Depends(get_workflow_service)],
        _: Annotated[str, Depends(get_bearer_token)],
    ) -> WorkflowDocument:
        return await service.publish(workflow_id, True)

    async def unpublish(
        self,
        workflow_id: UUID,
        service: Annotated[WorkflowService, Depends(get_workflow_service)],
        _: Annotated[str, Depends(get_bearer_token)],
    ) -> WorkflowDocument:
        return await service.publish(workflow_id, False)

    async def run(
        self,
        workflow_id: UUID,
        body: WorkflowRunRequest,
        service: Annotated[WorkflowService, Depends(get_workflow_service)],
        token: Annotated[str, Depends(get_bearer_token)],
        principal: Annotated[PlatformPrincipal, Depends(get_platform_principal)],
    ) -> WorkflowRunResponse:
        triggered_by = principal.username or principal.user_id or principal.subject
        return await service.run(workflow_id, body, token, triggered_by)
