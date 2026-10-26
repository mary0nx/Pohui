"""The morning message: greeting, today's real weather, practical advice and a wish.

Every weather statement is built from the forecast numbers; without a forecast the message
says so and makes no weather claims. Phrases are picked deterministically per person and
local date (a repeated run gives the same text), and the wishes go round a per-person shuffled
cycle, so the same wish does not come back for months.
"""

from __future__ import annotations

import random
import re
from dataclasses import dataclass
from datetime import date, time

from app.modules.care import phrases as P
from app.modules.care.weather import DayWeather

COND_TEXT = {
    "thunder": "возможна гроза",
    "snow": "ожидается снег",
    "rain": "дождливо",
    "drizzle": "временами моросит",
    "fog": "туманно",
    "overcast": "пасмурно",
    "cloudy": "переменная облачность",
    "clear": "ясно",
}
COND_SHORT = {
    "thunder": "гроза",
    "snow": "снег",
    "rain": "дождь",
    "drizzle": "морось",
    "fog": "туман",
    "overcast": "пасмурно",
    "cloudy": "переменная облачность",
    "clear": "ясно",
}
EMOJI = {
    "thunder": "⛈️",
    "snow": "🌨️",
    "rain": "🌧️",
    "drizzle": "🌦️",
    "fog": "🌫️",
    "overcast": "☁️",
    "cloudy": "⛅",
    "clear": "☀️",
}
GENDERED = re.compile(r"\{([^{}|]*)\|([^{}|]*)\}")


@dataclass(frozen=True)
class CareProfile:
    key: str  # stable per person (user id): seeds the choice of phrases
    name: str
    gender: str = "f"  # "f" | "m": grammatical forms of the phrases
    tone: str = "tender"
    weather_tips: bool = True
    signature: str | None = None
    leave: time = time(8, 0)


@dataclass(frozen=True)
class CareMessage:
    title: str
    body: str
    weather: DayWeather | None


def deg(value: float) -> str:
    v = round(value)
    if v == 0:
        return "0°C"
    return f"+{v}°C" if v > 0 else f"−{abs(v)}°C"


def render(text: str, gender: str, name: str) -> str:
    text = GENDERED.sub(lambda m: m.group(1) if gender != "m" else m.group(2), text)
    return text.replace("{name}", name)


def roughness(w: DayWeather) -> str | None:
    """Weather that deserves an extra word of care: "wet", "cold" (cold or windy) or None."""
    if w.wet or w.condition in ("snow", "thunder"):
        return "wet"
    if w.leave_feels <= 3 or (w.gust_max_kmh or 0) >= 50 or w.wind_max_kmh >= 35:
        return "cold"
    return None


def describe(w: DayWeather, leave: time) -> str:
    cond = COND_TEXT[w.condition]
    if w.condition == "rain" and w.precip_mm < 1.0:
        cond = "местами небольшой дождь"
    if w.condition == "clear" and w.temp_max >= 12:
        cond = "солнечно"
    lo, hi = deg(w.temp_min), deg(w.temp_max)
    text = f"Сегодня в городе {w.place} {cond}, днём {('около ' + hi) if lo == hi else f'от {lo} до {hi}'}."
    if w.place == "Вроцлав":
        text = text.replace("в городе Вроцлав", "во Вроцлаве")
    late = w.leave_hour > leave.hour + 1  # leaving time has passed (a test or preview later on)
    start = w.leave_hour if late else leave.hour
    if (
        w.rain_from is not None
        and w.rain_from >= start + 2
        and w.condition in ("rain", "drizzle", "snow", "thunder")
    ):
        what = {"snow": "Снег", "thunder": "Гроза"}.get(w.condition, "Дождь")
        text += f" {what} ожидается примерно с {w.rain_from}:00."
    elif (
        w.precip_prob_max is not None
        and w.precip_prob_max >= 30
        and w.condition not in ("rain", "drizzle", "snow", "thunder")
    ):
        text += f" Вероятность осадков — до {round(w.precip_prob_max)}%."
    text += (
        f" Сейчас {deg(w.leave_temp)}"
        if late
        else f" Утром, когда будешь выходить, {deg(w.leave_temp)}"
    )
    if abs(w.leave_feels - w.leave_temp) >= 2:
        text += f", ощущается как {deg(w.leave_feels)}"
    return text + "."


