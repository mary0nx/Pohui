"""«Мой маршрут»: schedule loading, routing, options, addresses, privacy, access and the API."""

from __future__ import annotations

import base64
import hashlib
import io
import json
import zipfile
from collections.abc import Iterator
from datetime import UTC, date, datetime, timedelta
from pathlib import Path
from typing import Any

import httpx
import pytest
from sqlalchemy import select, text

from app.db.session import get_sessionmaker
from app.models import TransitFeed, TransitSource
from app.modules.transit import feeds, gtfs, jakdojade, planner, raptor, service
from app.modules.transit.addresses import fold, get_index
from app.modules.transit.geo import cs2000_to_wgs84, haversine_m
from app.security.sealed import SealedError, seal, unseal
from tests import transit_fixtures as fx
from tests.conftest import Actor

WAW = planner.ZONE
TUESDAY = date(2026, 10, 27)
SATURDAY = date(2026, 10, 31)
HOLIDAY = date(2026, 11, 11)  # a Wednesday running the Sunday service


def at(day: date, h: int, m: int = 0) -> datetime:
    return datetime(day.year, day.month, day.day, h, m, tzinfo=WAW)


@pytest.fixture(scope="module")
def home_work() -> tuple[Any, Any]:
    ix = get_index()
    home = ix.search("Legnicka 58")[0][0]
    work = ix.search("pl. Grunwaldzki 2")[0][0]
    return home, work


@pytest.fixture(scope="module")
def net(home_work: tuple[Any, Any]) -> fx.Net:
    home, work = home_work
    return fx.Net((home.lat, home.lon), (work.lat, work.lon))


@pytest.fixture(scope="module")
def tt(net: fx.Net) -> gtfs.Timetable:
    return gtfs.load(fx.build(net))


@pytest.fixture(autouse=True)
def fresh_store() -> Iterator[None]:
    feeds.get_store().clear()
    feeds._rejected.clear()
    service._cache.clear()
    yield
    feeds.get_store().clear()
    service._cache.clear()


def points(net: fx.Net) -> tuple[planner.Point, planner.Point]:
    return planner.Point(*net.h), planner.Point(*net.w)


def rides(o: planner.Option, tt: gtfs.Timetable) -> list[str]:
    assert o.found is not None
    return [tt.routes[tt.patterns[r.dp.pattern].route].short_name for r in o.found.rides]


def hhmm(day: date, seconds: int) -> str:
    return planner.to_datetime(day, seconds).strftime("%H:%M")


# ---- geometry and the address register ------------------------------------------


def test_cs2000_conversion_matches_a_known_point() -> None:
    # ul. Wystawowa 1 (Hala Stulecia), point pa_47103 of the city's register (EPSG:2177); the
    # tram stop "Hala Stulecia" of the GTFS feed is about 80 m away.
    lat, lon = cs2000_to_wgs84(6435141.7, 5664016.355)
    assert haversine_m(lat, lon, 51.1074278200, 17.0726744600) < 120


def test_address_search_accents_prefixes_and_numbers() -> None:
    ix = get_index()
    assert fold("Źródlana Łąkowa") == "zrodlana lakowa"
    a, _ = ix.search("ul. legnicka 58")
    assert a[0].label == "ul. Legnicka 58" and a[0].postcode.startswith("54-")
    a, _ = ix.search("58 Legnicka")
    assert a[0].label == "ul. Legnicka 58"
    # A number that is part of the street name.
    a, streets = ix.search("3 maja")
    assert not a and streets[0].street == "ul. 3 Maja"
    a, _ = ix.search("ul. 3 Maja 11")
    assert a[0].label == "ul. 3 Maja 11"
    # A house number that does not exist: the street is offered instead of a guess.
    a, streets = ix.search("Legnicka 99999")
    assert not a and streets and streets[0].street == "ul. Legnicka"
    assert ix.search("zzzzqqq") == ([], [])


# ---- schedule: calendar, day tables ---------------------------------------------


def test_feed_info_and_service_days(tt: gtfs.Timetable) -> None:
    assert tt.info.start == date(2026, 10, 26) and tt.info.end == date(2026, 11, 15)
    wd, we = tt.services.index("WD"), tt.services.index("WE")
    assert tt.active_services(TUESDAY) == {wd}
    assert tt.active_services(SATURDAY) == {we}
    assert tt.active_services(HOLIDAY) == {we}  # calendar_dates: holiday runs Sunday service
    assert tt.covers(TUESDAY) and not tt.covers(date(2026, 11, 16))


