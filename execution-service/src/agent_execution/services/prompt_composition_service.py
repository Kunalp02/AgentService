from __future__ import annotations

from agent_execution.core.exceptions import ServiceError
from agent_execution.schemas.runtime import RuntimeManifest


class PromptCompositionService:
    @staticmethod
    def compose(
        manifest: RuntimeManifest,
        memory_instructions: str | None,
        history_block: str | None,
        kb_blocks: list[str],
        artifact_block: str | None = None,
    ) -> str:
        sections = [manifest.system_prompt.strip()]
        if memory_instructions:
            sections.append(memory_instructions)
        if history_block:
            sections.append(history_block)
        if kb_blocks:
            sections.append(
                "Retrieved knowledge base context:\n" + "\n\n".join(kb_blocks)
            )
        if artifact_block:
            sections.append(artifact_block)
        sections.append("Respond to the user message.")
        return "\n\n".join(sections)

    @staticmethod
    def compose_within_budget(
        manifest: RuntimeManifest,
        memory_instructions: str | None,
        history_block: str | None,
        kb_blocks: list[str],
        artifact_block: str | None,
        user_input: str,
        budget_chars: int,
    ) -> tuple[str, list[str]]:
        """Keep the system prompt and the new message. Shorten history, knowledge, then files."""
        system = manifest.system_prompt.strip()
        if len(system) + len(user_input) > budget_chars:
            raise ServiceError(
                "CONTEXT_TOO_LARGE",
                "The system prompt and the new message are larger than the context budget.",
                400,
            )
        instructions = memory_instructions
        history = history_block
        knowledge = list(kb_blocks)
        files = artifact_block
        traces: list[str] = []

        def composed() -> str:
            return PromptCompositionService.compose(
                manifest, instructions, history, knowledge, files
            )

        while len(composed()) + len(user_input) > budget_chars:
            if files and len(files) > 200:
                files = files[: max(200, len(files) // 2)]
                _add_trace(traces, "context.trimmed:files")
                continue
            if knowledge:
                knowledge.pop()
                _add_trace(traces, "context.trimmed:knowledge")
                continue
            if history and len(history) > 200:
                history = history[len(history) // 2 :]
                _add_trace(traces, "context.trimmed:history")
                continue
            if instructions:
                instructions = None
                _add_trace(traces, "context.trimmed:memory_instructions")
                continue
            files = None
            knowledge = []
            history = None
            break
        prompt = composed()
        if len(prompt) + len(user_input) > budget_chars:
            raise ServiceError(
                "CONTEXT_TOO_LARGE",
                "The system prompt and the new message are larger than the context budget.",
                400,
            )
        return prompt, traces


def _add_trace(traces: list[str], step: str) -> None:
    if step not in traces:
        traces.append(step)
