from __future__ import annotations

from dataclasses import dataclass
from typing import Any
from uuid import UUID

import httpx

from agent_execution.core.exceptions import ServiceError
from agent_execution.settings import Settings

AUTH_FAILED_CODE = "TOOL_SERVICE_AUTH_FAILED"


@dataclass(frozen=True, slots=True)
class LocalToolResult:
    success: bool
    result: Any = None
    error: str | None = None


class LocalToolsClient:
    """Calls the tool execution service with X-Service-Key. No JWT involved."""

    def __init__(self, http: httpx.AsyncClient, settings: Settings) -> None:
        self._http = http
        self._base_url = settings.tool_execution_base_url.strip()
        self._service_key = settings.tool_execution_service_key
        self._timeout = settings.local_tool_timeout_seconds

    async def invoke(self, tool_id: UUID, arguments_json: str) -> LocalToolResult:
        if not self._base_url or not self._service_key:
            raise ServiceError(
                AUTH_FAILED_CODE,
                "TOOL_EXECUTION_BASE_URL / TOOL_EXECUTION_SERVICE_KEY are not configured.",
                500,
            )
        try:
            resp = await self._http.post(
                f"/api/v1/local-tools/{tool_id}/test",
                headers={
                    "X-Service-Key": self._service_key,
                    "Accept": "application/json",
                },
                json={"argumentsJson": arguments_json},
                timeout=self._timeout,
            )
        except httpx.HTTPError as exc:
            raise ServiceError(
                "TOOL_ERROR", f"Tool execution service unreachable: {exc}", 503
            ) from exc

        if resp.status_code in (401, 403):
            raise ServiceError(
                AUTH_FAILED_CODE,
                "Tool execution service rejected the service key.",
                502,
            )
        if resp.status_code == 404:
            return LocalToolResult(
                False, error=f"Local tool {tool_id} was not found or is not approved."
            )
        if resp.status_code >= 400:
            raise ServiceError(
                "TOOL_ERROR",
                f"Local tool {tool_id} failed ({resp.status_code}): {resp.text[:300]}",
                502,
            )

        body = resp.json()
        if not isinstance(body, dict):
            return LocalToolResult(True, result=body)
        return LocalToolResult(
            success=bool(body.get("success")),
            result=body.get("result"),
            error=body.get("error"),
        )