def test_broken_feed_is_rejected(net: fx.Net) -> None:
    with pytest.raises(gtfs.FeedError):
        gtfs.load(fx.build(net, broken=True))
    with pytest.raises(gtfs.FeedError):
        gtfs.load(b"not a zip")


def test_night_trip_after_midnight_belongs_to_previous_day(tt: gtfs.Timetable, net: fx.Net) -> None:
    a, b = points(net)
    tue = gtfs.day_table(tt, TUESDAY)
    plan = planner.plan(tue, a, b, at(TUESDAY, 23, 40))
    night = plan.options[0]
    assert rides(night, tt) == ["209"]
    assert planner.to_datetime(TUESDAY, night.arrive).date() == TUESDAY + timedelta(days=1)
    assert hhmm(TUESDAY, night.found.rides[0].arrival) == "00:20"  # type: ignore[union-attr]
    # On Wednesday's clock the same trip left at 23:50 the day before: gone at 00:05.
    wed = gtfs.day_table(tt, TUESDAY + timedelta(days=1))
    n9 = next(
        dp
        for groups in wed.by_pattern.values()
        for dp in groups
        if tt.routes[tt.patterns[dp.pattern].route].short_name == "209"
    )
    assert n9.times[1] == -600 and n9.times[2] == 20 * 60  # 23:50 → 00:20, first in order
    assert planner.plan(wed, a, b, at(wed.day, 0, 5)).status == "no_route"


# ---- routing ------------------------------------------------------------------------


def test_fastest_has_a_transfer_and_fewer_transfers_is_the_direct_tram(
    tt: gtfs.Timetable, net: fx.Net
) -> None:
    day = gtfs.day_table(tt, TUESDAY)
    a, b = points(net)
    plan = planner.plan(day, a, b, at(TUESDAY, 6, 55))
    assert plan.status == "ok"
    fastest = plan.options[0]
    assert "fastest" in fastest.tags
    assert rides(fastest, tt) == ["102", "103"]  # bus then bus, one change at Węzeł
    assert fastest.transfers == 1
    direct = next(o for o in plan.options if "fewer_transfers" in o.tags)
    assert rides(direct, tt) == ["1"] and direct.transfers == 0
    assert direct.arrive > fastest.arrive
    # Times come from the timetable: 102 leaves Dom Przystanek at 07:05.
    first = fastest.found.rides[0]  # type: ignore[union-attr]
    assert tt.stop_names[first.from_stop] == "Dom Przystanek"
    assert hhmm(TUESDAY, first.departure) == "07:05"
    # Leaving home is the departure minus the walk to the stop.
    assert fastest.depart == first.departure - fastest.found.legs[0].seconds  # type: ignore[union-attr, attr-defined]
    later = next(o for o in plan.options if "later" in o.tags)
    assert later.depart > fastest.depart


def test_transfer_walk_is_at_least_a_minute(tt: gtfs.Timetable, net: fx.Net) -> None:
    day = gtfs.day_table(tt, TUESDAY)
    a, b = points(net)
    plan = planner.plan(day, a, b, at(TUESDAY, 6, 55))
    legs = plan.options[0].found.legs  # type: ignore[union-attr]
    walk = [
        leg
        for leg in legs
        if isinstance(leg, raptor.WalkLeg) and leg.from_stop is not None and leg.to_stop is not None
    ]
    assert walk and walk[0].seconds >= 60


def test_return_direction(tt: gtfs.Timetable, net: fx.Net) -> None:
    """The feed has no trips from work to home: no route, never an invented one."""
    day = gtfs.day_table(tt, TUESDAY)
    a, b = points(net)
    plan = planner.plan(day, b, a, at(TUESDAY, 7, 0))
    assert plan.status == "no_route" and plan.options == []


def test_arrive_by_gives_the_latest_departure(tt: gtfs.Timetable, net: fx.Net) -> None:
    day = gtfs.day_table(tt, TUESDAY)
    a, b = points(net)
    plan = planner.plan(day, a, b, at(TUESDAY, 8, 0), arrive_by=True)
    best = plan.options[0]
    assert "latest_departure" in best.tags
    assert best.arrive <= planner.to_seconds(at(TUESDAY, 8, 0), TUESDAY)
    # 07:45 bus 102 → 07:57 bus 103 → 08:05 is too late; 07:25 → 07:37 → 07:45 arrives in time.
    assert hhmm(TUESDAY, best.found.rides[-1].arrival) <= "08:00"  # type: ignore[union-attr]


