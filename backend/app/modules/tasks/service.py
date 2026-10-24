from __future__ import annotations

import uuid
from datetime import datetime, timedelta
from zoneinfo import ZoneInfo

from sqlalchemy import and_, delete, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.audit import audit
from app.core.errors import ValidationFailed
from app.core.time import step_local, utcnow
from app.models import AuditLog, FamilyMember, Reminder, Task, TaskComment, User
from app.models.enums import NotificationCategory, ReminderTarget, TaskStatus, Visibility
from app.modules.calendar.service import cancel_pending_reminders
from app.modules.notifications.service import notify_family
from app.modules.shopping.schemas import HistoryOut
from app.modules.tasks.schemas import CommentCreate, TaskCreate, TaskOut, TaskPatch, TaskStats
from app.security.access import FamilyContext, ensure_can_delete, get_visible, visible

OPEN = (TaskStatus.todo, TaskStatus.in_progress)


async def _check_assignee(
    db: AsyncSession, ctx: FamilyContext, assignee_id: uuid.UUID | None, visibility: Visibility
) -> None:
    if assignee_id is None:
        return
    if visibility == Visibility.private and assignee_id != ctx.user_id:
        raise ValidationFailed("Личную задачу можно назначить только себе")
    member = await db.scalar(
        select(FamilyMember.id).where(
            FamilyMember.family_id == ctx.family_id, FamilyMember.user_id == assignee_id
        )
    )
    if member is None:
        raise ValidationFailed("Исполнитель должен быть участником семьи")


async def _set_reminder(
    db: AsyncSession, ctx: FamilyContext, task: Task, minutes: int | None
) -> None:
    await cancel_pending_reminders(db, task.id)
    await db.execute(
        delete(Reminder).where(
            Reminder.target_type == ReminderTarget.task, Reminder.target_id == task.id
        )
    )
    if minutes is not None:
        db.add(
            Reminder(
                family_id=ctx.family_id,
                target_type=ReminderTarget.task,
                target_id=task.id,
                offset_minutes=minutes,
                for_all_members=False,
                created_by=ctx.user_id,
            )
        )


async def _notify_assignee(db: AsyncSession, ctx: FamilyContext, task: Task) -> None:
    if task.assignee_id and task.assignee_id != ctx.user_id:
        await notify_family(
            db,
            ctx,
            category=NotificationCategory.task_assigned,
            title=f"Новая задача: {task.title}",
            body=f"{ctx.user.first_name} назначил(а) вам задачу",
            dedupe_base=f"task-assigned:{task.id}:{task.assignee_id}",
            link=f"/home/tasks/{task.id}",
            obj=task,
            recipients=[task.assignee_id],
        )
    elif task.assignee_id is None and task.visibility == Visibility.family:
        await notify_family(
            db,
            ctx,
            category=NotificationCategory.task_assigned,
            title=f"Новая общая задача: {task.title}",
            body=f"Добавил(а) {ctx.user.first_name}",
            dedupe_base=f"task-new:{task.id}",
            link=f"/home/tasks/{task.id}",
            obj=task,
        )


async def create_task(
    db: AsyncSession, ctx: FamilyContext, data: TaskCreate, *, notify: bool = True
) -> Task:
    await _check_assignee(db, ctx, data.assignee_id, data.visibility)
    if data.recurrence_freq and data.due_at is None:
        raise ValidationFailed("Для повторяющейся задачи укажите срок")
    task = Task(
        family_id=ctx.family_id,
        title=data.title,
        description=data.description,
        assignee_id=data.assignee_id,
        due_at=data.due_at,
        priority=data.priority,
        category=data.category,
        points=data.points,
        recurrence_freq=data.recurrence_freq,
        recurrence_interval=data.recurrence_interval,
        visibility=data.visibility,
        created_by=ctx.user_id,
    )
    db.add(task)
    await db.flush()
    if data.reminder_minutes is not None and data.due_at is not None:
        await _set_reminder(db, ctx, task, data.reminder_minutes)
    audit(db, ctx, "task.create", "task", task.id, task.title, obj=task)
    if notify:
        await _notify_assignee(db, ctx, task)
    return task


