import uuid

from app.ai.providers import set_provider
from app.ai.providers.scripted import ScriptedProvider, call, text
from app.bot import logic
from app.db.session import get_sessionmaker
from app.models import User
from tests.conftest import Actor


async def test_start_marks_user_reachable(alice: Actor) -> None:
    async with get_sessionmaker()() as db:
        reply = await logic.start(db, 1001, "Алиса", None, "ru", None)
        assert "Откройте приложение" in reply.text and reply.open_app_path == "/"
        user = await db.get(User, uuid.UUID(alice.user_id))
        assert user.bot_started_at is not None
        invite = await logic.start(db, 1001, "Алиса", None, "ru", "inv_abc")
        assert invite.open_app_path == "/join?invite=inv_abc"


async def test_bot_ai_and_inline_confirmation(couple: tuple[Actor, Actor]) -> None:
    alice, bob = couple
    await alice.patch(alice.f(), {"ai_auto_execute": False})
    set_provider(ScriptedProvider([call("create_task", {"title": "Купить лампочку"}), text("Подтвердите, пожалуйста")]))
    try:
        async with get_sessionmaker()() as db:
            reply = await logic.ai_message(db, 1001, "создай задачу купить лампочку")
        assert reply.proposals and "Купить лампочку" in reply.proposals[0][1]
        pid = reply.proposals[0][0]
        async with get_sessionmaker()() as db:
            # Bob's Telegram account cannot confirm Alice's proposal.
            denied = await logic.resolve_proposal(db, 1002, pid, True)
            assert "не найдено" in denied.lower()
            done = await logic.resolve_proposal(db, 1001, pid, True)
            assert done.startswith("✅")
            again = await logic.resolve_proposal(db, 1001, pid, True)
            assert again.startswith("✅")
        tasks = (await bob.get(bob.f("/tasks"))).json()
        assert [t["title"] for t in tasks] == ["Купить лампочку"]
    finally:
        set_provider(None)


async def test_bot_without_family_or_ai(client) -> None:  # type: ignore[no-untyped-def]
    async with get_sessionmaker()() as db:
        reply = await logic.ai_message(db, 424242, "привет")
        assert "создайте семью" in reply.text
        assert (await logic.cancel(db, 424242)).text == "Нечего отменять."
