from __future__ import annotations

import hashlib
import uuid

from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import get_settings
from app.core.audit import audit
from app.core.errors import ServiceUnavailable, ValidationFailed
from app.core.time import utcnow
from app.integrations.storage import get_storage, require_uploads
from app.models import Document
from app.modules.documents.files import safe_filename, sniff_content_type
from app.modules.documents.schemas import DocumentMeta, DocumentOut, DocumentPatch
from app.security.access import FamilyContext, ensure_can_delete, get_visible, visible
from app.security.tokens import sign_payload

DOWNLOAD_TTL = 300


def document_out(doc: Document) -> DocumentOut:
    out = DocumentOut.model_validate(doc)
    out.has_file = doc.storage_key is not None
    return out


async def list_documents(
    db: AsyncSession, ctx: FamilyContext, q: str | None, category: str | None, archived: bool
) -> list[Document]:
    stmt = select(Document).where(visible(Document, ctx))
    stmt = stmt.where(
        Document.archived_at.is_not(None) if archived else Document.archived_at.is_(None)
    )
    if category:
        stmt = stmt.where(Document.category == category)
    if q:
        pattern = f"%{q.replace('%', '')}%"
        stmt = stmt.where(
            or_(
                Document.title.ilike(pattern),
                Document.notes.ilike(pattern),
                Document.original_filename.ilike(pattern),
            )
        )
    return list((await db.execute(stmt.order_by(Document.created_at.desc()).limit(200))).scalars())


async def _store(
    ctx: FamilyContext, data: bytes, filename: str | None
) -> tuple[str, str, str, str]:
    require_uploads()
    settings = get_settings()
    if not data:
        raise ValidationFailed("Файл пустой")
    if len(data) > settings.max_upload_mb * 1024 * 1024:
        raise ValidationFailed(f"Файл больше {settings.max_upload_mb} МБ", code="file_too_large")
    content_type = sniff_content_type(data)
    key = f"{ctx.family_id}/{uuid.uuid4().hex}"
    try:
        await get_storage().put(key, data, content_type)
    except ServiceUnavailable:
        raise
    except Exception as exc:
        raise ServiceUnavailable("Хранилище файлов недоступно", code="storage_unavailable") from exc
    return (
        key,
        content_type,
        safe_filename(filename, content_type),
        hashlib.sha256(data).hexdigest(),
    )


async def create_document(
    db: AsyncSession,
    ctx: FamilyContext,
    meta: DocumentMeta,
    data: bytes | None,
    filename: str | None,
) -> Document:
    doc = Document(family_id=ctx.family_id, created_by=ctx.user_id, **meta.model_dump())
    if data is not None:
        doc.storage_key, doc.content_type, doc.original_filename, doc.sha256 = await _store(
            ctx, data, filename
        )
        doc.size_bytes = len(data)
    db.add(doc)
    await db.flush()
    audit(
        db,
        ctx,
        "document.create",
        "document",
        doc.id,
        doc.title if meta.visibility == "family" else None,
        obj=doc,
    )
    return doc


async def replace_file(
    db: AsyncSession, ctx: FamilyContext, doc_id: uuid.UUID, data: bytes, filename: str | None
) -> tuple[Document, str | None]:
    doc = await get_visible(db, Document, doc_id, ctx, lock=True)
    old_key = doc.storage_key
    doc.storage_key, doc.content_type, doc.original_filename, doc.sha256 = await _store(
        ctx, data, filename
    )
    doc.size_bytes = len(data)
    await db.flush()
    return doc, old_key


async def update_document(
    db: AsyncSession, ctx: FamilyContext, doc_id: uuid.UUID, data: DocumentPatch
) -> Document:
    doc = await get_visible(db, Document, doc_id, ctx, lock=True)
    for field in (
        "title",
        "category",
        "notes",
        "document_date",
        "expires_on",
        "remind_days_before",
    ):
        if field in data.model_fields_set:
            setattr(doc, field, getattr(data, field))
    if data.archived is not None:
        doc.archived_at = utcnow() if data.archived else None
    audit(
        db,
        ctx,
        "document.update",
        "document",
        doc.id,
        doc.title if doc.visibility == "family" else None,
        obj=doc,
    )
    await db.flush()
    return doc


async def delete_document(db: AsyncSession, ctx: FamilyContext, doc_id: uuid.UUID) -> str | None:
    doc = await get_visible(db, Document, doc_id, ctx)
    ensure_can_delete(doc, ctx)
    key = doc.storage_key
    audit(
        db,
        ctx,
        "document.delete",
        "document",
        doc.id,
        doc.title if doc.visibility == "family" else None,
        obj=doc,
    )
    await db.delete(doc)
    return key


async def download_link(db: AsyncSession, ctx: FamilyContext, doc_id: uuid.UUID) -> tuple[str, int]:
    doc = await get_visible(db, Document, doc_id, ctx)
    if doc.storage_key is None:
        raise ValidationFailed("У документа нет файла")
    settings = get_settings()
    presigned = get_storage().presigned_url(
        doc.storage_key, doc.original_filename or "document", DOWNLOAD_TTL
    )
    if presigned:
        return presigned, DOWNLOAD_TTL
    token = sign_payload(
        {"d": str(doc.id), "u": str(ctx.user_id), "f": str(ctx.family_id)},
        settings.secret_key_bytes(),
        DOWNLOAD_TTL,
        "download",
    )
    return f"{settings.backend_url.rstrip('/')}/api/v1/files/{token}", DOWNLOAD_TTL
