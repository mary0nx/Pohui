"""«Забота на каждый день»: schedule, weather advice, texts, idempotency, isolation, delivery."""

import re
import uuid
from datetime import UTC, date, datetime, time, timedelta
from typing import Any
from zoneinfo import ZoneInfo

import pytest
from sqlalchemy import select, update

from app.db.session import get_sessionmaker
from app.integrations.telegram import TelegramTemporaryError
from app.models import CareSettings, Notification, User
from app.models.enums import NotificationCategory, NotificationStatus
from app.modules.care import messages as M
from app.modules.care import phrases as P
from app.modules.care import service, weather
from app.modules.care.weather import DayWeather, HourPoint, Place
from app.workers.dispatch import dispatch_due
from app.workers.jobs import run_job
from tests.conftest import Actor
from tests.test_worker import FakeSender, start_bot

WAW = ZoneInfo("Europe/Warsaw")


def utc(y: int, mo: int, d: int, h: int, mi: int = 0) -> datetime:
    return datetime(y, mo, d, h, mi, tzinfo=UTC)


def hours(day: date, **kw: Any) -> list[HourPoint]:
    """A day of hourly points; kw overrides per field (constant or callable of the hour)."""
    base = dict(
        temp=10.0,
        feels=None,
        precip_mm=0.0,
        precip_prob=0.0,
        wind_kmh=10.0,
        gust_kmh=20.0,
        condition="cloudy",
        uv=1.0,
    )
    base.update(kw)
    out = []
    for h in range(24):
        vals = {k: (v(h) if callable(v) else v) for k, v in base.items()}
        out.append(HourPoint(at=datetime(day.year, day.month, day.day, h, tzinfo=WAW), **vals))
    return out


def summary(day: date, **kw: Any) -> DayWeather:
    return weather.summarize(hours(day, **kw), day, time(8, 0), "Вроцлав", "test")


@pytest.fixture(autouse=True)
def fake_weather(monkeypatch: pytest.MonkeyPatch) -> Any:
    """Every test controls the forecast; no network."""
    state: dict[str, Any] = {"points": None, "calls": 0}

    async def source(place: Place, fetch: Any) -> list[HourPoint]:
        state["calls"] += 1
        if state["points"] is None:
            raise weather.WeatherUnavailable("down")
        return state["points"]

    monkeypatch.setattr(weather, "SOURCES", [("test", source)])
    weather.clear_cache()
    yield state
    weather.clear_cache()


# ---------------------------------------------------------------- schedule


def settings(**kw: Any) -> CareSettings:
    s = CareSettings(
        user_id=uuid.uuid4(),
        enabled=True,
        gender="f",
        city="Вроцлав",
        latitude=51.1,
        longitude=17.03,
        timezone="Europe/Warsaw",
        send_time=time(6, 0),
        leave_time=time(8, 0),
        weekdays=127,
        tone="tender",
        weather_tips=True,
        last_sent_on=None,
    )
    for k, v in kw.items():
        setattr(s, k, v)
    return s


def test_send_time_in_wroclaw_summer_and_winter() -> None:
    s = settings()
    # Winter (CET, UTC+1): 06:00 local = 05:00 UTC.
    assert service.due_date(s, utc(2026, 11, 10, 4, 59)) is None
    assert service.due_date(s, utc(2026, 11, 10, 5, 0)) == date(2026, 11, 10)
    # Summer (CEST, UTC+2): 06:00 local = 04:00 UTC.
    assert service.due_date(s, utc(2027, 7, 1, 3, 59)) is None
    assert service.due_date(s, utc(2027, 7, 1, 4, 0)) == date(2027, 7, 1)
    # Only within three hours after the chosen time; never in the afternoon.
    assert service.due_date(s, utc(2026, 11, 10, 7, 59)) == date(2026, 11, 10)
    assert service.due_date(s, utc(2026, 11, 10, 8, 0)) is None
    assert service.due_date(s, utc(2026, 11, 10, 13, 0)) is None


