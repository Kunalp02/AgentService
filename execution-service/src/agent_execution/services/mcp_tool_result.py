from __future__ import annotations

import json
from typing import Any


def serialize_mcp_call_result(result: Any) -> str:
    """Turn an MCP CallToolResult into a JSON string for the LLM tool message."""
    if getattr(result, "isError", False) or getattr(result, "is_error", False):
        payload = _content_payload(result)
        return json.dumps({"error": True, "content": payload}, ensure_ascii=True)

    structured = getattr(result, "structuredContent", None) or getattr(
        result, "structured_content", None
    )
    if structured is not None:
        return json.dumps(structured, ensure_ascii=True, default=str)

    payload = _content_payload(result)
    if len(payload) == 1 and payload[0].get("type") == "text":
        return payload[0].get("text") or ""
    return json.dumps(payload, ensure_ascii=True)


def _content_payload(result: Any) -> list[dict[str, Any]]:
    blocks: list[dict[str, Any]] = []
    for block in getattr(result, "content", None) or []:
        text = getattr(block, "text", None)
        if text is not None:
            blocks.append({"type": "text", "text": text})
            continue
        data = getattr(block, "data", None)
        if data is not None:
            blocks.append({"type": "data", "data": data})
            continue
        blocks.append({"type": type(block).__name__, "value": str(block)})
    return blocks
