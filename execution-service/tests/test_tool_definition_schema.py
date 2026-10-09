from __future__ import annotations

import uuid

import pytest

from agent_execution.core.exceptions import ServiceError
from agent_execution.schemas.runtime import AgentToolRef, ModelConfig, RuntimeManifest, ToolType
from agent_execution.services.tool_definition_service import ToolDefinitionService


def test_openai_tool_uses_manifest_input_schema():
    manifest = RuntimeManifest(
        agent_id=uuid.uuid4(),
        name="Agent",
        status="Published",
        system_prompt="sys",
        model=ModelConfig(model_id=uuid.uuid4(), model_identifier="gpt-4o-mini"),
        tools=[
            AgentToolRef(
                tool_id=uuid.uuid4(),
                tool_name="lookup",
                tool_type=ToolType.LOCAL,
                input_schema={
                    "type": "object",
                    "properties": {"symbol": {"type": "string"}},
                    "required": ["symbol"],
                },
            )
        ],
    )
    tools = ToolDefinitionService.build_openai_tools(manifest)
    params = tools[0]["function"]["parameters"]
    assert params["required"] == ["symbol"]
    assert "symbol" in params["properties"]


def test_nested_remote_server_url_is_bound_onto_the_tool():
    remote_id = uuid.UUID("4186ee92-ad9a-4202-9bc2-0e4ee5a486be")
    local_id = uuid.UUID("cf0f8d86-4e80-4a85-b8f2-376bc3e09f84")
    manifest = RuntimeManifest.model_validate(
        {
            "agentId": str(uuid.uuid4()),
            "name": "Monitoring Agent",
            "status": "Published",
            "systemPrompt": "You are a helpful assistant.",
            "model": {
                "modelId": str(uuid.uuid4()),
                "modelIdentifier": "vllm/gpt-oss-120b",
            },
            "tools": [
                {
                    "toolId": str(local_id),
                    "toolName": "PrimeNumberTool",
                    "toolType": "Local",
                }
            ],
            "remoteMcpServers": [
                {
                    "id": "9d15da89-29b9-4558-8e48-2453a494462e",
                    "name": "Simple Remote MCP",
                    "remoteMcpServerUrl": "http://172.19.204.25:8005/mcp",
                    "transportType": "StreamableHttp",
                    "authOption": "None",
                    "tools": [
                        {"toolId": str(remote_id), "toolName": "calculate_dog_years"}
                    ],
                }
            ],
        }
    )
    remote = manifest.remote_mcp_servers[0].tools[0]
    connection = manifest.connection_for_tool(remote, local_mcp_url_fallback="")
    assert connection.resolved_url() == "http://172.19.204.25:8005/mcp"
    with pytest.raises(ServiceError) as exc:
        manifest.connection_for_tool(manifest.tools[0], local_mcp_url_fallback="")
    assert "PrimeNumberTool" in str(exc.value)
