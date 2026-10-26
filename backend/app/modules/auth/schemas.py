from __future__ import annotations

import uuid
from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field

from app.core.schemas import ORMModel
from app.models.enums import Role
from app.modules.families.schemas import PendingInvitation


class TelegramAuthIn(BaseModel):
    init_data: str = Field(min_length=1, max_length=8192)


class DevAuthIn(BaseModel):
    telegram_id: int = Field(ge=1, le=10**15)
    first_name: str = Field(min_length=1, max_length=64)
    username: str | None = Field(None, max_length=64)


class UserOut(ORMModel):
    id: uuid.UUID
    telegram_id: int
    first_name: str
    last_name: str | None
    username: str | None
    language_code: str | None
    photo_url: str | None
    bot_started: bool = False


class MembershipOut(BaseModel):
    family_id: uuid.UUID
    name: str
    role: Role
    currency: str
    timezone: str


class MeOut(BaseModel):
    user: UserOut
    families: list[MembershipOut]
    active_family_id: uuid.UUID | None
    auth_method: str
    # Set when the user opened an invitation in the bot and has not joined or declined it.
    pending_invitation: PendingInvitation | None = None


class MePatch(BaseModel):
    active_family_id: uuid.UUID | None = None
    language_code: str | None = Field(None, pattern=r"^(ru|en|pl)$")


class TokenOut(BaseModel):
    token: str
    expires_at: datetime
    start_param: str | None = None
    me: MeOut


class LinkStartIn(BaseModel):
    # The page runs as an app from the home screen (display-mode: standalone).
    standalone: bool = False


class LinkStartOut(BaseModel):
    poll_token: str
    bot_url: str
    # Opens the Telegram app directly (tg://), bot_url is the https fallback.
    app_url: str
    expires_at: datetime


class LinkPollIn(BaseModel):
    poll_token: str = Field(min_length=1, max_length=128)


class LinkPollOut(BaseModel):
    status: Literal["pending", "approved", "rejected", "expired"]
    auth: TokenOut | None = None


class DeviceOut(BaseModel):
    id: uuid.UUID
    label: str
    created_at: datetime
    last_used_at: datetime
    current: bool
    push: bool
