from datetime import UTC, datetime, timedelta

from tests.conftest import Actor


async def default_list(actor: Actor) -> str:
    return (await actor.get(actor.f("/shopping/lists"))).json()[0]["id"]


async def test_shopping_sync_between_partners(couple: tuple[Actor, Actor]) -> None:
    alice, bob = couple
    lid = await default_list(alice)
    r = await alice.post(
        alice.f(f"/shopping/lists/{lid}/items"), {"name": "Молоко", "quantity": "2", "unit": "л"}
    )
    assert r.status_code == 201
    item = r.json()[0]
    detail = (await bob.get(bob.f(f"/shopping/lists/{lid}"))).json()
    assert [i["name"] for i in detail["items"]] == ["Молоко"]
    assert detail["items"][0]["added_by"] == alice.user_id

    r = await bob.patch(bob.f(f"/shopping/lists/{lid}/items/{item['id']}"), {"status": "bought"})
    assert r.json()["bought_by"] == bob.user_id
    detail = (await alice.get(alice.f(f"/shopping/lists/{lid}"))).json()
    assert detail["items"][0]["status"] == "bought" and detail["items_needed"] == 0

    history = (await alice.get(alice.f(f"/shopping/lists/{lid}/history"))).json()
    assert {h["action"] for h in history} >= {"shopping.item.add", "shopping.item.bought"}


async def test_bulk_add_merges_duplicates(couple: tuple[Actor, Actor]) -> None:
    alice, _ = couple
    lid = await default_list(alice)
    r = await alice.post(
        alice.f(f"/shopping/lists/{lid}/items/bulk"), {"text": "молоко, хлеб и яйца 10 шт"}
    )
    assert [i["name"] for i in r.json()] == ["Молоко", "Хлеб", "Яйца"]
    await alice.post(alice.f(f"/shopping/lists/{lid}/items/bulk"), {"text": "яйца 6 шт"})
    items = (await alice.get(alice.f(f"/shopping/lists/{lid}"))).json()["items"]
    eggs = [i for i in items if i["name"] == "Яйца"]
    assert len(eggs) == 1 and eggs[0]["quantity"] == "16.000"


async def test_shopping_idempotent_and_delete_confirmation(couple: tuple[Actor, Actor]) -> None:
    alice, bob = couple
    lid = (await alice.post(alice.f("/shopping/lists"), {"name": "Дача"})).json()["id"]
    h = {"Idempotency-Key": "shop-add-00001"}
    await alice.post(alice.f(f"/shopping/lists/{lid}/items"), {"name": "Уголь"}, headers=h)
    await alice.post(alice.f(f"/shopping/lists/{lid}/items"), {"name": "Уголь"}, headers=h)
    assert len((await alice.get(alice.f(f"/shopping/lists/{lid}"))).json()["items"]) == 1
    r = await alice.delete(alice.f(f"/shopping/lists/{lid}"))
    assert r.status_code == 409 and r.json()["error"]["code"] == "confirmation_required"
    r = await alice.patch(alice.f(f"/shopping/lists/{lid}"), {"archived": True})
    assert r.json()["archived_at"] is not None
    assert lid not in [x["id"] for x in (await bob.get(bob.f("/shopping/lists"))).json()]
    assert (await alice.delete(alice.f(f"/shopping/lists/{lid}?confirm=true"))).status_code == 204


async def test_shopping_isolation(couple: tuple[Actor, Actor], eve: Actor) -> None:
    alice, _ = couple
    lid = await default_list(alice)
    item = (await alice.post(alice.f(f"/shopping/lists/{lid}/items"), {"name": "Сыр"})).json()[0]
    assert (await eve.get(eve.f(f"/shopping/lists/{lid}"))).status_code == 404
    assert (await eve.post(eve.f(f"/shopping/lists/{lid}/items"), {"name": "x"})).status_code == 404
    assert (
        await eve.patch(eve.f(f"/shopping/lists/{lid}/items/{item['id']}"), {"status": "bought"})
    ).status_code == 404


async def test_tasks_assign_complete_recurring(couple: tuple[Actor, Actor]) -> None:
    alice, bob = couple
    due = (datetime.now(UTC) + timedelta(days=1)).isoformat()
    r = await alice.post(
        alice.f("/tasks"),
        {
            "title": "Вынести мусор",
            "assignee_id": bob.user_id,
            "due_at": due,
            "recurrence_freq": "weekly",
            "points": 5,
        },
    )
    assert r.status_code == 201, r.text
    task = r.json()
    mine = (await bob.get(bob.f("/tasks?assignee=me"))).json()
    assert [t["title"] for t in mine] == ["Вынести мусор"]

    r1 = await bob.post(bob.f(f"/tasks/{task['id']}/complete"))
    r2 = await bob.post(bob.f(f"/tasks/{task['id']}/complete"))
    assert r1.json()["status"] == r2.json()["status"] == "done"
    open_tasks = (await alice.get(alice.f("/tasks"))).json()
    assert len(open_tasks) == 1  # exactly one next occurrence
    nxt = open_tasks[0]
    assert datetime.fromisoformat(nxt["due_at"]) - datetime.fromisoformat(
        task["due_at"]
    ) == timedelta(days=7)
    stats = (await alice.get(alice.f("/tasks/stats"))).json()
    assert stats["done_this_week"] >= 1 and stats["points_this_week"] >= 5
    assert "by_member" not in stats  # joint progress only

    c = await alice.post(alice.f(f"/tasks/{nxt['id']}/comments"), {"body": "Не забудь стекло"})
    assert c.status_code == 201
    comments = (await bob.get(bob.f(f"/tasks/{nxt['id']}/comments"))).json()
    assert comments[0]["author_name"] == "Алиса"
    hist = (await bob.get(bob.f(f"/tasks/{task['id']}/history"))).json()
    assert {h["action"] for h in hist} >= {"task.create", "task.done"}


async def test_private_task_hidden(couple: tuple[Actor, Actor]) -> None:
    alice, bob = couple
    r = await alice.post(
        alice.f("/tasks"), {"title": "Купить подарок Борису", "visibility": "private"}
    )
    t = r.json()
    assert (await bob.get(bob.f("/tasks"))).json() == []
    assert (await bob.get(bob.f(f"/tasks/{t['id']}"))).status_code == 404
    assert (await bob.get(bob.f(f"/tasks/{t['id']}/comments"))).status_code == 404
    assert (await bob.get(bob.f(f"/tasks/{t['id']}/history"))).status_code == 404
    r = await alice.post(
        alice.f("/tasks"), {"title": "x", "visibility": "private", "assignee_id": bob.user_id}
    )
    assert r.status_code == 422
    stats_b = (await bob.get(bob.f("/tasks/stats"))).json()
    assert stats_b["open_total"] == 0


async def test_overdue_filter(couple: tuple[Actor, Actor]) -> None:
    alice, _ = couple
    past = (datetime.now(UTC) - timedelta(days=2)).isoformat()
    await alice.post(alice.f("/tasks"), {"title": "Оплатить", "due_at": past})
    await alice.post(alice.f("/tasks"), {"title": "Когда-нибудь"})
    overdue = (await alice.get(alice.f("/tasks?due=overdue"))).json()
    assert [t["title"] for t in overdue] == ["Оплатить"] and overdue[0]["overdue"]