def test_daylight_saving_changes() -> None:
    # 28 March 2027: 02:00 → 03:00. A 02:30 that never exists is sent at 03:00 local.
    s = settings(send_time=time(2, 30))
    assert service.due_date(s, utc(2027, 3, 28, 0, 59)) is None  # 01:59 CET
    assert service.due_date(s, utc(2027, 3, 28, 1, 0)) == date(2027, 3, 28)  # 03:00 CEST
    # 25 October 2026: 03:00 → 02:00, 02:30 happens twice; sent only once.
    s = settings(send_time=time(2, 30))
    assert service.due_date(s, utc(2026, 10, 25, 0, 30)) == date(2026, 10, 25)  # first 02:30
    s.last_sent_on = date(2026, 10, 25)
    assert service.due_date(s, utc(2026, 10, 25, 1, 30)) is None  # second 02:30
    # A 06:00 message keeps its local time across the change.
    s = settings()
    assert service.due_date(s, utc(2026, 10, 24, 4, 0)) == date(2026, 10, 24)  # CEST
    assert service.due_date(s, utc(2026, 10, 26, 4, 0)) is None  # 05:00 CET
    assert service.due_date(s, utc(2026, 10, 26, 5, 0)) == date(2026, 10, 26)


def test_disabled_days_and_already_sent() -> None:
    assert service.due_date(settings(enabled=False), utc(2026, 11, 10, 5, 0)) is None
    # 10 Nov 2026 is a Tuesday (bit 1); only weekends selected.
    assert service.due_date(settings(weekdays=0b1100000), utc(2026, 11, 10, 5, 0)) is None
    assert service.due_date(settings(weekdays=0b0000010), utc(2026, 11, 10, 5, 0)) == date(
        2026, 11, 10
    )
    assert (
        service.due_date(settings(last_sent_on=date(2026, 11, 10)), utc(2026, 11, 10, 5, 0)) is None
    )


# ---------------------------------------------------------------- weather and advice


def test_rain_cold_heat_and_wind_advice() -> None:
    d = date(2026, 11, 10)
    rain = summary(
        d,
        temp=8.0,
        feels=5.0,
        precip_mm=lambda h: 0.8 if h >= 9 else 0.0,
        precip_prob=80.0,
        condition=lambda h: "rain" if h >= 9 else "overcast",
    )
    assert rain.wet and rain.condition == "rain"
    tips = M.advice(rain)
    assert "возьми зонт" in tips and "тёплая куртка" in tips
    text = M.describe(rain, time(8, 0))
    assert "дождливо" in text and "+8°C" in text and "ощущается как +5°C" in text
    assert "Дождь ожидается примерно с 10:00" not in text  # rain from 9, leave at 8: already wet

    late = summary(
        d,
        precip_mm=lambda h: 1.0 if h >= 15 else 0.0,
        condition=lambda h: "rain" if h >= 15 else "cloudy",
        precip_prob=70.0,
    )
    assert "Дождь ожидается примерно с 15:00" in M.describe(late, time(8, 0))

    frost = summary(d, temp=-6.0, feels=-11.0, condition="clear", precip_prob=0.0)
    assert "тёплая куртка, шапка, шарф и перчатки" in M.advice(frost)
    assert "−6°C" in M.describe(frost, time(8, 0))

    heat = summary(d, temp=lambda h: 22.0 + max(0, 12 - abs(h - 15)), condition="clear", uv=7.0)
    tips = M.advice(heat)
    assert any("в тени" in t for t in tips) and any("очки" in t for t in tips)

    wind = summary(d, wind_kmh=40.0, gust_kmh=75.0)
    assert any("очень сильный ветер" in t for t in M.advice(wind))
    assert "ветер до 75 км/ч" in M.weather_line(wind)

    calm = summary(d, temp=18.0, condition="clear", precip_prob=0.0, uv=2.0)
    assert M.advice(calm) == ["погода спокойная, можно одеться как обычно"]


