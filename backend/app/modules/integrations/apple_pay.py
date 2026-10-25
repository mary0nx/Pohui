"""Apple Pay → Family OS through an iPhone Shortcuts automation.

iOS does not let apps read other apps' notifications, but Shortcuts has a "Transaction"
automation that runs on every Wallet card payment and exposes the amount, merchant and card.
The automation POSTs them (plus the current location) to the hook below with a personal key;
the hook records an expense in the member's account.
"""

from __future__ import annotations

import hashlib
import html
import re
import secrets
import uuid
from datetime import datetime
from decimal import Decimal, InvalidOperation

from fastapi import APIRouter, Request
from fastapi.responses import PlainTextResponse
from pydantic import BaseModel, Field, field_validator
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import DB, Ctx
from app.config import get_settings
from app.core.errors import ValidationFailed
from app.core.rate_limit import get_rate_limiter
from app.core.time import utcnow
from app.db.session import get_sessionmaker
from app.integrations.telegram import AiogramSender, TelegramSender
from app.models import Account, Category, Family, FamilyMember, IntegrationToken, Transaction, User
from app.models.enums import CategoryKind, PaymentMethod, TransactionKind, Visibility
from app.modules.finance import service as finance
from app.modules.finance.schemas import TransactionCreate
from app.security.access import FamilyContext

KIND = "apple_pay"
TOKEN_PREFIX = "fos_"  # noqa: S105 - marks Family OS keys, not a secret

# Currency words/symbols as iOS formats the Shortcuts "Amount" value in different locales.
CURRENCY_WORDS = {
    "zł": "PLN",
    "zl": "PLN",
    "pln": "PLN",
    "€": "EUR",
    "eur": "EUR",
    "$": "USD",
    "usd": "USD",
    "£": "GBP",
    "gbp": "GBP",
    "₴": "UAH",
    "uah": "UAH",
    "грн": "UAH",
    "byn": "BYN",
    "br": "BYN",
    "₽": "RUB",
    "rub": "RUB",
    "руб": "RUB",
    "₸": "KZT",
    "kzt": "KZT",
    "₾": "GEL",
    "gel": "GEL",
    "kč": "CZK",
    "czk": "CZK",
}
_CURRENCY_RE = re.compile(
    "|".join(sorted((re.escape(w) for w in CURRENCY_WORDS), key=len, reverse=True)), re.IGNORECASE
)
_NUMBER_RE = re.compile(r"\d[\d\s  '.,]*")

# First match wins; names are the default expense categories (users can rename them).
MERCHANT_CATEGORIES: list[tuple[str, tuple[str, ...]]] = [
    (
        "Продукты",
        (
            "biedronka",
            "lidl",
            "żabka",
            "zabka",
            "auchan",
            "carrefour",
            "kaufland",
            "netto",
            "dino",
            "aldi",
            "stokrotka",
            "lewiatan",
            "polomarket",
            "intermarche",
            "spar",
            "delikatesy",
            "frisco",
            "top market",
            "groszek",
        ),
    ),
    (
        "Кафе и рестораны",
        (
            "mcdonald",
            "kfc",
            "burger king",
            "starbucks",
            "costa",
            "pizza",
            "sushi",
            "restaurac",
            "kebab",
            "bistro",
            "cafe",
            "kawiarn",
            "pyszne",
            "glovo",
            "uber eats",
            "wolt",
            "bar ",
        ),
    ),
    (
        "Транспорт",
        (
            "orlen",
            "shell",
            "circle k",
            "moya",
            "amic",
            "lotos",
            "uber",
            "bolt",
            "free now",
            "freenow",
            "pkp",
            "intercity",
            "koleje",
            "jakdojade",
            "mpk",
            "ztm",
            "parking",
            "bp ",
        ),
    ),
    (
        "Здоровье",
        ("apteka", "pharma", "doz", "gemini", "medicover", "luxmed", "lux med", "enel-med"),
    ),
    ("Красота и уход", ("rossmann", "hebe", "sephora", "douglas", "notino", "fryzjer", "barber")),
    (
        "Одежда",
        (
            "zara",
            "h&m",
            "reserved",
            "cropp",
            "sinsay",
            "house",
            "ccc",
            "deichmann",
            "primark",
            "decathlon",
            "half price",
            "tk maxx",
        ),
    ),
    (
        "Дом и быт",
        (
            "ikea",
            "castorama",
            "leroy",
            "obi",
            "pepco",
            "action",
            "jysk",
            "media expert",
            "rtv euro",
            "media markt",
            "mediamarkt",
            "empik",
        ),
    ),
    ("Связь и интернет", ("play", "orange", "plus ", "t-mobile", "vectra", "upc")),
    ("Подписки", ("netflix", "spotify", "apple.com", "google", "youtube", "hbo", "disney", "max ")),
    ("Развлечения", ("cinema city", "multikino", "helios", "kino", "teatr", "bilet")),
]

