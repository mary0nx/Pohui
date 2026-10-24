from __future__ import annotations

import uuid
from datetime import date, timedelta

from fastapi import APIRouter

from app.api.deps import DB, Ctx
from app.core.time import local_range_bounds, local_today
from app.modules.calendar import service
from app.modules.calendar.schemas import (
    CustomReminderIn,
    CustomReminderOut,
    EventCreate,
    EventOut,
    EventPatch,
    OccurrenceCancel,
    OccurrenceOut,
    RemindersIn,
    RsvpIn,
)
from app.security.access import get_visible
from app.models import CalendarEvent

router = APIRouter(prefix="/families/{family_id}/calendar", tags=["calendar"])


@router.get("/occurrences", response_model=list[OccurrenceOut])
async def occurrences(
    ctx: Ctx, db: DB, date_from: date | None = None, date_to: date | None = None, include_cancelled: bool = False
) -> list[OccurrenceOut]:
    today = local_today(ctx.family.timezone)
    start_day = date_from or today
    end_day = date_to or (start_day + timedelta(days=30))
    start, end = local_range_bounds(start_day, end_day + timedelta(days=1), ctx.family.timezone)
    return await service.list_occurrences(db, ctx, start, end, include_cancelled)


@router.post("/events", response_model=EventOut, status_code=201)
async def create_event(body: EventCreate, ctx: Ctx, db: DB) -> EventOut:
    event = await service.create_event(db, ctx, body)
    await db.commit()
    return await service.event_out(db, ctx, event)


@router.get("/events/{event_id}", response_model=EventOut)
async def get_event(event_id: uuid.UUID, ctx: Ctx, db: DB) -> EventOut:
    return await service.event_out(db, ctx, await get_visible(db, CalendarEvent, event_id, ctx))


@router.patch("/events/{event_id}", response_model=EventOut)
async def patch_event(event_id: uuid.UUID, body: EventPatch, ctx: Ctx, db: DB) -> EventOut:
    event = await service.update_event(db, ctx, event_id, body)
    await db.commit()
    return await service.event_out(db, ctx, event)


@router.delete("/events/{event_id}", status_code=204)
async def delete_event(event_id: uuid.UUID, ctx: Ctx, db: DB) -> None:
    await service.delete_event(db, ctx, event_id)
    await db.commit()


@router.post("/events/{event_id}/cancel-occurrence", status_code=204)
async def cancel_occurrence(event_id: uuid.UUID, body: OccurrenceCancel, ctx: Ctx, db: DB) -> None:
    await service.cancel_occurrence(db, ctx, event_id, body.occurrence_start)
    await db.commit()


@router.post("/events/{event_id}/rsvp", response_model=EventOut)
async def rsvp(event_id: uuid.UUID, body: RsvpIn, ctx: Ctx, db: DB) -> EventOut:
    event = await service.set_rsvp(db, ctx, event_id, body.rsvp)
    await db.commit()
    return await service.event_out(db, ctx, event)


@router.put("/events/{event_id}/reminders", response_model=EventOut)
async def set_reminders(event_id: uuid.UUID, body: RemindersIn, ctx: Ctx, db: DB) -> EventOut:
    event = await service.set_my_reminders(db, ctx, event_id, body.minutes, body.all_members)
    await db.commit()
    return await service.event_out(db, ctx, event)


@router.get("/reminders", response_model=list[CustomReminderOut])
async def list_reminders(ctx: Ctx, db: DB) -> list[CustomReminderOut]:
    return [CustomReminderOut.model_validate(r) for r in await service.list_custom_reminders(db, ctx)]


@router.post("/reminders", response_model=CustomReminderOut, status_code=201)
async def create_reminder(body: CustomReminderIn, ctx: Ctx, db: DB) -> CustomReminderOut:
    rem = await service.create_custom_reminder(db, ctx, body.title, body.remind_at)
    await db.commit()
    return CustomReminderOut.model_validate(rem)


@router.delete("/reminders/{reminder_id}", status_code=204)
async def delete_reminder(reminder_id: uuid.UUID, ctx: Ctx, db: DB) -> None:
    await service.delete_custom_reminder(db, ctx, reminder_id)
    await db.commit()