def test_one_wet_hour_is_not_a_rainy_day_and_snow_is_slippery() -> None:
    d = date(2026, 11, 10)
    shower = summary(
        d,
        condition=lambda h: "drizzle" if h == 14 else "cloudy",
        precip_mm=lambda h: 0.1 if h == 14 else 0.0,
        precip_prob=20.0,
    )
    assert shower.condition == "cloudy" and not shower.wet and shower.rain_from is None
    snow = summary(d, temp=-1.0, condition="snow", precip_mm=0.5, precip_prob=90.0)
    assert snow.condition == "snow"
    assert any("скользко" in t for t in M.advice(snow))
    storm = summary(d, condition=lambda h: "thunder" if h == 17 else "cloudy")
    assert storm.condition == "thunder" and any("гроза" in t for t in M.advice(storm))


async def test_weather_source_fallback_and_cache(
    fake_weather: Any, monkeypatch: pytest.MonkeyPatch
) -> None:
    d = date(2026, 11, 10)
    calls: list[str] = []

    async def broken(place: Place, fetch: Any) -> list[HourPoint]:
        calls.append("primary")
        raise weather.WeatherUnavailable("Daily API request limit exceeded")

    async def backup(place: Place, fetch: Any) -> list[HourPoint]:
        calls.append("backup")
        return hours(d, temp=7.0)

    monkeypatch.setattr(weather, "SOURCES", [("Open-Meteo", broken), ("MET Norway", backup)])
    w = await weather.day_weather(weather.WROCLAW, d, time(8, 0))
    assert w.source == "MET Norway" and w.leave_temp == 7.0
    await weather.day_weather(weather.WROCLAW, d, time(8, 0))
    assert calls == ["primary", "backup"]  # cached


def test_provider_parsers() -> None:
    import asyncio

    async def om(url: str, params: dict[str, Any], headers: dict[str, str]) -> Any:
        assert params["timezone"] == "Europe/Warsaw"
        times = [f"2026-11-10T{h:02d}:00" for h in range(24)]
        return {
            "hourly": {
                "time": times,
                "temperature_2m": [5.0] * 24,
                "apparent_temperature": [2.0] * 24,
                "precipitation_probability": [60] * 24,
                "precipitation": [0.5] * 24,
                "weather_code": [61] * 24,
                "wind_speed_10m": [12.0] * 24,
                "wind_gusts_10m": [30.0] * 24,
                "uv_index": [0.5] * 24,
            }
        }

    async def met(url: str, params: dict[str, Any], headers: dict[str, str]) -> Any:
        series = [
            {
                "time": f"2026-11-10T{h:02d}:00:00Z",
                "data": {
                    "instant": {
                        "details": {
                            "air_temperature": 4.0,
                            "apparent_air_temperature": 1.0,
                            "wind_speed": 5.0,
                        }
                    },
                    "next_1_hours": {
                        "summary": {"symbol_code": "lightsnow"},
                        "details": {"precipitation_amount": 0.4},
                    },
                },
            }
            for h in range(24)
        ]
        return {"properties": {"timeseries": series}}

    a = asyncio.run(weather.open_meteo(weather.WROCLAW, om))
    assert a[8].condition == "rain" and a[8].feels == 2.0 and a[8].at.hour == 8
    b = asyncio.run(weather.met_norway(weather.WROCLAW, met))
    assert b[0].condition == "snow" and b[0].wind_kmh == 18.0 and b[0].at.hour == 1  # UTC → Warsaw
    assert (
        weather.wmo_condition(95) == "thunder"
        and weather.met_condition("partlycloudy_day") == "cloudy"
    )


# ---------------------------------------------------------------- texts


