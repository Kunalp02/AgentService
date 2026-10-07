from __future__ import annotations

from agent_execution.infrastructure.conversation_store.postgres_store import (
    PostgresConversationHistoryStore,
)
from agent_execution.infrastructure.persistence.database import Database


def create_conversation_history_store(database: Database) -> PostgresConversationHistoryStore:
    return PostgresConversationHistoryStore(database)
