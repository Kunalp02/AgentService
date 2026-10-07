from __future__ import annotations

from types import SimpleNamespace

from agent_execution.schemas.runtime import MemoryConfig
from agent_execution.services.memory_prompt_policy import MemoryPromptPolicy


def test_disabled_memory_excludes_prompt_content():
    settings = SimpleNamespace(conversation_max_turn_pairs=10, conversation_max_chars=8000)
    policy = MemoryPromptPolicy.from_manifest(MemoryConfig(enabled=False), settings)
    assert policy.enabled is False
    assert policy.instructions_block() is None


def test_manifest_limits_override_settings():
    settings = SimpleNamespace(conversation_max_turn_pairs=10, conversation_max_chars=8000)
    policy = MemoryPromptPolicy.from_manifest(
        MemoryConfig(
            enabled=True,
            instructions="Be concise.",
            max_turn_pairs_in_prompt=4,
            max_chars_in_prompt=3000,
        ),
        settings,
    )
    assert policy.max_turn_pairs == 4
    assert policy.max_history_chars == 3000
    assert "Be concise" in (policy.instructions_block() or "")
