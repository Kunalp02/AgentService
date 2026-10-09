from __future__ import annotations

from typing import Literal

from agent_execution.agents.graph.state import AgentGraphState

Route = Literal["run_tools", "finalize_answer", "persist_memory", "__end__"]


def route_after_prepare(state: AgentGraphState) -> Literal["call_llm", "__end__"]:
    if state.get("stop_reason") == "failed":
        return "__end__"
    return "call_llm"


def route_after_llm(state: AgentGraphState) -> Route:
    if state.get("stop_reason") == "failed":
        return "__end__"
    if not state.get("has_tools"):
        return "persist_memory"
    tool_round = state.get("tool_round", 0)
    max_rounds = state.get("max_tool_rounds", 5)
    if not state.get("tool_calls"):
        return "persist_memory"
    if tool_round >= max_rounds:
        return "finalize_answer"
    return "run_tools"


def route_after_tools(state: AgentGraphState) -> Literal["call_llm", "__end__"]:
    if state.get("stop_reason") == "failed":
        return "__end__"
    return "call_llm"


def route_after_finalize(state: AgentGraphState) -> Literal["persist_memory", "__end__"]:
    if state.get("stop_reason") == "failed":
        return "__end__"
    return "persist_memory"
