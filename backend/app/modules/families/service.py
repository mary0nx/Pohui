from __future__ import annotations

import uuid
from datetime import timedelta

from sqlalchemy import delete, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import get_settings
from app.core.audit import audit
from app.core.errors import Conflict, Forbidden, NotFound, ValidationFailed
from app.core.time import utcnow
from app.models import (
    Account,
    AiConversation,
    AiMemory,
    CalendarEvent,
    Category,
    Document,
    Family,
    FamilyInvitation,
    FamilyMember,
    Habit,
    LifeItem,
    Recipe,
    RecurringRule,
    SavingsGoal,
    ShoppingList,
    Task,
    Transaction,
    User,
)
from app.models.enums import AccountKind, CategoryKind, Role, Visibility
from app.modules.families.defaults import EXPENSE_CATEGORIES, INCOME_CATEGORIES
from app.modules.families.schemas import (
    FamilyCreate,
    FamilyOut,
    FamilyPatch,
    InvitationCreate,
    InvitationCreated,
    InvitationPreview,
    MemberOut,
)
from app.security.access import FamilyContext
from app.security.tokens import hash_token, new_token

INVITE_PREFIX = "inv_"


async def create_family(db: AsyncSession, user: User, data: FamilyCreate) -> Family:
    family = Family(
        name=data.name,
        currency=data.currency,
        timezone=data.timezone,
        created_by=user.id,
        ai_enabled=True,
        ai_auto_execute=True,
    )
    db.add(family)
    await db.flush()
    db.add(FamilyMember(family_id=family.id, user_id=user.id, role=Role.owner))
    for name, icon in EXPENSE_CATEGORIES:
        db.add(Category(family_id=family.id, kind=CategoryKind.expense, name=name, icon=icon))
    for name, icon in INCOME_CATEGORIES:
        db.add(Category(family_id=family.id, kind=CategoryKind.income, name=name, icon=icon))
    db.add(
        Account(
            family_id=family.id,
            name="Наличные",
            kind=AccountKind.cash,
            currency=family.currency,
            created_by=user.id,
        )
    )
    db.add(
        Account(
            family_id=family.id,
            name="Общая карта",
            kind=AccountKind.card,
            currency=family.currency,
            created_by=user.id,
        )
    )
    db.add(ShoppingList(family_id=family.id, name="Продукты", created_by=user.id))
    user.active_family_id = family.id
    await db.flush()
    return family


async def list_members(db: AsyncSession, family_id: uuid.UUID) -> list[MemberOut]:
    rows = (
        await db.execute(
            select(FamilyMember)
            .where(FamilyMember.family_id == family_id)
            .order_by(FamilyMember.joined_at)
        )
    ).scalars()
    return [
        MemberOut(
            id=m.id,
            user_id=m.user_id,
            first_name=m.user.first_name,
            last_name=m.user.last_name,
            username=m.user.username,
            photo_url=m.user.photo_url,
            role=m.role,
            joined_at=m.joined_at,
        )
        for m in rows
    ]


async def family_out(db: AsyncSession, ctx: FamilyContext) -> FamilyOut:
    out = FamilyOut.model_validate(ctx.family)
    out.members = await list_members(db, ctx.family_id)
    out.my_role = ctx.role
    return out


async def update_family(db: AsyncSession, ctx: FamilyContext, data: FamilyPatch) -> None:
    ctx.require_role(Role.admin)
    family = ctx.family
    if data.currency and data.currency != family.currency:
        has_tx = await db.scalar(
            select(func.count()).select_from(Transaction).where(Transaction.family_id == family.id)
        )
        if has_tx:
            raise Conflict("Нельзя сменить валюту семьи, когда уже есть операции")
        family.currency = data.currency
        for acc in (
            await db.execute(select(Account).where(Account.family_id == family.id))
        ).scalars():
            acc.currency = data.currency
    for field in ("name", "timezone", "ai_enabled", "ai_auto_execute"):
        value = getattr(data, field)
        if value is not None:
            setattr(family, field, value)
    audit(db, ctx, "family.update", "family", family.id, family.name)
    await db.flush()


async def delete_family(db: AsyncSession, ctx: FamilyContext, confirm_name: str) -> list[str]:
    ctx.require_role(Role.owner)
    if confirm_name.strip() != ctx.family.name:
        raise ValidationFailed("Название семьи введено неверно", code="confirmation_mismatch")
    keys = (
        (
            await db.execute(
                select(Document.storage_key).where(
                    Document.family_id == ctx.family_id, Document.storage_key.is_not(None)
                )
            )
        )
        .scalars()
        .all()
    )
    # Transactions reference accounts with RESTRICT; remove them before the cascade.
    await db.execute(delete(Transaction).where(Transaction.family_id == ctx.family_id))
    await db.execute(delete(Family).where(Family.id == ctx.family_id))
    return [k for k in keys if k]