async def _spawn_next(db: AsyncSession, ctx: FamilyContext, task: Task) -> Task | None:
    if task.recurrence_freq is None or task.due_at is None or task.next_task_id is not None:
        return None
    local = task.due_at.astimezone(ZoneInfo(ctx.family.timezone))
    nxt_due = step_local(local, task.recurrence_freq, task.recurrence_interval, 1)
    now_local = utcnow().astimezone(ZoneInfo(ctx.family.timezone))
    n = 1
    while nxt_due < now_local and n < 1000:  # skip periods missed while the task was overdue
        n += 1
        nxt_due = step_local(local, task.recurrence_freq, task.recurrence_interval, n)
    nxt = Task(
        family_id=task.family_id,
        title=task.title,
        description=task.description,
        assignee_id=task.assignee_id,
        due_at=nxt_due,
        priority=task.priority,
        category=task.category,
        points=task.points,
        recurrence_freq=task.recurrence_freq,
        recurrence_interval=task.recurrence_interval,
        visibility=task.visibility,
        created_by=task.created_by,
    )
    db.add(nxt)
    await db.flush()
    task.next_task_id = nxt.id
    old_rem = await db.scalar(
        select(Reminder).where(
            Reminder.target_type == ReminderTarget.task, Reminder.target_id == task.id
        )
    )
    if old_rem is not None:
        db.add(
            Reminder(
                family_id=task.family_id,
                target_type=ReminderTarget.task,
                target_id=nxt.id,
                offset_minutes=old_rem.offset_minutes,
                created_by=old_rem.created_by,
            )
        )
    return nxt


async def update_task(
    db: AsyncSession, ctx: FamilyContext, task_id: uuid.UUID, data: TaskPatch
) -> Task:
    task = await get_visible(db, Task, task_id, ctx, lock=True)
    previous_assignee = task.assignee_id
    if data.unassign:
        task.assignee_id = None
    elif data.assignee_id is not None:
        await _check_assignee(db, ctx, data.assignee_id, task.visibility)
        task.assignee_id = data.assignee_id
    if data.clear_due:
        task.due_at = None
    elif data.due_at is not None:
        task.due_at = data.due_at
    if data.clear_recurrence:
        task.recurrence_freq = None
    elif data.recurrence_freq is not None:
        task.recurrence_freq = data.recurrence_freq
    for field in ("title", "description", "priority", "category", "points", "recurrence_interval"):
        value = getattr(data, field)
        if value is not None:
            setattr(task, field, value)
    if data.due_at is not None or data.clear_due:
        await cancel_pending_reminders(db, task.id)
    if data.status is not None and data.status != task.status:
        await set_status(db, ctx, task, data.status)
    else:
        audit(db, ctx, "task.update", "task", task.id, task.title, obj=task)
    task.updated_at = utcnow()
    if task.assignee_id != previous_assignee:
        await _notify_assignee(db, ctx, task)
    await db.flush()
    return task


async def set_status(
    db: AsyncSession, ctx: FamilyContext, task: Task, status: TaskStatus
) -> Task | None:
    """Returns the spawned next occurrence for recurring tasks, if any."""
    task.status = status
    nxt = None
    if status == TaskStatus.done:
        task.completed_at, task.completed_by = utcnow(), ctx.user_id
        nxt = await _spawn_next(db, ctx, task)
        audit(db, ctx, "task.done", "task", task.id, task.title, obj=task)
    else:
        task.completed_at, task.completed_by = None, None
        audit(db, ctx, f"task.{status.value}", "task", task.id, task.title, obj=task)
    await cancel_pending_reminders(db, task.id)
    return nxt


async def complete_task(
    db: AsyncSession, ctx: FamilyContext, task_id: uuid.UUID
) -> tuple[Task, Task | None]:
    task = await get_visible(db, Task, task_id, ctx, lock=True)
    if task.status == TaskStatus.done:
        return task, None  # idempotent
    nxt = await set_status(db, ctx, task, TaskStatus.done)
    await db.flush()
    return task, nxt


async def delete_task(db: AsyncSession, ctx: FamilyContext, task_id: uuid.UUID) -> None:
    task = await get_visible(db, Task, task_id, ctx)
    ensure_can_delete(task, ctx)
    await cancel_pending_reminders(db, task.id)
    await db.execute(
        delete(Reminder).where(
            Reminder.target_type == ReminderTarget.task, Reminder.target_id == task.id
        )
    )
    audit(db, ctx, "task.delete", "task", task.id, task.title, obj=task)
    await db.delete(task)


def _to_out(task: Task, now: datetime, comments: int = 0) -> TaskOut:
    out = TaskOut.model_validate(task)
    out.overdue = task.status in OPEN and task.due_at is not None and task.due_at < now
    out.comments_count = comments
    return out


