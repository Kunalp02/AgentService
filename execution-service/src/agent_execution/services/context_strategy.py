"""Context layers and compaction.

The packing order follows published practice from Anthropic and OpenAI:
keep a stable instruction prefix, keep the newest user turn, compact older
conversation instead of deleting it blindly, and drop retrieved or tool
payloads before instructions.
"""

from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True, slots=True)
class ContextLayer:
    name: str
    source: str
    action: str


# Highest priority first. The runtime never drops the first two layers.
CONTEXT_LAYERS: tuple[ContextLayer, ...] = (
    ContextLayer(
        "system prompt",
        "runtime manifest instructions",
        "Pinned. If this plus the new user message exceeds the input budget, the run fails.",
    ),
    ContextLayer(
        "current user message",
        "this run's input",
        "Pinned. Never trimmed or replaced.",
    ),
    ContextLayer(
        "memory instructions",
        "manifest memory.instructions",
        "Included only when memory is enabled. Dropped only after files, knowledge, and history are gone.",
    ),
    ContextLayer(
        "conversation history",
        "thread transcript",
        "Older lines are compacted into a short note. The newest lines stay verbatim.",
    ),
    ContextLayer(
        "retrieved knowledge",
        "knowledge bases in Context mode",
        "Fetched for this question only. Lowest-ranked blocks are removed first.",
    ),
    ContextLayer(
        "attached files",
        "input artifacts",
        "Shortened first. They are the largest and least stable prefix.",
    ),
    ContextLayer(
        "tool definitions",
        "manifest local and remote tools",
        "Sent as the tools array, not inside the system prompt, so the instruction prefix stays stable.",
    ),
    ContextLayer(
        "tool calls and results",
        "the current tool loop",
        "Result text is capped. The oldest completed tool round is removed before the system prompt.",
    ),
    ContextLayer(
        "output reserve",
        "CONTEXT_MAX_OUTPUT_TOKENS",
        "Subtracted from the window and sent as max_tokens so the reply has room.",
    ),
)


def compact_history_block(history: str, max_chars: int) -> tuple[str | None, bool]:
    """Keep the newest history lines and replace the dropped prefix with one note."""
    text = history.strip()
    if not text:
        return None, False
    if len(text) <= max_chars:
        return text, False
    if max_chars < 80:
        return None, True

    prefix = "Previous conversation (most recent last):\n"
    body = text[len(prefix) :] if text.startswith(prefix) else text
    lines = [line for line in body.splitlines() if line.strip()]
    kept: list[str] = []
    while lines:
        candidate = lines[-1]
        note = f"[Earlier conversation compacted: {len(lines)} lines omitted.]"
        draft_lines = [note, *([candidate] + kept)]
        draft = prefix + "\n".join(draft_lines)
        if len(draft) > max_chars and kept:
            break
        if len(draft) > max_chars and not kept:
            return None, True
        kept.insert(0, lines.pop())
    omitted = len(lines)
    if omitted == 0:
        return text[: max_chars - 16].rstrip() + "\n…[truncated]", True
    note = f"[Earlier conversation compacted: {omitted} lines omitted.]"
    return prefix + "\n".join([note, *kept]), True