def test_weekend_has_only_the_hourly_tram(tt: gtfs.Timetable, net: fx.Net) -> None:
    day = gtfs.day_table(tt, SATURDAY)
    a, b = points(net)
    plan = planner.plan(day, a, b, at(SATURDAY, 7, 5))
    assert {tuple(rides(o, tt)) for o in plan.options} == {("1",)}
    assert hhmm(SATURDAY, plan.options[0].found.rides[0].departure) == "08:00"  # type: ignore[union-attr]


def test_no_service_late_evening(tt: gtfs.Timetable, net: fx.Net) -> None:
    day = gtfs.day_table(tt, SATURDAY)
    a, b = points(net)
    assert planner.plan(day, a, b, at(SATURDAY, 13, 0)).status == "no_route"


def test_no_stops_near_and_walk_only(tt: gtfs.Timetable, net: fx.Net) -> None:
    day = gtfs.day_table(tt, TUESDAY)
    far = get_index().search("Kosmonautów 166")[0][0]
    a, _ = points(net)
    plan = planner.plan(day, planner.Point(far.lat, far.lon), a, at(TUESDAY, 7, 0))
    assert plan.status == "no_stops_start"
    # Two points 300 m apart: walking is offered and is the fastest.
    near = planner.Point(net.h[0] + 0.0027, net.h[1])
    plan = planner.plan(day, a, near, at(TUESDAY, 7, 0))
    assert plan.walk_only is not None and "fastest" in plan.walk_only.tags


def test_dst_day_times(tt: gtfs.Timetable) -> None:
    # 25 Oct 2026: clocks go back at 03:00. GTFS time 12:00:00 is still noon local time.
    d = date(2026, 10, 25)
    assert planner.to_datetime(d, 12 * 3600).hour == 12
    assert planner.to_seconds(at(d, 12, 0), d) == 12 * 3600


# ---- schedule updates from the portal ------------------------------------------------


def portal(files: dict[int, bytes], fail: bool = False) -> httpx.MockTransport:
    def handler(req: httpx.Request) -> httpx.Response:
        if fail:
            return httpx.Response(503)
        path = req.url.path
        if req.url.host != "api.open-data.cui.wroclaw.pl":
            return httpx.Response(404)
        if path == "/od2/6/":
            return httpx.Response(200, json={"id": 6, "pliki": sorted(files, reverse=True)})
        for fid, data in files.items():
            if path == f"/od2-files/{fid}/":
                return httpx.Response(200, json={
                    "id": fid,
                    "nazwa_pliku_bez_rozszerzenia": "OtwartyWroclaw_rozklad_jazdy_GTFS_26102026",
                    "rozmiar_pliku": len(data),
                    "harvested_at": "2026-10-26T21:16:12+01:00",
                    "download_url": f"https://api.open-data.cui.wroclaw.pl/od2-files/{fid}/download/",
                })  # fmt: skip
            if path == f"/od2-files/{fid}/download/":
                return httpx.Response(200, content=data)
        return httpx.Response(404)

    return httpx.MockTransport(handler)


async def test_update_stores_a_valid_feed_and_skips_broken_and_known(net: fx.Net) -> None:
    now = datetime(2026, 10, 27, 6, 0, tzinfo=UTC)
    good, bad = fx.build(net), fx.build(net, broken=True)
    async with get_sessionmaker()() as db, httpx.AsyncClient(transport=portal({101: good})) as c:
        res = await feeds.check_updates(db, c, now)
        await db.commit()
        assert res["error"] is None and len(res["added"]) == 1  # type: ignore[arg-type]
        row = await db.scalar(select(TransitFeed))
        assert row is not None and row.feed_end == date(2026, 11, 15)
        assert row.sha256 == hashlib.sha256(good).hexdigest()
        data = await db.scalar(select(TransitFeed.data))
        with zipfile.ZipFile(io.BytesIO(data)) as z:  # stored without shapes
            assert "shapes.txt" not in z.namelist() and "stop_times.txt" in z.namelist()
    # A newer broken file never replaces the working one.
    async with (
        get_sessionmaker()() as db,
        httpx.AsyncClient(transport=portal({101: good, 102: bad})) as c,
    ):
        res = await feeds.check_updates(db, c, now + timedelta(hours=1))
        await db.commit()
        assert res["error"] and "FeedError" in str(res["error"])
        state = await db.get(TransitSource, feeds.SOURCE)
        assert state is not None and state.ok_at == now  # not counted as a successful update
        assert len((await db.scalars(select(TransitFeed))).all()) == 1
        meta = await feeds.feed_for(db, TUESDAY)
        assert meta is not None and meta.remote_id == 101
    # The portal republishes file 101 with other content: the new version replaces the old.
    newer = fx.build(net, end="20261120", holiday=None)  # a different size
    async with get_sessionmaker()() as db, httpx.AsyncClient(transport=portal({101: newer})) as c:
        await feeds.check_updates(db, c, now)
        await db.commit()
        rows = (await db.scalars(select(TransitFeed))).all()
        assert len(rows) == 1 and rows[0].feed_end == date(2026, 11, 20)


