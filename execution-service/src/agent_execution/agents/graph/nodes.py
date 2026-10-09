from __future__ import annotations

import asyncio
import json
import uuid
from typing import Any

from agent_execution.agents.graph.context import AgentGraphContext
from agent_execution.agents.graph.state import AgentGraphState
from agent_execution.core.exceptions import ServiceError
from agent_execution.infrastructure.llm_gateway import LlmToolCall
from agent_execution.schemas.runtime import RuntimeManifest
from agent_execution.services.conversation_memory_service import (
    ConversationMemoryService,
)
from agent_execution.services.conversation_models import (
    ConversationHistory,
    MemoryContext,
)
from agent_execution.services.tool_definition_service import ToolDefinitionService

_FINALIZE_PROMPT = (
    "You have reached the maximum number of tool calls allowed for this request. "
    "Provide your best final answer using the information gathered so far."
)


def _tool_calls_to_state(calls: list[LlmToolCall]) -> list[dict[str, Any]]:
    return [
        {"id": call.id, "name": call.name, "arguments": call.arguments}
        for call in calls
    ]


def _assistant_message(content: str, tool_calls: list[LlmToolCall]) -> dict[str, Any]:
    message: dict[str, Any] = {"role": "assistant", "content": content or None}
    if tool_calls:
        message["tool_calls"] = [
            {
                "id": call.id,
                "type": "function",
                "function": {
                    "name": call.name,
                    "arguments": json.dumps(call.arguments, ensure_ascii=True),
                },
            }
            for call in tool_calls
        ]
    return message


def _messages_for_llm(state: AgentGraphState) -> list[dict[str, Any]]:
    messages = state.get("messages")
    if messages:
        return list(messages)
    return [
        {"role": "system", "content": state["system_prompt"]},
        {"role": "user", "content": state["llm_input"]},
    ]


