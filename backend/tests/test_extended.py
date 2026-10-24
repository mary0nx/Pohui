from datetime import date, timedelta

import httpx

from app.ai.providers import set_provider
from app.ai.providers.scripted import ScriptedProvider, call, text
from tests.conftest import Actor

PDF = b"%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF"
PNG = b"\x89PNG\r\n\x1a\n" + b"\x00" * 64


async def test_pantry_recipes_meal_plan_to_shopping(couple: tuple[Actor, Actor]) -> None:
    alice, bob = couple
    await alice.post(alice.f("/kitchen/pantry"), {"name": "Мука", "quantity": "1", "unit": "кг"})
    await alice.post(alice.f("/kitchen/pantry"), {"name": "Яйца", "quantity": "2", "unit": "шт", "expires_on": (date.today() + timedelta(days=1)).isoformat()})
    pantry = (await bob.get(bob.f("/kitchen/pantry"))).json()
    assert {p["name"] for p in pantry} == {"Мука", "Яйца"}
    assert next(p for p in pantry if p["name"] == "Яйца")["expiring_soon"]

    r = await alice.post(
        alice.f("/kitchen/recipes"),
        {"title": "Блины", "servings": 2, "ingredients": [{"name": "Мука", "quantity": "0.2", "unit": "кг"}, {"name": "Яйца", "quantity": "2", "unit": "шт"}, {"name": "Молоко", "quantity": "0.5", "unit": "л"}]},
    )
    recipe = r.json()
    day = date.today() + timedelta(days=2)
    r = await alice.put(alice.f("/kitchen/meal-plan"), {"day": day.isoformat(), "meal_type": "breakfast", "recipe_id": recipe["id"], "servings": 4})
    assert r.json()["title"] == "Блины"
    out = (await alice.post(alice.f("/kitchen/meal-plan/shopping-list"), {"date_from": day.isoformat(), "date_to": day.isoformat()})).json()
    # 4 servings: flour 0.4 kg (have 1 -> covered), eggs 4 (have 2 -> buy 2), milk 1 l.
    assert set(out["covered_by_pantry"]) == {"Мука"}
    items = {i["name"]: i for i in (await bob.get(bob.f(f"/shopping/lists/{out['list_id']}"))).json()["items"]}
    assert items["Яйца"]["quantity"] == "2.000" and items["Молоко"]["quantity"] == "1.000"
    # Generating the list never touches pantry stock.
    assert next(p for p in (await alice.get(alice.f("/kitchen/pantry"))).json() if p["name"] == "Мука")["quantity"] == "1.000"

    egg = next(p for p in pantry if p["name"] == "Яйца")
    r = await bob.post(bob.f(f"/kitchen/pantry/{egg['id']}/adjust"), {"delta": "-3"})
    assert r.status_code == 422


async def test_private_recipe_not_in_family_plan(couple: tuple[Actor, Actor]) -> None:
    alice, bob = couple
    recipe = (await alice.post(alice.f("/kitchen/recipes"), {"title": "Секретный соус", "visibility": "private"})).json()
    assert (await bob.get(bob.f(f"/kitchen/recipes/{recipe['id']}"))).status_code == 404
    r = await alice.put(alice.f("/kitchen/meal-plan"), {"day": date.today().isoformat(), "meal_type": "dinner", "recipe_id": recipe["id"]})
    assert r.status_code == 422


async def test_life_items_privacy_defaults(couple: tuple[Actor, Actor]) -> None:
    alice, bob = couple
    note = (await alice.post(alice.f("/life/items"), {"kind": "note", "title": "Мысли", "body": "очень личное"})).json()
    wish = (await alice.post(alice.f("/life/items"), {"kind": "wish", "title": "Наушники", "price": "300"})).json()
    goal = (await alice.post(alice.f("/life/items"), {"kind": "goal", "title": "Съездить в Италию"})).json()
    assert note["visibility"] == wish["visibility"] == "private" and goal["visibility"] == "family"
    bob_items = (await bob.get(bob.f("/life/items"))).json()
    assert [i["title"] for i in bob_items] == ["Съездить в Италию"]
    r = await bob.patch(bob.f(f"/life/items/{goal['id']}"), {"status": "done"})
    assert r.json()["done_at"] is not None
    # Dashboard activity never reveals the private note.
    dash = (await bob.get(bob.f("/dashboard"))).json()
    assert all("Мысли" not in (a["summary"] or "") and a["entity_id"] != note["id"] for a in dash["activity"])


async def test_habits(couple: tuple[Actor, Actor]) -> None:
    alice, bob = couple
    habits = (await alice.post(alice.f("/life/habits"), {"title": "Прогулка вместе", "target_per_week": 3})).json()
    hid = habits[0]["id"]
    await alice.post(alice.f(f"/life/habits/{hid}/checkin"), {})
    await alice.post(alice.f(f"/life/habits/{hid}/checkin"), {})  # idempotent
    res = (await bob.post(bob.f(f"/life/habits/{hid}/checkin"), {})).json()
    assert res[0]["week_count"] == 1 and res[0]["checked_today_by_me"]
    r = await bob.post(bob.f(f"/life/habits/{hid}/checkin"), {"day": (date.today() + timedelta(days=1)).isoformat()})
    assert r.status_code == 422


