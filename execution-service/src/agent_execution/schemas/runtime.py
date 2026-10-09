from __future__ import annotations

import json
from enum import Enum
from typing import Any
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, model_validator

from agent_execution.core.exceptions import ServiceError


class AgentMemoryScope(str, Enum):
    SESSION = "Session"
    USER = "User"
    AGENT = "Agent"
    ORGANIZATION = "Organization"


class KnowledgeBaseMode(str, Enum):
    CONTEXT = "Context"
    TOOL = "Tool"


class ToolType(str, Enum):
    REMOTE = "Remote"
    LOCAL = "Local"


class McpConnectionConfig(BaseModel):
    """Streamable HTTP MCP endpoint and credentials from the runtime manifest."""

    model_config = ConfigDict(populate_by_name=True)

    connection_id: UUID | None = Field(default=None, alias="connectionId")
    mcp_server_url: str | None = Field(default=None, alias="mcpServerUrl")
    transport_type: str | None = Field(default="StreamableHttp", alias="transportType")
    auth_option: str = Field(default="None", alias="authOption")
    api_key: str | None = Field(default=None, alias="apiKey")
    api_key_header: str | None = Field(default=None, alias="apiKeyHeader")
    bearer_token: str | None = Field(default=None, alias="bearerToken")

    @model_validator(mode="before")
    @classmethod
    def _normalize_payload(cls, data: Any) -> Any:
        if not isinstance(data, dict):
            return data
        url = (
            data.get("mcpServerUrl")
            or data.get("remoteMcpServerUrl")
            or data.get("mcpUrl")
            or data.get("url")
        )
        if url and not data.get("mcpServerUrl"):
            data = {**data, "mcpServerUrl": url}
        return data

    def resolved_url(self) -> str:
        url = (self.mcp_server_url or "").strip()
        if not url:
            raise ServiceError("TOOL_ERROR", "MCP connection is missing mcpServerUrl.", 400)
        return url.rstrip("/")

    def auth_headers(self) -> dict[str, str]:
        option = (self.auth_option or "None").strip()
        headers: dict[str, str] = {}
        if option == "ApiKey":
            secret = self.api_key
            if not secret:
                raise ServiceError("TOOL_ERROR", "MCP connection requires apiKey for ApiKey auth.", 400)
            header = (self.api_key_header or "X-API-Key").strip() or "X-API-Key"
            headers[header] = secret
        elif option in {"SessionToken", "Bearer"}:
            token = self.bearer_token or self.api_key
            if not token:
                raise ServiceError(
                    "TOOL_ERROR",
                    "MCP connection requires a bearer token for SessionToken auth.",
                    400,
                )
            headers["Authorization"] = f"Bearer {token}"
        return headers