async def test_portal_down_keeps_the_schedule_and_marks_it_stale_later(net: fx.Net) -> None:
    now = datetime(2026, 10, 27, 6, 0, tzinfo=UTC)
    async with (
        get_sessionmaker()() as db,
        httpx.AsyncClient(transport=portal({101: fx.build(net)})) as c,
    ):
        await feeds.check_updates(db, c, now)
        await db.commit()
    later = now + timedelta(days=4)
    async with get_sessionmaker()() as db, httpx.AsyncClient(transport=portal({}, fail=True)) as c:
        res = await feeds.check_updates(db, c, later)
        await db.commit()
        assert "HTTPStatusError" in str(res["error"])
    async with get_sessionmaker()() as db:
        state = await db.get(TransitSource, feeds.SOURCE)
        assert state is not None and state.ok_at == now
        assert feeds.is_stale(state, later) and not feeds.is_stale(state, now + timedelta(hours=1))
        assert await feeds.feed_for(db, TUESDAY) is not None


async def test_newest_file_covering_the_date_wins_and_old_ones_go(net: fx.Net) -> None:
    async with get_sessionmaker()() as db:
        db.add(TransitFeed(source=feeds.SOURCE, remote_id=10, name="a", feed_start=date(2026, 10, 1),
                           feed_end=date(2026, 11, 30), sha256="x", size=1, data=b"x"))  # fmt: skip
        db.add(TransitFeed(source=feeds.SOURCE, remote_id=11, name="b", feed_start=date(2026, 10, 31),
                           feed_end=date(2026, 11, 1), sha256="y", size=1, data=b"y"))  # fmt: skip
        await db.commit()
        assert (await feeds.feed_for(db, SATURDAY)).remote_id == 11  # type: ignore[union-attr]
        assert (await feeds.feed_for(db, TUESDAY)).remote_id == 10  # type: ignore[union-attr]
        assert await feeds.feed_for(db, date(2026, 12, 5)) is None


def test_only_portal_downloads_are_followed() -> None:
    assert feeds._portal_url("https://api.open-data.cui.wroclaw.pl/od2-files/1/download/")
    assert not feeds._portal_url("http://api.open-data.cui.wroclaw.pl/x")
    assert not feeds._portal_url("https://evil.example/od2-files/1/download/")
    assert feeds.name_date("OtwartyWroclaw_rozklad_jazdy_GTFS_26102026") == date(2026, 10, 26)


# ---- privacy -----------------------------------------------------------------------


def test_sealed_values_roundtrip_and_detect_tampering() -> None:
    token = seal({"street": "ul. Legnicka", "lat": 51.1}, "places/v1")
    assert "Legnicka" not in token and unseal(token, "places/v1")["street"] == "ul. Legnicka"
    with pytest.raises(SealedError):
        unseal(token, "other/v1")  # bound to its purpose
    raw = bytearray(base64.urlsafe_b64decode(token.split(".", 1)[1]))
    raw[-1] ^= 1
    with pytest.raises(SealedError):
        unseal("v1." + base64.urlsafe_b64encode(bytes(raw)).decode(), "places/v1")


# ---- Jakdojade -------------------------------------------------------------------------


def test_jakdojade_link_is_official_and_has_stops_only() -> None:
    url = jakdojade.link("Dom Przystanek", 51.12, 16.99, "Praca", 51.11, 17.06, at(TUESDAY, 7, 5))
    assert url.startswith("https://jakdojade.pl/wroclaw/Dom%20Przystanek/Praca?")
    assert "d=27.10.26" in url and "h=07%3A05" in url and "ia=false" in url
    assert jakdojade.valid_link(url)
    assert not jakdojade.valid_link("https://jakdojade.pl.evil.example/wroclaw/a/b")
    assert not jakdojade.valid_link("http://jakdojade.pl/wroclaw/a/b")


