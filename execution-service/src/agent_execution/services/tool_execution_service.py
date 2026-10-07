from __future__ import annotations

import json

from agent_execution.core.exceptions import ServiceError
from agent_execution.infrastructure.platform.platform_clients import PlatformClients
from agent_execution.schemas.runtime import KnowledgeBaseRef, RuntimeManifest, ToolType
from agent_execution.services.tool_definition_service import ToolDefinitionService
import httpx


class ToolExecutionService:
    def __init__(self, platform: PlatformClients) -> None:
        self._platform = platform

    async def run(
        self,
        manifest: RuntimeManifest,
        tool_name: str,
        arguments: dict,
        bearer_token: str | None,
        user_input: str,
    ) -> str:
        resolved = ToolDefinitionService.resolve_llm_tool_name(manifest, tool_name)
        if resolved is None:
            raise ServiceError("TOOL_ERROR", f"Unknown tool: {tool_name}", 400)
        kind, ref = resolved
        if kind == "kb":
            kb = ref
            assert isinstance(kb, KnowledgeBaseRef)
            query = arguments.get("query") or arguments.get("input") or user_input
            result = await self._platform.rag_ask.ask(kb.knowledge_base_id, query, bearer_token)
            return json.dumps(result.get("evidence", []), ensure_ascii=True)
        tool = ref
        if tool.tool_type == ToolType.REMOTE:
            # Remote tool: we need to discover the MCP server that hosts this tool.
            # 1. List all active remote MCP servers.
            # 2. For each server, fetch its detailed definition (including the tools it provides).
            # 3. Find the matching tool ID and obtain the server's base URL.
            # 4. POST the arguments directly to the server.

            server = await self._find_server_for_tool(tool.tool_id, bearer_token)
            base_url = server.get("remoteMcpServerUrl")
            if not base_url:
                raise ServiceError(
                    "TOOL_ERROR",
                    f"Server {server.get('id')} does not expose a remoteMcpServerUrl.",
                    400,
                )
            # Construct a simple invoke endpoint. The exact path depends on the remote MCP API;
            # we assume a generic convention: POST <base_url>/api/tools/{toolId}
            invoke_url = f"{base_url.rstrip('/')}/api/tools/{tool.tool_id}"
            result = await self._post_to_remote(invoke_url, bearer_token, arguments)
            return json.dumps(result, ensure_ascii=True)
        else:
            meta = await self._platform.tools.get_local_tool(tool.tool_id, bearer_token)
            url = meta.get("invokeUrl") or meta.get("endpoint") or meta.get("url")
            if not url:
                raise ServiceError("TOOL_ERROR", f"Tool {tool.tool_id} has no invoke URL.", 400)
            result = await self._platform.tools.invoke_tool(url, bearer_token, arguments)
            return json.dumps(result, ensure_ascii=True)

    # ---------------------------------------------------------------------
    # Helper methods for remote‑MCP tool discovery and invocation
    # ---------------------------------------------------------------------
    async def _find_server_for_tool(self, tool_id: str, bearer_token: str | None) -> dict:
        """Return the server JSON that contains the given ``tool_id``.

        The platform exposes two helper endpoints via ``ToolsConfigClient``:
        * ``list_active_servers`` – returns a list of server summaries (id, name …).
        * ``get_server_for_use`` – returns the full server description, including a
          ``tools`` array where each entry contains ``toolId`` (or ``id``).

        This function iterates over the active servers until it finds a match.
        If no server contains the tool, a ``ServiceError`` is raised.
        """
        # Step 1 – list servers
        active_servers = await self._platform.tools.list_active_servers(bearer_token)
        for srv in active_servers:
            srv_id = srv.get("id") or srv.get("serverId")
            if not srv_id:
                continue
            try:
                details = await self._platform.tools.get_server_for_use(
                    # ``srv_id`` may be a string; the client expects a UUID instance.
                    # Convert safely – if it fails, let the exception propagate as a
                    # ServiceError from the platform client.
                    uuid.UUID(str(srv_id)),
                    bearer_token,
                )
            except Exception as exc:
                # If a particular server cannot be fetched, skip it but continue
                # checking the others. This mirrors a tolerant discovery approach.
                continue
            for tool in details.get("tools", []):
                candidate_id = str(tool.get("toolId") or tool.get("id"))
                if candidate_id.lower() == str(tool_id).lower():
                    return details
        raise ServiceError(
            "TOOL_ERROR",
            f"Remote tool {tool_id} not found on any active MCP server.",
            404,
        )

    async def _post_to_remote(self, url: str, bearer_token: str | None, payload: dict) -> Any:
        """POST JSON ``payload`` to ``url`` using a short‑lived ``httpx.AsyncClient``.

        This mirrors the behavior of :meth:`BasePlatformClient._post_json` but works
        with an arbitrary absolute URL (the remote MCP server). SSL verification
        follows the same default as the rest of the code base (no verification unless
        the platform client is configured otherwise). For the purposes of unit
        testing we keep the client creation simple.
        """
        token = bearer_token  # In many cases the remote server expects the same token.
        headers = {"Accept": "application/json"}
        if token:
            headers["Authorization"] = f"Bearer {token}"
        async with httpx.AsyncClient(timeout=60.0) as client:
            response = await client.post(
                url,
                headers={**headers, "Content-Type": "application/json"},
                json=payload or {},
            )
        if response.status_code >= 400:
            raise ServiceError(
                "TOOL_ERROR",
                f"Remote MCP invoke failed ({response.status_code}): {response.text[:300]}",
                response.status_code,
            )
        try:
            return response.json()
        except Exception:
            return {"text": response.text}
