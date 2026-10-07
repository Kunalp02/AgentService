from __future__ import annotations

import asyncio
import hashlib
import json
import logging
import time
from dataclasses import dataclass
from typing import Any

from fastmcp import Client
from fastmcp.client.transports import StreamableHttpTransport

from agent_execution.schemas.runtime import McpConnectionConfig
from agent_execution.settings import Settings

logger = logging.getLogger(__name__)


@dataclass(slots=True)
class _CachedMcpSession:
    client: Client
    expires_at: float


class McpClientCache:
    """Reuse FastMCP Streamable HTTP sessions per connection fingerprint for a TTL."""

    def __init__(self, settings: Settings) -> None:
        self._ttl = max(1, settings.mcp_client_cache_ttl_seconds)
        self._verify_ssl = settings.verify_ssl
        self._timeout = settings.mcp_tool_timeout_seconds
        self._entries: dict[str, _CachedMcpSession] = {}
        self._locks: dict[str, asyncio.Lock] = {}
        self._call_semaphores: dict[str, asyncio.Semaphore] = {}

    def _lock_for(self, key: str) -> asyncio.Lock:
        if key not in self._locks:
            self._locks[key] = asyncio.Lock()
        return self._locks[key]

    def _semaphore_for(self, key: str) -> asyncio.Semaphore:
        if key not in self._call_semaphores:
            self._call_semaphores[key] = asyncio.Semaphore(1)
        return self._call_semaphores[key]

    @staticmethod
    def connection_cache_key(connection: McpConnectionConfig) -> str:
        material = {
            "url": connection.resolved_url(),
            "auth": connection.auth_option,
            "api_key": connection.api_key or "",
            "api_key_header": connection.api_key_header or "",
            "bearer": connection.bearer_token or "",
        }
        raw = json.dumps(material, sort_keys=True)
        return hashlib.sha256(raw.encode()).hexdigest()

    def _build_transport(self, connection: McpConnectionConfig) -> StreamableHttpTransport:
        return StreamableHttpTransport(
            url=connection.resolved_url(),
            headers=connection.auth_headers(),
            verify=self._verify_ssl,
        )

    async def call_tool(
        self,
        connection: McpConnectionConfig,
        tool_name: str,
        arguments: dict[str, Any] | None,
    ) -> Any:
        key = self.connection_cache_key(connection)
        sem = self._semaphore_for(key)
        async with sem:
            client = await self._client_for(connection, key)
            return await client.call_tool_mcp(
                tool_name,
                arguments or {},
                timeout=self._timeout,
            )

    async def _client_for(self, connection: McpConnectionConfig, key: str) -> Client:
        lock = self._lock_for(key)
        async with lock:
            now = time.monotonic()
            entry = self._entries.get(key)
            if entry is not None and now < entry.expires_at:
                return entry.client
            if entry is not None:
                await self._disconnect(entry.client)
            transport = self._build_transport(connection)
            client = Client(transport)
            await client.__aenter__()
            self._entries[key] = _CachedMcpSession(client, now + self._ttl)
            return client

    @staticmethod
    async def _disconnect(client: Client) -> None:
        try:
            await client.__aexit__(None, None, None)
        except Exception:
            logger.warning("Failed to close MCP client session", exc_info=True)

    async def aclose(self) -> None:
        for entry in list(self._entries.values()):
            await self._disconnect(entry.client)
        self._entries.clear()