def test_messages_vary_and_respect_tone_and_gender() -> None:
    w = summary(date(2026, 11, 10), temp=8.0, condition="rain", precip_mm=1.0, precip_prob=80.0)
    all_wishes = {M.render(x, "f", "") for theme in P.WISHES.values() for x in theme}
    for tone in P.TONES:
        for gender, name in (("f", "Мария"), ("m", "Юрий")):
            for i in range(14):
                day = date(2026, 11, 2) + timedelta(days=i)
                msg = M.compose(
                    M.CareProfile(key="u1", name=name, gender=gender, tone=tone), day, w
                )
                text = msg.title + msg.body
                assert name in msg.title
                assert "{" not in text and "|" not in text
                assert len(msg.body) < 1000 and len(msg.title) < 200
                if tone != "romantic":
                    assert not any(r.split("{")[0][:25] in text for r in P.ROMANTIC)
                    assert "любим" not in msg.title
                if gender == "m":
                    assert not re.search(r"\b(дорогая|любимая|родная|заслужила|думала)\b", text)
    # Same person and day → same text; a new wish every day for the length of the cycle.
    p = M.CareProfile(key="u1", name="Мария", tone="tender")
    assert M.compose(p, date(2026, 11, 10), w) == M.compose(p, date(2026, 11, 10), w)
    used = []
    for i in range(60):
        day = date(2027, 1, 4) + timedelta(days=i)
        if day.weekday() == 6:
            continue
        body = M.compose(p, day, w).body
        used.append(next(x for x in all_wishes if x in body))
    assert len(used) == len(set(used))
    # Two people do not get the same sequence.
    other = [
        M.compose(
            M.CareProfile(key="u2", name="Мария"), date(2027, 1, 4) + timedelta(days=i), w
        ).body
        for i in range(5)
    ]
    mine = [M.compose(p, date(2027, 1, 4) + timedelta(days=i), w).body for i in range(5)]
    assert other != mine


def test_message_structure_and_no_false_weather() -> None:
    w = summary(
        date(2026, 11, 10), temp=8.0, feels=5.0, condition="rain", precip_mm=2.0, precip_prob=80.0
    )
    msg = M.compose(M.CareProfile(key="u1", name="Мария", signature="Юра"), date(2026, 11, 10), w)
    assert msg.title.startswith(("Доброе утро", "С добрым утром", "Мария"))
    assert "🌧️ Погода: +8°C утром" in msg.body and "🧥 Совет: " in msg.body and "зонт" in msg.body
    assert msg.body.endswith("— Юра")
    no_tips = M.compose(
        M.CareProfile(key="u1", name="Мария", weather_tips=False), date(2026, 11, 10), w
    )
    assert "Совет" not in no_tips.body and "+8°C" in no_tips.body
    # Without a forecast: no temperatures, conditions or advice at all.
    blind = M.compose(M.CareProfile(key="u1", name="Мария"), date(2026, 11, 10), None)
    assert "°C" not in blind.body and "Совет" not in blind.body and "дожд" not in blind.body
    assert "Прогноз" in blind.body or "Погоду" in blind.body
    short = M.compose(M.CareProfile(key="u1", name="Мария", tone="short"), date(2026, 11, 10), w)
    assert len(short.body) < 200
    sunday = M.compose(M.CareProfile(key="u1", name="Мария"), date(2026, 11, 15), w)
    assert "воскрес" in sunday.title.lower()


# ---------------------------------------------------------------- API, worker, delivery


async def enable(actor: Actor, **kw: Any) -> dict[str, Any]:
    body = {
        "enabled": True,
        "recipient_name": None,
        "send_time": "06:00",
        "days": list(range(7)),
        "tone": "tender",
        **kw,
    }
    r = await actor.put("/api/v1/me/care", body)
    assert r.status_code == 200, r.text
    return r.json()  # type: ignore[no-any-return]


async def care_notifications() -> list[Notification]:
    async with get_sessionmaker()() as db:
        return list(
            (
                await db.scalars(
                    select(Notification)
                    .where(Notification.category == NotificationCategory.morning_care)
                    .order_by(Notification.created_at)
                )
            ).all()
        )


