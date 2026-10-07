from __future__ import annotations

import json
from datetime import datetime, timezone
from uuid import UUID

from agent_execution.infrastructure.persistence.database import Database


def _loads(value, fallback):
    if value is None:
        return fallback
    if isinstance(value, str):
        return json.loads(value)
    return value


class RunRepository:
    _AUDIT_FROM = """
        FROM runs r
        JOIN threads t ON t.thread_id = r.thread_id
        LEFT JOIN deployments d ON d.deployment_id = t.deployment_id
    """
    _AUDIT_COLS = """
        r.run_id, r.thread_id, r.agent_id, r.status, r.dispatch, r.error,
        r.stop_reason, r.attempt, r.created_at, r.started_at, r.completed_at,
        t.channel, t.execution_type, t.triggered_by, d.slug AS deployment_slug,
        EXTRACT(EPOCH FROM (r.completed_at - r.started_at)) * 1000 AS duration_ms
    """

    def __init__(self, database: Database) -> None:
        self._database = database

    async def list_for_audit(
        self,
        agent_id,
        *,
        status=None,
        channel=None,
        execution_type=None,
        date_from=None,
        date_to=None,
        search=None,
        limit=50,
        offset=0,
    ):
        conds, args = ["r.agent_id = $1"], [agent_id]

        def add(sql: str, value) -> None:
            args.append(value)
            conds.append(sql.replace("?", f"${len(args)}"))

        if status:
            add("r.status = ?", status)
        if channel:
            add("t.channel = ?", channel)
        if execution_type:
            add("t.execution_type = ?", execution_type)
        if date_from:
            add("r.created_at >= ?", date_from)
        if date_to:
            add("r.created_at < ?", date_to)
        if search:
            add(
                "(r.input ILIKE ? OR r.output ILIKE ? OR t.triggered_by ILIKE ?)",
                f"%{search}%",
            )
        where = " AND ".join(conds)
        n = len(args)
        pool = await self._database.pool()
        async with pool.acquire() as conn:
            total = await conn.fetchval(
                f"SELECT count(*) {self._AUDIT_FROM} WHERE {where}", *args
            )
            rows = await conn.fetch(
                f"""SELECT {self._AUDIT_COLS}, left(r.input, 200) AS input_preview
                    {self._AUDIT_FROM} WHERE {where}
                    ORDER BY r.created_at DESC LIMIT ${n + 1} OFFSET ${n + 2}""",
                *args,
                limit,
                offset,
            )
        return rows, int(total or 0)

    async def get_for_audit(self, run_id):
        pool = await self._database.pool()
        async with pool.acquire() as conn:
            return await conn.fetchrow(
                f"""SELECT {self._AUDIT_COLS}, r.input AS input_preview, r.input, r.output,
                           r.steps, r.retrieved_context, r.tool_calls, r.manifest_hash,
                           r.revision_id
                    {self._AUDIT_FROM} WHERE r.run_id = $1""",
                run_id,
            )

    async def insert(
        self,
        *,
        run_id: UUID,
        thread_id: UUID,
        agent_id: UUID,
        status: str,
        dispatch: str,
        user_input: str,
        revision_id: UUID | None,
        manifest_hash: str,
        attempt: int,
        max_attempts: int,
        worker_id: str | None,
        lease_expires_at: datetime | None,
        idempotency_key: str | None,
        input_artifact_ids: list[str],
        org_id: str | None,
        started_at: datetime | None,
    ):
        pool = await self._database.pool()
        async with pool.acquire() as conn:
            if idempotency_key:
                existing = await conn.fetchrow(
                    """
                    SELECT * FROM runs
                    WHERE thread_id = $1 AND idempotency_key = $2
                    """,
                    thread_id,
                    idempotency_key,
                )
                if existing is not None:
                    return existing, False
            await conn.execute(
                """
                INSERT INTO runs (
                    run_id, thread_id, agent_id, status, dispatch, input,
                    revision_id, manifest_hash, attempt, max_attempts, worker_id,
                    lease_expires_at, idempotency_key, input_artifact_ids, org_id,
                    created_at, started_at
                ) VALUES (
                    $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14::jsonb,$15,$16,$17
                )
                """,
                run_id,
                thread_id,
                agent_id,
                status,
                dispatch,
                user_input,
                revision_id,
                manifest_hash,
                attempt,
                max_attempts,
                worker_id,
                lease_expires_at,
                idempotency_key,
                json.dumps(input_artifact_ids),
                org_id,
                datetime.now(timezone.utc),
                started_at,
            )
            row = await conn.fetchrow("SELECT * FROM runs WHERE run_id = $1", run_id)
            return row, True

    async def get(self, run_id: UUID):
        pool = await self._database.pool()
        async with pool.acquire() as conn:
            return await conn.fetchrow("SELECT * FROM runs WHERE run_id = $1", run_id)

    async def list_for_thread(self, thread_id: UUID, limit: int, offset: int):
        pool = await self._database.pool()
        async with pool.acquire() as conn:
            return await conn.fetch(
                """
                SELECT * FROM runs
                WHERE thread_id = $1
                ORDER BY created_at DESC
                LIMIT $2 OFFSET $3
                """,
                thread_id,
                limit,
                offset,
            )

    async def claim_next(self, worker_id: str, lease_seconds: int):
        pool = await self._database.pool()
        async with pool.acquire() as conn:
            return await conn.fetchrow(
                """
                WITH candidate AS (
                    SELECT run_id
                    FROM runs
                    WHERE dispatch = 'ASYNC'
                      AND (
                        status = 'QUEUED'
                        OR (
                            status = 'RUNNING'
                            AND lease_expires_at IS NOT NULL
                            AND lease_expires_at < NOW()
                            AND attempt < max_attempts
                        )
                      )
                    ORDER BY created_at
                    FOR UPDATE SKIP LOCKED
                    LIMIT 1
                )
                UPDATE runs AS r
                SET status = 'RUNNING',
                    attempt = r.attempt + 1,
                    worker_id = $1,
                    lease_expires_at = NOW() + make_interval(secs => $2),
                    started_at = COALESCE(r.started_at, NOW()),
                    error = NULL
                FROM candidate AS c
                WHERE r.run_id = c.run_id
                RETURNING r.*
                """,
                worker_id,
                lease_seconds,
            )

    async def heartbeat(self, run_id: UUID, worker_id: str, lease_seconds: int) -> None:
        pool = await self._database.pool()
        async with pool.acquire() as conn:
            await conn.execute(
                """
                UPDATE runs
                SET lease_expires_at = NOW() + make_interval(secs => $3)
                WHERE run_id = $1 AND worker_id = $2 AND status = 'RUNNING'
                """,
                run_id,
                worker_id,
                lease_seconds,
            )

    async def mark_succeeded(
        self,
        run_id,
        *,
        output,
        output_artifact_ids,
        steps,
        retrieved_context,
        stop_reason,
        manifest_hash,
        revision_id,
        tool_calls: list | None = None,
    ) -> None:
        pool = await self._database.pool()
        async with pool.acquire() as conn:
            await conn.execute(
                """
                UPDATE runs
                SET status = 'SUCCEEDED', output = $2, output_artifact_ids = $3::jsonb,
                    steps = $4::jsonb, retrieved_context = $5::jsonb, stop_reason = $6,
                    manifest_hash = $7, revision_id = COALESCE($8, revision_id),
                    completed_at = $9, lease_expires_at = NULL, tool_calls = $10::jsonb
                WHERE run_id = $1
                """,
                run_id,
                output,
                json.dumps(output_artifact_ids),
                json.dumps(steps),
                json.dumps(retrieved_context),
                stop_reason,
                manifest_hash,
                revision_id,
                datetime.now(timezone.utc),
                json.dumps(tool_calls or []),
            )

    async def mark_failed(self, run_id: UUID, error: str, *, requeue: bool) -> None:
        pool = await self._database.pool()
        async with pool.acquire() as conn:
            if requeue:
                await conn.execute(
                    """
                    UPDATE runs
                    SET status = 'QUEUED',
                        error = $2,
                        worker_id = NULL,
                        lease_expires_at = NULL
                    WHERE run_id = $1
                    """,
                    run_id,
                    error[:2000],
                )
                return
            await conn.execute(
                """
                UPDATE runs
                SET status = 'FAILED',
                    error = $2,
                    completed_at = $3,
                    lease_expires_at = NULL
                WHERE run_id = $1
                """,
                run_id,
                error[:2000],
                datetime.now(timezone.utc),
            )

    async def fail_expired_sync(self) -> int:
        pool = await self._database.pool()
        async with pool.acquire() as conn:
            result = await conn.execute("""
                UPDATE runs
                SET status = 'FAILED',
                    error = 'Run interrupted before completion.',
                    completed_at = NOW(),
                    lease_expires_at = NULL
                WHERE dispatch = 'SYNC'
                  AND status = 'RUNNING'
                  AND lease_expires_at IS NOT NULL
                  AND lease_expires_at < NOW()
                """)
        return int(result.split()[-1])
