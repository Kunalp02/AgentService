from __future__ import annotations

import json
from dataclasses import dataclass
from typing import Any

from agent_execution.core.exceptions import ServiceError
from agent_execution.schemas.runtime import AgentMemoryScope, MemoryConfig, RuntimeManifest
from agent_execution.services.context_budget import ContextBudget
from agent_execution.services.memory_prompt_policy import MemoryPromptPolicy
from agent_execution.services.prompt_composition_service import PromptCompositionService
from agent_execution.settings import Settings


@dataclass(frozen=True, slots=True)
class SystemContextPack:
    system_prompt: str
    trim_traces: list[str]
    history_truncated: bool
    estimated_input_tokens: int


@dataclass(frozen=True, slots=True)
class MessageContextPack:
    messages: list[dict[str, Any]]
    trim_traces: list[str]
    estimated_input_tokens: int
    trimmed: bool


class ContextManager:
    """
    Thread-scoped context packing (no cross-thread sharing).

    Strategy (see execution-service/CONTEXT_MANAGEMENT.md):
      1. Pin the agent system prompt and the current user message.
      2. Apply the runtime manifest memory policy before packing.
      3. With thread isolation on, memory is stored and read only for this thread.
      4. Shorten files, then knowledge, then compact older history, then memory notes.
      5. On tool loops, cap tool results and drop the oldest completed tool round.
    """

    def __init__(self, settings: Settings) -> None:
        self._settings = settings

    def isolate_memory(self, memory: MemoryConfig) -> MemoryConfig:
        """Force Session scope so User, Agent, and Organization memory cannot cross threads."""
        if not self._settings.context_isolate_threads:
            return memory
        if memory.scope == AgentMemoryScope.SESSION:
            return memory
        return memory.model_copy(update={"scope": AgentMemoryScope.SESSION})

    def budget_for_thread(
        self,
        *,
        thread_id: str | None = None,
        session_id: str | None = None,
    ) -> ContextBudget:
        return ContextBudget.for_thread(
            self._settings, thread_id=thread_id, session_id=session_id
        )

    @staticmethod
    def estimate_tokens(text: str, chars_per_token: float) -> int:
        if not text:
            return 0
        return max(1, int(len(text) / chars_per_token))

    def estimate_messages_tokens(
        self, messages: list[dict[str, Any]], chars_per_token: float
    ) -> int:
        total = 0
        for message in messages:
            total += 4
            content = message.get("content")
            if content:
                total += self.estimate_tokens(str(content), chars_per_token)
            tool_calls = message.get("tool_calls")
            if tool_calls:
                total += self.estimate_tokens(
                    json.dumps(tool_calls, ensure_ascii=True), chars_per_token
                )
            if message.get("role") == "tool":
                total += 2
        return total

    def pack_system_context(
        self,
        manifest: RuntimeManifest,
        *,
        budget: ContextBudget,
        memory_cfg: MemoryConfig,
        history_block: str | None,
        kb_blocks: list[str],
        artifact_block: str | None,
        user_input: str,
    ) -> SystemContextPack:
        policy = MemoryPromptPolicy.from_manifest(memory_cfg, self._settings)
        memory_instructions = policy.instructions_block()
        if not policy.enabled:
            memory_instructions = None
            history_block = None
        char_budget = int(budget.input_token_budget * budget.chars_per_token)
        system_prompt, trim_traces = PromptCompositionService.compose_within_budget(
            manifest,
            memory_instructions,
            history_block,
            kb_blocks,
            artifact_block,
            user_input,
            char_budget,
        )
        history_truncated = (
            "context.trimmed:history" in trim_traces
            or "context.compacted:history" in trim_traces
        )
        estimated = self.estimate_tokens(system_prompt + user_input, budget.chars_per_token)
        return SystemContextPack(
            system_prompt=system_prompt,
            trim_traces=trim_traces,
            history_truncated=history_truncated,
            estimated_input_tokens=estimated,
        )

    def fit_messages(
        self,
        messages: list[dict[str, Any]],
        *,
        budget: ContextBudget,
    ) -> MessageContextPack:
        working = [dict(message) for message in messages]
        traces: list[str] = []
        trimmed = False

        if self._shrink_tool_messages(working, budget.tool_message_max_chars, traces):
            trimmed = True

        while (
            self.estimate_messages_tokens(working, budget.chars_per_token)
            > budget.input_token_budget
        ):
            if self._drop_oldest_tool_round(working):
                trimmed = True
                _trace(traces, "context.trimmed:tool_round")
                continue
            if self._shrink_tool_messages(working, max(120, budget.tool_message_max_chars // 2), traces):
                trimmed = True
                continue
            break

        estimated = self.estimate_messages_tokens(working, budget.chars_per_token)
        if estimated > budget.input_token_budget:
            raise ServiceError(
                "CONTEXT_TOO_LARGE",
                "The conversation exceeds the configured context window after trimming.",
                400,
            )
        return MessageContextPack(
            messages=working,
            trim_traces=traces,
            estimated_input_tokens=estimated,
            trimmed=trimmed,
        )

    @staticmethod
    def _shrink_tool_messages(
        messages: list[dict[str, Any]],
        max_chars: int,
        traces: list[str],
    ) -> bool:
        changed = False
        for message in messages:
            if message.get("role") != "tool":
                continue
            content = message.get("content")
            if content is None:
                continue
            text = str(content)
            if len(text) <= max_chars:
                continue
            message["content"] = text[: max_chars - 20] + "\n…[truncated]"
            changed = True
        if changed:
            _trace(traces, "context.trimmed:tool_content")
        return changed

    @staticmethod
    def _drop_oldest_tool_round(messages: list[dict[str, Any]]) -> bool:
        """Remove the earliest assistant(tool_calls) + following tool messages."""
        if len(messages) < 3:
            return False
        start = 1
        while start < len(messages):
            role = messages[start].get("role")
            if role == "assistant" and messages[start].get("tool_calls"):
                break
            start += 1
        if start >= len(messages):
            return False
        end = start + 1
        while end < len(messages) and messages[end].get("role") == "tool":
            end += 1
        if end >= len(messages):
            return False
        del messages[start:end]
        return True


def _trace(traces: list[str], step: str) -> None:
    if step not in traces:
        traces.append(step)