async def test_settings_defaults_and_isolation(couple: tuple[Actor, Actor]) -> None:
    alice, bob = couple
    r = (await alice.get("/api/v1/me/care")).json()
    assert r["enabled"] is False and r["configured"] is False
    assert (r["city"], r["timezone"], r["send_time"], r["days"]) == (
        "Вроцлав",
        "Europe/Warsaw",
        "06:00:00",
        list(range(7)),
    )
    assert (
        r["telegram"]["bot_started"] is False
        and r["telegram"]["bot_link"] == "https://t.me/family_os_test_bot"
    )
    out = await enable(
        alice,
        recipient_name="Мария",
        tone="romantic",
        signature="Юра",
        send_time="06:30",
        days=[0, 1, 2, 3, 4],
    )
    assert (
        out["recipient_name"] == "Мария" and out["send_time"] == "06:30:00" and out["next_send_at"]
    )
    # Bob sees only his own (still default) settings; there is no way to address Alice's.
    bob_view = (await bob.get("/api/v1/me/care")).json()
    assert (
        bob_view["enabled"] is False
        and bob_view["recipient_name"] is None
        and bob_view["signature"] is None
    )
    # Validation.
    bad = await alice.put("/api/v1/me/care", {"enabled": True, "timezone": "Mars/Base"})
    assert bad.status_code == 422
    bad = await alice.put("/api/v1/me/care", {"enabled": True, "days": [7]})
    assert bad.status_code == 422
    assert (await alice.client.get("/api/v1/me/care")).status_code == 401


async def test_city_is_looked_up(
    couple: tuple[Actor, Actor], monkeypatch: pytest.MonkeyPatch
) -> None:
    alice, _ = couple

    async def fake_geocode(query: str) -> Place | None:
        return Place("Варшава", 52.23, 21.01, "Europe/Warsaw") if "ars" in query.lower() else None

    from app.modules.care import router as care_router

    monkeypatch.setattr(care_router, "geocode", fake_geocode)
    out = await enable(alice, city="Warszawa")
    assert out["city"] == "Варшава"
    r = await alice.put("/api/v1/me/care", {"enabled": True, "city": "Нетакогогорода"})
    assert r.status_code == 422 and "Не нашли" in r.json()["error"]["message"]
    out = await enable(alice, city="Wrocław")
    assert out["city"] == "Вроцлав" and out["country"] == "Польша"


async def test_worker_sends_once_at_each_members_time(
    couple: tuple[Actor, Actor], fake_weather: Any
) -> None:
    alice, bob = couple
    day = date(2026, 11, 10)
    fake_weather["points"] = hours(
        day, temp=8.0, feels=5.0, condition="rain", precip_mm=1.0, precip_prob=80.0
    )
    await enable(alice, recipient_name="Мария", send_time="06:00")
    await enable(bob, send_time="07:30", tone="friendly")
    sm = get_sessionmaker()
    assert await run_job(sm, "care", utc(2026, 11, 10, 4, 50)) == 0  # 05:50
    assert await run_job(sm, "care", utc(2026, 11, 10, 5, 1)) == 1  # 06:01: Alice only
    assert await run_job(sm, "care", utc(2026, 11, 10, 5, 2)) == 0  # not twice
    assert await run_job(sm, "care", utc(2026, 11, 10, 6, 31)) == 1  # 07:31: Bob
    ns = await care_notifications()
    assert [str(n.user_id) for n in ns] == [alice.user_id, bob.user_id]
    assert "Мария" in ns[0].title and "+8°C" in ns[0].body and "зонт" in ns[0].body
    # Even if last_sent_on were lost, the dedupe key keeps it to one per local date.
    async with sm() as db:
        await db.execute(update(CareSettings).values(last_sent_on=None))
        await db.commit()
    await run_job(sm, "care", utc(2026, 11, 10, 5, 3))
    assert len(await care_notifications()) == 2
    # Turned off: nothing the next morning.
    await alice.put("/api/v1/me/care", {"enabled": False})
    await run_job(sm, "care", utc(2026, 11, 11, 5, 1))
    assert len(await care_notifications()) == 2


