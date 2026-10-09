from __future__ import annotations

import json
import logging
import re
from collections.abc import AsyncIterator
from dataclasses import dataclass, field
from typing import Any

import httpx

from agent_execution.core.exceptions import ServiceError
from agent_execution.infrastructure.auth.service_token_provider import (
    ServiceAuthTokenProvider,
)
from agent_execution.settings import Settings

logger = logging.getLogger(__name__)

_TOOL_CALL_BLOCK = re.compile(r"<tool_call>\s*(.*?)\s*</tool_call>", re.IGNORECASE | re.DOTALL)
_HARMONY_CALL = re.compile(
    r"to=functions\.([A-Za-z0-9_\-.]+).*?<\|message\|>\s*(\{.*?\})\s*(?:<\|call\|>|<\|end\|>|$)",
    re.DOTALL,
)
_FUNCTION_TAG = re.compile(
    r"<function=([A-Za-z0-9_\-.]+)>(.*?)</function>",
    re.IGNORECASE | re.DOTALL,
)
_PARAMETER_TAG = re.compile(
    r"<parameter=([A-Za-z0-9_\-.]+)>\s*(.*?)\s*</parameter>",
    re.IGNORECASE | re.DOTALL,
)


@dataclass(slots=True)
class LlmToolCall:
    id: str
    name: str
    arguments: dict[str, Any]


@dataclass(slots=True)
class ChatCompletionResult:
    content: str
    tool_calls: list[LlmToolCall] = field(default_factory=list)


