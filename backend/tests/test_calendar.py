from datetime import UTC, datetime, timedelta
from zoneinfo import ZoneInfo

from tests.conftest import Actor

WAW = ZoneInfo("Europe/Warsaw")


async def test_shared_event_and_private_event(couple: tuple[Actor, Actor]) -> None:
    alice, bob = couple
    start = datetime(2026, 11, 7, 15, 0, tzinfo=WAW)
    r = await alice.post(alice.f("/calendar/events"), {"title": "Кино", "starts_at": start.isoformat(), "reminder_minutes": [60]})
    assert r.status_code == 201, r.text
    ev = r.json()
    assert ev["my_reminders"] == [60]
    assert {a["name"] for a in ev["attendees"]} == {"Алиса", "Борис"}
    r = await alice.post(alice.f("/calendar/events"), {"title": "Врач (личное)", "starts_at": start.isoformat(), "visibility": "private"})
    private = r.json()

    occ = (await bob.get(bob.f("/calendar/occurrences?date_from=2026-11-01&date_to=2026-11-30"))).json()
    assert [o["title"] for o in occ] == ["Кино"]
    assert (await bob.get(bob.f(f"/calendar/events/{private['id']}"))).status_code == 404
    assert (await bob.patch(bob.f(f"/calendar/events/{private['id']}"), {"title": "x"})).status_code == 404
    occ_a = (await alice.get(alice.f("/calendar/occurrences?date_from=2026-11-01&date_to=2026-11-30"))).json()
    assert len(occ_a) == 2

    r = await bob.post(bob.f(f"/calendar/events/{ev['id']}/rsvp"), {"rsvp": "declined"})
    assert next(a for a in r.json()["attendees"] if a["name"] == "Борис")["rsvp"] == "declined"


async def test_recurring_event_across_dst(couple: tuple[Actor, Actor]) -> None:
    alice, _ = couple
    start = datetime(2026, 10, 18, 10, 0, tzinfo=WAW)  # DST ends 2026-10-25
    r = await alice.post(
        alice.f("/calendar/events"),
        {"title": "Йога", "starts_at": start.isoformat(), "ends_at": (start + timedelta(hours=1)).isoformat(), "recurrence_freq": "weekly", "recurrence_until": "2026-11-08"},
    )
    ev = r.json()
    occ = (await alice.get(alice.f("/calendar/occurrences?date_from=2026-10-01&date_to=2026-12-31"))).json()
    local_hours = {datetime.fromisoformat(o["start"]).astimezone(WAW).hour for o in occ}
    assert len(occ) == 4 and local_hours == {10}
    utc_hours = sorted({datetime.fromisoformat(o["start"]).astimezone(UTC).hour for o in occ})
    assert utc_hours == [8, 9]  # offset changed, wall clock did not

    second = occ[1]["start"]
    r = await alice.post(alice.f(f"/calendar/events/{ev['id']}/cancel-occurrence"), {"occurrence_start": second})
    assert r.status_code == 204
    occ = (await alice.get(alice.f("/calendar/occurrences?date_from=2026-10-01&date_to=2026-12-31"))).json()
    assert len(occ) == 3 and second not in [o["start"] for o in occ]
    bad = await alice.post(alice.f(f"/calendar/events/{ev['id']}/cancel-occurrence"), {"occurrence_start": "2026-10-19T10:00:00+02:00"})
    assert bad.status_code == 404


async def test_all_day_and_monthly_clamp(couple: tuple[Actor, Actor]) -> None:
    alice, _ = couple
    r = await alice.post(
        alice.f("/calendar/events"),
        {"title": "Платёж 31-го", "starts_at": "2026-01-31T09:00:00+01:00", "all_day": True, "recurrence_freq": "monthly"},
    )
    assert r.status_code == 201
    occ = (await alice.get(alice.f("/calendar/occurrences?date_from=2026-02-01&date_to=2026-04-30"))).json()
    days = [datetime.fromisoformat(o["start"]).astimezone(WAW).date().isoformat() for o in occ]
    assert days == ["2026-02-28", "2026-03-31", "2026-04-30"]
    assert all(o["all_day"] for o in occ)


async def test_event_validation_and_isolation(couple: tuple[Actor, Actor], eve: Actor) -> None:
    alice, _ = couple
    r = await alice.post(alice.f("/calendar/events"), {"title": "x", "starts_at": "2026-11-07T15:00:00"})
    assert r.status_code == 422  # naive datetime rejected
    r = await alice.post(alice.f("/calendar/events"), {"title": "x", "starts_at": "2026-11-07T15:00:00+01:00", "ends_at": "2026-11-07T14:00:00+01:00"})
    assert r.status_code == 422
    r = await alice.post(alice.f("/calendar/events"), {"title": "Секрет", "starts_at": "2026-11-07T15:00:00+01:00"})
    ev = r.json()
    assert (await eve.get(alice.f("/calendar/occurrences"))).status_code == 404
    assert (await eve.get(eve.f(f"/calendar/events/{ev['id']}"))).status_code == 404
    assert (await eve.delete(eve.f(f"/calendar/events/{ev['id']}"))).status_code == 404
