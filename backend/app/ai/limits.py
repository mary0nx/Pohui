"""Daily per-user request limits and per-family token budgets."""

from __future__ import annotations

from sqlalchemy import func, select
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import get_settings
from app.core.errors import RateLimited
from app.core.time import local_today
from app.models import AiUsageDaily
from app.security.access import FamilyContext


async def usage_today(db: AsyncSession, ctx: FamilyContext) -> tuple[int, int]:
    day = local_today(ctx.family.timezone)
    requests = await db.scalar(
        select(func.coalesce(func.sum(AiUsageDaily.requests), 0)).where(
            AiUsageDaily.user_id == ctx.user_id,
            AiUsageDaily.family_id == ctx.family_id,
            AiUsageDaily.day == day,
        )
    )
    tokens = await db.scalar(
        select(
            func.coalesce(func.sum(AiUsageDaily.input_tokens + AiUsageDaily.output_tokens), 0)
        ).where(AiUsageDaily.family_id == ctx.family_id, AiUsageDaily.day == day)
    )
    return int(requests or 0), int(tokens or 0)


async def check_limits(db: AsyncSession, ctx: FamilyContext) -> None:
    s = get_settings()
    requests, tokens = await usage_today(db, ctx)
    if requests >= s.ai_daily_requests_per_user:
        raise RateLimited(
            "Дневной лимит запросов к AI исчерпан, попробуйте завтра", code="ai_daily_limit"
        )
    if tokens >= s.ai_daily_tokens_per_family:
        raise RateLimited(
            "Дневной бюджет AI для семьи исчерпан, попробуйте завтра", code="ai_token_budget"
        )


async def record_usage(
    db: AsyncSession, ctx: FamilyContext, input_tokens: int, output_tokens: int, requests: int = 0
) -> None:
    import uuid

    day = local_today(ctx.family.timezone)
    await db.execute(
        insert(AiUsageDaily)
        .values(
            id=uuid.uuid4(),
            family_id=ctx.family_id,
            user_id=ctx.user_id,
            day=day,
            requests=requests,
            input_tokens=input_tokens,
            output_tokens=output_tokens,
        )
        .on_conflict_do_update(
            index_elements=["user_id", "family_id", "day"],
            set_={
                "requests": AiUsageDaily.requests + requests,
                "input_tokens": AiUsageDaily.input_tokens + input_tokens,
                "output_tokens": AiUsageDaily.output_tokens + output_tokens,
            },
        )
    )