PRIVATE_MODELS = (
    Transaction,
    RecurringRule,
    Account,
    SavingsGoal,
    CalendarEvent,
    Task,
    Recipe,
    LifeItem,
    Habit,
    AiMemory,
)


async def purge_private_data(
    db: AsyncSession, family_id: uuid.UUID, user_id: uuid.UUID
) -> list[str]:
    """Delete a departing member's private records in the family. Returns storage keys of
    deleted documents (files are removed after commit)."""
    keys = (
        (
            await db.execute(
                select(Document.storage_key).where(
                    Document.family_id == family_id,
                    Document.created_by == user_id,
                    Document.visibility == Visibility.private,
                    Document.storage_key.is_not(None),
                )
            )
        )
        .scalars()
        .all()
    )
    await db.execute(
        delete(Document).where(
            Document.family_id == family_id,
            Document.created_by == user_id,
            Document.visibility == Visibility.private,
        )
    )
    for model in PRIVATE_MODELS:
        await db.execute(
            delete(model).where(
                model.family_id == family_id,
                model.created_by == user_id,
                model.visibility == Visibility.private,
            )
        )
    await db.execute(
        delete(AiConversation).where(
            AiConversation.family_id == family_id, AiConversation.user_id == user_id
        )
    )
    return [k for k in keys if k]


async def remove_member(db: AsyncSession, ctx: FamilyContext, member_id: uuid.UUID) -> list[str]:
    member = await db.scalar(
        select(FamilyMember).where(
            FamilyMember.id == member_id, FamilyMember.family_id == ctx.family_id
        )
    )
    if member is None:
        raise NotFound("Участник не найден")
    if member.user_id == ctx.user_id:
        raise ValidationFailed("Чтобы выйти из семьи, используйте «Покинуть семью»")
    ctx.require_role(Role.admin)
    if member.role == Role.owner or (member.role == Role.admin and ctx.role != Role.owner):
        raise Forbidden("Недостаточно прав для удаления этого участника")
    keys = await purge_private_data(db, ctx.family_id, member.user_id)
    audit(db, ctx, "member.remove", "family_member", member.id, member.user.first_name)
    await db.delete(member)
    await _clear_active_family(db, member.user_id, ctx.family_id)
    return keys


async def leave_family(db: AsyncSession, ctx: FamilyContext) -> list[str]:
    others = await db.scalar(
        select(func.count())
        .select_from(FamilyMember)
        .where(FamilyMember.family_id == ctx.family_id, FamilyMember.user_id != ctx.user_id)
    )
    if ctx.role == Role.owner:
        if others:
            raise Conflict("Передайте роль владельца другому участнику перед выходом")
        raise Conflict("Вы единственный участник — удалите семью в настройках")
    keys = await purge_private_data(db, ctx.family_id, ctx.user_id)
    audit(db, ctx, "member.leave", "family_member", ctx.member.id, ctx.user.first_name)
    await db.delete(ctx.member)
    await _clear_active_family(db, ctx.user_id, ctx.family_id)
    return keys


async def _clear_active_family(db: AsyncSession, user_id: uuid.UUID, family_id: uuid.UUID) -> None:
    user = await db.get(User, user_id)
    if user and user.active_family_id == family_id:
        user.active_family_id = None


async def change_role(
    db: AsyncSession, ctx: FamilyContext, member_id: uuid.UUID, role: Role
) -> None:
    ctx.require_role(Role.owner)
    member = await db.scalar(
        select(FamilyMember).where(
            FamilyMember.id == member_id, FamilyMember.family_id == ctx.family_id
        )
    )
    if member is None:
        raise NotFound("Участник не найден")
    if member.user_id == ctx.user_id:
        raise ValidationFailed("Нельзя изменить собственную роль")
    if role == Role.owner:
        # Ownership transfer: the current owner becomes admin.
        ctx.member.role = Role.admin
    member.role = role
    audit(db, ctx, "member.role", "family_member", member.id, f"{member.user.first_name}: {role}")
    await db.flush()


def invitation_link(token: str) -> str | None:
    s = get_settings()
    start = f"{INVITE_PREFIX}{token}"
    if s.telegram_bot_username and s.telegram_mini_app_short_name:
        return f"https://t.me/{s.telegram_bot_username}/{s.telegram_mini_app_short_name}?startapp={start}"
    if s.telegram_bot_username:
        return f"https://t.me/{s.telegram_bot_username}?start={start}"
    return None


