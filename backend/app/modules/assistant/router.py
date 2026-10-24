from __future__ import annotations

import uuid
from datetime import datetime

from fastapi import APIRouter
from pydantic import BaseModel, Field
from sqlalchemy import delete, select

from app.ai import assistant, proposals
from app.ai.limits import usage_today
from app.ai.providers import ai_available
from app.ai.providers.base import AIUnavailable
from app.ai.tools.registry import ToolContext
from app.api.deps import DB, Ctx
from app.config import get_settings
from app.core.errors import NotFound, ServiceUnavailable
from app.core.rate_limit import get_rate_limiter
from app.core.schemas import ORMModel
from app.models import AiActionProposal, AiConversation, AiMemory, AiMessage, AuditLog
from app.models.enums import AiRole, Channel, ProposalStatus, Visibility
from app.security.access import visible

router = APIRouter(prefix="/families/{family_id}/ai", tags=["assistant"])


class ChatIn(BaseModel):
    message: str = Field(min_length=1, max_length=4000)
    conversation_id: uuid.UUID | None = None


class ActionOut(BaseModel):
    tool: str
    status: str
    summary: str


class ChatOut(BaseModel):
    conversation_id: uuid.UUID
    reply: str
    actions: list[ActionOut]
    proposals: list[proposals.ProposalOut]


class StatusOut(BaseModel):
    available: bool
    enabled_for_family: bool
    reason: str | None
    requests_today: int
    requests_limit: int
    tokens_today: int
    tokens_limit: int
    auto_execute: bool


class ConversationOut(ORMModel):
    id: uuid.UUID
    title: str | None
    channel: Channel
    summary: str | None
    created_at: datetime
    updated_at: datetime


class MessageOut(BaseModel):
    id: uuid.UUID
    role: AiRole
    content: str
    created_at: datetime


class MemoryIn(BaseModel):
    content: str = Field(min_length=3, max_length=300)
    visibility: Visibility = Visibility.family


class MemoryPatch(BaseModel):
    content: str = Field(min_length=3, max_length=300)


class MemoryOut(ORMModel):
    id: uuid.UUID
    content: str
    visibility: Visibility
    created_by: uuid.UUID | None
    created_at: datetime


class AiActionLog(BaseModel):
    action: str
    summary: str | None
    created_at: datetime


@router.get("/status", response_model=StatusOut)
async def status(ctx: Ctx, db: DB) -> StatusOut:
    s = get_settings()
    requests, tokens = await usage_today(db, ctx)
    available = ai_available()
    reason = None
    if not available:
        reason = "AI не настроен на сервере (нет OPENAI_API_KEY или AI_MODEL)"
    elif not ctx.family.ai_enabled:
        reason = "AI отключён в настройках семьи"
    return StatusOut(
        available=available,
        enabled_for_family=ctx.family.ai_enabled,
        reason=reason,
        requests_today=requests,
        requests_limit=s.ai_daily_requests_per_user,
        tokens_today=tokens,
        tokens_limit=s.ai_daily_tokens_per_family,
        auto_execute=ctx.family.ai_auto_execute,
    )


@router.post("/chat", response_model=ChatOut)
async def chat(body: ChatIn, ctx: Ctx, db: DB) -> ChatOut:
    await get_rate_limiter().hit(f"ai:{ctx.user_id}", 20)
    tc = ToolContext(db=db, ctx=ctx, channel=Channel.app)
    try:
        result = await assistant.chat(db, tc, body.message, body.conversation_id)
    except AIUnavailable as exc:
        await db.rollback()
        raise ServiceUnavailable(exc.message, code=exc.code) from exc
    return ChatOut(
        conversation_id=result.conversation_id,
        reply=result.reply,
        actions=[ActionOut(**a.__dict__) for a in result.actions],
        proposals=result.proposals,
    )


@router.get("/conversations", response_model=list[ConversationOut])
async def conversations(ctx: Ctx, db: DB) -> list[ConversationOut]:
    rows = (
        await db.execute(
            select(AiConversation)
            .where(AiConversation.family_id == ctx.family_id, AiConversation.user_id == ctx.user_id)
            .order_by(AiConversation.updated_at.desc())
            .limit(50)
        )
    ).scalars()
    return [ConversationOut.model_validate(c) for c in rows]


async def _own_conversation(db: DB, ctx: Ctx, conversation_id: uuid.UUID) -> AiConversation:
    conv = await db.scalar(
        select(AiConversation).where(
            AiConversation.id == conversation_id,
            AiConversation.family_id == ctx.family_id,
            AiConversation.user_id == ctx.user_id,
        )
    )
    if conv is None:
        raise NotFound("Диалог не найден")
    return conv