def test_jakdojade_documented_sample_parses() -> None:
    xml = (Path(__file__).parent / "fixtures" / "jakdojade_routes_sample.xml").read_bytes()
    routes = jakdojade.parse(xml)
    assert len(routes) == 3
    first = routes[0]
    assert first.start == datetime(2009, 12, 7, 11, 30, tzinfo=WAW)
    tram = next(ln for ln in first.lines if ln.vehicle == "tram")
    assert tram.name == "7" and tram.direction == "ZAWADY"
    assert tram.stops[0].name == "Arciszewskiego"  # the context stop "Arena" is left out
    opts = service.jakdojade_options(routes, "fastest")
    assert sum(o.recommended for o in opts) == 1 and all(o.provider == "jakdojade" for o in opts)


def test_jakdojade_sample_answer_is_never_shown() -> None:
    xml = b'<ROUTE_SEARCH_RESULT><added_params><param key="test" value="true"/></added_params></ROUTE_SEARCH_RESULT>'
    with pytest.raises(jakdojade.JakdojadeUnavailable):
        jakdojade.parse(xml)


async def test_jakdojade_is_not_called_without_keys() -> None:
    def handler(req: httpx.Request) -> httpx.Response:
        raise AssertionError("must not call Jakdojade without keys")

    async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as c:
        with pytest.raises(jakdojade.JakdojadeUnavailable):
            await jakdojade.search(51.1, 17.0, 51.11, 17.05, at(TUESDAY, 7, 0), False, c)


# ---- API: places, access, plans ----------------------------------------------------------


async def add_feed(net: fx.Net) -> None:
    data = feeds.slim(fx.build(net))
    async with get_sessionmaker()() as db:
        db.add(TransitFeed(source=feeds.SOURCE, remote_id=1, name="test", feed_start=date(2026, 10, 26),
                           feed_end=date(2026, 11, 15), sha256="t", size=len(data), data=data))  # fmt: skip
        db.add(
            TransitSource(
                source=feeds.SOURCE, checked_at=datetime.now(UTC), ok_at=datetime.now(UTC)
            )
        )
        await db.commit()


async def address_id(actor: Actor, q: str) -> str:
    r = await actor.post("/api/v1/me/places/search", {"q": q})
    assert r.status_code == 200, r.text
    return r.json()["addresses"][0]["id"]


async def save(actor: Actor, kind: str, title: str, q: str, shared: bool = False) -> str:
    r = await actor.post(
        "/api/v1/me/places",
        {"kind": kind, "title": title, "address_id": await address_id(actor, q), "shared": shared},
    )
    assert r.status_code == 201, r.text
    return r.json()["id"]


async def test_places_are_private_encrypted_and_editable(alice: Actor, eve: Actor) -> None:
    home = await save(alice, "home", "Дом", "Legnicka 58")
    work = await save(alice, "work", "Работа", "pl. Grunwaldzki 2")
    r = await alice.get("/api/v1/me/places")
    places = r.json()["places"]
    assert [p["title"] for p in places] == ["Дом", "Работа"]
    assert places[0]["label"] == "ul. Legnicka 58" and places[0]["mine"]
    # A second home is refused; the existing one is edited instead.
    r = await alice.post(
        "/api/v1/me/places",
        {"kind": "home", "title": "Дом 2", "address_id": await address_id(alice, "Rynek 1")},
    )
    assert r.status_code == 409
    r = await alice.patch(
        f"/api/v1/me/places/{home}", {"address_id": await address_id(alice, "Rynek 1")}
    )
    assert r.status_code == 200 and r.json()["label"] == "Rynek 1"
    # Stored encrypted: no street name or coordinates in the table.
    async with get_sessionmaker()() as db:
        raw = (await db.execute(text("SELECT sealed, title FROM places"))).all()
    assert raw and all(
        "Rynek" not in s and "Grunwaldzki" not in s and "51." not in s for s, _ in raw
    )
    # Someone else: not visible, not usable, not editable.
    assert (await eve.get("/api/v1/me/places")).json() == {"places": [], "shared": []}
    assert (await eve.patch(f"/api/v1/me/places/{home}", {"title": "x"})).status_code == 404
    assert (await eve.delete(f"/api/v1/me/places/{home}")).status_code == 404
    r = await eve.post("/api/v1/me/route/plan", {"from_place_id": home, "to_place_id": work})
    assert r.status_code == 404
    assert (await alice.delete(f"/api/v1/me/places/{work}")).status_code == 204


