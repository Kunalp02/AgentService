from __future__ import annotations

import logging
from typing import Annotated

from fastapi import APIRouter, Depends

from agent_execution.api.controller import ApiController
from agent_execution.api.dependencies import get_app_container
from agent_execution.core.container import ApplicationContainer
from agent_execution.core.exceptions import ServiceError
from agent_execution.settings import Settings, get_settings

logger = logging.getLogger(__name__)


class HealthController(ApiController):
    def register(self, router: APIRouter) -> None:
        router.get("/health/live", tags=["health"])(self.live)
        router.get("/health/ready", tags=["health"])(self.ready)

    async def live(self, settings: Annotated[Settings, Depends(get_settings)]) -> dict:
        return {
            "status": "ok",
            "service": settings.app_name,
            "runtime": "langgraph",
            "maxInflightRuns": settings.max_inflight_runs,
        }

    async def ready(self, container: Annotated[ApplicationContainer, Depends(get_app_container)]) -> dict:
        try:
            await container.database.ping()
        except Exception as exc:
            logger.exception("readiness.failed")
            raise ServiceError("NOT_READY", "Database is unavailable.", 503) from exc
        return {"status": "ok"}