class AgentToolRef(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    tool_id: UUID = Field(alias="toolId")
    tool_name: str | None = Field(default=None, alias="toolName")
    tool_type: ToolType = Field(alias="toolType")
    mcp_tool_name: str | None = Field(default=None, alias="mcpToolName")
    description: str | None = None
    input_schema: dict[str, Any] | None = Field(default=None, alias="inputSchema")
    input_schema_json: str | None = Field(default=None, alias="inputSchemaJson")
    connection_id: UUID | None = Field(default=None, alias="connectionId")
    connection: McpConnectionConfig | None = None

    def resolved_mcp_tool_name(self) -> str:
        name = (self.mcp_tool_name or self.tool_name or "").strip()
        if name:
            return name
        raise ServiceError(
            "TOOL_ERROR",
            f"Tool {self.tool_id} is missing mcpToolName/toolName for MCP invocation.",
            400,
        )

    def resolved_input_schema(self) -> dict[str, Any] | None:
        if self.input_schema:
            return self.input_schema
        raw = self.input_schema_json
        if not raw:
            return None
        try:
            parsed = json.loads(raw)
        except json.JSONDecodeError:
            return None
        if isinstance(parsed, dict) and parsed.get("type") == "object":
            return parsed
        if isinstance(parsed, dict) and "schema" in parsed and isinstance(parsed["schema"], dict):
            return parsed["schema"]
        return parsed if isinstance(parsed, dict) else None


class KnowledgeBaseRef(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    knowledge_base_id: UUID = Field(alias="knowledgeBaseId")
    knowledge_base_name: str | None = Field(default=None, alias="knowledgeBaseName")
    mode: KnowledgeBaseMode


class MemoryConfig(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    enabled: bool = False
    scope: AgentMemoryScope | None = None
    retention: str | None = None
    instructions: str | None = None
    max_turn_pairs_in_prompt: int | None = Field(default=None, alias="maxTurnPairsInPrompt")
    max_chars_in_prompt: int | None = Field(default=None, alias="maxCharsInPrompt")


class ModelConfig(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    model_id: UUID = Field(alias="modelId")
    name: str | None = None
    model_identifier: str = Field(alias="modelIdentifier")
    provider: str = "openai"
    base_url: str | None = Field(default=None, alias="baseUrl")
    group_ids: list[UUID] = Field(default_factory=list, alias="groupIds")
    gateway_id: UUID | None = Field(default=None, alias="gatewayId")
    api_key: str | None = Field(default=None, alias="apiKey")


class RemoteMcpServerConfig(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    id: UUID
    name: str | None = None
    remote_mcp_server_url: str | None = Field(default=None, alias="remoteMcpServerUrl")
    transport_type: str | None = Field(default=None, alias="transportType")
    auth_option: str | None = Field(default=None, alias="authOption")
    api_key: str | None = Field(default=None, alias="apiKey")
    group_ids: list[UUID] = Field(default_factory=list, alias="groupIds")
    tools: list[AgentToolRef] = Field(default_factory=list)

    @model_validator(mode="before")
    @classmethod
    def _default_nested_tool_type(cls, data: Any) -> Any:
        if not isinstance(data, dict):
            return data
        tools = data.get("tools")
        if tools is None:
            tools = data.get("Tools")
        if not isinstance(tools, list):
            return data
        normalized: list[Any] = []
        for tool in tools:
            if isinstance(tool, dict) and not (tool.get("toolType") or tool.get("tool_type")):
                tool = {**tool, "toolType": "Remote"}
            normalized.append(tool)
        return {**data, "tools": normalized}


class RuntimeManifest(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    agent_id: UUID = Field(alias="agentId")
    name: str
    status: str
    group_ids: list[UUID] = Field(default_factory=list, alias="groupIds")
    system_prompt: str = Field(alias="systemPrompt")
    temperature: float = 0.7
    model: ModelConfig
    tools: list[AgentToolRef] = Field(default_factory=list)
    remote_mcp_servers: list[RemoteMcpServerConfig] = Field(default_factory=list, alias="remoteMcpServers")
    knowledge_bases: list[KnowledgeBaseRef] = Field(default_factory=list, alias="knowledgeBases")
    memory: MemoryConfig = Field(default_factory=MemoryConfig)
    manifest_hash: str = Field(default="", alias="manifestHash")
    revision_id: UUID | None = None
    mcp_connections: dict[str, McpConnectionConfig] = Field(default_factory=dict, alias="mcpConnections")
    local_mcp_connection: McpConnectionConfig | None = Field(default=None, alias="localMcpConnection")

    @model_validator(mode="before")
    @classmethod
    def _normalize_mcp_connections(cls, data: Any) -> Any:
        if not isinstance(data, dict):
            return data
        raw = data.get("mcpConnections")
        if isinstance(raw, list):
            mapped: dict[str, McpConnectionConfig] = {}
            for item in raw:
                conn = McpConnectionConfig.model_validate(item)
                conn_id = conn.connection_id
                if conn_id is None and isinstance(item, dict):
                    conn_id = item.get("connectionId") or item.get("id")
                if conn_id is not None:
                    mapped[str(conn_id)] = conn
            data = {**data, "mcpConnections": mapped}
        return data

    @model_validator(mode="after")
    def _bind_remote_tool_connections(self) -> RuntimeManifest:
        """Copy each remote server URL onto its tools so execution does not depend on a second lookup."""
        for server in self.remote_mcp_servers:
            url = (server.remote_mcp_server_url or "").strip()
            if not url:
                continue
            bound = McpConnectionConfig(
                mcp_server_url=url,
                transport_type=server.transport_type or "StreamableHttp",
                auth_option=server.auth_option or "None",
                api_key=server.api_key,
            )
            for tool in server.tools:
                tool.tool_type = ToolType.REMOTE
                if tool.connection is None:
                    tool.connection = bound
        return self

    @property
    def is_published(self) -> bool:
        return self.status.lower() == "published"

    @property
    def has_tools(self) -> bool:
        tool_mode_kbs = any(kb.mode == KnowledgeBaseMode.TOOL for kb in self.knowledge_bases)
        remote_tools = any(server.tools for server in self.remote_mcp_servers)
        return bool(self.tools) or remote_tools or tool_mode_kbs

    def connection_for_tool(
        self, tool: AgentToolRef, *, local_mcp_url_fallback: str | None = None
    ) -> McpConnectionConfig:
        if tool.connection is not None:
            return tool.connection
        if tool.connection_id is not None:
            key = str(tool.connection_id)
            shared = self.mcp_connections.get(key)
            if shared is not None:
                return shared
        wanted = str(tool.tool_id).lower()
        for server in self.remote_mcp_servers:
            if not any(str(entry.tool_id).lower() == wanted for entry in server.tools):
                continue
            if server.remote_mcp_server_url:
                return McpConnectionConfig(
                    mcp_server_url=server.remote_mcp_server_url,
                    transport_type=server.transport_type or "StreamableHttp",
                    auth_option=server.auth_option or "None",
                    api_key=server.api_key,
                )
        if tool.tool_type == ToolType.LOCAL:
            if self.local_mcp_connection is not None:
                return self.local_mcp_connection
            fallback = (local_mcp_url_fallback or "").strip()
            if fallback:
                return McpConnectionConfig(mcp_server_url=fallback)
        label = tool.tool_name or str(tool.tool_id)
        raise ServiceError(
            "TOOL_ERROR",
            f"Tool {label} ({tool.tool_id}, {tool.tool_type.value}) has no MCP connection in the runtime manifest.",
            400,
        )