async def test_family_sees_only_places_shared_on_purpose(
    couple: tuple[Actor, Actor], eve: Actor
) -> None:
    alice, bob = couple
    secret = await save(alice, "home", "Дом", "Legnicka 58")
    shared = await save(alice, "work", "Работа Алисы", "pl. Grunwaldzki 2", shared=True)
    bob_home = await save(bob, "home", "Дом Бориса", "Rynek 1")
    r = (await bob.get("/api/v1/me/places")).json()
    assert [p["title"] for p in r["shared"]] == ["Работа Алисы"]
    assert r["shared"][0]["owner_name"] == "Алиса" and not r["shared"][0]["mine"]
    # Bob may plan to Alice's shared work, never from her private home.
    ok = await bob.post("/api/v1/me/route/plan", {"from_place_id": bob_home, "to_place_id": shared})
    assert ok.status_code == 200
    no = await bob.post("/api/v1/me/route/plan", {"from_place_id": secret, "to_place_id": bob_home})
    assert no.status_code == 404
    # Bob cannot change Alice's shared place; a stranger cannot even see it.
    assert (await bob.patch(f"/api/v1/me/places/{shared}", {"title": "x"})).status_code == 404
    assert (await eve.get("/api/v1/me/places")).json()["shared"] == []
    # Switching sharing off hides it again.
    await alice.patch(f"/api/v1/me/places/{shared}", {"shared": False})
    assert (await bob.get("/api/v1/me/places")).json()["shared"] == []


async def test_plan_api_options_scheduled_times_and_sources(alice: Actor, net: fx.Net) -> None:
    await add_feed(net)
    home = await save(alice, "home", "Дом", "Legnicka 58")
    work = await save(alice, "work", "Работа", "pl. Grunwaldzki 2")
    body = {"from_place_id": home, "to_place_id": work, "at": at(TUESDAY, 6, 55).isoformat()}
    r = await alice.post("/api/v1/me/route/plan", body)
    assert r.status_code == 200, r.text
    plan = r.json()
    assert plan["status"] == "ok" and plan["realtime"] is False
    assert plan["schedule"]["provider"] == "gtfs" and plan["schedule"]["license"] == "CC0 1.0"
    assert not plan["schedule"]["stale"]
    best = plan["options"][0]
    assert best["recommended"] and "fastest" in best["tags"]
    assert best["transfers"] == 1 and best["time_kind"] == "scheduled"
    ride = best["first_ride"]
    assert (
        ride["line"] == "102"
        and ride["mode"] == "bus"
        and ride["from_stop"]["name"] == "Dom Przystanek"
    )
    assert ride["departure_at"].startswith("2026-10-27T07:05")
    # The stop is described by the nearest address of the city's register.
    assert ride["from_stop"]["near_address"].startswith("ul. Legnicka")
    assert all(leg["time_kind"] == "scheduled" and leg["delay_min"] is None for leg in best["legs"])
    assert any(o["transfers"] == 0 and "fewer_transfers" in o["tags"] for o in plan["options"])
    assert plan["jakdojade_url"].startswith("https://jakdojade.pl/wroclaw/")
    assert "Legnicka" not in plan["jakdojade_url"]  # stops only, never the home address
    assert any("реальном времени" in n for n in plan["notes"])
    # Arrive by 08:00.
    r = await alice.post(
        "/api/v1/me/route/plan", {**body, "mode": "arrive", "at": at(TUESDAY, 8, 0).isoformat()}
    )
    arrive = r.json()
    assert (
        arrive["status"] == "ok"
        and arrive["options"][0]["arrive_at"] <= "2026-10-27T08:00:00+01:00"
    )
    # The preference picks the recommended option.
    await alice.put(
        "/api/v1/me/route/preferences", {"prefer": "fewer_transfers", "max_walk_m": 1000}
    )
    plan = (await alice.post("/api/v1/me/route/plan", body)).json()
    rec = [o for o in plan["options"] if o["recommended"]]
    assert len(rec) == 1 and rec[0]["transfers"] == 0


