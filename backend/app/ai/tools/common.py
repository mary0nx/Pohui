"""Helpers shared by AI tools: name resolution and lenient date parsing."""

from __future__ import annotations

import uuid
from datetime import date, datetime, time
from zoneinfo import ZoneInfo

from sqlalchemy import select

from app.ai.tools.registry import ToolContext
from app.core.errors import ValidationFailed
from app.models import Account, Category, FamilyMember, Transaction, User
from app.models.enums import CategoryKind, Visibility
from app.security.access import visible


class ToolError(ValidationFailed):
    """User-facing problem with tool arguments; reported back to the model."""


def parse_local_datetime(value: str, zone: str) -> datetime:
    """Accept ISO datetime with or without offset; naive values are family-local."""
    try:
        dt = datetime.fromisoformat(value.strip().replace("Z", "+00:00"))
    except ValueError as exc:
        raise ToolError(
            f"Не удалось разобрать дату/время «{value[:40]}»; нужен формат ГГГГ-ММ-ДДTЧЧ:ММ"
        ) from exc
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=ZoneInfo(zone))
    return dt


def parse_date(value: str) -> date:
    try:
        return date.fromisoformat(value.strip()[:10])
    except ValueError as exc:
        raise ToolError(
            f"Не удалось разобрать дату «{value[:40]}»; нужен формат ГГГГ-ММ-ДД"
        ) from exc


def day_noon(d: date, zone: str) -> datetime:
    return datetime.combine(d, time(12, 0), tzinfo=ZoneInfo(zone))


def _match(names: dict[str, object], query: str) -> object | None:
    q = query.strip().lower()
    if not q:
        return None
    if q in names:
        return names[q]
    starts = [v for k, v in names.items() if k.startswith(q) or q.startswith(k)]
    if len(starts) == 1:
        return starts[0]
    contains = [v for k, v in names.items() if q in k or k in q]
    return contains[0] if len(contains) == 1 else None


async def resolve_category(
    tc: ToolContext, name: str | None, kind: CategoryKind
) -> Category | None:
    if not name:
        return None
    cats = (
        (
            await tc.db.execute(
                select(Category).where(
                    Category.family_id == tc.ctx.family_id,
                    Category.kind == kind,
                    Category.archived_at.is_(None),
                )
            )
        )
        .scalars()
        .all()
    )
    found = _match({c.name.lower(): c for c in cats}, name)
    if found is None:
        options = ", ".join(sorted(c.name for c in cats if c.parent_id is None))
        raise ToolError(f"Категория «{name}» не найдена. Доступные: {options}")
    assert isinstance(found, Category)
    return found


async def resolve_account(
    tc: ToolContext, name: str | None, private: bool | None = None
) -> Account:
    stmt = select(Account).where(visible(Account, tc.ctx), Account.archived_at.is_(None))
    if private is not None:
        stmt = stmt.where(
            Account.visibility == (Visibility.private if private else Visibility.family)
        )
    accounts = (await tc.db.execute(stmt.order_by(Account.created_at))).scalars().all()
    if not accounts:
        raise ToolError("Нет доступных счетов — создайте счёт в разделе «Финансы»")
    if name:
        found = _match({a.name.lower(): a for a in accounts}, name)
        if found is None:
            raise ToolError(
                f"Счёт «{name}» не найден. Доступные: {', '.join(a.name for a in accounts)}"
            )
        assert isinstance(found, Account)
        return found
    # Default: the account this user used most recently, else the first one.
    last = await tc.db.scalar(
        select(Transaction.account_id)
        .where(visible(Transaction, tc.ctx), Transaction.created_by == tc.ctx.user_id)
        .order_by(Transaction.created_at.desc())
        .limit(1)
    )
    by_id = {a.id: a for a in accounts}
    return by_id.get(last, accounts[0]) if last else accounts[0]


async def resolve_member(tc: ToolContext, name: str | None) -> uuid.UUID | None:
    if not name:
        return None
    if name.strip().lower() in {"я", "меня", "мне", "me", "себе"}:
        return tc.ctx.user_id
    rows = (
        (
            await tc.db.execute(
                select(User)
                .join(FamilyMember, FamilyMember.user_id == User.id)
                .where(FamilyMember.family_id == tc.ctx.family_id)
            )
        )
        .scalars()
        .all()
    )
    lookup: dict[str, object] = {}
    for u in rows:
        lookup[u.first_name.lower()] = u.id
        if u.username:
            lookup[u.username.lower()] = u.id
    found = _match(lookup, name)
    if found is None:
        raise ToolError(
            f"Участник «{name}» не найден. В семье: {', '.join(u.first_name for u in rows)}"
        )
    assert isinstance(found, uuid.UUID)
    return found
