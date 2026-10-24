"""Provider-neutral LLM interface. Messages use the OpenAI chat format internally;
adapters for other providers translate to and from it."""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Protocol


class AIUnavailable(Exception):
    """The model cannot be reached or refused the request; message is user-safe."""

    def __init__(self, message: str, code: str = "ai_unavailable") -> None:
        super().__init__(message)
        self.message = message
        self.code = code


@dataclass
class ToolCall:
    id: str
    name: str
    arguments: str  # raw JSON produced by the model; validated before use


@dataclass
class LLMResponse:
    text: str | None
    tool_calls: list[ToolCall] = field(default_factory=list)
    input_tokens: int = 0
    output_tokens: int = 0


class LLMProvider(Protocol):
    name: str

    async def complete(
        self, messages: list[dict[str, Any]], tools: list[dict[str, Any]], *, max_tokens: int = 1200
    ) -> LLMResponse: ...
