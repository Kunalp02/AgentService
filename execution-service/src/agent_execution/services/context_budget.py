from __future__ import annotations

from dataclasses import dataclass

from agent_execution.settings import Settings


@dataclass(frozen=True, slots=True)
class ContextBudget:
    """Per-run input/output token limits (defaults from settings; scoped to one thread/session)."""

    thread_id: str | None
    session_id: str | None
    context_window_tokens: int
    max_output_tokens: int
    input_token_budget: int
    chars_per_token: float
    tool_message_max_chars: int
    tool_round_reserve_tokens: int

    @classmethod
    def for_thread(
        cls,
        settings: Settings,
        *,
        thread_id: str | None = None,
        session_id: str | None = None,
    ) -> ContextBudget:
        window = max(512, settings.context_window_tokens)
        max_output = min(
            max(1, settings.resolved_max_output_tokens()),
            window - 1,
        )
        tool_reserve = min(
            max(0, settings.context_tool_round_reserve_tokens),
            max(0, window - max_output - 256),
        )
        input_budget = max(256, window - max_output - tool_reserve)
        return cls(
            thread_id=thread_id,
            session_id=session_id,
            context_window_tokens=window,
            max_output_tokens=max_output,
            input_token_budget=input_budget,
            chars_per_token=max(1.0, settings.context_chars_per_token),
            tool_message_max_chars=max(200, settings.context_tool_message_max_chars),
            tool_round_reserve_tokens=tool_reserve,
        )
