"""Tests for the *remote MCP discovery* flow added to ``ToolExecutionService``.

The test creates a minimal ``RuntimeManifest`` containing a single remote tool.
It supplies a dummy ``PlatformClients`` implementation that returns a static
active‑server list and a static server description (including the remote tool).
The ``_post_to_remote`` method of ``ToolExecutionService`` is monkey‑patched so
that no real HTTP request is performed – it simply records the URL it would have
called and returns a known payload.
"""

from __future__ import annotations

import uuid
import json
import pytest

from agent_execution.schemas.runtime import (
    RuntimeManifest,
    ModelConfig,
    AgentMemoryScope,
    KnowledgeBaseMode,
    KnowledgeBaseRef,
    MemoryConfig,
    AgentToolRef,
    ToolType,
)
from agent_execution.services.tool_execution_service import ToolExecutionService
from agent_execution.infrastructure.platform.platform_clients import PlatformClients


class DummyToolsClient:
    """A tiny stub that mimics the few methods used by ``ToolExecutionService``.

    It returns a single active server whose ``tools`` array contains the remote
    tool with the same ID we place in the manifest.
    """

    async def list_active_servers(self, bearer_token: str | None):  # noqa: D401
        """Return a list with one server entry (UUID as a string)."""
        return [{"id": "11111111-1111-1111-1111-111111111111"}]

    async def get_server_for_use(self, server_id: uuid.UUID, bearer_token: str | None):  # noqa: D401
        """Return a server description that includes the remote tool.

        ``remoteMcpServerUrl`` is a dummy URL – the actual network call is later
        intercepted by the monkey‑patched ``_post_to_remote`` method.
        """
        return {
            "id": str(server_id),
            "remoteMcpServerUrl": "http://dummy-mcp",
            "tools": [
                {
                    "toolId": str(self.remote_tool_id),
                    "toolName": "get_holdings_details",
                }
            ],
        }

    # The following two methods are required for the codepath that handles
    # *local* tools. They will never be called in this test but we provide a
    # minimal implementation to satisfy the type checker.
    async def get_local_tool(self, tool_id: uuid.UUID, bearer_token: str | None):  # pragma: no cover
        return {}

    async def get_remote_tool(self, tool_id: uuid.UUID, bearer_token: str | None):  # pragma: no cover
        return {}

    async def invoke_tool(self, url: str, bearer_token: str | None, payload: dict):  # pragma: no cover
        return {}


class DummyPlatformClients:
    def __init__(self, tools_client: DummyToolsClient) -> None:
        self.tools = tools_client
        # The other client attributes are not used in this test but the dataclass
        # requires them, so we provide simple placeholders.
        self.agent = None  # type: ignore
        self.rag = None  # type: ignore
        self.rag_ask = None  # type: ignore


@pytest.fixture
def manifest() -> RuntimeManifest:
    tool_id = uuid.UUID("a988ed0b-e35c-466b-a0e5-7e337cd1ec30")
    # Attach the tool ID to the DummyToolsClient so that ``get_server_for_use``
    # can reference it.
    DummyToolsClient.remote_tool_id = tool_id
    return RuntimeManifest(
        agent_id=uuid.uuid4(),
        name="Test Agent",
        status="Published",
        system_prompt="You are helpful.",
        temperature=0.0,
        model=ModelConfig(
            model_id=uuid.uuid4(),
            model_identifier="gpt-4o-mini",
        ),
        memory=MemoryConfig(enabled=False, scope=AgentMemoryScope.SESSION),
        tools=[
            AgentToolRef(
                tool_id=tool_id,
                tool_name="get_holdings_details",
                tool_type=ToolType.REMOTE,
            )
        ],
        knowledge_bases=[],
        group_ids=[],
        manifest_hash="",
    )


@pytest.mark.asyncio
async def test_remote_tool_discovery_and_invocation(manifest: RuntimeManifest):
    # Build the service with our dummy platform client.
    platform = DummyPlatformClients(DummyToolsClient())
    service = ToolExecutionService(platform)

    # Patch ``_post_to_remote`` so that no real network request is made.
    captured = {}

    async def fake_post(url: str, bearer_token: str | None, payload: dict):  # noqa: D401
        """Record the arguments and return a deterministic payload."""
        captured["url"] = url
        captured["payload"] = payload
        return {"status": "ok"}

    service._post_to_remote = fake_post  # type: ignore[assignment]

    # Run the tool – we use the tool *name* that the LLM would send. The resolver
    # matches on the UUID string as a fallback, so passing the UUID works.
    result_json = await service.run(
        manifest,
        str(manifest.tools[0].tool_id),  # tool name (fallback to ID)
        {"userId": 123},
        bearer_token=None,
        user_input="dummy",
    )

    # ``result_json`` is a JSON string produced by ``json.dumps`` in the service.
    result = json.loads(result_json)
    assert result == {"status": "ok"}

    # Verify that the URL the service attempted to call follows the convention
    # ``<base>/api/tools/<toolId>``.
    expected_url = "http://dummy-mcp/api/tools/a988ed0b-e35c-466b-a0e5-7e337cd1ec30"
    assert captured["url"] == expected_url