async def list_tasks(
    db: AsyncSession,
    ctx: FamilyContext,
    *,
    status: str = "open",
    assignee: str | None = None,
    due: str | None = None,
    q: str | None = None,
    limit: int = 100,
    offset: int = 0,
) -> list[TaskOut]:
    now = utcnow()
    stmt = select(Task).where(visible(Task, ctx))
    if status == "open":
        stmt = stmt.where(Task.status.in_(OPEN))
    elif status == "done":
        stmt = stmt.where(Task.status == TaskStatus.done)
    if assignee == "me":
        stmt = stmt.where(Task.assignee_id == ctx.user_id)
    elif assignee == "unassigned":
        stmt = stmt.where(Task.assignee_id.is_(None))
    elif assignee:
        try:
            stmt = stmt.where(Task.assignee_id == uuid.UUID(assignee))
        except ValueError as exc:
            raise ValidationFailed("Некорректный исполнитель") from exc
    if due == "overdue":
        stmt = stmt.where(Task.due_at < now)
    elif due == "today":
        zone = ZoneInfo(ctx.family.timezone)
        end_of_day = datetime.combine(
            now.astimezone(zone).date() + timedelta(days=1), datetime.min.time(), tzinfo=zone
        )
        stmt = stmt.where(Task.due_at < end_of_day)
    elif due == "week":
        stmt = stmt.where(Task.due_at < now + timedelta(days=7))
    if q:
        stmt = stmt.where(Task.title.ilike(f"%{q.replace('%', '')}%"))
    if status == "done":
        stmt = stmt.order_by(Task.completed_at.desc())
    else:
        stmt = stmt.order_by(Task.due_at.asc().nulls_last(), Task.priority.desc(), Task.created_at)
    tasks = (await db.execute(stmt.limit(limit).offset(offset))).scalars().all()
    counts = (
        dict(
            (
                await db.execute(
                    select(TaskComment.task_id, func.count())
                    .where(TaskComment.task_id.in_([t.id for t in tasks]))
                    .group_by(TaskComment.task_id)
                )
            ).all()
        )
        if tasks
        else {}
    )
    return [_to_out(t, now, counts.get(t.id, 0)) for t in tasks]


async def task_out(db: AsyncSession, task: Task) -> TaskOut:
    count = await db.scalar(
        select(func.count()).select_from(TaskComment).where(TaskComment.task_id == task.id)
    )
    return _to_out(task, utcnow(), count or 0)


async def add_comment(
    db: AsyncSession, ctx: FamilyContext, task_id: uuid.UUID, data: CommentCreate
) -> TaskComment:
    task = await get_visible(db, Task, task_id, ctx)
    comment = TaskComment(
        family_id=ctx.family_id, task_id=task.id, body=data.body.strip(), created_by=ctx.user_id
    )
    db.add(comment)
    await db.flush()
    audit(db, ctx, "task.comment", "task", task.id, task.title, obj=task)
    return comment


async def list_comments(
    db: AsyncSession, ctx: FamilyContext, task_id: uuid.UUID
) -> list[tuple[TaskComment, str | None]]:
    task = await get_visible(db, Task, task_id, ctx)
    return [
        (c, n)
        for c, n in (
            await db.execute(
                select(TaskComment, User.first_name)
                .outerjoin(User, User.id == TaskComment.created_by)
                .where(TaskComment.task_id == task.id)
                .order_by(TaskComment.created_at)
            )
        ).all()
    ]


async def task_history(
    db: AsyncSession, ctx: FamilyContext, task_id: uuid.UUID
) -> list[HistoryOut]:
    task = await get_visible(db, Task, task_id, ctx)
    rows = (
        await db.execute(
            select(AuditLog, User.first_name)
            .outerjoin(User, User.id == AuditLog.actor_id)
            .where(
                AuditLog.entity_type == "task",
                AuditLog.entity_id == task.id,
                AuditLog.family_id == ctx.family_id,
            )
            .order_by(AuditLog.created_at.desc())
            .limit(50)
        )
    ).all()
    return [
        HistoryOut(action=a.action, summary=a.summary, actor_name=n, created_at=a.created_at)
        for a, n in rows
    ]


async def stats(db: AsyncSession, ctx: FamilyContext) -> TaskStats:
    now = utcnow()
    zone = ZoneInfo(ctx.family.timezone)
    today = now.astimezone(zone).date()
    week_start = datetime.combine(
        today - timedelta(days=today.weekday()), datetime.min.time(), tzinfo=zone
    )
    month_start = datetime.combine(today.replace(day=1), datetime.min.time(), tzinfo=zone)
    family_only = and_(
        Task.family_id == ctx.family_id,
        or_(Task.visibility == Visibility.family, Task.created_by == ctx.user_id),
    )

    async def done_since(since: datetime) -> tuple[int, int]:
        row = (
            await db.execute(
                select(func.count(), func.coalesce(func.sum(Task.points), 0)).where(
                    family_only, Task.status == TaskStatus.done, Task.completed_at >= since
                )
            )
        ).one()
        return int(row[0] or 0), int(row[1] or 0)

    w = await done_since(week_start)
    m = await done_since(month_start)
    open_total = await db.scalar(
        select(func.count()).select_from(Task).where(family_only, Task.status.in_(OPEN))
    )
    overdue = await db.scalar(
        select(func.count())
        .select_from(Task)
        .where(family_only, Task.status.in_(OPEN), Task.due_at < now)
    )
    return TaskStats(
        done_this_week=w[0],
        points_this_week=w[1],
        done_this_month=m[0],
        points_this_month=m[1],
        open_total=open_total or 0,
        overdue_total=overdue or 0,
    )
