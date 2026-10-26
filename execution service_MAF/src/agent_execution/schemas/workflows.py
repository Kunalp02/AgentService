from __future__ import annotations

from datetime import datetime
from typing import Any, Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field


class WorkflowNode(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    id: str
    type: Literal[
        "start",
        "agent",
        "condition",
        "end",
        "parallel",
        "join",
        "human",
        "workflow",
    ]
    agent_id: UUID | None = Field(default=None, alias="agentId")
    workflow_id: UUID | None = Field(default=None, alias="workflowId")
    role: Literal["supervisor", "specialist", "default"] | None = None
    input: str = "{{input}}"
    output: str = ""
    on: str = ""
    position: dict[str, float] | None = None


class WorkflowEdge(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    from_node: str = Field(alias="from")
    to_node: str = Field(alias="to")
    when: str = ""
    max_loops: int | None = Field(default=None, alias="maxLoops")


class WorkflowDefinition(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    nodes: list[WorkflowNode] = Field(default_factory=list)
    edges: list[WorkflowEdge] = Field(default_factory=list)
    max_steps: int = Field(default=30, alias="maxSteps")


class WorkflowUpsert(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    name: str
    definition: WorkflowDefinition


class WorkflowSummary(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    workflow_id: UUID = Field(alias="workflowId")
    name: str
    status: str
    updated_at: datetime = Field(alias="updatedAt")


class WorkflowDocument(WorkflowSummary):
    definition: WorkflowDefinition
    created_at: datetime = Field(alias="createdAt")


class WorkflowRunRequest(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    input: str
    session_id: str | None = Field(default=None, alias="sessionId")
    user_id: str | None = Field(default=None, alias="userId")
    org_id: str | None = Field(default=None, alias="orgId")


class WorkflowResumeRequest(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    input: str = "approved"


class WorkflowStepTrace(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    node_id: str = Field(alias="nodeId")
    type: str
    agent_id: UUID | None = Field(default=None, alias="agentId")
    status: str
    input: str = ""
    output: str = ""
    output_key: str = Field(default="", alias="outputKey")
    error: str = ""


class WorkflowRunResponse(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    workflow_run_id: UUID = Field(alias="workflowRunId")
    workflow_id: UUID = Field(alias="workflowId")
    status: str
    output: str = ""
    error: str = ""
    session_id: str = Field(alias="sessionId")
    user_id: str = Field(alias="userId")
    steps: list[WorkflowStepTrace] = Field(default_factory=list)
    state: dict[str, Any] = Field(default_factory=dict)



