from __future__ import annotations

import json
from datetime import datetime, timezone
from uuid import UUID

from agent_execution.infrastructure.persistence.database import Database
from agent_execution.schemas.workflows import WorkflowDefinition


class WorkflowRepository:
    def __init__(self, database: Database) -> None:
        self._database = database

    async def insert(
        self, workflow_id: UUID, name: str, status: str, definition: WorkflowDefinition
    ) -> None:
        now = datetime.now(timezone.utc)
        pool = await self._database.pool()
        async with pool.acquire() as conn:
            await conn.execute(
                """
                INSERT INTO workflows (workflow_id, name, status, definition, created_at, updated_at)
                VALUES ($1, $2, $3, $4::jsonb, $5, $5)
                """,
                workflow_id,
                name,
                status,
                _dump(definition),
                now,
            )

    async def update(
        self, workflow_id: UUID, name: str, definition: WorkflowDefinition
    ) -> None:
        pool = await self._database.pool()
        async with pool.acquire() as conn:
            await conn.execute(
                """
                UPDATE workflows
                SET name = $2, definition = $3::jsonb, updated_at = $4
                WHERE workflow_id = $1
                """,
                workflow_id,
                name,
                _dump(definition),
                datetime.now(timezone.utc),
            )

    async def set_status(self, workflow_id: UUID, status: str) -> None:
        pool = await self._database.pool()
        async with pool.acquire() as conn:
            await conn.execute(
                """
                UPDATE workflows SET status = $2, updated_at = $3 WHERE workflow_id = $1
                """,
                workflow_id,
                status,
                datetime.now(timezone.utc),
            )

    async def get(self, workflow_id: UUID):
        pool = await self._database.pool()
        async with pool.acquire() as conn:
            return await conn.fetchrow(
                "SELECT * FROM workflows WHERE workflow_id = $1",
                workflow_id,
            )

    async def list_all(self):
        pool = await self._database.pool()
        async with pool.acquire() as conn:
            return await conn.fetch(
                "SELECT workflow_id, name, status, updated_at FROM workflows ORDER BY updated_at DESC"
            )

    async def insert_run(
        self,
        *,
        workflow_run_id: UUID,
        workflow_id: UUID,
        status: str,
        user_input: str,
        session_id: str,
        user_id: str,
        org_id: str | None,
    ) -> None:
        pool = await self._database.pool()
        async with pool.acquire() as conn:
            await conn.execute(
                """
                INSERT INTO workflow_runs (
                    workflow_run_id, workflow_id, status, input, session_id, user_id, org_id
                ) VALUES ($1,$2,$3,$4,$5,$6,$7)
                """,
                workflow_run_id,
                workflow_id,
                status,
                user_input,
                session_id,
                user_id,
                org_id,
            )

    async def finish_run(
        self,
        workflow_run_id: UUID,
        *,
        status: str,
        output: str,
        error: str,
        steps: list,
        state: dict,
    ) -> None:
        pool = await self._database.pool()
        async with pool.acquire() as conn:
            await conn.execute(
                """
                UPDATE workflow_runs
                SET status = $2, output = $3, error = $4, steps = $5::jsonb,
                    state = $6::jsonb, completed_at = $7
                WHERE workflow_run_id = $1
                """,
                workflow_run_id,
                status,
                output,
                error,
                json.dumps([step.model_dump(mode="json", by_alias=True) for step in steps]),
                json.dumps(state),
                datetime.now(timezone.utc),
            )


def _dump(definition: WorkflowDefinition) -> str:
    return json.dumps(definition.model_dump(mode="json", by_alias=True))



