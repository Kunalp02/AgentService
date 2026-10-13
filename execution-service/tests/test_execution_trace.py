from agent_execution.agents.graph.routing import (
    route_after_finalize,
    route_after_llm,
    route_after_prepare,
    route_after_tools,
)
from agent_execution.services.execution_trace import summarize_llm_call


def test_llm_call_not_reached_when_prepare_fails():
    summary = summarize_llm_call(
        [{"step": "prepare_context", "status": "failed", "error": "TOOLS_API: down"}],
        model="vllm/gpt-oss-120b",
        stop_reason="failed",
    )
    assert summary["status"] == "not_called"
    assert summary["calls"] == 0
    assert summary["failedStep"] == "prepare_context"


def test_llm_call_failed_is_reported():
    summary = summarize_llm_call(
        [
            {"step": "prepare_context", "status": "ok"},
            {"step": "call_llm", "status": "failed", "error": "LLM_ERROR: gateway down"},
        ],
        model="vllm/gpt-oss-120b",
        stop_reason="failed",
    )
    assert summary["status"] == "failed"
    assert summary["failedStep"] == "call_llm"


def test_llm_completed_before_a_later_step_failed():
    summary = summarize_llm_call(
        [
            {"step": "call_llm:r0", "status": "ok", "detail": "model=vllm/gpt-oss-120b"},
            {"step": "run_tools:r1", "status": "ok"},
            {"step": "persist_memory", "status": "failed", "error": "db down"},
        ],
        stop_reason="failed",
    )
    assert summary["status"] == "completed_before_failure"
    assert summary["calls"] == 1
    assert summary["failedStep"] == "persist_memory"


def test_failed_step_stops_the_graph():
    failed = {"stop_reason": "failed", "has_tools": True, "tool_calls": [{}], "tool_round": 0}
    assert route_after_prepare(failed) == "__end__"
    assert route_after_llm(failed) == "__end__"
    assert route_after_tools(failed) == "__end__"
    assert route_after_finalize(failed) == "__end__"
    assert route_after_llm({"has_tools": True, "tool_calls": [{}], "tool_round": 1, "max_tool_rounds": 5}) == "run_tools"
