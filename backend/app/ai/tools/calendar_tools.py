"""AI tools for calendar and reminders."""

from __future__ import annotations

import uuid
from datetime import UTC, datetime, timedelta
from typing import Any
from zoneinfo import ZoneInfo

from pydantic import Field

from app.ai.tools.common import ToolError, parse_date, parse_local_datetime
from app.ai.tools.registry import Prepared, Tool, ToolArgs, ToolContext, register
from app.core.time import local_range_bounds, local_today
from app.models import CalendarEvent
from app.modules.calendar import service
from app.modules.calendar.schemas import EventCreate, EventPatch
from app.security.access import get_visible


class EventsArgs(ToolArgs):
    date_from: str | None = Field(None, description="ГГГГ-ММ-ДД, по умолчанию сегодня")
    date_to: str | None = Field(None, description="ГГГГ-ММ-ДД, по умолчанию +7 дней")


async def get_events(tc: ToolContext, a: EventsArgs) -> dict[str, Any]:
    zone = tc.ctx.family.timezone
    start_day = parse_date(a.date_from) if a.date_from else local_today(zone)
    end_day = parse_date(a.date_to) if a.date_to else start_day + timedelta(days=7)
    if end_day < start_day or (end_day - start_day).days > 92:
        raise ToolError("Период до 92 дней")
    start, end = local_range_bounds(start_day, end_day + timedelta(days=1), zone)
    occ = await service.list_occurrences(tc.db, tc.ctx, start, end)
    z = ZoneInfo(zone)
    return {
        "events": [
            {
                "event_id": str(o.event_id),
                "title": o.title,
                "start": o.start.astimezone(z).isoformat(timespec="minutes"),
                "end": o.end.astimezone(z).isoformat(timespec="minutes"),
                "all_day": o.all_day,
                "location": o.location,
                "recurring": o.recurring,
                "private": o.visibility == "private",
            }
            for o in occ[:100]
        ]
    }


register(
    Tool(
        "get_calendar_events",
        "События календаря за период (по умолчанию ближайшая неделя).",
        EventsArgs,
        "read",
        get_events,
    )
)


class CreateEventArgs(ToolArgs):
    title: str = Field(min_length=1, max_length=200)
    start: str = Field(
        description="Начало ГГГГ-ММ-ДДTЧЧ:ММ по местному времени семьи (или дата для события на весь день)"
    )
    end: str | None = Field(None, description="Окончание ГГГГ-ММ-ДДTЧЧ:ММ; по умолчанию +1 час")
    all_day: bool = False
    location: str | None = Field(None, max_length=300)
    description: str | None = Field(None, max_length=2000)
    reminder_minutes: int | None = Field(None, ge=0, le=43200, description="Напомнить за N минут")
    private: bool = False
    repeat: str | None = Field(None, pattern="^(daily|weekly|monthly|yearly)$")


async def prepare_event(tc: ToolContext, a: CreateEventArgs) -> Prepared:
    zone = tc.ctx.family.timezone
    start = parse_local_datetime(a.start, zone)
    end = parse_local_datetime(a.end, zone) if a.end else None
    if end and end < start:
        raise ToolError("Окончание раньше начала")
    local = start.astimezone(ZoneInfo(zone))
    when = f"{local:%d.%m.%Y}" if a.all_day else f"{local:%d.%m.%Y %H:%M}"
    details = [f"Когда: {when}"]
    if a.location:
        details.append(f"Где: {a.location}")
    if a.reminder_minutes is not None:
        details.append(f"Напоминание за {a.reminder_minutes} мин")
    if a.repeat:
        details.append(f"Повтор: {a.repeat}")
    details.append("Видимость: личное" if a.private else "Видимость: для всей семьи")
    return Prepared(
        arguments={
            "title": a.title,
            "starts_at": start.isoformat(),
            "ends_at": end.isoformat() if end else None,
            "all_day": a.all_day,
            "location": a.location,
            "description": a.description,
            "reminder_minutes": [a.reminder_minutes] if a.reminder_minutes is not None else [],
            "visibility": "private" if a.private else "family",
            "recurrence_freq": a.repeat,
        },
        summary=f"Событие «{a.title}»",
        details=details,
    )


