from __future__ import annotations

import logging

from langgraph.graph import END, START, StateGraph

from agent_execution.agents.graph.context import AgentGraphContext
from agent_execution.agents.graph.nodes import AgentGraphNodes
from agent_execution.agents.graph.routing import (
    route_after_finalize,
    route_after_llm,
    route_after_prepare,
    route_after_tools,
)
from agent_execution.agents.graph.state import AgentGraphState
from agent_execution.services.execution_trace import describe_exception, trace_record

logger = logging.getLogger(__name__)


def guard_step(step: str, handler):
    """Keep the traces collected so far when a step raises."""

    async def wrapped(state: AgentGraphState) -> AgentGraphState:
        if state.get("stop_reason") == "failed":
            return {}
        try:
            return await handler(state) or {}
        except Exception as exc:
            logger.exception("execution.step.failed step=%s", step)
            detail = describe_exception(exc)
            return {
                "stop_reason": "failed",
                "error": detail,
                "failed_step": step,
                "failure_code": getattr(exc, "code", "RUN_FAILED"),
                "failure_status": getattr(exc, "status_code", 500),
                "steps": [f"{step}:failed"],
                "traces": [trace_record(step, status="failed", error=detail)],
            }

    return wrapped


def build_execution_graph(context: AgentGraphContext):
    nodes = AgentGraphNodes(context)
    graph = StateGraph(AgentGraphState)
    graph.add_node("prepare_context", guard_step("prepare_context", nodes.prepare_context))
    graph.add_node("call_llm", guard_step("call_llm", nodes.call_llm))
    graph.add_node("run_tools", guard_step("run_tools", nodes.run_tools))
    graph.add_node("finalize_answer", guard_step("finalize_answer", nodes.finalize_answer))
    graph.add_node("persist_memory", guard_step("persist_memory", nodes.persist_memory))
    graph.add_edge(START, "prepare_context")
    graph.add_conditional_edges(
        "prepare_context",
        route_after_prepare,
        {"call_llm": "call_llm", "__end__": END},
    )
    graph.add_conditional_edges(
        "call_llm",
        route_after_llm,
        {
            "run_tools": "run_tools",
            "finalize_answer": "finalize_answer",
            "persist_memory": "persist_memory",
            "__end__": END,
        },
    )
    graph.add_conditional_edges(
        "run_tools",
        route_after_tools,
        {"call_llm": "call_llm", "__end__": END},
    )
    graph.add_conditional_edges(
        "finalize_answer",
        route_after_finalize,
        {"persist_memory": "persist_memory", "__end__": END},
    )
    graph.add_edge("persist_memory", END)

    return graph.compile()
