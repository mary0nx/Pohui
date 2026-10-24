from __future__ import annotations

from functools import lru_cache

from app.ai.providers.base import AIUnavailable, LLMProvider
from app.config import get_settings

_override: LLMProvider | None = None


def set_provider(provider: LLMProvider | None) -> None:
    """Tests inject a ScriptedProvider here."""
    global _override
    _override = provider


def get_provider() -> LLMProvider:
    if _override is not None:
        return _override
    settings = get_settings()
    if not settings.ai_configured:
        raise AIUnavailable(
            "AI-ассистент не настроен: укажите OPENAI_API_KEY и AI_MODEL", "ai_not_configured"
        )
    return _openai_provider()


@lru_cache(maxsize=1)
def _openai_provider() -> LLMProvider:
    from app.ai.providers.openai_provider import OpenAIProvider

    return OpenAIProvider(get_settings())


def ai_available() -> bool:
    return _override is not None or get_settings().ai_configured