def advice(w: DayWeather) -> list[str]:
    tips: list[str] = []
    if w.condition == "thunder":
        tips.append("возможна гроза — её лучше переждать в помещении")
    if w.wet and w.condition != "snow":
        tips.append("возьми зонт")
    elif w.maybe_wet:
        tips.append("зонт лучше положить в сумку — дождь не исключён")
    if w.condition == "snow" or (w.wet and w.temp_min <= 0):
        tips.append("обувь с нескользкой подошвой — может быть скользко")
    feels = w.leave_feels
    if feels <= -5:
        tips.append("тёплая куртка, шапка, шарф и перчатки")
    elif feels <= 3:
        tips.append("тёплая куртка и шапка")
    elif feels <= 9:
        tips.append("тёплая куртка")
    elif feels <= 15:
        tips.append("лёгкая куртка или свитер")
    if w.temp_max >= 32:
        tips.append("в полдень лучше держаться в тени, лёгкая одежда и вода обязательно")
    elif w.temp_max >= 27:
        tips.append("лёгкая одежда и бутылка воды")
    if w.temp_max - w.temp_min >= 10:
        tips.append("днём заметно теплее, чем утром, — удобно одеться слоями")
    gust = w.gust_max_kmh or 0
    if gust >= 70 or w.wind_max_kmh >= 50:
        tips.append("очень сильный ветер — осторожнее у деревьев и строительных лесов")
    elif gust >= 50 or w.wind_max_kmh >= 35:
        tips.append("ветрено — капюшон или шарф пригодятся")
    if w.condition == "fog":
        tips.append("на дорогах туман — внимательнее за рулём и на переходах")
    if (w.uv_max or 0) >= 6 and not w.wet:
        tips.append("солнце сильное — пригодятся очки и крем от солнца")
    if not tips:
        tips.append("погода спокойная, можно одеться как обычно")
    return tips


def weather_line(w: DayWeather, leave: time | None = None) -> str:
    late = leave is not None and w.leave_hour > leave.hour + 1
    parts = [f"{deg(w.leave_temp)} {'сейчас' if late else 'утром'}"]
    if round(w.temp_max) != round(w.leave_temp):
        parts.append(f"днём до {deg(w.temp_max)}")
    cond = COND_SHORT[w.condition]
    if w.condition == "rain" and w.precip_mm < 1.0:
        cond = "небольшой дождь"
    parts.append(cond)
    if w.precip_prob_max is not None and w.precip_prob_max >= 30:
        parts.append(f"осадки до {round(w.precip_prob_max)}%")
    if (w.gust_max_kmh or 0) >= 40 or w.wind_max_kmh >= 30:
        top = max(w.gust_max_kmh or 0, w.wind_max_kmh)
        parts.append(f"ветер до {round(top)} км/ч")
    return f"{EMOJI[w.condition]} Погода: {', '.join(parts)}."


def tips_line(w: DayWeather) -> str:
    text = "; ".join(advice(w))
    return f"🧥 Совет: {text[0].upper()}{text[1:]}."


def _cycle(items: list[str], key: str, day: date) -> str:
    """Per-person shuffled order, one step per day: no repeat within len(items) days."""
    order = list(items)
    random.Random(f"{key}|{day.year}|{len(items)}").shuffle(order)  # noqa: S311 - not security
    return order[day.timetuple().tm_yday % len(order)]


def compose(profile: CareProfile, day: date, weather: DayWeather | None) -> CareMessage:
    rnd = random.Random(f"{profile.key}|{day.isoformat()}")  # noqa: S311 - not security
    tone = profile.tone if profile.tone in P.TONES else "tender"
    sunday = day.weekday() == 6
    greetings = (P.SUNDAY_GREETINGS if sunday else P.GREETINGS)[tone]
    title = render(rnd.choice(greetings), profile.gender, profile.name)
    rough = roughness(weather) if weather is not None else None
    wishes = [w for theme in P.WISHES.values() for w in theme]

    if tone == "short":
        lines = []
        if weather is not None:
            line = weather_line(weather, profile.leave).replace(" Погода:", "")
            lines.append(line)
            if profile.weather_tips:
                lines.append(tips_line(weather))
        lines.append(_cycle(P.SHORT_WISHES, profile.key, day))
        body = "\n".join(lines)
    else:
        paragraphs = [
            describe(weather, profile.leave) if weather is not None else rnd.choice(P.NO_WEATHER)
        ]
        wish = rnd.choice(P.SUNDAY) if sunday else _cycle(wishes, profile.key, day)
        extra: list[str] = []
        if tone == "romantic":
            extra.append(_cycle(P.ROMANTIC, profile.key, day))
            if rough:
                extra.append(rnd.choice(P.WET_CARE if rough == "wet" else P.COLD_CARE))
        elif tone == "friendly":
            closer = {"wet": P.FRIENDLY_WET, "cold": P.FRIENDLY_COLD}.get(
                rough or "", P.FRIENDLY_CLOSERS
            )
            extra.append(rnd.choice(closer))
        else:
            care = {"wet": P.WET_CARE, "cold": P.COLD_CARE}.get(rough or "", P.CARE)
            extra.append(rnd.choice(care))
        paragraphs.append(" ".join([wish, *extra]))
        if weather is not None and profile.weather_tips:
            paragraphs.append(f"{weather_line(weather, profile.leave)}\n{tips_line(weather)}")
        body = "\n\n".join(paragraphs)
    body = render(body, profile.gender, profile.name)
    if profile.signature:
        body += f"\n\n— {profile.signature}"
    return CareMessage(title=title, body=body, weather=weather)
