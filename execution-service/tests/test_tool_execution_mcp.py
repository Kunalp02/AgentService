"""FastMCP-based tool execution using manifest MCP connection details."""

from __future__ import annotations

import json
import uuid
from types import SimpleNamespace

import pytest

from agent_execution.schemas.runtime import (
    AgentMemoryScope,
    AgentToolRef,
    McpConnectionConfig,
    MemoryConfig,
    ModelConfig,
    RuntimeManifest,
    ToolType,
)
from agent_execution.services.mcp_client_cache import McpClientCache
from agent_execution.services.tool_execution_service import ToolExecutionService
from agent_execution.infrastructure.platform.platform_clients import PlatformClients


class _DummyMcpCache:
    def __init__(self) -> None:
        self.calls: list[tuple[McpConnectionConfig, str, dict]] = []

    async def call_tool(self, connection: McpConnectionConfig, tool_name: str, arguments: dict):
        self.calls.append((connection, tool_name, arguments))
        return SimpleNamespace(
            isError=False,
            structuredContent={"ok": True, "tool": tool_name},
            content=[],
        )


class _DummyPlatform:
    tools = None
    agent = None
    rag = None
    rag_ask = None


@pytest.fixture
def remote_manifest() -> RuntimeManifest:
    tool_id = uuid.UUID("a988ed0b-e35c-466b-a0e5-7e337cd1ec30")
    connection_id = uuid.UUID("11111111-1111-1111-1111-111111111111")
    return RuntimeManifest(
        agent_id=uuid.uuid4(),
        name="Test Agent",
        status="Published",
        system_prompt="You are helpful.",
        temperature=0.0,
        model=ModelConfig(model_id=uuid.uuid4(), model_identifier="gpt-4o-mini"),
        memory=MemoryConfig(enabled=False, scope=AgentMemoryScope.SESSION),
        tools=[
            AgentToolRef(
                tool_id=tool_id,
                tool_name="get_holdings_details",
                tool_type=ToolType.REMOTE,
                mcp_tool_name="get_holdings_details",
                connection_id=connection_id,
            )
        ],
        mcp_connections={
            str(connection_id): McpConnectionConfig(
                connection_id=connection_id,
                mcp_server_url="http://dummy-mcp/mcp",
                auth_option="ApiKey",
                api_key="secret-key",
            )
        },
    )


@pytest.mark.asyncio
async def test_remote_tool_uses_fastmcp_cache(remote_manifest: RuntimeManifest):
    cache = _DummyMcpCache()
    settings = SimpleNamespace(local_mcp_url="")
    service = ToolExecutionService(_DummyPlatform(), settings, cache)  # type: ignore[arg-type]

    result_json = await service.run(
        remote_manifest,
        "get_holdings_details",
        {"userId": 123},
        bearer_token=None,
        user_input="dummy",
    )
    result = json.loads(result_json)
    assert result["ok"] is True
    assert len(cache.calls) == 1
    connection, tool_name, payload = cache.calls[0]
    assert tool_name == "get_holdings_details"
    assert payload == {"userId": 123}
    assert connection.resolved_url() == "http://dummy-mcp/mcp"


def test_mcp_connection_cache_key_changes_with_credentials():
    settings = SimpleNamespace(
        mcp_client_cache_ttl_seconds=60,
        verify_ssl=False,
        mcp_tool_timeout_seconds=30.0,
    )
    cache = McpClientCache(settings)  # type: ignore[arg-type]
    base = McpConnectionConfig(mcp_server_url="http://localhost/mcp", auth_option="None")
    other = McpConnectionConfig(
        mcp_server_url="http://localhost/mcp",
        auth_option="ApiKey",
        api_key="x",
    )
    assert cache.connection_cache_key(base) != cache.connection_cache_key(other)
