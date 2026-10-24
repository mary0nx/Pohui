"""Confirmation proposals for AI actions with real consequences.

A proposal stores validated, normalized arguments plus a human preview. Only the user who
caused it can confirm it, only while pending and not expired, and only once: the status
moves pending -> executing -> executed atomically under a row lock, so a double tap or a
retried request returns the stored result instead of acting twice.
"""

from __future__ import annotations

import uuid
from datetime import timedelta
from typing import Any

from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.ai.tools import REGISTRY
from app.ai.tools.registry import Prepared, Tool, ToolContext
from app.config import get_settings
from app.core.audit import audit
from app.core.errors import AppError, Conflict, NotFound
from app.core.time import utcnow
from app.models import AiActionProposal
from app.models.enums import Channel, ProposalStatus
from app.security.access import FamilyContext


class ProposalOut(BaseModel):
    id: uuid.UUID
    tool: str
    summary: str
    details: list[str]
    status: ProposalStatus
    expires_at: Any
    result: dict[str, Any] | None = None
    error: str | None = None


def proposal_out(p: AiActionProposal) -> ProposalOut:
    return ProposalOut(
        id=p.id,
        tool=p.tool_name,
        summary=p.preview.get("summary", ""),
        details=p.preview.get("details", []),
        status=p.status,
        expires_at=p.expires_at,
        result=p.result if p.status == ProposalStatus.executed else None,
        error=(p.result or {}).get("error") if p.status == ProposalStatus.failed else None,
    )


async def create_proposal(tc: ToolContext, tool: Tool, prepared: Prepared) -> AiActionProposal:
    proposal = AiActionProposal(
        family_id=tc.ctx.family_id,
        user_id=tc.ctx.user_id,
        conversation_id=tc.conversation_id,
        tool_name=tool.name,
        arguments=prepared.arguments,
        preview={"summary": prepared.summary, "details": prepared.details},
        target_version=prepared.target_version,
        status=ProposalStatus.pending,
        expires_at=utcnow() + timedelta(minutes=get_settings().ai_proposal_ttl_minutes),
    )
    tc.db.add(proposal)
    await tc.db.flush()
    return proposal


async def _load(db: AsyncSession, ctx: FamilyContext, proposal_id: uuid.UUID) -> AiActionProposal:
    p = await db.scalar(
        select(AiActionProposal)
        .where(
            AiActionProposal.id == proposal_id,
            AiActionProposal.family_id == ctx.family_id,
            AiActionProposal.user_id == ctx.user_id,  # only the requester may confirm
        )
        .with_for_update()
    )
    if p is None:
        raise NotFound("Предложение не найдено")
    return p


async def confirm_proposal(db: AsyncSession, ctx: FamilyContext, proposal_id: uuid.UUID, channel: Channel = Channel.app) -> AiActionProposal:
    p = await _load(db, ctx, proposal_id)
    if p.status in (ProposalStatus.executed, ProposalStatus.failed):
        return p  # idempotent repeat
    if p.status != ProposalStatus.pending:
        raise Conflict("Предложение уже неактуально", code=f"proposal_{p.status.value}")
    now = utcnow()
    if p.expires_at <= now:
        p.status, p.resolved_at = ProposalStatus.expired, now
        await db.commit()
        raise Conflict("Срок подтверждения истёк — попросите ассистента ещё раз", code="proposal_expired")
    tool = REGISTRY.get(p.tool_name)
    if tool is None:
        raise Conflict("Действие больше не поддерживается", code="proposal_unknown_tool")
    tc = ToolContext(db=db, ctx=ctx, channel=channel, conversation_id=p.conversation_id)
    p.status = ProposalStatus.executing
    await db.flush()
    try:
        async with db.begin_nested():
            if tool.current_version is not None and p.target_version is not None:
                current = await tool.current_version(tc, p.arguments)
                if current != p.target_version:
                    raise Conflict("Объект изменился после предложения — запросите действие заново", code="proposal_stale")
            result = await tool.handler(tc, p.arguments)
    except AppError as exc:
        p.status, p.resolved_at, p.result = ProposalStatus.failed, utcnow(), {"error": exc.message}
        audit(db, ctx, f"ai.failed.{tool.name}", "ai_proposal", p.id, p.preview.get("summary"))
        await db.commit()
        return p
    p.status, p.resolved_at, p.result = ProposalStatus.executed, utcnow(), result
    audit(db, ctx, f"ai.confirmed.{tool.name}", "ai_proposal", p.id, p.preview.get("summary"))
    await db.commit()
    return p


async def cancel_proposal(db: AsyncSession, ctx: FamilyContext, proposal_id: uuid.UUID) -> AiActionProposal:
    p = await _load(db, ctx, proposal_id)
    if p.status == ProposalStatus.pending:
        p.status, p.resolved_at = ProposalStatus.cancelled, utcnow()
        await db.commit()
    return p


async def cancel_all_pending(db: AsyncSession, ctx: FamilyContext) -> int:
    rows = (
        await db.execute(
            select(AiActionProposal)
            .where(
                AiActionProposal.family_id == ctx.family_id,
                AiActionProposal.user_id == ctx.user_id,
                AiActionProposal.status == ProposalStatus.pending,
            )
            .with_for_update()
        )
    ).scalars().all()
    for p in rows:
        p.status, p.resolved_at = ProposalStatus.cancelled, utcnow()
    await db.commit()
    return len(rows)
