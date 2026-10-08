from __future__ import annotations

import uuid
from types import SimpleNamespace

import pytest

from agent_execution.core.exceptions import ServiceError
from agent_execution.schemas.runtime import AgentMemoryScope, MemoryConfig, ModelConfig, RuntimeManifest
from agent_execution.services.context_strategy import compact_history_block
from agent_execution.services.context_budget import ContextBudget
from agent_execution.services.context_manager import ContextManager


def _settings(**overrides):
    base = {
        "context_window_tokens": 8000,
        "context_output_reserve_tokens": 1000,
        "context_max_output_tokens": None,
        "context_chars_per_token": 4.0,
        "context_tool_round_reserve_tokens": 1000,
        "context_tool_message_max_chars": 500,
        "conversation_max_turn_pairs": 10,
        "conversation_max_chars": 8000,
    }
    base.update(overrides)
    settings = SimpleNamespace(**base)

    def resolved_max_output_tokens() -> int:
        if settings.context_max_output_tokens is not None:
            return settings.context_max_output_tokens
        return settings.context_output_reserve_tokens

    settings.resolved_max_output_tokens = resolved_max_output_tokens  # type: ignore[method-assign]
    return settings


def test_budget_reserves_output_and_tool_headroom():
    settings = _settings()
    budget = ContextBudget.for_thread(settings, thread_id="t-1", session_id="s-1")
    assert budget.max_output_tokens == 1000
    assert budget.input_token_budget == 8000 - 1000 - 1000
    assert budget.thread_id == "t-1"


def test_pack_system_context_trims_knowledge_before_history():
    manager = ContextManager(_settings(context_window_tokens=400, context_output_reserve_tokens=50))
    manifest = RuntimeManifest(
        agent_id=uuid.uuid4(),
        name="Agent",
        status="Published",
        system_prompt="Base instructions.",
        model=ModelConfig(model_id=uuid.uuid4(), model_identifier="gpt-4o-mini"),
    )
    packed = manager.pack_system_context(
        manifest,
        budget=manager.budget_for_thread(session_id="sess"),
        memory_cfg=MemoryConfig(enabled=True, instructions="Remember user preferences."),
        history_block="Previous conversation (most recent last):\n" + ("User: hi\n" * 40),
        kb_blocks=["KB: A\n" + ("claim " * 200), "KB: B\nsmall"],
        artifact_block=None,
        user_input="What is the policy?",
    )
    assert "KB: B" in packed.system_prompt or "KB: A" not in packed.system_prompt
    assert packed.trim_traces


def test_pack_system_context_skips_memory_when_disabled():
    manager = ContextManager(_settings())
    manifest = RuntimeManifest(
        agent_id=uuid.uuid4(),
        name="Agent",
        status="Published",
        system_prompt="Base.",
        model=ModelConfig(model_id=uuid.uuid4(), model_identifier="gpt-4o-mini"),
    )
    packed = manager.pack_system_context(
        manifest,
        budget=manager.budget_for_thread(session_id="sess"),
        memory_cfg=MemoryConfig(enabled=False, instructions="ignored"),
        history_block="Previous conversation:\nUser: secret",
        kb_blocks=[],
        artifact_block=None,
        user_input="Hi",
    )
    assert "secret" not in packed.system_prompt
    assert "ignored" not in packed.system_prompt


def test_fit_messages_truncates_tool_content_and_drops_old_rounds():
    manager = ContextManager(_settings(context_window_tokens=600, context_output_reserve_tokens=100))
    budget = manager.budget_for_thread(session_id="sess")
    messages = [
        {"role": "system", "content": "sys"},
        {"role": "user", "content": "go"},
        {
            "role": "assistant",
            "content": None,
            "tool_calls": [{"id": "1", "type": "function", "function": {"name": "a", "arguments": "{}"}}],
        },
        {"role": "tool", "tool_call_id": "1", "content": "x" * 5000},
        {
            "role": "assistant",
            "content": None,
            "tool_calls": [{"id": "2", "type": "function", "function": {"name": "b", "arguments": "{}"}}],
        },
        {"role": "tool", "tool_call_id": "2", "content": "fresh"},
        {"role": "user", "content": "continue"},
    ]
    fitted = manager.fit_messages(messages, budget=budget)
    assert any("truncated" in str(m.get("content", "")) for m in fitted.messages if m.get("role") == "tool")
    assert fitted.trimmed


def test_compact_history_keeps_the_newest_lines():
    lines = [f"User: turn {index} " + ("word " * 30) for index in range(12)]
    block = "Previous conversation (most recent last):\n" + "\n".join(lines)
    compacted, changed = compact_history_block(block, 500)
    assert changed
    assert compacted is not None
    assert "turn 11" in compacted
    assert "compacted" in compacted
    assert "turn 0" not in compacted


def test_isolate_memory_forces_session_scope():
    manager = ContextManager(_settings())
    manager._settings.context_isolate_threads = True
    isolated = manager.isolate_memory(
        MemoryConfig(enabled=True, scope=AgentMemoryScope.ORGANIZATION)
    )
    assert isolated.scope == AgentMemoryScope.SESSION


def test_fit_messages_raises_when_unrecoverable():
    manager = ContextManager(_settings(context_window_tokens=300, context_output_reserve_tokens=50))
    budget = manager.budget_for_thread(session_id="sess")
    messages = [
        {"role": "system", "content": "x" * 5000},
        {"role": "user", "content": "y" * 5000},
    ]
    with pytest.raises(ServiceError) as exc:
        manager.fit_messages(messages, budget=budget)
    assert exc.value.code == "CONTEXT_TOO_LARGE"
