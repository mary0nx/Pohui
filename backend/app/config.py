"""Application settings loaded from environment variables (see .env.example)."""

from __future__ import annotations

from functools import lru_cache
from typing import Annotated, Literal
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from pydantic import Field, SecretStr, field_validator, model_validator
from pydantic_settings import BaseSettings, NoDecode, SettingsConfigDict


class ConfigError(RuntimeError):
    """Raised when required configuration is missing or unsafe."""


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=(".env", "../.env"), env_file_encoding="utf-8", extra="ignore"
    )

    app_env: Literal["development", "test", "production"] = "development"
    app_secret_key: SecretStr = SecretStr("")
    log_level: str = "INFO"

    database_url: str = "postgresql+asyncpg://familyos:familyos@localhost:5432/familyos"
    db_pool_size: int = 10
    redis_url: str = ""

    frontend_url: str = "http://localhost:5173"
    backend_url: str = "http://localhost:8000"
    cors_origins: Annotated[list[str], NoDecode] = Field(default_factory=lambda: ["http://localhost:5173"])
    default_timezone: str = "Europe/Warsaw"
    default_currency: str = "PLN"

    # Telegram
    telegram_bot_token: SecretStr = SecretStr("")
    telegram_bot_username: str = ""
    telegram_mini_app_short_name: str = ""
    telegram_webhook_secret: SecretStr = SecretStr("")
    telegram_webhook_url: str = ""
    telegram_init_data_max_age: int = 86400
    bot_mode: Literal["polling", "webhook"] = "polling"
    bot_webhook_host: str = "0.0.0.0"  # noqa: S104 - bind inside container
    bot_webhook_port: int = 8081

    # Sessions
    session_ttl_hours: int = 24 * 7
    dev_auth_enabled: bool = False

    # AI
    ai_provider: Literal["openai", "disabled"] = "openai"
    openai_api_key: SecretStr = SecretStr("")
    openai_base_url: str = ""
    ai_model: str = ""
    ai_timeout_seconds: float = 45.0
    ai_max_tool_iterations: int = 6
    ai_daily_requests_per_user: int = 100
    ai_daily_tokens_per_family: int = 400_000
    ai_max_message_chars: int = 2000
    ai_proposal_ttl_minutes: int = 30

    # Storage
    storage_backend: Literal["local", "s3"] = "local"
    storage_local_path: str = "./data/files"
    storage_endpoint: str = ""
    storage_region: str = "auto"
    storage_bucket: str = ""
    storage_access_key: SecretStr = SecretStr("")
    storage_secret_key: SecretStr = SecretStr("")
    max_upload_mb: int = 15

    # Limits
    max_request_body_kb: int = 1024
    rate_limit_per_minute: int = 240
    auth_rate_limit_per_minute: int = 20

    # Worker
    worker_tick_seconds: float = 20.0

    @field_validator("cors_origins", mode="before")
    @classmethod
    def _split_origins(cls, value: object) -> object:
        if isinstance(value, str):
            return [v.strip() for v in value.split(",") if v.strip()]
        return value

    @field_validator("default_timezone")
    @classmethod
    def _check_tz(cls, value: str) -> str:
        try:
            ZoneInfo(value)
        except ZoneInfoNotFoundError as exc:
            raise ValueError(f"Unknown timezone: {value}") from exc
        return value

    @model_validator(mode="after")
    def _check_production(self) -> Settings:
        if self.app_env == "production":
            problems: list[str] = []
            if self.dev_auth_enabled:
                problems.append("DEV_AUTH_ENABLED must be false in production")
            if len(self.app_secret_key.get_secret_value()) < 32:
                problems.append("APP_SECRET_KEY must be at least 32 characters")
            if not self.telegram_bot_token.get_secret_value():
                problems.append("TELEGRAM_BOT_TOKEN is required")
            if problems:
                raise ConfigError("; ".join(problems))
        elif self.dev_auth_enabled and self.app_env != "development" and self.app_env != "test":
            raise ConfigError("DEV_AUTH_ENABLED is only allowed in development/test")
        return self

    @property
    def is_production(self) -> bool:
        return self.app_env == "production"

    @property
    def dev_auth_active(self) -> bool:
        return self.dev_auth_enabled and self.app_env in ("development", "test")

    @property
    def ai_configured(self) -> bool:
        return (
            self.ai_provider == "openai"
            and bool(self.openai_api_key.get_secret_value())
            and bool(self.ai_model)
        )

    @property
    def telegram_configured(self) -> bool:
        return bool(self.telegram_bot_token.get_secret_value())

    def secret_key_bytes(self) -> bytes:
        key = self.app_secret_key.get_secret_value()
        if not key:
            if self.is_production:
                raise ConfigError("APP_SECRET_KEY is required")
            key = "insecure-development-key-do-not-use-in-production"
        return key.encode()


@lru_cache
def get_settings() -> Settings:
    return Settings()
