from __future__ import annotations

from typing import Any


def trace_record(
    step: str,
    *,
    status: str = "ok",
    detail: str | None = None,
    error: str | None = None,
) -> dict[str, Any]:
    return {
        "step": step,
        "status": status,
        "detail": _clip(detail),
        "error": _clip(error),
    }


def describe_exception(exc: BaseException) -> str:
    code = getattr(exc, "code", None)
    message = str(exc).strip() or type(exc).__name__
    if code:
        return f"{code}: {message}"
    return message


def is_llm_step(step: str) -> bool:
    return step == "finalize_answer" or step.startswith("call_llm")


def summarize_llm_call(
    traces: list[dict[str, Any]] | None,
    *,
    model: str | None = None,
    failed_step: str | None = None,
    stop_reason: str | None = None,
) -> dict[str, Any]:
    """Say whether the model ran, failed, or a later step failed after it returned."""
    items = list(traces or [])
    if not failed_step:
        failed_step = next(
            (
                str(item.get("step"))
                for item in items
                if item.get("status") == "failed" and item.get("step")
            ),
            None,
        )
    llm_steps = [item for item in items if is_llm_step(str(item.get("step") or ""))]
    if any(item.get("status") == "failed" for item in llm_steps):
        status = "failed"
    elif not llm_steps:
        status = "not_called"
    elif stop_reason == "failed":
        status = "completed_before_failure"
    else:
        status = "completed"
    return {
        "status": status,
        "model": model,
        "calls": sum(1 for item in llm_steps if item.get("status") == "ok"),
        "failedStep": failed_step,
    }


def _clip(value: str | None, limit: int = 2000) -> str | None:
    if value is None:
        return None
    text = str(value).strip()
    if not text:
        return None
    if len(text) <= limit:
        return text
    return text[: limit - 1] + "…"
