from __future__ import annotations

import uuid
from datetime import datetime

from pydantic import BaseModel, Field

from app.core.schemas import Currency, Name, ORMModel, TimeZoneName
from app.models.enums import Role


class FamilyCreate(BaseModel):
    name: Name
    currency: Currency = "PLN"
    timezone: TimeZoneName = "Europe/Warsaw"


class FamilyPatch(BaseModel):
    name: Name | None = None
    currency: Currency | None = None
    timezone: TimeZoneName | None = None
    ai_enabled: bool | None = None
    ai_auto_execute: bool | None = None


class FamilyDelete(BaseModel):
    confirm_name: str = Field(min_length=1, max_length=100)


class MemberOut(BaseModel):
    id: uuid.UUID
    user_id: uuid.UUID
    first_name: str
    last_name: str | None
    username: str | None
    photo_url: str | None
    role: Role
    joined_at: datetime


class FamilyOut(ORMModel):
    id: uuid.UUID
    name: str
    currency: str
    timezone: str
    ai_enabled: bool
    ai_auto_execute: bool
    created_at: datetime
    members: list[MemberOut] = []
    my_role: Role | None = None


class MemberPatch(BaseModel):
    role: Role


class InvitationCreate(BaseModel):
    role: Role = Role.admin
    max_uses: int = Field(1, ge=1, le=10)
    expires_in_hours: int = Field(72, ge=1, le=24 * 14)


class InvitationOut(ORMModel):
    id: uuid.UUID
    role: Role
    max_uses: int
    use_count: int
    expires_at: datetime
    revoked_at: datetime | None
    created_at: datetime


class InvitationCreated(InvitationOut):
    token: str
    link: str | None
    start_param: str


class InvitationTokenIn(BaseModel):
    token: str = Field(min_length=10, max_length=100)


class InvitationPreview(BaseModel):
    family_name: str
    inviter_name: str | None
    expires_at: datetime
    already_member: bool


class PendingInvitation(InvitationPreview):
    """An invitation the user opened through the bot and has not answered yet."""

    id: uuid.UUID
