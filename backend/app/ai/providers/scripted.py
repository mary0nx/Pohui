"""Deterministic provider for tests: replays scripted responses or calls a function."""

from __future__ import annotations

import json
from collections.abc import Callable
from typing import Any

from app.ai.providers.base import LLMResponse, ToolCall


class ScriptedProvider:
    name = "scripted"

    def __init__(self, script: list[LLMResponse] | Callable[[list[dict[str, Any]], list[dict[str, Any]]], LLMResponse]) -> None:
        self.script = script
        self.calls: list[list[dict[str, Any]]] = []
        self.tools_seen: list[list[dict[str, Any]]] = []

    async def complete(self, messages: list[dict[str, Any]], tools: list[dict[str, Any]], *, max_tokens: int = 1200) -> LLMResponse:
        self.calls.append(messages)
        self.tools_seen.append(tools)
        if callable(self.script):
            return self.script(messages, tools)
        if not self.script:
            return LLMResponse(text="Готово.", input_tokens=10, output_tokens=5)
        return self.script.pop(0)


def call(name: str, args: dict[str, Any], call_id: str = "call_1") -> LLMResponse:
    return LLMResponse(text=None, tool_calls=[ToolCall(id=call_id, name=name, arguments=json.dumps(args, ensure_ascii=False))], input_tokens=100, output_tokens=20)


def text(content: str) -> LLMResponse:
    return LLMResponse(text=content, input_tokens=100, output_tokens=20)
