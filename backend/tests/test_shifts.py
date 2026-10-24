"""Work schedule: day/night shifts generated from a repeating pattern and edited per day."""

from datetime import date, timedelta

from tests.conftest import Actor


def shifts_url(actor: Actor, start: str, end: str) -> str:
    return actor.f(f"/calendar/shifts?date_from={start}&date_to={end}")


async def schedule(actor: Actor, start: str, end: str) -> dict[str, str]:
    r = await actor.get(shifts_url(actor, start, end))
    assert r.status_code == 200, r.text
    return {s["day"]: s["kind"] for s in r.json()}


async def test_pattern_generates_two_days_two_nights_four_off(
    couple: tuple[Actor, Actor],
) -> None:
    alice, bob = couple
    # The "C shift" rota: day, day, night, night, then four days off; a cycle starts 8 Oct.
    r = await alice.post(
        alice.f("/calendar/shifts/generate"),
        {"pattern": "DDNNOOOO", "anchor": "2026-10-08", "start": "2026-10-01", "end": "2027-04-30"},
    )
    assert r.status_code == 200, r.text
    # 1 Oct is the 2nd day of a cycle; 212 days = 26 full cycles + D N N O.
    assert r.json() == {"day_shifts": 26 * 2 + 1, "night_shifts": 26 * 2 + 2}

    oct_ = await schedule(alice, "2026-10-01", "2026-10-31")
    assert oct_["2026-10-01"] == "day"
    assert oct_["2026-10-02"] == oct_["2026-10-03"] == "night"
    assert not {"2026-10-04", "2026-10-05", "2026-10-06", "2026-10-07"} & oct_.keys()
    assert oct_["2026-10-08"] == oct_["2026-10-09"] == "day"
    assert oct_["2026-10-26"] == oct_["2026-10-27"] == "night"
    dec = await schedule(alice, "2026-12-01", "2026-12-31")
    assert dec["2026-12-27"] == dec["2026-12-28"] == "day"
    assert dec["2026-12-29"] == dec["2026-12-30"] == "night"
    assert "2026-12-31" not in dec
    apr = await schedule(alice, "2027-04-25", "2027-05-10")
    assert max(apr) <= "2027-04-30"  # nothing generated past the end of the period

    # Shifts are personal: the partner's schedule stays empty.
    assert await schedule(bob, "2026-10-01", "2026-12-31") == {}


async def test_single_days_can_be_changed(couple: tuple[Actor, Actor]) -> None:
    alice, _ = couple
    await alice.post(
        alice.f("/calendar/shifts/generate"),
        {"pattern": "DDNNOOOO", "anchor": "2026-10-08", "start": "2026-10-01", "end": "2026-10-31"},
    )
    # A cancelled night shift becomes a day off; an extra shift can be added.
    assert (
        await alice.put(alice.f("/calendar/shifts/2026-10-11"), {"kind": None})
    ).status_code == 204
    assert (
        await alice.put(alice.f("/calendar/shifts/2026-10-12"), {"kind": "night"})
    ).status_code == 204
    assert (
        await alice.put(alice.f("/calendar/shifts/2026-10-08"), {"kind": "night"})
    ).status_code == 204
    oct_ = await schedule(alice, "2026-10-01", "2026-10-31")
    assert "2026-10-11" not in oct_
    assert oct_["2026-10-12"] == "night" and oct_["2026-10-08"] == "night"

    # Regenerating a shorter period only replaces that period.
    await alice.post(
        alice.f("/calendar/shifts/generate"),
        {"pattern": "D", "anchor": "2026-10-20", "start": "2026-10-20", "end": "2026-10-21"},
    )
    oct_ = await schedule(alice, "2026-10-01", "2026-10-31")
    assert oct_["2026-10-20"] == oct_["2026-10-21"] == "day"
    assert oct_["2026-10-12"] == "night"

    r = await alice.delete(shifts_url(alice, "2026-10-01", "2026-10-15"))
    assert r.status_code == 204
    assert min(await schedule(alice, "2026-10-01", "2026-10-31")) >= "2026-10-16"


async def test_shift_validation_and_isolation(couple: tuple[Actor, Actor], eve: Actor) -> None:
    alice, _ = couple
    gen = alice.f("/calendar/shifts/generate")
    base = {
        "pattern": "DDNNOOOO",
        "anchor": "2026-10-08",
        "start": "2026-10-01",
        "end": "2026-10-31",
    }
    assert (await alice.post(gen, {**base, "pattern": "DX"})).status_code == 422
    assert (await alice.post(gen, {**base, "pattern": "OOO"})).status_code == 422
    assert (await alice.post(gen, {**base, "end": "2026-09-01"})).status_code == 422
    too_long = (date(2026, 10, 1) + timedelta(days=400)).isoformat()
    assert (await alice.post(gen, {**base, "end": too_long})).status_code == 422
    assert (await alice.get(shifts_url(alice, "2026-10-01", too_long))).status_code == 422

    # Another family cannot read or write this family's schedules.
    other = eve.f("").replace(eve.family_id or "", alice.family_id or "")
    assert (
        await eve.get(f"{other}/calendar/shifts?date_from=2026-10-01&date_to=2026-10-31")
    ).status_code in (403, 404)
    assert (await eve.put(f"{other}/calendar/shifts/2026-10-01", {"kind": "day"})).status_code in (
        403,
        404,
    )
