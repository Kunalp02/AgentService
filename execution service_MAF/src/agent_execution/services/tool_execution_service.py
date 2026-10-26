from __future__ import annotations

import json

from agent_execution.core.exceptions import ServiceError
from agent_execution.infrastructure.platform.platform_clients import PlatformClients
from agent_execution.schemas.runtime import (
    AgentToolRef,
    KnowledgeBaseRef,
    RuntimeManifest,
    ToolType,
)
from agent_execution.services.mcp_client_cache import McpClientCache
from agent_execution.services.mcp_tool_result import serialize_mcp_call_result
from agent_execution.services.tool_definition_service import ToolDefinitionService
from agent_execution.settings import Settings
from agent_execution.infrastructure.platform.local_tools_client import LocalToolsClient
import json


class ToolExecutionService:
    def __init__(
        self,
        platform: PlatformClients,
        settings: Settings,
        mcp_cache: McpClientCache,
        local_client: LocalToolsClient,
    ) -> None:
        self._platform = platform
        self._settings = settings
        self._mcp_cache = mcp_cache
        self._local_client = local_client

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
            result = await self._platform.rag_ask.ask(
                kb.knowledge_base_id, query, bearer_token
            )
            return json.dumps(result.get("evidence", []), ensure_ascii=True)

        tool = ref
        # assert isinstance(tool, AgentToolRef)
        # if tool.tool_type not in {ToolType.LOCAL, ToolType.REMOTE}:
        #     raise ServiceError(
        #         "TOOL_ERROR", f"Unsupported tool type for {tool.tool_id}.", 400
        #     )

        # connection = manifest.connection_for_tool(
        #     tool, local_mcp_url_fallback=self._settings.local_mcp_url
        # )
        # mcp_name = tool.resolved_mcp_tool_name()
        # mcp_result = await self._mcp_cache.call_tool(connection, mcp_name, arguments)
        # return serialize_mcp_call_result(mcp_result)
        tool = ref
        assert isinstance(tool, AgentToolRef)

        if tool.tool_type == ToolType.LOCAL:
            return await self._run_local(tool, arguments)

        # Remote tools: existing MCP path, unchanged
        connection = manifest.connection_for_tool(
            tool, local_mcp_url_fallback=self._settings.local_mcp_url
        )
        mcp_name = tool.resolved_mcp_tool_name()
        mcp_result = await self._mcp_cache.call_tool(connection, mcp_name, arguments)
        return serialize_mcp_call_result(mcp_result)

    async def _run_local(self, tool: AgentToolRef, arguments: dict) -> str:
        if self._local_client is None:
            raise ServiceError(
                "TOOL_ERROR", "Local tool execution is not configured.", 500
            )
        res = await self._local_client.invoke(
            tool.tool_id, json.dumps(arguments, ensure_ascii=True)
        )
        if not res.success:
            return json.dumps(
                {"error": True, "message": res.error or "Local tool failed."},
                ensure_ascii=True,
            )
        if isinstance(res.result, str):
            return res.result
        return json.dumps(res.result, ensure_ascii=True, default=str)



