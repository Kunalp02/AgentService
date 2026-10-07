from __future__ import annotations

import uuid

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