class BifrostLlmGateway:
    def __init__(
        self, settings: Settings, token_provider: ServiceAuthTokenProvider | None = None
    ) -> None:
        self._settings = settings
        self._token_provider = token_provider
        timeout = httpx.Timeout(settings.llm_gateway_timeout_seconds, connect=10.0)
        self._client = httpx.AsyncClient(timeout=timeout, verify=False)
        self._default_base_url = (
            settings.bifrost_gateway_base_url.rstrip("/")
            if settings.bifrost_gateway_base_url
            else ""
        )

    async def aclose(self) -> None:
        await self._client.aclose()

    def _resolve_base_url(self, base_url: str | None) -> str:
        candidate = (base_url or "").strip().rstrip("/")
        return candidate or self._default_base_url

    def _use_mock(self, resolved_base_url: str) -> bool:
        return self._settings.llm_gateway_mock or not resolved_base_url

    def _full_url(self, resolved_base_url: str) -> str:
        path = self._settings.llm_chat_completions_path
        if not path.startswith("/"):
            path = "/" + path
        return f"{resolved_base_url}{path}"

    async def _headers(
        self, bearer_token: str | None, api_key: str | None = None
    ) -> dict[str, str]:
        headers = {"Content-Type": "application/json", "Accept": "application/json"}
        token = api_key or self._settings.bifrost_gateway_api_key or bearer_token
        if not token and self._token_provider is not None:
            token = await self._token_provider.get_token()
        if token:
            headers["Authorization"] = f"Bearer {token}"
        return headers

    @staticmethod
    def _parse_arguments(args_raw: Any) -> dict[str, Any]:
        if isinstance(args_raw, dict):
            return args_raw
        if args_raw is None or args_raw == "":
            return {}
        if isinstance(args_raw, str):
            try:
                parsed = json.loads(args_raw)
            except json.JSONDecodeError:
                return {"input": args_raw}
            if isinstance(parsed, dict):
                return parsed
            return {"input": parsed}
        return {"input": args_raw}

    @staticmethod
    def _coerce_call_items(raw: Any) -> list[Any]:
        if raw is None:
            return []
        if isinstance(raw, str):
            text = raw.strip()
            if not text or text.lower() == "null":
                return []
            try:
                raw = json.loads(text)
            except json.JSONDecodeError:
                return []
        if isinstance(raw, dict):
            return [raw]
        if isinstance(raw, list):
            return raw
        return []

    @staticmethod
    def _tool_call_from_item(item: dict[str, Any], index: int) -> LlmToolCall | None:
        function = item.get("function") if isinstance(item.get("function"), dict) else {}
        name = (
            function.get("name")
            or item.get("name")
            or item.get("tool_name")
            or item.get("toolName")
        )
        if not name:
            return None
        if "arguments" in function:
            args_raw = function.get("arguments")
        elif "arguments" in item:
            args_raw = item.get("arguments")
        elif "args" in item:
            args_raw = item.get("args")
        elif "input" in item:
            args_raw = item.get("input")
        else:
            args_raw = {}
        return LlmToolCall(
            id=str(item.get("id") or f"call_{index}_{name}"),
            name=str(name),
            arguments=BifrostLlmGateway._parse_arguments(args_raw),
        )

    @staticmethod
    def _parse_structured_tool_calls(message: dict[str, Any]) -> list[LlmToolCall]:
        parsed: list[LlmToolCall] = []
        sources = [
            message.get("tool_calls"),
            message.get("toolCalls"),
        ]
        legacy = message.get("function_call")
        if legacy:
            sources.append([legacy])
        for source in sources:
            for index, item in enumerate(BifrostLlmGateway._coerce_call_items(source)):
                if not isinstance(item, dict):
                    continue
                call = BifrostLlmGateway._tool_call_from_item(item, index)
                if call is not None:
                    parsed.append(call)
            if parsed:
                return parsed
        return []

    @staticmethod
    def _split_content(content: Any) -> tuple[list[LlmToolCall], str]:
        calls: list[LlmToolCall] = []
        text_parts: list[str] = []
        if isinstance(content, list):
            for index, block in enumerate(content):
                if isinstance(block, str):
                    text_parts.append(block)
                    continue
                if not isinstance(block, dict):
                    continue
                block_type = str(block.get("type") or "")
                if block_type in {"tool_use", "tool_call", "function_call"}:
                    call = BifrostLlmGateway._tool_call_from_item(block, index)
                    if call is not None:
                        calls.append(call)
                        continue
                text = block.get("text") or block.get("content")
                if text:
                    text_parts.append(str(text))
            content_text = "\n".join(text_parts)
        elif content is None:
            content_text = ""
        else:
            content_text = str(content)

        if calls:
            return calls, content_text

        for index, match in enumerate(_TOOL_CALL_BLOCK.finditer(content_text)):
            payload = match.group(1).strip()
            try:
                parsed = json.loads(payload)
            except json.JSONDecodeError:
                parsed = None
            if isinstance(parsed, dict):
                call = BifrostLlmGateway._tool_call_from_item(parsed, index)
                if call is not None:
                    calls.append(call)
                    continue
            if isinstance(parsed, list):
                for nested in parsed:
                    if isinstance(nested, dict):
                        call = BifrostLlmGateway._tool_call_from_item(nested, index)
                        if call is not None:
                            calls.append(call)
        if calls:
            cleaned = _TOOL_CALL_BLOCK.sub("", content_text).strip()
            return calls, cleaned

        for index, match in enumerate(_HARMONY_CALL.finditer(content_text)):
            calls.append(
                LlmToolCall(
                    id=f"call_harmony_{index}_{match.group(1)}",
                    name=match.group(1),
                    arguments=BifrostLlmGateway._parse_arguments(match.group(2)),
                )
            )
        if calls:
            return calls, ""

        for index, match in enumerate(_FUNCTION_TAG.finditer(content_text)):
            arguments = {
                param.group(1): param.group(2)
                for param in _PARAMETER_TAG.finditer(match.group(2))
            }
            calls.append(
                LlmToolCall(
                    id=f"call_fn_{index}_{match.group(1)}",
                    name=match.group(1),
                    arguments=arguments,
                )
            )
        if calls:
            cleaned = _FUNCTION_TAG.sub("", content_text).strip()
            return calls, cleaned

        stripped = content_text.strip()
        if stripped.startswith("{") and stripped.endswith("}"):
            try:
                parsed = json.loads(stripped)
            except json.JSONDecodeError:
                parsed = None
            if isinstance(parsed, dict) and any(
                key in parsed for key in ("arguments", "args", "input")
            ) and (
                parsed.get("name") or parsed.get("tool_name") or parsed.get("toolName")
            ):
                call = BifrostLlmGateway._tool_call_from_item(parsed, 0)
                if call is not None:
                    return [call], ""
        return [], content_text

    @staticmethod
    def _extract_result(data: dict[str, Any]) -> ChatCompletionResult:
        if not isinstance(data, dict):
            raise ServiceError("LLM_ERROR", "Gateway returned a non-JSON body.", 502)
        choices = data.get("choices") or []
        if not choices and isinstance(data.get("data"), dict):
            choices = data["data"].get("choices") or []
        if not choices:
            raise ServiceError("LLM_ERROR", "Gateway returned no choices.", 502)
        message = choices[0].get("message") or {}
        if not isinstance(message, dict):
            message = {}
        content_calls, content_text = BifrostLlmGateway._split_content(message.get("content"))
        tool_calls = BifrostLlmGateway._parse_structured_tool_calls(message) or content_calls
        if not tool_calls:
            for key in ("reasoning", "reasoning_content", "reasoningContent"):
                extra_calls, _extra_text = BifrostLlmGateway._split_content(message.get(key))
                if extra_calls:
                    tool_calls = extra_calls
                    break
        content = content_text
        if not content and not tool_calls:
            raise ServiceError("LLM_ERROR", "Gateway returned empty content.", 502)
        return ChatCompletionResult(content=content, tool_calls=tool_calls)

    @staticmethod
    def _mock_content(model: str, messages: list[dict[str, Any]]) -> str:
        last_user = next(
            (
                msg.get("content", "")
                for msg in reversed(messages)
                if msg.get("role") == "user"
            ),
            "",
        )
        return f"[mock-llm:{model}] {last_user}"

    async def chat_with_messages(
        self,
        *,
        model: str,
        messages: list[dict[str, Any]],
        temperature: float,
        bearer_token: str | None = None,
        tools: list[dict[str, Any]] | None = None,
        base_url: str | None = None,
        api_key: str | None = None,
        max_tokens: int | None = None,
    ) -> ChatCompletionResult:
        resolved_base_url = self._resolve_base_url(base_url)
        if self._use_mock(resolved_base_url):
            return ChatCompletionResult(content=self._mock_content(model, messages))
        payload: dict[str, Any] = {
            "model": model,
            "messages": messages,
            "temperature": temperature,
            "stream": False,
        }
        if tools:
            payload["tools"] = tools
            payload["tool_choice"] = "auto"
        if max_tokens is not None and max_tokens > 0:
            payload["max_tokens"] = max_tokens
        response = await self._client.post(
            self._full_url(resolved_base_url),
            headers=await self._headers(bearer_token, api_key),
            json=payload,
        )
        if response.status_code >= 400:
            raise ServiceError(
                "LLM_ERROR",
                f"Gateway chat failed ({response.status_code}): {response.text[:300]}",
                response.status_code if response.status_code < 500 else 502,
            )
        return self._extract_result(response.json())

    async def stream(
        self,
        *,
        model: str,
        system_prompt: str,
        user_input: str,
        temperature: float,
        bearer_token: str | None = None,
        base_url: str | None = None,
        api_key: str | None = None,
    ) -> AsyncIterator[str]:
        resolved_base_url = self._resolve_base_url(base_url)
        if self._use_mock(resolved_base_url):
            yield self._mock_content(
                model,
                [{"role": "user", "content": user_input}],
            )
            return
        headers = {
            **(await self._headers(bearer_token, api_key)),
            "Accept": "text/event-stream",
        }
        payload = {
            "model": model,
            "messages": [
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_input},
            ],
            "temperature": temperature,
            "stream": True,
        }
        async with self._client.stream(
            "POST", self._full_url(resolved_base_url), headers=headers, json=payload
        ) as response:
            if response.status_code >= 400:
                body = await response.aread()
                raise ServiceError(
                    "LLM_ERROR",
                    f"Gateway stream failed ({response.status_code}): {body.decode()[:300]}",
                    response.status_code if response.status_code < 500 else 502,
                )
            async for line in response.aiter_lines():
                if not line or not line.startswith("data:"):
                    continue
                data_str = line[5:].strip()
                if data_str == "[DONE]":
                    break
                try:
                    chunk = json.loads(data_str)
                except json.JSONDecodeError:
                    logger.debug("Skipping non-JSON SSE line")
                    continue
                choices = chunk.get("choices") or []
                if not choices:
                    continue
                text = (choices[0].get("delta") or {}).get("content")
                if text:
                    yield str(text)
