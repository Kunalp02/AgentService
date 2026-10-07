"""Tests for the new remote MCP server helper methods in ``ToolsConfigClient``.

The ``ToolsConfigClient`` communicates with the platform via an ``httpx.AsyncClient``.
For unit testing we replace the real HTTP client with a lightweight dummy that
returns static ``httpx.Response`` objects. This avoids network calls and keeps the
tests fast and deterministic.
"""

from __future__ import annotations

import uuid

import pytest
import httpx

from agent_execution.infrastructure.platform.tools_config_client import ToolsConfigClient


class DummyAsyncClient:
    """A minimal async HTTP client that mimics the ``httpx.AsyncClient`` API used
    by ``BasePlatformClient``. It returns pre‑canned JSON responses based on the
    request path.
    """

    async def get(self, path: str, headers: dict | None = None) -> httpx.Response:  # noqa: D401
        """Return a stubbed ``Response`` for the supported MCP endpoints.

        * ``/remote-mcp-servers/active`` – returns a list with a single server.
        * ``/remote-mcp-servers/<uuid>/for-use`` – returns a dict containing the
          same server data plus an empty ``tools`` list.
        """
        if path.endswith("/remote-mcp-servers/active"):
            return httpx.Response(200, json=[{"id": "test-id", "name": "test-server"}])
        if path.endswith("/for-use"):
            return httpx.Response(200, json={"id": "test-id", "tools": []})
        # Any unexpected path – simulate a 404 so the client raises ServiceError.
        return httpx.Response(404, json={})

    # The ``invoke_tool`` method in ``ToolsConfigClient`` uses ``post``; provide a
    # no‑op implementation to satisfy the type checker.
    async def post(self, *args, **kwargs):  # pragma: no cover
        return httpx.Response(200, json={})

    async def aclose(self):  # pragma: no cover
        pass


@pytest.fixture
def tools_client() -> ToolsConfigClient:
    """Create a ``ToolsConfigClient`` wired to the ``DummyAsyncClient``.

    The second argument is a ``ServiceAuthTokenProvider``; ``None`` is fine for
    these tests because token resolution is not exercised.
    """
    return ToolsConfigClient(DummyAsyncClient(), None)


@pytest.mark.asyncio
async def test_list_active_servers(tools_client: ToolsConfigClient) -> None:
    """Verify that ``list_active_servers`` returns the stubbed list of servers."""
    servers = await tools_client.list_active_servers(bearer_token=None)
    assert isinstance(servers, list)
    assert servers[0]["id"] == "test-id"
    assert servers[0]["name"] == "test-server"


@pytest.mark.asyncio
async def test_get_server_for_use(tools_client: ToolsConfigClient) -> None:
    """Verify that ``get_server_for_use`` returns detailed server data.

    The UUID is irrelevant because the dummy client ignores it and always returns
    the same payload.
    """
    server_id = uuid.UUID("00000000-0000-0000-0000-000000000001")
    data = await tools_client.get_server_for_use(server_id, bearer_token=None)
    assert isinstance(data, dict)
    assert data["id"] == "test-id"
    assert data["tools"] == []
