"""OpenAI Chat Completions adapter (also works with OpenAI-compatible endpoints)."""

from __future__ import annotations

import logging
from typing import Any

import openai

from app.ai.providers.base import AIUnavailable, LLMResponse, ToolCall
from app.config import Settings

log = logging.getLogger(__name__)


class OpenAIProvider:
    name = "openai"

    def __init__(self, settings: Settings) -> None:
        self.model = settings.ai_model
        self.client = openai.AsyncOpenAI(
            api_key=settings.openai_api_key.get_secret_value(),
            base_url=settings.openai_base_url or None,
            timeout=settings.ai_timeout_seconds,
            max_retries=2,
        )

    async def complete(
        self, messages: list[dict[str, Any]], tools: list[dict[str, Any]], *, max_tokens: int = 1200
    ) -> LLMResponse:
        kwargs: dict[str, Any] = {
            "model": self.model,
            "messages": messages,
            "max_completion_tokens": max_tokens,
        }
        if tools:
            kwargs["tools"] = [{"type": "function", "function": t} for t in tools]
            kwargs["tool_choice"] = "auto"
        try:
            resp = await self.client.chat.completions.create(**kwargs)
        except openai.RateLimitError as exc:
            raise AIUnavailable(
                "AI-сервис перегружен или исчерпан лимит, попробуйте позже", "ai_rate_limited"
            ) from exc
        except openai.APITimeoutError as exc:
            raise AIUnavailable("AI не ответил вовремя, попробуйте ещё раз", "ai_timeout") from exc
        except openai.AuthenticationError as exc:
            log.error("openai authentication failed - check OPENAI_API_KEY")
            raise AIUnavailable("AI не настроен: ключ API отклонён", "ai_not_configured") from exc
        except openai.APIConnectionError as exc:
            raise AIUnavailable("Нет связи с AI-сервисом", "ai_unavailable") from exc
        except openai.APIStatusError as exc:
            log.warning("openai error", extra={"ctx": {"status": exc.status_code}})
            raise AIUnavailable("AI-сервис вернул ошибку, попробуйте позже", "ai_error") from exc
        if not resp.choices:
            raise AIUnavailable("AI вернул пустой ответ", "ai_error")
        msg = resp.choices[0].message
        calls = [
            ToolCall(id=c.id, name=c.function.name, arguments=c.function.arguments or "{}")
            for c in (msg.tool_calls or [])
            if getattr(c, "type", "function") == "function"
        ]
        usage = resp.usage
        return LLMResponse(
            text=msg.content or (msg.refusal if getattr(msg, "refusal", None) else None),
            tool_calls=calls,
            input_tokens=usage.prompt_tokens if usage else 0,
            output_tokens=usage.completion_tokens if usage else 0,
        )
