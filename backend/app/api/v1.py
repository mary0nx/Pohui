"""Version 1 API router: every module router is mounted under /api/v1."""

from __future__ import annotations

from fastapi import APIRouter

from app.ai.providers import ai_available
from app.config import get_settings
from app.modules.assistant.router import router as assistant_router
from app.modules.auth.router import router as auth_router
from app.modules.calendar.router import router as calendar_router
from app.modules.families.router import router as families_router
from app.modules.finance.router import router as finance_router
from app.modules.notifications.router import router as notifications_router
from app.modules.shopping.router import router as shopping_router
from app.modules.tasks.router import router as tasks_router

api_router = APIRouter(prefix="/api/v1")
api_router.include_router(auth_router)
api_router.include_router(families_router)
api_router.include_router(finance_router)
api_router.include_router(calendar_router)
api_router.include_router(shopping_router)
api_router.include_router(tasks_router)
api_router.include_router(notifications_router)
api_router.include_router(assistant_router)


@api_router.get("/meta", tags=["meta"])
async def meta() -> dict[str, object]:
    """Public, non-secret configuration the Mini App needs before login."""
    s = get_settings()
    return {
        "env": s.app_env,
        "dev_auth": s.dev_auth_active,
        "ai_available": ai_available(),
        "bot_username": s.telegram_bot_username or None,
        "storage": s.storage_backend,
        "max_upload_mb": s.max_upload_mb,
    }
