"""Application settings loaded from environment variables (see .env.example)."""

from __future__ import annotations

import hashlib
import hmac
from functools import lru_cache
from typing import Annotated, Literal
from urllib.parse import parse_qsl, urlencode, urlsplit, urlunsplit
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from pydantic import Field, SecretStr, field_validator, model_validator
from pydantic_settings import BaseSettings, NoDecode, SettingsConfigDict


class ConfigError(RuntimeError):
    """Raised when required configuration is missing or unsafe."""


def normalize_database_url(url: str) -> str:
    """Accept the plain `postgres://...` strings hosting providers hand out (Neon, Render, ...).

    The app needs the asyncpg driver; asyncpg understands `ssl=` but not libpq's `sslmode=` or
    `channel_binding=`. Transaction-mode poolers break asyncpg's prepared statements, so Neon
    "-pooler" hosts are replaced by the direct endpoint of the same database and Supabase's
    transaction pooler port 6543 by its session pooler port 5432 (same host, IPv4).
    """
    # Supabase shows the string with a "[YOUR-PASSWORD]" placeholder; brackets would be read
    # as an IPv6 host. DATABASE_PASSWORD can then supply the real password.
    url = url.strip().replace("[YOUR-PASSWORD]", "YOUR-PASSWORD")
    try:
        parts = urlsplit(url)
    except ValueError:
        return url  # reported as database_url_invalid by /health/ready
    if parts.scheme in ("postgres", "postgresql"):
        parts = parts._replace(scheme="postgresql+asyncpg")
    if parts.scheme != "postgresql+asyncpg":
        return url
    query = dict(parse_qsl(parts.query, keep_blank_values=True))
    sslmode = query.pop("sslmode", None)
    query.pop("channel_binding", None)
    if sslmode and sslmode != "disable" and "ssl" not in query:
        query["ssl"] = "require"
    userinfo, at, hostport = parts.netloc.rpartition("@")
    if "-pooler." in hostport:
        hostport = hostport.replace("-pooler.", ".", 1)
    if hostport.endswith(".pooler.supabase.com:6543"):
        hostport = hostport.removesuffix(":6543") + ":5432"
    netloc = f"{userinfo}{at}{hostport}"
    return urlunsplit(parts._replace(netloc=netloc, query=urlencode(query)))


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=(".env", "../.env"), env_file_encoding="utf-8", extra="ignore"
    )

    app_env: Literal["development", "test", "production"] = "development"
    app_secret_key: SecretStr = SecretStr("")
    log_level: str = "INFO"

    database_url: str = "postgresql+asyncpg://familyos:familyos@localhost:5432/familyos"
    # Optional: replaces the password inside DATABASE_URL (any characters, encoded for you).
    # Lets a hosted database password be changed without editing the whole connection string.
    database_password: SecretStr = SecretStr("")
    db_pool_size: int = 10
    db_max_overflow: int = 10
    redis_url: str = ""

    frontend_url: str = "http://localhost:5173"
    backend_url: str = "http://localhost:8000"
    cors_origins: Annotated[list[str], NoDecode] = Field(
        default_factory=lambda: ["http://localhost:5173"]
    )
    # Optional regex for extra allowed origins, e.g. Cloudflare Pages deployment previews:
    # ^https://[a-z0-9-]+\.my-family-app\.pages\.dev$  (auth is a bearer token, no cookies).
    cors_origin_regex: str = ""
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
    # Off: files are streamed by the API, which re-checks access on every download. On: the
    # client gets a presigned bucket URL (only for providers that support presigning).
    storage_presigned_downloads: bool = False
    # Local storage on a disk wiped by every deploy/restart (Render). None = detect Render.
    storage_ephemeral: bool | None = None
    max_upload_mb: int = 15
    # Hosts an external image source may serve shopping thumbnails from (https only).
    image_allowed_hosts: Annotated[list[str], NoDecode] = Field(default_factory=list)

    # Limits
    max_request_body_kb: int = 1024
    rate_limit_per_minute: int = 240
    auth_rate_limit_per_minute: int = 20

    # «Мой маршрут». The Wrocław open data schedule (GTFS, CC0) needs no key. Jakdojade's
    # official API is used only with the partner keys it issues on request (biuro@jakdojade.pl);
    # when on, the start and end positions of a search are sent to Jakdojade.
    transit_updates_enabled: bool = True
    jakdojade_api_key: SecretStr = SecretStr("")
    jakdojade_api_secret: SecretStr = SecretStr("")

    # Worker
    worker_tick_seconds: float = 20.0

    # Single-process mode for hosts that run one service (e.g. a free Render web service):
    # the API process also runs the worker loop and receives Telegram updates at /tg/webhook.
    embedded_worker: bool = False
    embedded_bot: bool = False
    # Public URL Render assigns to the service; fills BACKEND_URL / TELEGRAM_WEBHOOK_URL if unset.
    render_external_url: str = ""
    # Render sets RENDER=true in every service.
    render: bool = False
    # Self-ping interval that keeps a free Render instance (and its embedded worker) awake.
    # None = automatic: every 10 minutes on Render with EMBEDDED_WORKER, otherwise off; 0 = off.
    keep_awake_minutes: float | None = None

    @field_validator("storage_backend", mode="before")
    @classmethod
    def _storage_backend(cls, value: object) -> object:
        # Values typed on a phone often get a capital letter or a trailing space ("S3 ").
        return value.strip().lower() if isinstance(value, str) else value

    @field_validator(
        "storage_endpoint",
        "storage_region",
        "storage_bucket",
        "storage_access_key",
        "storage_secret_key",
        mode="before",
    )
    @classmethod
    def _strip_storage(cls, value: object) -> object:
        return value.strip() if isinstance(value, str) else value

    @field_validator("cors_origins", "image_allowed_hosts", mode="before")
    @classmethod
    def _split_origins(cls, value: object) -> object:
        if isinstance(value, str):
            return [v.strip() for v in value.split(",") if v.strip()]
        return value

    @field_validator("database_url")
    @classmethod
    def _normalize_db_url(cls, value: str) -> str:
        return normalize_database_url(value)

    @field_validator("default_timezone")
    @classmethod
    def _check_tz(cls, value: str) -> str:
        try:
            ZoneInfo(value)
        except ZoneInfoNotFoundError as exc:
            raise ValueError(f"Unknown timezone: {value}") from exc
        return value

    @model_validator(mode="after")
    def _apply_database_password(self) -> Settings:
        password = self.database_password.get_secret_value()
        if password:
            from sqlalchemy.engine import make_url

            url = make_url(self.database_url).set(password=password)
            self.database_url = url.render_as_string(hide_password=False)
        return self

    @model_validator(mode="after")
    def _derive_public_urls(self) -> Settings:
        public = self.render_external_url.strip().rstrip("/")
        if public:
            if "backend_url" not in self.model_fields_set:
                self.backend_url = public
            if not self.telegram_webhook_url:
                self.telegram_webhook_url = f"{public}/tg/webhook"
        return self

    @model_validator(mode="after")
    def _check_production(self) -> Settings:
        if self.app_env == "production":
            problems: list[str] = []
            if self.embedded_bot and not self.telegram_webhook_url.startswith("https://"):
                problems.append("EMBEDDED_BOT needs an https TELEGRAM_WEBHOOK_URL")
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
    def keep_awake_url(self) -> str | None:
        """Own public /health URL to ping, or None when self-ping is off."""
        minutes = self.keep_awake_minutes
        if minutes is None:
            on_render = self.render or bool(self.render_external_url)
            minutes = 10.0 if on_render and self.embedded_worker else 0.0
        base = self.render_external_url or self.backend_url
        if minutes <= 0 or not base:
            return None
        return f"{base.rstrip('/')}/health"

    @property
    def uploads_enabled(self) -> bool:
        """False when files would land on a disk that the next deploy wipes."""
        if self.storage_backend == "s3":
            return True
        ephemeral = self.storage_ephemeral
        if ephemeral is None:
            ephemeral = self.render or bool(self.render_external_url)
        return not ephemeral

    @property
    def jakdojade_configured(self) -> bool:
        return bool(
            self.jakdojade_api_key.get_secret_value()
            and self.jakdojade_api_secret.get_secret_value()
        )

    @property
    def telegram_configured(self) -> bool:
        return bool(self.telegram_bot_token.get_secret_value())

    def webhook_secret(self) -> str:
        """Secret Telegram echoes in X-Telegram-Bot-Api-Secret-Token.

        Derived from APP_SECRET_KEY when not set explicitly (Telegram allows only A-Z, a-z,
        0-9, _ and -, which a hex digest satisfies).
        """
        explicit = self.telegram_webhook_secret.get_secret_value()
        if explicit:
            return explicit
        return hmac.new(self.secret_key_bytes(), b"telegram-webhook", hashlib.sha256).hexdigest()

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