async def execute_event(tc: ToolContext, args: dict[str, Any]) -> dict[str, Any]:
    event = await service.create_event(tc.db, tc.ctx, EventCreate.model_validate(args))
    return {"created_event_id": str(event.id), "starts_at": event.starts_at.isoformat()}


register(
    Tool(
        "create_calendar_event",
        "Создать событие в календаре.",
        CreateEventArgs,
        "auto",
        execute_event,
        prepare=prepare_event,
    )
)


class UpdateEventArgs(ToolArgs):
    event_id: uuid.UUID
    title: str | None = Field(None, max_length=200)
    start: str | None = Field(None, description="ГГГГ-ММ-ДДTЧЧ:ММ")
    end: str | None = None
    location: str | None = Field(None, max_length=300)
    cancel: bool = Field(False, description="true — отменить событие")


async def _event_version(tc: ToolContext, args: dict[str, Any]) -> str | None:
    ev = await get_visible(tc.db, CalendarEvent, uuid.UUID(args["event_id"]), tc.ctx)
    return ev.updated_at.isoformat()


async def prepare_update_event(tc: ToolContext, a: UpdateEventArgs) -> Prepared:
    ev = await get_visible(tc.db, CalendarEvent, a.event_id, tc.ctx)
    zone = tc.ctx.family.timezone
    start = parse_local_datetime(a.start, zone) if a.start else None
    end = parse_local_datetime(a.end, zone) if a.end else None
    details = [f"Событие: {ev.title}"]
    if a.cancel:
        details.append("Действие: отменить")
    if a.title:
        details.append(f"Новое название: {a.title}")
    if start:
        details.append(f"Новое начало: {start.astimezone(ZoneInfo(zone)):%d.%m.%Y %H:%M}")
    if a.location:
        details.append(f"Новое место: {a.location}")
    return Prepared(
        arguments={
            "event_id": str(ev.id),
            "title": a.title,
            "starts_at": start.isoformat() if start else None,
            "ends_at": end.isoformat() if end else None,
            "location": a.location,
            "status": "cancelled" if a.cancel else None,
        },
        summary=("Отменить" if a.cancel else "Изменить") + f" событие «{ev.title}»",
        details=details,
        target_version=ev.updated_at.isoformat(),
    )


async def execute_update_event(tc: ToolContext, args: dict[str, Any]) -> dict[str, Any]:
    patch = EventPatch.model_validate(
        {k: v for k, v in args.items() if k != "event_id" and v is not None}
    )
    ev = await service.update_event(tc.db, tc.ctx, uuid.UUID(args["event_id"]), patch)
    return {"updated_event_id": str(ev.id)}


register(
    Tool(
        "update_calendar_event",
        "Изменить или отменить событие (нужен event_id).",
        UpdateEventArgs,
        "confirm",
        execute_update_event,
        prepare=prepare_update_event,
        current_version=_event_version,
    )
)


class ReminderArgs(ToolArgs):
    title: str = Field(min_length=1, max_length=200)
    remind_at: str = Field(description="ГГГГ-ММ-ДДTЧЧ:ММ по местному времени")


async def prepare_reminder(tc: ToolContext, a: ReminderArgs) -> Prepared:
    zone = tc.ctx.family.timezone
    at = parse_local_datetime(a.remind_at, zone)
    if at < datetime.now(UTC) - timedelta(minutes=1):
        raise ToolError("Это время уже прошло")
    return Prepared(
        arguments={"title": a.title, "remind_at": at.isoformat()},
        summary=f"Напоминание «{a.title}»",
        details=[f"Когда: {at.astimezone(ZoneInfo(zone)):%d.%m.%Y %H:%M}", "Получатель: только вы"],
    )


async def execute_reminder(tc: ToolContext, args: dict[str, Any]) -> dict[str, Any]:
    rem = await service.create_custom_reminder(
        tc.db, tc.ctx, args["title"], datetime.fromisoformat(args["remind_at"])
    )
    return {"created_reminder_id": str(rem.id)}


register(
    Tool(
        "create_reminder",
        "Создать личное напоминание в Telegram на указанное время.",
        ReminderArgs,
        "auto",
        execute_reminder,
        prepare=prepare_reminder,
    )
)
