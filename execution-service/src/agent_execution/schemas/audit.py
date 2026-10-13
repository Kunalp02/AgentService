from __future__ import annotations
from datetime import datetime
from typing import Any
from uuid import UUID
from pydantic import BaseModel, ConfigDict, Field


class AuditRunItem(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    run_id: UUID = Field(alias="runId")
    thread_id: UUID = Field(alias="threadId")
    agent_id: UUID = Field(alias="agentId")
    status: str
    dispatch: str
    channel: str
    execution_type: str = Field(alias="executionType")
    triggered_by: str = Field(default="", alias="triggeredBy")
    deployment_slug: str | None = Field(default=None, alias="deploymentSlug")
    input_preview: str = Field(default="", alias="inputPreview")
    error: str | None = None
    stop_reason: str | None = Field(default=None, alias="stopReason")
    attempt: int = 0
    created_at: datetime = Field(alias="createdAt")
    started_at: datetime | None = Field(default=None, alias="startedAt")
    completed_at: datetime | None = Field(default=None, alias="completedAt")
    duration_ms: float | None = Field(default=None, alias="durationMs")


class AuditRunPage(BaseModel):
    items: list[AuditRunItem]
    total: int
    limit: int
    offset: int


class AuditRunDetail(AuditRunItem):
    input: str = ""
    output: str | None = None
    steps: list[str] = Field(default_factory=list)
    retrieved_context: list[dict[str, Any]] = Field(default_factory=list, alias="retrievedContext")
    tool_calls: list[dict[str, Any]] = Field(default_factory=list, alias="toolCalls")
    manifest_hash: str = Field(default="", alias="manifestHash")
    revision_id: UUID | None = Field(default=None, alias="revisionId")