class AgentGraphNodes:
    def __init__(self, context: AgentGraphContext) -> None:
        self._ctx = context

    async def prepare_context(self, state: AgentGraphState) -> AgentGraphState:
        agent_id = uuid.UUID(state["agent_id"])
        bearer_token = state.get("bearer_token")
        thread_id = state.get("thread_id")
        session_id = state.get("session_id") or thread_id or str(uuid.uuid4())
        if self._ctx.settings.context_isolate_threads and thread_id:
            session_id = str(thread_id)
        mem_context = MemoryContext(session_id=session_id, org_id=state.get("org_id"))
        user_input = state["user_input"]

        if state.get("manifest"):
            manifest = RuntimeManifest.model_validate(state["manifest"])
        else:
            manifest = await self._ctx.manifest_service.resolve(agent_id, bearer_token)

        memory_cfg = self._ctx.context_manager.isolate_memory(manifest.memory)
        manifest = manifest.model_copy(update={"memory": memory_cfg})
        self._ctx.memory_service.validate_context(memory_cfg, mem_context)
        history = (
            await self._ctx.memory_service.load_history(
                agent_id, memory_cfg, mem_context
            )
            if memory_cfg.enabled
            else ConversationHistory()
        )
        artifact_block = await self._artifact_block(
            state.get("input_artifact_ids") or []
        )
        kb_blocks: list[str] = []
        retrieved_context: list[dict] = []
        if any(kb.mode.value == "Context" for kb in manifest.knowledge_bases):
            (kb_blocks, retrieved_context), history_parts = await asyncio.gather(
                self._ctx.rag_service.fetch_context(manifest, user_input, bearer_token),
                asyncio.to_thread(
                    self._ctx.memory_service.history_for_prompt, history, memory_cfg
                ),
            )
            history_block, history_for_prompt, history_truncated = history_parts
        else:
            history_block, history_for_prompt, history_truncated = (
                self._ctx.memory_service.history_for_prompt(history, memory_cfg)
            )

        thread_id = state.get("thread_id")
        context_budget = self._ctx.context_manager.budget_for_thread(
            thread_id=str(thread_id) if thread_id else None,
            session_id=session_id,
        )
        packed = self._ctx.context_manager.pack_system_context(
            manifest,
            budget=context_budget,
            memory_cfg=memory_cfg,
            history_block=history_block,
            kb_blocks=kb_blocks,
            artifact_block=artifact_block,
            user_input=user_input,
        )
        system_prompt = packed.system_prompt
        trim_steps = packed.trim_traces
        if packed.history_truncated:
            history_truncated = True
        initial_messages = [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_input},
        ]
        fitted = self._ctx.context_manager.fit_messages(
            initial_messages, budget=context_budget
        )
        return {
            "session_id": session_id,
            "manifest": manifest.model_dump(mode="json"),
            "system_prompt": system_prompt,
            "llm_input": user_input,
            "messages": fitted.messages,
            "history_turns": [
                {"role": turn.role, "content": turn.content} for turn in history.turns
            ],
            "memory_scope": memory_cfg.scope.value if memory_cfg.scope else None,
            "history_total_turns": len(history.turns),
            "history_turns_in_prompt": len(history_for_prompt.turns),
            "history_truncated": history_truncated or packed.history_truncated,
            "context_messages_trimmed": fitted.trimmed,
            "context_input_tokens": fitted.estimated_input_tokens,
            "context_input_budget": context_budget.input_token_budget,
            "context_max_output_tokens": context_budget.max_output_tokens,
            "has_tools": manifest.has_tools,
            "tool_round": 0,
            "max_tool_rounds": self._ctx.settings.max_tool_rounds,
            "tool_calls": [],
            "tool_results": [],
            "retrieved_context": retrieved_context,
            "artifact_block": artifact_block,
            "stop_reason": None,
            "steps": [
                "prepare_context",
                *[item["trace"] for item in retrieved_context if item.get("trace")],
                *trim_steps,
            ],
        }

    async def _artifact_block(self, artifact_ids: list[str]) -> str | None:
        if not artifact_ids:
            return None
        sections: list[str] = []
        for raw_id in artifact_ids:
            payload = await self._ctx.storage.fetch_artifact_text(
                uuid.UUID(str(raw_id))
            )
            filename = payload.get("filename") or raw_id
            text = payload.get("text")
            if text:
                truncated = " (truncated)" if payload.get("truncated") else ""
                sections.append(f"File {filename}{truncated}:\n{text}")
            else:
                sections.append(f"File {filename} is attached and is not text.")
        return "Attached files:\n\n" + "\n\n".join(sections)

    def _context_budget(self, state: AgentGraphState):
        return self._ctx.context_manager.budget_for_thread(
            thread_id=state.get("thread_id"),
            session_id=state.get("session_id"),
        )

    def _fit_for_llm(self, state: AgentGraphState, messages: list[dict[str, Any]]):
        budget = self._context_budget(state)
        return self._ctx.context_manager.fit_messages(messages, budget=budget)

    async def call_llm(self, state: AgentGraphState) -> AgentGraphState:
        manifest = RuntimeManifest.model_validate(state["manifest"])
        fitted = self._fit_for_llm(state, _messages_for_llm(state))
        messages = fitted.messages
        tool_round = state.get("tool_round", 0)
        tools = (
            ToolDefinitionService.build_openai_tools(manifest)
            if manifest.has_tools
            else None
        )
        result = await self._ctx.llm_gateway.chat_with_messages(
            model=manifest.model.model_identifier,
            messages=messages,
            temperature=manifest.temperature,
            bearer_token=state.get("bearer_token"),
            tools=tools,
            base_url=manifest.model.base_url,
            api_key=manifest.model.api_key,
            max_tokens=state.get("context_max_output_tokens"),
        )
        updated = messages + [_assistant_message(result.content, result.tool_calls)]
        return {
            "output": result.content,
            "messages": updated,
            "tool_calls": _tool_calls_to_state(result.tool_calls),
            "stop_reason": "completed" if not result.tool_calls else None,
            "context_messages_trimmed": bool(state.get("context_messages_trimmed"))
            or fitted.trimmed,
            "context_input_tokens": fitted.estimated_input_tokens,
            "steps": [f"call_llm:r{tool_round}", *fitted.trim_traces],
        }

    async def run_tools(self, state: AgentGraphState) -> AgentGraphState:
        manifest = RuntimeManifest.model_validate(state["manifest"])
        messages = list(_messages_for_llm(state))
        tool_round = state.get("tool_round", 0) + 1

        async def execute_call(call: dict[str, Any]) -> dict[str, Any]:
            name = call.get("name")
            args = call.get("arguments") or {}
            call_id = str(call.get("id") or f"call_{uuid.uuid4().hex[:8]}")
            if not name:
                raise ServiceError("TOOL_ERROR", "Tool call is missing a name.", 400)
            if not isinstance(args, dict):
                args = {"input": args}
            try:
                output = await self._ctx.tool_service.run(
                    manifest,
                    str(name),
                    args,
                    state.get("bearer_token"),
                    state["user_input"],
                )
            except ServiceError as exc:
                output = str(exc)
            return {"id": call_id, "name": str(name), "output": output}

        executed = await asyncio.gather(
            *(execute_call(call) for call in state.get("tool_calls") or [])
        )
        max_tool_chars = self._context_budget(state).tool_message_max_chars
        for item in executed:
            output = item["output"]
            if len(output) > max_tool_chars:
                output = output[: max_tool_chars - 20] + "\n…[truncated]"
            messages.append(
                {"role": "tool", "tool_call_id": item["id"], "content": output}
            )
        fitted = self._fit_for_llm(state, messages)
        return {
            "messages": fitted.messages,
            "tool_calls": [],
            "tool_results": list(state.get("tool_results") or [])
            + [{**item, "output": item["output"][:2000]} for item in executed],
            "tool_round": tool_round,
            "context_messages_trimmed": bool(state.get("context_messages_trimmed"))
            or fitted.trimmed,
            "context_input_tokens": fitted.estimated_input_tokens,
            "steps": [f"run_tools:r{tool_round}", *fitted.trim_traces],
        }

    async def finalize_answer(self, state: AgentGraphState) -> AgentGraphState:
        manifest = RuntimeManifest.model_validate(state["manifest"])
        messages = list(_messages_for_llm(state))
        messages.append({"role": "user", "content": _FINALIZE_PROMPT})
        fitted = self._fit_for_llm(state, messages)
        result = await self._ctx.llm_gateway.chat_with_messages(
            model=manifest.model.model_identifier,
            messages=fitted.messages,
            temperature=manifest.temperature,
            bearer_token=state.get("bearer_token"),
            tools=None,
            base_url=manifest.model.base_url,
            api_key=manifest.model.api_key,
            max_tokens=state.get("context_max_output_tokens"),
        )
        return {
            "output": result.content,
            "messages": fitted.messages
            + [{"role": "assistant", "content": result.content}],
            "tool_calls": [],
            "stop_reason": "max_tool_rounds",
            "context_messages_trimmed": bool(state.get("context_messages_trimmed"))
            or fitted.trimmed,
            "context_input_tokens": fitted.estimated_input_tokens,
            "steps": ["finalize_answer", *fitted.trim_traces],
        }

    async def persist_memory(self, state: AgentGraphState) -> AgentGraphState:
        manifest = RuntimeManifest.model_validate(state["manifest"])
        memory_cfg = manifest.memory
        if not self._ctx.settings.persist_conversation_memory or not memory_cfg.enabled:
            return {"memory_persisted": False, "steps": ["persist_memory"]}
        mem_context = MemoryContext(
            session_id=state["session_id"], org_id=state.get("org_id")
        )
        persisted = await self._ctx.memory_service.append_exchange_safe(
            manifest.agent_id,
            memory_cfg,
            mem_context,
            state["user_input"],
            state.get("output") or "",
        )
        prior_turns = len(state.get("history_turns") or [])
        return {
            "memory_persisted": persisted,
            "history_total_turns": prior_turns + 2 if persisted else prior_turns,
            "steps": ["persist_memory"],
        }