async def test_plan_without_schedule_or_with_stale_schedule(alice: Actor, net: fx.Net) -> None:
    home = await save(alice, "home", "Дом", "Legnicka 58")
    work = await save(alice, "work", "Работа", "pl. Grunwaldzki 2")
    body = {"from_place_id": home, "to_place_id": work, "at": at(TUESDAY, 6, 55).isoformat()}
    r = (await alice.post("/api/v1/me/route/plan", body)).json()
    assert r["status"] == "no_schedule" and r["options"] == []
    await add_feed(net)
    # A date after the feed ends: no schedule, no guessing.
    late = {**body, "at": at(date(2026, 11, 20), 7, 0).isoformat()}
    assert (await alice.post("/api/v1/me/route/plan", late)).json()["status"] == "no_schedule"
    # The portal has not answered for days: routes shown, none marked as the best.
    async with get_sessionmaker()() as db:
        state = await db.get(TransitSource, feeds.SOURCE)
        assert state is not None
        state.ok_at = datetime.now(UTC) - timedelta(days=5)
        await db.commit()
    r = (await alice.post("/api/v1/me/route/plan", body)).json()
    assert r["status"] == "ok" and r["schedule"]["stale"]
    assert not any(o["recommended"] for o in r["options"])


async def test_plan_same_place_and_check_endpoint(alice: Actor, net: fx.Net) -> None:
    await add_feed(net)
    a = await save(alice, "home", "Дом", "Legnicka 58")
    b = await save(alice, "other", "Тоже дом", "Legnicka 58")
    r = (await alice.post("/api/v1/me/route/plan", {"from_place_id": a, "to_place_id": b})).json()
    assert r["status"] == "same_place"
    r = await alice.post(
        "/api/v1/me/places/check", {"address_id": await address_id(alice, "Legnicka 58")}
    )
    body = r.json()
    assert r.status_code == 200 and body["address"]["label"] == "ul. Legnicka 58"
    assert body["stops"][0]["name"] == "Dom Przystanek" and body["stops"][0]["lines"] == [
        "1",
        "102",
        "209",
    ]
    assert body["osm_url"].startswith("https://www.openstreetmap.org/")
    r = await alice.post("/api/v1/me/places/check", {"address_id": "1999-01-01:5"})
    assert r.status_code == 409  # an id from another register version


async def test_favorites_and_limits(alice: Actor, eve: Actor) -> None:
    home = await save(alice, "home", "Дом", "Legnicka 58")
    work = await save(alice, "work", "Работа", "pl. Grunwaldzki 2")
    r = await alice.post("/api/v1/me/route/favorites", {"from_place_id": home, "to_place_id": work})
    assert r.status_code == 201
    again = await alice.post(
        "/api/v1/me/route/favorites", {"from_place_id": home, "to_place_id": work}
    )
    assert again.json()["id"] == r.json()["id"]
    assert len((await alice.get("/api/v1/me/route/favorites")).json()) == 1
    assert (
        await eve.post("/api/v1/me/route/favorites", {"from_place_id": home, "to_place_id": work})
    ).status_code == 404
    assert (await eve.delete(f"/api/v1/me/route/favorites/{r.json()['id']}")).status_code == 404
    assert (await alice.delete(f"/api/v1/me/route/favorites/{r.json()['id']}")).status_code == 204
    bad = await alice.put("/api/v1/me/route/preferences", {"prefer": "fastest", "max_walk_m": 50})
    assert bad.status_code == 422


async def test_address_never_in_urls_or_logs(
    alice: Actor, caplog: pytest.LogCaptureFixture
) -> None:
    caplog.set_level("DEBUG")
    await save(alice, "home", "Дом", "Legnicka 58")
    assert "Legnicka" not in caplog.text and "legnicka" not in caplog.text


async def test_status_endpoint(alice: Actor, net: fx.Net) -> None:
    r = (await alice.get("/api/v1/me/route/status")).json()
    assert r["schedule"] is None and r["realtime"] is False and not r["jakdojade_configured"]
    assert r["addresses_count"] > 70000
    await add_feed(net)
    r = (await alice.get("/api/v1/me/route/status")).json()
    assert r["schedule"]["valid_to"] == "2026-11-15"


async def test_loading_status_when_parse_is_slow(
    alice: Actor, net: fx.Net, monkeypatch: pytest.MonkeyPatch
) -> None:
    await add_feed(net)
    home = await save(alice, "home", "Дом", "Legnicka 58")
    work = await save(alice, "work", "Работа", "pl. Grunwaldzki 2")
    monkeypatch.setattr(service, "LOAD_WAIT", 0.0)
    real = gtfs.load

    def slow(data: bytes) -> gtfs.Timetable:
        import time

        time.sleep(0.3)
        return real(data)

    monkeypatch.setattr(gtfs, "load", slow)
    body = {"from_place_id": home, "to_place_id": work, "at": at(TUESDAY, 6, 55).isoformat()}
    assert (await alice.post("/api/v1/me/route/plan", body)).json()["status"] == "loading"


