"""Single authorization layer: family context, roles and record visibility.

Every family-scoped query must go through `visible()` / `get_visible()` so that
records of other families and private records of other members are never returned.
"""

from __future__ import annotations

import uuid
from dataclasses import dataclass
from typing import Any, TypeVar

from sqlalchemy import ColumnElement, and_, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import Forbidden, NotFound
from app.models.enums import Role, Visibility
from app.models.identity import Family, FamilyMember, User

T = TypeVar("T")

ROLE_RANK = {Role.member: 0, Role.admin: 1, Role.owner: 2}


@dataclass(frozen=True, slots=True)
class FamilyContext:
    user: User
    family: Family
    member: FamilyMember

    @property
    def user_id(self) -> uuid.UUID:
        return self.user.id

    @property
    def family_id(self) -> uuid.UUID:
        return self.family.id

    @property
    def role(self) -> Role:
        return self.member.role

    def has_role(self, minimum: Role) -> bool:
        return ROLE_RANK[self.role] >= ROLE_RANK[minimum]

    def require_role(self, minimum: Role) -> None:
        if not self.has_role(minimum):
            raise Forbidden()


async def load_family_context(
    db: AsyncSession, user: User, family_id: uuid.UUID
) -> FamilyContext:
    row = (
        await db.execute(
            select(FamilyMember, Family)
            .join(Family, Family.id == FamilyMember.family_id)
            .where(FamilyMember.family_id == family_id, FamilyMember.user_id == user.id)
        )
    ).first()
    if row is None:
        # Same answer for "does not exist" and "not a member": do not leak existence.
        raise NotFound("Семья не найдена")
    member, family = row
    return FamilyContext(user=user, family=family, member=member)


def visible(model: Any, ctx: FamilyContext) -> ColumnElement[bool]:
    """SQL condition: record belongs to the family and is visible to the current user."""
    cond = model.family_id == ctx.family_id
    if hasattr(model, "visibility"):
        cond = and_(
            cond,
            or_(model.visibility == Visibility.family, model.created_by == ctx.user_id),
        )
    return cond


async def get_visible(
    db: AsyncSession, model: type[T], obj_id: uuid.UUID, ctx: FamilyContext, *, lock: bool = False
) -> T:
    stmt = select(model).where(model.id == obj_id, visible(model, ctx))  # type: ignore[attr-defined]
    if lock:
        stmt = stmt.with_for_update()
    obj = (await db.execute(stmt)).scalar_one_or_none()
    if obj is None:
        raise NotFound()
    return obj


def ensure_can_delete(obj: Any, ctx: FamilyContext) -> None:
    """Family records: the author or an admin/owner may delete. Private: only the author
    (others never see them in the first place)."""
    if getattr(obj, "created_by", None) == ctx.user_id:
        return
    if getattr(obj, "visibility", Visibility.family) == Visibility.private:
        raise NotFound()
    if not ctx.has_role(Role.admin):
        raise Forbidden("Удалить запись может её автор или администратор семьи")


def is_private(obj: Any) -> bool:
    return getattr(obj, "visibility", Visibility.family) == Visibility.private
