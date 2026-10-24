"""CSV import of transactions into one account.

Accepted columns (header row, `,` or `;` separated, case-insensitive):
date (YYYY-MM-DD | DD.MM.YYYY), amount (negative = expense, positive = income),
description, merchant, category (matched by name). Duplicates are detected by a hash of
(account, date, amount, description, ordinal within the file) and skipped.
"""

from __future__ import annotations

import csv
import hashlib
import io
import uuid
from datetime import date, datetime, time
from decimal import Decimal, InvalidOperation
from zoneinfo import ZoneInfo

from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.audit import audit
from app.core.errors import ValidationFailed
from app.models import Account, Category, Transaction
from app.models.enums import CategoryKind, TransactionKind
from app.modules.finance.schemas import ImportResult
from app.security.access import FamilyContext, get_visible

MAX_ROWS = 5000
ALIASES = {
    "date": {"date", "дата", "data"},
    "amount": {"amount", "сумма", "kwota"},
    "description": {"description", "описание", "opis", "назначение"},
    "merchant": {"merchant", "магазин", "получатель", "odbiorca"},
    "category": {"category", "категория", "kategoria"},
}


def _parse_date(raw: str) -> date:
    raw = raw.strip()
    for fmt in ("%Y-%m-%d", "%d.%m.%Y", "%d/%m/%Y", "%d-%m-%Y"):
        try:
            return datetime.strptime(raw, fmt).date()
        except ValueError:
            continue
    raise ValueError(f"неизвестный формат даты «{raw[:20]}»")


def _parse_amount(raw: str) -> Decimal:
    cleaned = raw.strip().replace(" ", "").replace(" ", "")
    if "," in cleaned and "." in cleaned:
        cleaned = cleaned.replace(",", "") if cleaned.rfind(".") > cleaned.rfind(",") else cleaned.replace(".", "").replace(",", ".")
    else:
        cleaned = cleaned.replace(",", ".")
    try:
        value = Decimal(cleaned).quantize(Decimal("0.01"))
    except InvalidOperation as exc:
        raise ValueError(f"некорректная сумма «{raw[:20]}»") from exc
    if value == 0 or abs(value) >= Decimal("1e12"):
        raise ValueError("сумма должна быть ненулевой")
    return value


async def import_csv(
    db: AsyncSession, ctx: FamilyContext, account_id: uuid.UUID, content: bytes, dry_run: bool
) -> ImportResult:
    account = await get_visible(db, Account, account_id, ctx)
    try:
        text = content.decode("utf-8-sig")
    except UnicodeDecodeError:
        text = content.decode("cp1251", errors="replace")
    sample = text[:2048]
    delimiter = ";" if sample.count(";") > sample.count(",") else ","
    reader = csv.reader(io.StringIO(text), delimiter=delimiter)
    try:
        header = [h.strip().lower() for h in next(reader)]
    except StopIteration as exc:
        raise ValidationFailed("Файл пустой") from exc
    columns: dict[str, int] = {}
    for key, names in ALIASES.items():
        for idx, h in enumerate(header):
            if h in names:
                columns[key] = idx
                break
    if "date" not in columns or "amount" not in columns:
        raise ValidationFailed("В файле нужны колонки date и amount (дата и сумма)")

    categories = {
        (c.kind, c.name.lower()): c.id
        for c in (
            await db.execute(select(Category).where(Category.family_id == ctx.family_id))
        ).scalars()
    }
    zone = ZoneInfo(ctx.family.timezone)
    created = skipped = 0
    errors: list[str] = []
    seen: dict[str, int] = {}
    for line_no, row in enumerate(reader, start=2):
        if line_no - 1 > MAX_ROWS:
            errors.append(f"Импортировано не более {MAX_ROWS} строк")
            break
        if not any(cell.strip() for cell in row):
            continue

        def cell(key: str, r: list[str] = row) -> str:
            idx = columns.get(key)
            return r[idx].strip() if idx is not None and idx < len(r) else ""

        try:
            day = _parse_date(cell("date"))
            amount = _parse_amount(cell("amount"))
        except ValueError as exc:
            if len(errors) < 20:
                errors.append(f"Строка {line_no}: {exc}")
            continue
        kind = TransactionKind.income if amount > 0 else TransactionKind.expense
        description = cell("description")[:500] or None
        cat_kind = CategoryKind.income if kind == TransactionKind.income else CategoryKind.expense
        category_id = categories.get((cat_kind, cell("category").lower())) if cell("category") else None
        base_key = f"{account.id}|{day.isoformat()}|{amount}|{description or ''}"
        # Identical rows inside one file are distinct operations (two coffees a day);
        # the per-file ordinal keeps re-imports of the same file idempotent.
        seen[base_key] = seen.get(base_key, 0) + 1
        digest = hashlib.sha256(f"{base_key}|{seen[base_key]}".encode()).hexdigest()
        if dry_run:
            exists = await db.scalar(
                select(Transaction.id).where(
                    Transaction.family_id == ctx.family_id, Transaction.import_hash == digest
                )
            )
            skipped += 1 if exists else 0
            created += 0 if exists else 1
            continue
        result = await db.execute(
            insert(Transaction)
            .values(
                id=uuid.uuid4(),
                family_id=ctx.family_id,
                kind=kind,
                amount=abs(amount),
                currency=account.currency,
                account_id=account.id,
                category_id=category_id,
                occurred_at=datetime.combine(day, time(12, 0), tzinfo=zone),
                description=description,
                merchant=cell("merchant")[:200] or None,
                visibility=account.visibility,
                created_by=ctx.user_id,
                import_hash=digest,
            )
            .on_conflict_do_nothing(
                index_elements=["family_id", "import_hash"],
                index_where=Transaction.import_hash.is_not(None),
            )
        )
        if result.rowcount:  # type: ignore[attr-defined]
            created += 1
        else:
            skipped += 1
    if not dry_run and created:
        audit(db, ctx, "transaction.import", "account", account.id, f"{created} операций", obj=account)
    return ImportResult(created=created, skipped_duplicates=skipped, errors=errors, dry_run=dry_run)
