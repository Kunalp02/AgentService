from __future__ import annotations

from dataclasses import dataclass

from agent_execution.schemas.runtime import MemoryConfig
from agent_execution.settings import Settings


@dataclass(frozen=True, slots=True)
class MemoryPromptPolicy:
    """How runtime manifest memory settings affect the prompt/context budget."""

    enabled: bool
    instructions: str | None
    max_turn_pairs: int
    max_history_chars: int

    @classmethod
    def from_manifest(cls, memory: MemoryConfig, settings: Settings) -> MemoryPromptPolicy:
        if not memory.enabled:
            return cls(
                enabled=False,
                instructions=None,
                max_turn_pairs=0,
                max_history_chars=0,
            )
        instructions = (memory.instructions or "").strip() or None
        max_turn_pairs = memory.max_turn_pairs_in_prompt
        if max_turn_pairs is None:
            max_turn_pairs = settings.conversation_max_turn_pairs
        max_chars = memory.max_chars_in_prompt
        if max_chars is None:
            max_chars = settings.conversation_max_chars
        max_turn_pairs, max_chars = _apply_retention_hint(
            memory.retention, max_turn_pairs, max_chars, settings
        )
        return cls(
            enabled=True,
            instructions=instructions,
            max_turn_pairs=max(0, max_turn_pairs),
            max_history_chars=max(0, max_chars),
        )

    def instructions_block(self) -> str | None:
        if not self.enabled or not self.instructions:
            return None
        return f"Memory behavior notes:\n{self.instructions}"


def _apply_retention_hint(
    retention: str | None,
    max_turn_pairs: int,
    max_chars: int,
    settings: Settings,
) -> tuple[int, int]:
    """
    Optional manifest retention hints for *prompt* footprint.

    Storage retention (e.g. Days30) is enforced elsewhere; when the manifest only
    names a duration, we keep service defaults for turn/char limits.
    """
    if not retention:
        return max_turn_pairs, max_chars
    normalized = retention.strip().lower()
    if normalized in {"short", "minimal"}:
        return min(max_turn_pairs, 3), min(max_chars, 2000)
    if normalized in {"long", "extended"}:
        return max(max_turn_pairs, settings.conversation_max_turn_pairs), max(
            max_chars, settings.conversation_max_chars
        )
    return max_turn_pairs, max_chars
