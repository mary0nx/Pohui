from tests.conftest import Actor, create_family, login


async def test_create_family_seeds_defaults(alice: Actor) -> None:
    await create_family(alice, "Наш дом")
    r = await alice.get(alice.f())
    body = r.json()
    assert body["name"] == "Наш дом"
    assert body["my_role"] == "owner"
    assert len(body["members"]) == 1
    me = (await alice.get("/api/v1/me")).json()
    assert me["active_family_id"] == alice.family_id


async def test_invitation_flow(alice: Actor, bob: Actor) -> None:
    await create_family(alice)
    inv = (await alice.post(alice.f("/invitations"), {"max_uses": 1})).json()
    assert inv["token"] and inv["start_param"].startswith("inv_")
    assert inv["link"].startswith("https://t.me/family_os_test_bot")

    preview = await bob.post("/api/v1/invitations/preview", {"token": inv["start_param"]})
    assert preview.status_code == 200
    assert preview.json()["family_name"] == "Семья"

    r = await bob.post("/api/v1/invitations/accept", {"token": inv["token"]})
    assert r.status_code == 200
    assert {m["first_name"] for m in r.json()["members"]} == {"Алиса", "Борис"}
    # Accepting again is idempotent.
    assert (
        await bob.post("/api/v1/invitations/accept", {"token": inv["token"]})
    ).status_code == 200

    # Single-use invitation cannot be used by a third person.
    carol = await login(alice.client, 1003, "Карина")
    r = await carol.post("/api/v1/invitations/accept", {"token": inv["token"]})
    assert r.status_code == 404


async def test_revoked_invitation(alice: Actor, bob: Actor) -> None:
    await create_family(alice)
    inv = (await alice.post(alice.f("/invitations"), {})).json()
    assert (await alice.delete(alice.f(f"/invitations/{inv['id']}"))).status_code == 204
    r = await bob.post("/api/v1/invitations/accept", {"token": inv["token"]})
    assert r.status_code == 404
    assert (await alice.get(alice.f("/invitations"))).json() == []


async def test_non_member_cannot_access_family(couple: tuple[Actor, Actor], eve: Actor) -> None:
    alice, _ = couple
    for path in ("", "/members", "/invitations"):
        r = await eve.get(alice.f(path))
        assert r.status_code == 404, path
    r = await eve.patch(alice.f(), {"name": "hacked"})
    assert r.status_code == 404
    r = await eve.post(alice.f("/invitations"), {})
    assert r.status_code == 404


async def test_member_roles(couple: tuple[Actor, Actor]) -> None:
    alice, bob = couple
    members = (await alice.get(alice.f("/members"))).json()
    bob_member = next(m for m in members if m["user_id"] == bob.user_id)
    alice_member = next(m for m in members if m["user_id"] == alice.user_id)
    # Bob (admin) cannot remove the owner, cannot delete the family.
    assert (await bob.delete(alice.f(f"/members/{alice_member['id']}"))).status_code == 403
    r = await bob.post(alice.f("/delete"), {"confirm_name": "Мы"})
    assert r.status_code == 403
    # Owner leaving with other members is refused.
    assert (await alice.post(alice.f("/leave"))).status_code == 409
    # Bob may leave.
    assert (await bob.post(bob.f("/leave"))).status_code == 204
    assert (await bob.get(alice.f())).status_code == 404
    assert bob_member


async def test_delete_family_requires_confirmation(alice: Actor) -> None:
    await create_family(alice, "Удаляемая")
    r = await alice.post(alice.f("/delete"), {"confirm_name": "не то"})
    assert r.status_code == 422
    r = await alice.post(alice.f("/delete"), {"confirm_name": "Удаляемая"})
    assert r.status_code == 204
    assert (await alice.get(alice.f())).status_code == 404


async def test_ownership_transfer(couple: tuple[Actor, Actor]) -> None:
    alice, bob = couple
    members = (await alice.get(alice.f("/members"))).json()
    bob_member = next(m for m in members if m["user_id"] == bob.user_id)
    r = await alice.patch(alice.f(f"/members/{bob_member['id']}"), {"role": "owner"})
    assert r.status_code == 200
    roles = {m["user_id"]: m["role"] for m in r.json()}
    assert roles == {bob.user_id: "owner", alice.user_id: "admin"}
    assert (await alice.post(alice.f("/leave"))).status_code == 204


async def test_dev_auth_meta(client) -> None:  # type: ignore[no-untyped-def]
    meta = (await client.get("/api/v1/meta")).json()
    assert meta["dev_auth"] is True
    assert meta["ai_available"] is False