async def test_weather_down_waits_then_sends_without_weather(
    couple: tuple[Actor, Actor], fake_weather: Any
) -> None:
    alice, _ = couple
    await enable(alice)
    sm = get_sessionmaker()
    assert await run_job(sm, "care", utc(2026, 11, 10, 5, 1)) == 0  # retries for 20 minutes
    weather.clear_cache()
    assert await run_job(sm, "care", utc(2026, 11, 10, 5, 25)) == 1
    n = (await care_notifications())[0]
    assert "°C" not in n.body and "Совет" not in n.body


async def test_delivery_telegram_status_errors_and_quiet_hours(
    couple: tuple[Actor, Actor], fake_weather: Any
) -> None:
    alice, bob = couple
    fake_weather["points"] = hours(date.today(), temp=12.0)
    await enable(alice)
    # Quiet hours do not hold the chosen morning message back.
    s = (await alice.get("/api/v1/notifications/settings")).json()
    s.update(quiet_start="00:00", quiet_end="23:59", timezone="Europe/Warsaw")
    await alice.put("/api/v1/notifications/settings", s)
    r = await alice.post("/api/v1/me/care/test")
    assert r.status_code == 200 and r.json() == {
        "queued": True,
        "telegram_ready": False,
        "push_devices": 0,
    }
    sm = get_sessionmaker()
    sender = FakeSender()
    stats = await dispatch_due(sm, sender, "Europe/Warsaw")
    assert stats.skipped == 1 and sender.sent == []  # no bot: not sent, explained in the app
    await start_bot(alice)
    await alice.post("/api/v1/me/care/test")
    flaky = FakeSender([TelegramTemporaryError("timeout")])
    await dispatch_due(sm, flaky, "Europe/Warsaw")
    ns = await care_notifications()
    assert ns[-1].status == NotificationStatus.pending  # retried later, not lost
    async with sm() as db:
        await db.execute(update(Notification).values(scheduled_for=datetime.now(UTC)))
        await db.commit()
    await dispatch_due(sm, flaky, "Europe/Warsaw")
    assert len(flaky.sent) == 1
    async with sm() as db:
        alice_tg = (await db.get(User, uuid.UUID(alice.user_id))).telegram_id  # type: ignore[union-attr]
    assert flaky.sent[0][0] == alice_tg
    # Bob never receives Alice's messages.
    async with sm() as db:
        assert not (
            await db.scalars(
                select(Notification).where(Notification.user_id == uuid.UUID(bob.user_id))
            )
        ).all()
    # Preview works and the test button is rate limited.
    p = (await alice.get("/api/v1/me/care/preview")).json()
    assert p["weather"]["leave_temp"] == "+12°C" and p["title"]
    for _ in range(3):
        await alice.post("/api/v1/me/care/test")
    assert (await alice.post("/api/v1/me/care/test")).status_code == 429


def test_after_leaving_time_it_says_now() -> None:
    d = date(2026, 11, 10)
    afternoon = [p for p in hours(d, temp=lambda h: float(h)) if p.at.hour >= 14]
    w = weather.summarize(afternoon, d, time(8, 0), "Вроцлав", "test")
    assert w.leave_hour == 14
    assert "Сейчас +14°C" in M.describe(w, time(8, 0)) and "Утром" not in M.describe(w, time(8, 0))
    assert M.weather_line(w, time(8, 0)).startswith("⛅ Погода: +14°C сейчас")
    morning = summary(d, temp=lambda h: float(h))
    assert "Утром, когда будешь выходить, +8°C" in M.describe(morning, time(8, 0))