@router.get("/conversations/{conversation_id}/messages", response_model=list[MessageOut])
async def messages(conversation_id: uuid.UUID, ctx: Ctx, db: DB) -> list[MessageOut]:
    conv = await _own_conversation(db, ctx, conversation_id)
    rows = (
        await db.execute(
            select(AiMessage)
            .where(AiMessage.conversation_id == conv.id, AiMessage.role.in_([AiRole.user, AiRole.assistant]), AiMessage.content.is_not(None))
            .order_by(AiMessage.created_at)
            .limit(200)
        )
    ).scalars()
    return [MessageOut(id=m.id, role=m.role, content=m.content or "", created_at=m.created_at) for m in rows if m.content]


@router.patch("/conversations/{conversation_id}", response_model=ConversationOut)
async def edit_conversation(conversation_id: uuid.UUID, body: MemoryPatch, ctx: Ctx, db: DB) -> ConversationOut:
    """Edit the stored summary of a conversation (users can correct what the AI remembers)."""
    conv = await _own_conversation(db, ctx, conversation_id)
    conv.summary = body.content
    await db.commit()
    return ConversationOut.model_validate(conv)


@router.delete("/conversations/{conversation_id}", status_code=204)
async def delete_conversation(conversation_id: uuid.UUID, ctx: Ctx, db: DB) -> None:
    conv = await _own_conversation(db, ctx, conversation_id)
    await db.delete(conv)
    await db.commit()


@router.get("/proposals", response_model=list[proposals.ProposalOut])
async def list_proposals(ctx: Ctx, db: DB, status: ProposalStatus | None = ProposalStatus.pending) -> list[proposals.ProposalOut]:
    stmt = select(AiActionProposal).where(AiActionProposal.family_id == ctx.family_id, AiActionProposal.user_id == ctx.user_id)
    if status is not None:
        stmt = stmt.where(AiActionProposal.status == status)
    rows = (await db.execute(stmt.order_by(AiActionProposal.created_at.desc()).limit(50))).scalars()
    return [proposals.proposal_out(p) for p in rows]


@router.post("/proposals/{proposal_id}/confirm", response_model=proposals.ProposalOut)
async def confirm(proposal_id: uuid.UUID, ctx: Ctx, db: DB) -> proposals.ProposalOut:
    return proposals.proposal_out(await proposals.confirm_proposal(db, ctx, proposal_id))


@router.post("/proposals/{proposal_id}/cancel", response_model=proposals.ProposalOut)
async def cancel(proposal_id: uuid.UUID, ctx: Ctx, db: DB) -> proposals.ProposalOut:
    return proposals.proposal_out(await proposals.cancel_proposal(db, ctx, proposal_id))


@router.get("/memories", response_model=list[MemoryOut])
async def memories(ctx: Ctx, db: DB) -> list[MemoryOut]:
    rows = (await db.execute(select(AiMemory).where(visible(AiMemory, ctx)).order_by(AiMemory.created_at))).scalars()
    return [MemoryOut.model_validate(m) for m in rows]


@router.post("/memories", response_model=MemoryOut, status_code=201)
async def add_memory(body: MemoryIn, ctx: Ctx, db: DB) -> MemoryOut:
    mem = AiMemory(family_id=ctx.family_id, content=body.content.strip(), visibility=body.visibility, created_by=ctx.user_id)
    db.add(mem)
    await db.commit()
    return MemoryOut.model_validate(mem)


@router.patch("/memories/{memory_id}", response_model=MemoryOut)
async def edit_memory(memory_id: uuid.UUID, body: MemoryPatch, ctx: Ctx, db: DB) -> MemoryOut:
    mem = await db.scalar(select(AiMemory).where(AiMemory.id == memory_id, visible(AiMemory, ctx)))
    if mem is None:
        raise NotFound()
    mem.content = body.content.strip()
    await db.commit()
    return MemoryOut.model_validate(mem)


@router.delete("/memories/{memory_id}", status_code=204)
async def delete_memory(memory_id: uuid.UUID, ctx: Ctx, db: DB) -> None:
    await db.execute(delete(AiMemory).where(AiMemory.id == memory_id, visible(AiMemory, ctx)))
    await db.commit()


@router.get("/actions", response_model=list[AiActionLog])
async def action_log(ctx: Ctx, db: DB) -> list[AiActionLog]:
    rows = (
        await db.execute(
            select(AuditLog)
            .where(AuditLog.family_id == ctx.family_id, AuditLog.actor_id == ctx.user_id, AuditLog.action.like("ai.%"))
            .order_by(AuditLog.created_at.desc())
            .limit(100)
        )
    ).scalars()
    return [AiActionLog(action=a.action, summary=a.summary, created_at=a.created_at) for a in rows]