router = APIRouter(tags=["integrations"])


def hash_token(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


def parse_amount(text: str) -> tuple[Decimal, str | None, bool]:
    """'12,50 zł' / 'PLN 1 234.56' / '-3,20 €' → (amount, currency or None, is_refund)."""
    raw = text.strip()
    match = _NUMBER_RE.search(raw)
    if not match:
        raise ValidationFailed("Не удалось прочитать сумму")
    number = re.sub(r"[\s  ']", "", match.group()).rstrip(".,")
    if "," in number and "." in number:
        decimal_sep = "," if number.rfind(",") > number.rfind(".") else "."
        number = number.replace("." if decimal_sep == "," else ",", "").replace(decimal_sep, ".")
    elif "," in number:
        number = (
            number.replace(",", ".")
            if re.fullmatch(r"\d+,\d{1,2}", number)
            else number.replace(",", "")
        )
    elif "." in number and not re.fullmatch(r"\d+\.\d{1,2}", number):
        number = number.replace(".", "")
    try:
        amount = Decimal(number).quantize(Decimal("0.01"))
    except InvalidOperation as exc:
        raise ValidationFailed("Не удалось прочитать сумму") from exc
    if amount <= 0:
        raise ValidationFailed("Сумма должна быть больше нуля")
    currency_match = _CURRENCY_RE.search(raw)
    currency = CURRENCY_WORDS[currency_match.group().lower()] if currency_match else None
    refund = bool(re.search(r"[-−–]\s*\d", raw[: match.end()]))
    return amount, currency, refund


class ApplePayIn(BaseModel):
    """What the Shortcuts automation sends; values arrive as text from Shortcuts variables."""

    amount: str = Field(min_length=1, max_length=64)
    merchant: str | None = Field(None, max_length=200)
    card: str | None = Field(None, max_length=100)
    location: str | None = Field(None, max_length=400)

    @field_validator("amount", mode="before")
    @classmethod
    def _amount_text(cls, v: object) -> object:
        return str(v) if isinstance(v, int | float | Decimal) else v

    @field_validator("merchant", "card", "location", mode="before")
    @classmethod
    def _blank(cls, v: object) -> object:
        if isinstance(v, str):
            v = " ".join(v.split())
            return v or None
        return v


async def _pick_account(
    db: AsyncSession, ctx: FamilyContext, preferred: uuid.UUID | None, currency: str | None
) -> Account:
    usable = [
        a
        for a in (
            await db.execute(
                select(Account)
                .where(Account.family_id == ctx.family_id, Account.archived_at.is_(None))
                .order_by(Account.created_at)
            )
        ).scalars()
        if a.visibility == Visibility.family or a.created_by == ctx.user_id
    ]
    if not usable:
        raise ValidationFailed("В семье нет счёта для записи расходов — создайте счёт в приложении")
    chosen = next((a for a in usable if a.id == preferred), None)
    if currency and (chosen is None or chosen.currency != currency):
        # Spending abroad: prefer an account in that currency if the family has one.
        chosen = next((a for a in usable if a.currency == currency), chosen)
    if chosen is None:
        chosen = next((a for a in usable if a.currency == ctx.family.currency), usable[0])
    return chosen


async def _pick_category(
    db: AsyncSession, ctx: FamilyContext, merchant: str | None
) -> Category | None:
    if not merchant:
        return None
    # The category the family used last time for this merchant wins over the keyword guess.
    previous = await db.scalar(
        select(Category)
        .join(Transaction, Transaction.category_id == Category.id)
        .where(
            Transaction.family_id == ctx.family_id,
            func.lower(Transaction.merchant) == merchant.lower(),
            Category.kind == CategoryKind.expense,
            Category.archived_at.is_(None),
        )
        .order_by(Transaction.occurred_at.desc())
        .limit(1)
    )
    if previous is not None:
        return previous
    name = merchant.lower() + " "
    for category_name, words in MERCHANT_CATEGORIES:
        if any(w in name for w in words):
            return await db.scalar(
                select(Category).where(
                    Category.family_id == ctx.family_id,
                    Category.kind == CategoryKind.expense,
                    Category.archived_at.is_(None),
                    func.lower(Category.name) == category_name.lower(),
                )
            )
    return None


async def record(
    db: AsyncSession, ctx: FamilyContext, token: IntegrationToken, data: ApplePayIn
) -> tuple[Transaction, Category | None, bool]:
    """Creates the expense (or refund); returns (transaction, category, created)."""
    amount, currency, refund = parse_amount(data.amount)
    account = await _pick_account(db, ctx, token.account_id, currency)
    now = utcnow()
    # Shortcuts can fire twice for one payment; the same payment within a minute is one row.
    digest = hashlib.sha256(
        f"{KIND}:{ctx.user_id}:{(data.merchant or '').lower()}:{amount}:{refund}:{now:%Y%m%d%H%M}".encode()
    ).hexdigest()
    existing = await db.scalar(
        select(Transaction).where(
            Transaction.family_id == ctx.family_id, Transaction.import_hash == digest
        )
    )
    if existing is not None:
        category = await db.get(Category, existing.category_id) if existing.category_id else None
        return existing, category, False
    category = await _pick_category(db, ctx, data.merchant)
    details = ["Apple Pay", data.card]
    if currency and currency != account.currency:
        details.append(f"сумма в {currency}")
    if data.location:
        details.append(f"📍 {data.location}")
    tx = await finance.create_transaction(
        db,
        ctx,
        TransactionCreate(
            kind=TransactionKind.refund if refund else TransactionKind.expense,
            amount=amount,
            account_id=account.id,
            category_id=category.id if category else None,
            occurred_at=now,
            description=" · ".join(d for d in details if d)[:500],
            merchant=data.merchant or "Apple Pay",
            payment_method=PaymentMethod.card,
        ),
        source=KIND,
    )
    tx.import_hash = digest
    token.last_used_at = now
    await db.flush()
    return tx, category, True


def _money(amount: Decimal) -> str:
    return f"{amount:,.2f}".replace(",", " ").replace(".", ",")


async def _context_for(db: AsyncSession, token: IntegrationToken) -> FamilyContext | None:
    row = (
        await db.execute(
            select(User, Family, FamilyMember)
            .join(FamilyMember, FamilyMember.user_id == User.id)
            .join(Family, Family.id == FamilyMember.family_id)
            .where(User.id == token.user_id, Family.id == token.family_id)
        )
    ).first()
    return FamilyContext(user=row[0], family=row[1], member=row[2]) if row else None


def _text(message: str, status: int = 200) -> PlainTextResponse:
    # Plain text so a "Show notification" step in Shortcuts can display the reply as is.
    return PlainTextResponse(message, status_code=status)


@router.post("/hooks/apple-pay", include_in_schema=False)
async def apple_pay_hook(request: Request) -> PlainTextResponse:
    auth = request.headers.get("Authorization", "")
    token_value = auth.removeprefix("Bearer ").strip()
    if not token_value.startswith(TOKEN_PREFIX):
        return _text("Нет ключа Family OS: добавьте заголовок Authorization: Bearer <ключ>", 401)
    await get_rate_limiter().hit(f"hook:{hash_token(token_value)[:16]}", 30)
    try:
        data = ApplePayIn.model_validate(await request.json())
    except ValueError:
        return _text("Ожидается JSON с полями amount, merchant, card, location", 422)
    async with get_sessionmaker()() as db:
        token = await db.scalar(
            select(IntegrationToken).where(
                IntegrationToken.token_hash == hash_token(token_value),
                IntegrationToken.kind == KIND,
            )
        )
        ctx = await _context_for(db, token) if token else None
        if token is None or ctx is None:
            return _text("Ключ Family OS недействителен: создайте новый в приложении", 401)
        try:
            tx, category, created = await record(db, ctx, token, data)
        except ValidationFailed as exc:
            await db.rollback()
            return _text(exc.message, 422)
        await db.commit()
    sign = "Возврат" if tx.kind == TransactionKind.refund else "Записано"
    message = f"{sign}: {_money(tx.amount)} {tx.currency} — {tx.merchant}"
    if category:
        message += f" ({category.name})"
    return _text(
        message if created else f"Уже записано: {_money(tx.amount)} {tx.currency} — {tx.merchant}"
    )


# --- Settings in the app (member's own key) -------------------------------------------------


class ApplePayStatus(BaseModel):
    connected: bool
    token_prefix: str | None = None
    account_id: uuid.UUID | None = None
    last_used_at: datetime | None = None
    hook_url: str


class ApplePayConnect(BaseModel):
    account_id: uuid.UUID | None = None
    # Also send the address and key to the member's chat with the bot: in Telegram a tap on
    # the code copies it, which is the easiest way to paste it into Shortcuts on the iPhone.
    send_to_chat: bool = False


class ApplePayConnected(ApplePayStatus):
    token: str
    sent_to_chat: bool = False


def make_sender() -> TelegramSender | None:
    """Overridden in tests."""
    return AiogramSender() if get_settings().telegram_configured else None


async def _send_key(user: User, hook_url: str, token: str) -> bool:
    if user.bot_started_at is None:
        return False
    sender = make_sender()
    if sender is None:
        return False
    text = (
        "<b>Apple Pay → Family OS</b>\n\n"
        f"Адрес (URL):\n<code>{html.escape(hook_url)}</code>\n\n"
        f"Заголовок Authorization:\n<code>Bearer {html.escape(token)}</code>\n\n"
        "Нажмите на текст, чтобы скопировать. Ключ личный: не пересылайте его. "
        "Пошаговая настройка — в приложении: Профиль → Apple Pay."
    )
    try:
        await sender.send(user.telegram_id, text, "Открыть настройку", "/profile/apple-pay")
    except Exception:
        return False
    finally:
        if isinstance(sender, AiogramSender):
            await sender.close()
    return True


def _hook_url() -> str:
    return f"{get_settings().backend_url.rstrip('/')}/api/v1/hooks/apple-pay"


async def _own_token(db: AsyncSession, ctx: FamilyContext) -> IntegrationToken | None:
    return await db.scalar(
        select(IntegrationToken).where(
            IntegrationToken.family_id == ctx.family_id,
            IntegrationToken.user_id == ctx.user_id,
            IntegrationToken.kind == KIND,
        )
    )


async def _check_account(
    db: AsyncSession, ctx: FamilyContext, account_id: uuid.UUID | None
) -> None:
    if account_id is None:
        return
    acc = await db.get(Account, account_id)
    if acc is None or acc.family_id != ctx.family_id or acc.archived_at is not None:
        raise ValidationFailed("Счёт не найден")
    if acc.visibility == Visibility.private and acc.created_by != ctx.user_id:
        raise ValidationFailed("Счёт не найден")


settings_router = APIRouter(
    prefix="/families/{family_id}/integrations/apple-pay", tags=["integrations"]
)


@settings_router.get("", response_model=ApplePayStatus)
async def status(ctx: Ctx, db: DB) -> ApplePayStatus:
    token = await _own_token(db, ctx)
    if token is None:
        return ApplePayStatus(connected=False, hook_url=_hook_url())
    return ApplePayStatus(
        connected=True,
        token_prefix=token.token_prefix,
        account_id=token.account_id,
        last_used_at=token.last_used_at,
        hook_url=_hook_url(),
    )


@settings_router.post("", response_model=ApplePayConnected)
async def connect(body: ApplePayConnect, ctx: Ctx, db: DB) -> ApplePayConnected:
    """Creates the key, or replaces it (the old key stops working)."""
    await _check_account(db, ctx, body.account_id)
    value = TOKEN_PREFIX + secrets.token_urlsafe(32)
    token = await _own_token(db, ctx)
    if token is None:
        token = IntegrationToken(
            family_id=ctx.family_id, user_id=ctx.user_id, kind=KIND, token_hash="", token_prefix=""
        )
        db.add(token)
    token.token_hash = hash_token(value)
    token.token_prefix = value[: len(TOKEN_PREFIX) + 4]
    token.account_id = body.account_id
    token.last_used_at = None
    await db.commit()
    sent = await _send_key(ctx.user, _hook_url(), value) if body.send_to_chat else False
    return ApplePayConnected(
        connected=True,
        token=value,
        token_prefix=token.token_prefix,
        account_id=token.account_id,
        hook_url=_hook_url(),
        sent_to_chat=sent,
    )


@settings_router.patch("", response_model=ApplePayStatus)
async def change_account(body: ApplePayConnect, ctx: Ctx, db: DB) -> ApplePayStatus:
    token = await _own_token(db, ctx)
    if token is None:
        raise ValidationFailed("Apple Pay ещё не подключён")
    await _check_account(db, ctx, body.account_id)
    token.account_id = body.account_id
    await db.commit()
    return await status(ctx, db)


@settings_router.delete("", status_code=204)
async def disconnect(ctx: Ctx, db: DB) -> None:
    token = await _own_token(db, ctx)
    if token is not None:
        await db.delete(token)
        await db.commit()
