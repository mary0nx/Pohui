from __future__ import annotations

import uuid
from datetime import date
from typing import Annotated
from urllib.parse import quote

from fastapi import APIRouter, File, Form, UploadFile
from fastapi.responses import StreamingResponse
from sqlalchemy import select

from app.api.deps import DB, Ctx
from app.config import get_settings
from app.core.errors import NotFound
from app.integrations.storage import delete_files_quietly, get_storage
from app.models import Document, User
from app.models.enums import Visibility
from app.modules.documents import service
from app.modules.documents.schemas import DocumentMeta, DocumentOut, DocumentPatch, DownloadLink
from app.security.access import get_visible, load_family_context
from app.security.tokens import verify_payload

router = APIRouter(prefix="/families/{family_id}/documents", tags=["documents"])
files_router = APIRouter(tags=["documents"])


async def _read_upload(file: UploadFile) -> bytes:
    limit = get_settings().max_upload_mb * 1024 * 1024
    data = await file.read(limit + 1)
    return data


@router.get("", response_model=list[DocumentOut])
async def list_docs(ctx: Ctx, db: DB, q: str | None = None, category: str | None = None, archived: bool = False) -> list[DocumentOut]:
    return [service.document_out(d) for d in await service.list_documents(db, ctx, q, category, archived)]


@router.post("", response_model=DocumentOut, status_code=201)
async def create_meta(body: DocumentMeta, ctx: Ctx, db: DB) -> DocumentOut:
    doc = await service.create_document(db, ctx, body, None, None)
    out = service.document_out(doc)
    await db.commit()
    return out


@router.post("/upload", response_model=DocumentOut, status_code=201)
async def upload(
    ctx: Ctx,
    db: DB,
    file: Annotated[UploadFile, File()],
    title: Annotated[str, Form(min_length=1, max_length=200)],
    category: Annotated[str | None, Form(max_length=32)] = None,
    notes: Annotated[str | None, Form(max_length=1000)] = None,
    document_date: Annotated[date | None, Form()] = None,
    expires_on: Annotated[date | None, Form()] = None,
    remind_days_before: Annotated[int | None, Form(ge=0, le=180)] = None,
    visibility: Annotated[Visibility, Form()] = Visibility.family,
) -> DocumentOut:
    meta = DocumentMeta(
        title=title, category=category or None, notes=notes or None, document_date=document_date,
        expires_on=expires_on, remind_days_before=remind_days_before, visibility=visibility,
    )
    data = await _read_upload(file)
    doc = await service.create_document(db, ctx, meta, data, file.filename)
    out = service.document_out(doc)
    try:
        await db.commit()
    except Exception:
        await delete_files_quietly([doc.storage_key] if doc.storage_key else [])
        raise
    return out


@router.get("/{doc_id}", response_model=DocumentOut)
async def get_doc(doc_id: uuid.UUID, ctx: Ctx, db: DB) -> DocumentOut:
    return service.document_out(await get_visible(db, Document, doc_id, ctx))


@router.patch("/{doc_id}", response_model=DocumentOut)
async def patch_doc(doc_id: uuid.UUID, body: DocumentPatch, ctx: Ctx, db: DB) -> DocumentOut:
    doc = await service.update_document(db, ctx, doc_id, body)
    out = service.document_out(doc)
    await db.commit()
    return out


@router.post("/{doc_id}/file", response_model=DocumentOut)
async def replace(doc_id: uuid.UUID, ctx: Ctx, db: DB, file: Annotated[UploadFile, File()]) -> DocumentOut:
    doc, old_key = await service.replace_file(db, ctx, doc_id, await _read_upload(file), file.filename)
    out = service.document_out(doc)
    await db.commit()
    await delete_files_quietly([old_key] if old_key else [])
    return out


@router.delete("/{doc_id}", status_code=204)
async def delete_doc(doc_id: uuid.UUID, ctx: Ctx, db: DB) -> None:
    key = await service.delete_document(db, ctx, doc_id)
    await db.commit()
    await delete_files_quietly([key] if key else [])


@router.post("/{doc_id}/download-link", response_model=DownloadLink)
async def link(doc_id: uuid.UUID, ctx: Ctx, db: DB) -> DownloadLink:
    url, ttl = await service.download_link(db, ctx, doc_id)
    return DownloadLink(url=url, expires_in=ttl)


@files_router.get("/files/{token}")
async def download(token: str, db: DB) -> StreamingResponse:
    """Short-lived signed link. Permissions are re-checked at download time."""
    payload = verify_payload(token, get_settings().secret_key_bytes(), "download")
    if payload is None:
        raise NotFound("Ссылка недействительна или истекла")
    user = await db.scalar(select(User).where(User.id == uuid.UUID(payload["u"])))
    if user is None:
        raise NotFound()
    ctx = await load_family_context(db, user, uuid.UUID(payload["f"]))
    doc = await get_visible(db, Document, uuid.UUID(payload["d"]), ctx)
    if doc.storage_key is None:
        raise NotFound()
    name = doc.original_filename or "document"
    ascii_name = name.encode("ascii", "ignore").decode() or "document"
    try:
        stream = get_storage().stream(doc.storage_key)
        first = await anext(stream)
    except (FileNotFoundError, StopAsyncIteration) as exc:
        raise NotFound("Файл не найден в хранилище") from exc

    async def body():  # type: ignore[no-untyped-def]
        yield first
        async for chunk in stream:
            yield chunk

    return StreamingResponse(
        body(),
        media_type=doc.content_type or "application/octet-stream",
        headers={
            "Content-Disposition": f"attachment; filename=\"{ascii_name}\"; filename*=UTF-8''{quote(name)}",
            "Content-Security-Policy": "default-src 'none'; sandbox",
            "Cache-Control": "private, no-store",
        },
    )