async def test_documents_upload_download_and_privacy(couple: tuple[Actor, Actor], client: httpx.AsyncClient) -> None:
    alice, bob = couple
    files = {"file": ("../../etc/Паспорт.pdf", PDF, "image/png")}  # declared type is ignored
    r = await alice.post(alice.f("/documents/upload"), data={"title": "Паспорт", "category": "id", "expires_on": "2030-01-01"}, files=files)
    assert r.status_code == 201, r.text
    doc = r.json()
    assert doc["content_type"] == "application/pdf" and doc["original_filename"] == "Паспорт.pdf" and doc["has_file"]

    link = (await bob.post(bob.f(f"/documents/{doc['id']}/download-link"))).json()
    path = link["url"].split("http://localhost:8000")[-1]
    resp = await client.get(path)
    assert resp.status_code == 200 and resp.content == PDF
    assert resp.headers["content-disposition"].startswith("attachment")
    assert (await client.get(path[:-3] + "abc")).status_code == 404  # tampered token

    exe = {"file": ("virus.pdf", b"MZ\x90\x00\x03\x00\x00\x00" + b"\x00" * 100, "application/pdf")}
    r = await alice.post(alice.f("/documents/upload"), data={"title": "x"}, files=exe)
    assert r.status_code == 422 and r.json()["error"]["code"] == "unsupported_file_type"

    priv = (await alice.post(alice.f("/documents/upload"), data={"title": "Медкарта", "visibility": "private"}, files={"file": ("a.png", PNG, "image/png")})).json()
    assert (await bob.get(bob.f(f"/documents/{priv['id']}"))).status_code == 404
    assert (await bob.post(bob.f(f"/documents/{priv['id']}/download-link"))).status_code == 404
    assert [d["title"] for d in (await bob.get(bob.f("/documents?q=Мед"))).json()] == []

    # A link issued to Bob stops working once he leaves the family.
    link = (await bob.post(bob.f(f"/documents/{doc['id']}/download-link"))).json()
    await bob.post(bob.f("/leave"))
    assert (await client.get(link["url"].split("http://localhost:8000")[-1])).status_code == 404


async def test_document_size_limit(couple: tuple[Actor, Actor], monkeypatch) -> None:  # type: ignore[no-untyped-def]
    from app.config import get_settings

    alice, _ = couple
    monkeypatch.setattr(get_settings(), "max_upload_mb", 0)
    r = await alice.post(alice.f("/documents/upload"), data={"title": "big"}, files={"file": ("a.pdf", PDF, "application/pdf")})
    assert r.status_code in (413, 422)


async def test_dashboard_empty_and_filled(couple: tuple[Actor, Actor]) -> None:
    alice, bob = couple
    dash = (await alice.get(alice.f("/dashboard"))).json()
    assert dash["is_empty"] and dash["family_name"] == "Мы" and dash["month_family"]["expense"] == "0"
    accs = (await alice.get(alice.f("/finance/accounts"))).json()
    await alice.post(alice.f("/finance/transactions"), {"kind": "expense", "amount": "80", "account_id": accs[0]["id"]})
    await bob.post(bob.f("/tasks"), {"title": "Общая уборка"})
    dash = (await alice.get(alice.f("/dashboard"))).json()
    assert not dash["is_empty"]
    assert dash["month_family"]["expense"] == "80.00"
    assert [t["title"] for t in dash["my_tasks"]] == ["Общая уборка"]
    assert any(a["action"] == "task.create" and a["actor_name"] == "Борис" for a in dash["activity"])


async def test_ai_meal_plan_tool(couple: tuple[Actor, Actor]) -> None:
    alice, _ = couple
    day = (date.today() + timedelta(days=1)).isoformat()
    provider = ScriptedProvider(
        [
            call("get_pantry_items", {}, "a"),
            call("generate_meal_plan", {"meals": [{"day": day, "meal_type": "dinner", "title": "Паста", "servings": 2, "ingredients": [{"name": "Спагетти", "quantity": "0.2", "unit": "кг"}]}]}, "b"),
            text("Предлагаю меню, подтвердите."),
        ]
    )
    set_provider(provider)
    try:
        r = await alice.post(alice.f("/ai/chat"), {"message": "Составь меню на завтра"})
        res = r.json()
        assert res["proposals"][0]["summary"].startswith("Меню: 1")
        assert (await alice.get(alice.f("/kitchen/meal-plan"))).json() == []
        done = (await alice.post(alice.f(f"/ai/proposals/{res['proposals'][0]['id']}/confirm"))).json()
        assert done["status"] == "executed" and done["result"]["added_to_shopping"] == ["Спагетти"]
        assert len((await alice.get(alice.f("/kitchen/meal-plan"))).json()) == 1
    finally:
        set_provider(None)