async def create_invitation(
    db: AsyncSession, ctx: FamilyContext, data: InvitationCreate
) -> InvitationCreated:
    ctx.require_role(Role.admin)
    if data.role == Role.owner:
        raise ValidationFailed("Нельзя пригласить владельца")
    active = await db.scalar(
        select(func.count())
        .select_from(FamilyInvitation)
        .where(
            FamilyInvitation.family_id == ctx.family_id,
            FamilyInvitation.revoked_at.is_(None),
            FamilyInvitation.expires_at > utcnow(),
            FamilyInvitation.use_count < FamilyInvitation.max_uses,
        )
    )
    if (active or 0) >= 10:
        raise Conflict("Слишком много активных приглашений — отзовите ненужные")
    token = new_token(24)
    inv = FamilyInvitation(
        family_id=ctx.family_id,
        token_hash=hash_token(token),
        created_by=ctx.user_id,
        role=data.role,
        max_uses=data.max_uses,
        use_count=0,
        expires_at=utcnow() + timedelta(hours=data.expires_in_hours),
    )
    db.add(inv)
    await db.flush()
    await db.refresh(inv)
    audit(db, ctx, "invitation.create", "invitation", inv.id)
    return InvitationCreated(
        id=inv.id,
        role=inv.role,
        max_uses=inv.max_uses,
        use_count=inv.use_count,
        expires_at=inv.expires_at,
        revoked_at=None,
        created_at=inv.created_at,
        token=token,
        link=invitation_link(token),
        start_param=f"{INVITE_PREFIX}{token}",
    )


def _normalize_token(token: str) -> str:
    token = token.strip()
    return token[len(INVITE_PREFIX) :] if token.startswith(INVITE_PREFIX) else token


async def _usable_invitation(
    db: AsyncSession, token: str, *, lock: bool = False
) -> FamilyInvitation:
    stmt = select(FamilyInvitation).where(
        FamilyInvitation.token_hash == hash_token(_normalize_token(token))
    )
    if lock:
        stmt = stmt.with_for_update()
    inv = (await db.execute(stmt)).scalar_one_or_none()
    if (
        inv is None
        or inv.revoked_at is not None
        or inv.expires_at <= utcnow()
        or inv.use_count >= inv.max_uses
    ):
        raise NotFound("Приглашение недействительно или истекло", code="invitation_invalid")
    return inv


async def preview_invitation(db: AsyncSession, user: User, token: str) -> InvitationPreview:
    inv = await _usable_invitation(db, token)
    family = await db.get(Family, inv.family_id)
    assert family is not None
    inviter = await db.get(User, inv.created_by) if inv.created_by else None
    already = await db.scalar(
        select(FamilyMember.id).where(
            FamilyMember.family_id == inv.family_id, FamilyMember.user_id == user.id
        )
    )
    return InvitationPreview(
        family_name=family.name,
        inviter_name=inviter.first_name if inviter else None,
        expires_at=inv.expires_at,
        already_member=already is not None,
    )


async def accept_invitation(db: AsyncSession, user: User, token: str) -> Family:
    any_inv = await db.scalar(
        select(FamilyInvitation).where(
            FamilyInvitation.token_hash == hash_token(_normalize_token(token))
        )
    )
    if any_inv is not None:
        existing = await db.scalar(
            select(FamilyMember).where(
                FamilyMember.family_id == any_inv.family_id, FamilyMember.user_id == user.id
            )
        )
        if existing is not None:
            # Idempotent: accepting twice does not consume another use.
            family = await db.get(Family, any_inv.family_id)
            assert family is not None
            user.active_family_id = family.id
            return family
    inv = await _usable_invitation(db, token, lock=True)
    family = await db.get(Family, inv.family_id)
    assert family is not None
    inv.use_count += 1
    member = FamilyMember(family_id=family.id, user_id=user.id, role=inv.role)
    db.add(member)
    user.active_family_id = family.id
    await db.flush()
    ctx = FamilyContext(user=user, family=family, member=member)
    audit(db, ctx, "member.join", "family_member", member.id, user.first_name)
    return family


async def list_invitations(db: AsyncSession, ctx: FamilyContext) -> list[FamilyInvitation]:
    ctx.require_role(Role.admin)
    return list(
        (
            await db.execute(
                select(FamilyInvitation)
                .where(
                    FamilyInvitation.family_id == ctx.family_id,
                    FamilyInvitation.revoked_at.is_(None),
                    FamilyInvitation.expires_at > utcnow(),
                    FamilyInvitation.use_count < FamilyInvitation.max_uses,
                )
                .order_by(FamilyInvitation.created_at.desc())
            )
        ).scalars()
    )


async def revoke_invitation(db: AsyncSession, ctx: FamilyContext, inv_id: uuid.UUID) -> None:
    ctx.require_role(Role.admin)
    inv = await db.scalar(
        select(FamilyInvitation).where(
            FamilyInvitation.id == inv_id, FamilyInvitation.family_id == ctx.family_id
        )
    )
    if inv is None:
        raise NotFound("Приглашение не найдено")
    if inv.revoked_at is None:
        inv.revoked_at = utcnow()
        audit(db, ctx, "invitation.revoke", "invitation", inv.id)
