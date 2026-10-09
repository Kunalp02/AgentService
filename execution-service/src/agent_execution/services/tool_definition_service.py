from __future__ import annotations

from typing import Any, Literal

from agent_execution.schemas.runtime import (
    AgentToolRef,
    KnowledgeBaseMode,
    KnowledgeBaseRef,
    RemoteMcpServerConfig,
    RuntimeManifest,
)


class ToolDefinitionService:
    @staticmethod
    def build_openai_tools(manifest: RuntimeManifest) -> list[dict[str, Any]]:
        tools: list[dict[str, Any]] = []
        for tool in ToolDefinitionService.iter_tools(manifest):
            name = ToolDefinitionService.sanitize_name(tool.tool_name or str(tool.tool_id))
            schema = tool.resolved_input_schema()
            parameters = schema or {
                "type": "object",
                "properties": {
                    "input": {"type": "string", "description": "Primary input for the tool."}
                },
                "additionalProperties": True,
            }
            description = (
                tool.description
                or f"Invoke configured tool {tool.tool_name or tool.tool_id}."
            )
            tools.append(
                {
                    "type": "function",
                    "function": {
                        "name": name,
                        "description": description,
                        "parameters": parameters,
                    },
                }
            )
        for kb in manifest.knowledge_bases:
            if kb.mode != KnowledgeBaseMode.TOOL:
                continue
            name = ToolDefinitionService.sanitize_name(kb.knowledge_base_name or f"kb_{kb.knowledge_base_id}")
            tools.append(
                {
                    "type": "function",
                    "function": {
                        "name": name,
                        "description": f"Search knowledge base {kb.knowledge_base_name or kb.knowledge_base_id}.",
                        "parameters": {
                            "type": "object",
                            "properties": {
                                "query": {"type": "string", "description": "Search query."}
                            },
                            "required": ["query"],
                        },
                    },
                }
            )
        return tools

    @staticmethod
    def sanitize_name(raw: str) -> str:
        cleaned = "".join(ch if ch.isalnum() or ch in {"_", "-"} else "_" for ch in raw.strip())
        return cleaned[:64] or "tool"

    @staticmethod
    def iter_tools(manifest: RuntimeManifest) -> list[AgentToolRef]:
        nested = [tool for server in manifest.remote_mcp_servers for tool in server.tools]
        return [*manifest.tools, *nested]

    @staticmethod
    def find_remote_server(
        manifest: RuntimeManifest, tool_id
    ) -> RemoteMcpServerConfig | None:
        wanted = str(tool_id).lower()
        for server in manifest.remote_mcp_servers:
            if any(str(tool.tool_id).lower() == wanted for tool in server.tools):
                return server
        return None

    @staticmethod
    def canonical_name(raw: str) -> str:
        name = raw.strip().lower()
        for prefix in ("functions.", "function.", "tools.", "tool."):
            if name.startswith(prefix):
                name = name[len(prefix) :]
                break
        return "".join(ch for ch in name if ch.isalnum())

    @staticmethod
    def tool_catalog(manifest: RuntimeManifest) -> str:
        lines: list[str] = []
        for tool in ToolDefinitionService.iter_tools(manifest):
            name = ToolDefinitionService.sanitize_name(tool.tool_name or str(tool.tool_id))
            schema = tool.resolved_input_schema()
            parameters = schema if schema else {"type": "object", "additionalProperties": True}
            description = tool.description or f"Invoke {name}."
            lines.append(
                f"- {name}: {description} parameters={parameters}"
            )
        for kb in manifest.knowledge_bases:
            if kb.mode != KnowledgeBaseMode.TOOL:
                continue
            name = ToolDefinitionService.sanitize_name(
                kb.knowledge_base_name or f"kb_{kb.knowledge_base_id}"
            )
            lines.append(f"- {name}: Search this knowledge base. parameters={{'query': string}}")
        if not lines:
            return ""
        return (
            "Available tools:\n"
            + "\n".join(lines)
            + "\nWhen a tool can answer the request, call it. "
            "Do not invent tool results. If the model interface does not return a native tool call, "
            'reply with only <tool_call>{"name":"<tool_name>","arguments":{}}</tool_call>.'
        )

    @staticmethod
    def resolve_llm_tool_name(
        manifest: RuntimeManifest, llm_name: str
    ) -> tuple[Literal["tool", "kb"], AgentToolRef | KnowledgeBaseRef] | None:
        normalized = llm_name.strip().lower()
        canonical = ToolDefinitionService.canonical_name(llm_name)
        for tool in ToolDefinitionService.iter_tools(manifest):
            candidates = {
                ToolDefinitionService.sanitize_name(tool.tool_name or str(tool.tool_id)).lower(),
                (tool.tool_name or "").lower(),
                str(tool.tool_id).lower(),
            }
            canonical_candidates = {
                ToolDefinitionService.canonical_name(candidate) for candidate in candidates if candidate
            }
            if normalized in candidates or (canonical and canonical in canonical_candidates):
                return ("tool", tool)
        for kb in manifest.knowledge_bases:
            if kb.mode != KnowledgeBaseMode.TOOL:
                continue
            base = kb.knowledge_base_name or str(kb.knowledge_base_id)
            candidates = {
                ToolDefinitionService.sanitize_name(base).lower(),
                base.lower(),
                f"kb_{kb.knowledge_base_id}".lower(),
            }
            canonical_candidates = {
                ToolDefinitionService.canonical_name(candidate) for candidate in candidates if candidate
            }
            if normalized in candidates or (canonical and canonical in canonical_candidates):
                return ("kb", kb)
        return None
