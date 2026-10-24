"""AI tools for family overview and long-term preferences."""

from __future__ import annotations

from typing import Any

from pydantic import Field
from sqlalchemy import select

from app.ai.tools.registry import Prepared, Tool, ToolArgs, ToolContext, register
from app.models import AiMemory, FamilyMember, User
from app.models.enums import Visibility
from app.modules.finance import service as finance


class OverviewArgs(ToolArgs):
    pass


async def overview(tc: ToolContext, a: OverviewArgs) -> dict[str, Any]:
    members = (
        await tc.db.execute(
            select(User.first_name, FamilyMember.role)
            .join(FamilyMember, FamilyMember.user_id == User.id)
            .where(FamilyMember.family_id == tc.ctx.family_id)
        )
    ).all()
    accounts = await finance.list_accounts(tc.db, tc.ctx)
    cats = await finance.list_categories(tc.db, tc.ctx)
    return {
        "family": tc.ctx.family.name,
        "currency": tc.ctx.family.currency,
        "members": [
            {"name": n, "role": r, "is_me": n == tc.ctx.user.first_name} for n, r in members
        ],
        "accounts": [
            {
                "name": x.name,
                "kind": x.kind,
                "balance": str(x.balance),
                "private": x.visibility == "private",
            }
            for x in accounts
        ],
        "expense_categories": [c.name for c in cats if c.kind == "expense" and c.parent_id is None],
        "income_categories": [c.name for c in cats if c.kind == "income" and c.parent_id is None],
    }


register(
    Tool(
        "get_family_overview",
        "Участники семьи, счета с балансами и категории.",
        OverviewArgs,
        "read",
        overview,
    )
)


class RememberArgs(ToolArgs):
    content: str = Field(
        min_length=3,
        max_length=300,
        description="Краткое устойчивое предпочтение семьи, например «Не едим свинину»",
    )
    private: bool = Field(False, description="true — только для меня")


async def prepare_remember(tc: ToolContext, a: RememberArgs) -> Prepared:
    return Prepared(
        arguments={"content": a.content.strip(), "private": a.private},
        summary="Запомнить предпочтение",
        details=[a.content.strip(), "Видно: только вам" if a.private else "Видно: всей семье"],
    )


async def execute_remember(tc: ToolContext, args: dict[str, Any]) -> dict[str, Any]:
    mem = AiMemory(
        family_id=tc.ctx.family_id,
        content=args["content"],
        visibility=Visibility.private if args.get("private") else Visibility.family,
        created_by=tc.ctx.user_id,
    )
    tc.db.add(mem)
    await tc.db.flush()
    return {"remembered": True}


register(
    Tool(
        "remember_preference",
        "Сохранить долгосрочное предпочтение (только по явной просьбе пользователя; требует подтверждения).",
        RememberArgs,
        "confirm",
        execute_remember,
        prepare=prepare_remember,
    )
)
