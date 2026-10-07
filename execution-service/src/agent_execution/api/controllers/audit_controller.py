from __future__ import annotations
from datetime import datetime
from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, Query

from agent_execution.api.controller import ApiController
from agent_execution.api.dependencies import get_audit_service, get_bearer_token
from agent_execution.schemas.audit import AuditRunDetail, AuditRunPage
from agent_execution.services.audit_service import AuditService


class AuditController(ApiController):
    def register(self, router: APIRouter) -> None:
        router.get(
            "/agents/{agent_id}/audit/runs", response_model=AuditRunPage, tags=["audit"]
        )(self.list_runs)
        router.get(
            "/agents/{agent_id}/audit/runs/{run_id}",
            response_model=AuditRunDetail,
            tags=["audit"],
        )(self.get_run)

    async def list_runs(
        self,
        agent_id: UUID,
        service: Annotated[AuditService, Depends(get_audit_service)],
        token: Annotated[str, Depends(get_bearer_token)],
        status: str | None = Query(default=None),
        channel: str | None = Query(default=None),
        execution_type: str | None = Query(default=None, alias="executionType"),
        date_from: datetime | None = Query(default=None, alias="from"),
        date_to: datetime | None = Query(default=None, alias="to"),
        search: str | None = Query(default=None, max_length=200),
        limit: int = Query(default=25, ge=1, le=200),
        offset: int = Query(default=0, ge=0),
    ) -> AuditRunPage:
        return await service.list(
            agent_id,
            token,
            status=status.upper() if status else None,
            channel=channel.upper() if channel else None,
            execution_type=execution_type.upper() if execution_type else None,
            date_from=date_from,
            date_to=date_to,
            search=search,
            limit=limit,
            offset=offset,
        )

    async def get_run(
        self,
        agent_id: UUID,
        run_id: UUID,
        service: Annotated[AuditService, Depends(get_audit_service)],
        token: Annotated[str, Depends(get_bearer_token)],
    ) -> AuditRunDetail:
        return await service.get(agent_id, run_id, token)
