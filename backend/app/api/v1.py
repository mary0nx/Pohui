"""Version 1 API router: every module router is mounted under /api/v1."""

from __future__ import annotations

from fastapi import APIRouter

from app.config import get_settings
from app.modules.auth.router import router as auth_router
from app.modules.families.router import router as families_router

api_router = APIRouter(prefix="/api/v1")
api_router.include_router(auth_router)
api_router.include_router(families_router)


@api_router.get("/meta", tags=["meta"])
async def meta() -> dict[str, object]:
    """Public, non-secret configuration the Mini App needs before login."""
    s = get_settings()
    return {
        "env": s.app_env,
        "dev_auth": s.dev_auth_active,
        "ai_available": s.ai_configured,
        "bot_username": s.telegram_bot_username or None,
        "storage": s.storage_backend,
        "max_upload_mb": s.max_upload_mb,
    }
