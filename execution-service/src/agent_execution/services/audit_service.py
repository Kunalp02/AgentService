from __future__ import annotations
import json
from datetime import datetime
from uuid import UUID

from agent_execution.core.exceptions import ServiceError
from agent_execution.infrastructure.persistence.run_repository import RunRepository
from agent_execution.schemas.audit import AuditRunDetail, AuditRunItem, AuditRunPage
from agent_execution.services.thread_service import ThreadService


def _json(value, fallback):
    if value is None:
        return fallback
    return json.loads(value) if isinstance(value, str) else value


class AuditService:
    def __init__(self, runs: RunRepository, threads: ThreadService) -> None:
        self._runs = runs
        self._threads = threads

    async def list(
        self,
        agent_id: UUID,
        token: str | None,
        *,
        status: str | None,
        channel: str | None,
        execution_type: str | None,
        date_from: datetime | None,
        date_to: datetime | None,
        search: str | None,
        limit: int,
        offset: int,
    ) -> AuditRunPage:
        await self._threads.authorize_agent(agent_id, token)
        rows, total = await self._runs.list_for_audit(
            agent_id,
            status=status,
            channel=channel,
            execution_type=execution_type,
            date_from=date_from,
            date_to=date_to,
            search=(search or "").strip() or None,
            limit=limit,
            offset=offset,
        )
        return AuditRunPage(
            items=[AuditRunItem(**dict(r)) for r in rows],
            total=total,
            limit=limit,
            offset=offset,
        )

    async def get(
        self, agent_id: UUID, run_id: UUID, token: str | None
    ) -> AuditRunDetail:
        await self._threads.authorize_agent(agent_id, token)
        row = await self._runs.get_for_audit(run_id)
        if row is None or row["agent_id"] != agent_id:
            raise ServiceError("NOT_FOUND", "Run not found.", 404)
        data = dict(row)
        data["steps"] = [str(s) for s in _json(data["steps"], [])]
        data["retrieved_context"] = _json(data["retrieved_context"], [])
        data["tool_calls"] = _json(data["tool_calls"], [])
        return AuditRunDetail(**data)