async def test_requires_login(client: httpx.AsyncClient) -> None:
    for method, url in (
        ("GET", "/api/v1/me/places"),
        ("POST", "/api/v1/me/route/plan"),
        ("POST", "/api/v1/me/places/search"),
    ):
        r = await client.request(method, url, json={})
        assert r.status_code == 401


def test_haversine_sanity() -> None:
    assert 110_000 < haversine_m(51.0, 17.0, 52.0, 17.0) < 112_000


def test_json_register_is_small() -> None:
    from app.modules.transit.addresses import DATA

    assert DATA.stat().st_size < 1_500_000
    assert json.loads(__import__("gzip").decompress(DATA.read_bytes()))["version"]


# ---- timetables (/transit) ------------------------------------------------------------


async def test_timetable_lines_directions_departures_and_board(
    alice: Actor, net: fx.Net, monkeypatch: pytest.MonkeyPatch
) -> None:
    from app.modules.transit import timetable_router

    monkeypatch.setattr(timetable_router, "_today", lambda: TUESDAY)
    r = (await alice.get("/api/v1/transit/lines")).json()
    assert r["status"] == "no_schedule" and r["lines"] == []
    await add_feed(net)
    r = (await alice.get("/api/v1/transit/lines", params={"date": "2026-10-27"})).json()
    assert r["status"] == "ok" and r["schedule"]["license"] == "CC0 1.0"
    names = [x["line"] for x in r["lines"]]
    assert names == ["1", "102", "103", "209"]  # trams first, night lines last
    assert r["lines"][0]["mode"] == "tram" and r["lines"][-1]["night"] is False
    # Saturday: the buses do not run.
    sat = (await alice.get("/api/v1/transit/lines", params={"date": "2026-10-31"})).json()
    assert {x["line"]: x["runs"] for x in sat["lines"]} == {
        "1": True,
        "102": False,
        "103": False,
        "209": False,
    }

    d = (await alice.get("/api/v1/transit/lines/1", params={"date": "2026-10-27"})).json()
    direction = d["directions"][0]
    assert direction["headsign"] == "Praca"
    assert [s["name"] for s in direction["stops"]] == [
        "Dom Przystanek",
        "Węzeł",
        "Praca Przystanek",
    ]
    stop = direction["stops"][0]["id"]
    deps = (
        await alice.get(
            "/api/v1/transit/lines/1/departures",
            params={"direction": direction["id"], "stop": stop, "date": "2026-10-27"},
        )
    ).json()
    assert [x["time"] for x in deps["departures"]] == [
        "07:00",
        "07:20",
        "07:40",
        "08:00",
        "08:20",
        "08:40",
    ]
    assert deps["time_kind"] == "scheduled" and deps["stop"]["name"] == "Dom Przystanek"
    # From the last stop nothing departs.
    last = direction["stops"][-1]["id"]
    end = await alice.get(
        "/api/v1/transit/lines/1/departures",
        params={"direction": direction["id"], "stop": last, "date": "2026-10-27"},
    )
    assert end.json()["departures"] == []
    assert (await alice.get("/api/v1/transit/lines/77")).status_code == 404

    found = (await alice.get("/api/v1/transit/stops/search", params={"q": "dom przyst"})).json()
    assert found["stops"] == [{"name": "Dom Przystanek", "lines": ["1", "102", "209"]}]
    board = (
        await alice.get(
            "/api/v1/transit/stops/board",
            params={"name": "Dom Przystanek", "date": "2026-10-27", "time": "07:01"},
        )
    ).json()
    assert [(x["time"], x["line"]) for x in board["rows"][:3]] == [
        ("07:05", "102"),
        ("07:20", "1"),
        ("07:25", "102"),
    ]
    assert board["rows"][0]["minutes"] == 4 and board["rows"][0]["headsign"] == "Węzeł"
    assert (
        await alice.get("/api/v1/transit/lines", params={"date": "2027-06-01"})
    ).status_code == 422


async def test_timetable_requires_login(client: httpx.AsyncClient) -> None:
    assert (await client.get("/api/v1/transit/lines")).status_code == 401
