from __future__ import annotations


class ConversationVersionConflict(Exception):
    def __init__(self, current_version: int) -> None:
        self.current_version = current_version
        super().__init__(f"conversation version conflict (current={current_version})")
