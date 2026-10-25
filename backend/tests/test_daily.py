from tests.conftest import Actor


async def test_daily_favorites_are_personal_and_persistent(couple: tuple[Actor, Actor]) -> None:
    alice, bob = couple
    url = "/api/v1/me/daily-favorites"
    assert (await alice.get(url)).json() == []

    body = {"text": "Медленно — тоже вперёд.", "day": "2026-10-25"}
    r = await alice.put(f"{url}/steps-7", body)
    assert r.status_code == 200, r.text
    assert r.json()["phrase_id"] == "steps-7" and r.json()["day"] == "2026-10-25"
    # Saving again keeps one entry (double tap, two devices).
    assert (await alice.put(f"{url}/steps-7", body)).status_code == 200
    await alice.put(f"{url}/autumn-3", {"text": "Открой окно.", "day": "2026-10-26"})
    saved = (await alice.get(url)).json()
    assert sorted(f["phrase_id"] for f in saved) == ["autumn-3", "steps-7"]

    # Bob, in the same family, does not see Alice's favourites.
    assert (await bob.get(url)).json() == []

    assert (await alice.delete(f"{url}/steps-7")).status_code == 204
    assert (await alice.delete(f"{url}/steps-7")).status_code == 204
    assert [f["phrase_id"] for f in (await alice.get(url)).json()] == ["autumn-3"]


async def test_daily_favorites_validate_input(alice: Actor, client) -> None:  # type: ignore[no-untyped-def]
    url = "/api/v1/me/daily-favorites"
    ok = {"text": "Фраза", "day": "2026-10-25"}
    assert (await alice.put(f"{url}/../families", ok)).status_code in (404, 405, 422)
    assert (await alice.put(f"{url}/DROP-1", ok)).status_code == 422
    assert (await alice.put(f"{url}/self-1", {"text": "", "day": "2026-10-25"})).status_code == 422
    assert (
        await alice.put(f"{url}/self-1", {"text": "x" * 301, "day": "2026-10-25"})
    ).status_code == 422
    assert (await alice.put(f"{url}/self-1", {"text": "Фраза", "day": "вчера"})).status_code == 422
    # Without a session nothing is readable.
    assert (await client.get(url)).status_code == 401
