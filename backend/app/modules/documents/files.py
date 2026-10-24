"""Upload validation: content sniffing (not the client-declared type), size, safe names."""

from __future__ import annotations

import re
import unicodedata

from app.core.errors import ValidationFailed

ALLOWED = {
    "application/pdf": ".pdf",
    "image/jpeg": ".jpg",
    "image/png": ".png",
    "image/webp": ".webp",
    "image/heic": ".heic",
    "text/plain": ".txt",
}


def sniff_content_type(data: bytes) -> str:
    head = data[:32]
    if head.startswith(b"%PDF-"):
        return "application/pdf"
    if head.startswith(b"\xff\xd8\xff"):
        return "image/jpeg"
    if head.startswith(b"\x89PNG\r\n\x1a\n"):
        return "image/png"
    if head[:4] == b"RIFF" and head[8:12] == b"WEBP":
        return "image/webp"
    if head[4:8] == b"ftyp" and head[8:12] in (b"heic", b"heix", b"mif1", b"msf1", b"hevc"):
        return "image/heic"
    if b"\x00" not in data[:4096]:
        try:
            data[:65536].decode("utf-8")
        except UnicodeDecodeError:
            pass
        else:
            return "text/plain"
    raise ValidationFailed(
        "Тип файла не поддерживается. Разрешены PDF, JPEG, PNG, WebP, HEIC и текст", code="unsupported_file_type"
    )


def safe_filename(name: str | None, content_type: str) -> str:
    base = (name or "document").replace("\\", "/").split("/")[-1]
    base = unicodedata.normalize("NFC", base)
    base = re.sub(r"[^\w.\- ()]+", "_", base, flags=re.UNICODE).strip(" ._") or "document"
    stem = base.rsplit(".", 1)[0][:90] if "." in base else base[:90]
    return stem + ALLOWED[content_type]
