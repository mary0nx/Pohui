"""The Wrocław schedule: fetched from the city's open data portal, kept in the database, loaded
into memory for routing.

Source: «Rozkład jazdy transportu publicznego» (Urząd Miejski Wrocławia, CC0 1.0) on
https://open-data.cui.wroclaw.pl, read through the portal's documented API
(api.open-data.cui.wroclaw.pl/od2/<dataset>/ lists the files, newest first). Every file is a
complete GTFS feed valid for the dates in its feed_info. A new file is used only after it was
downloaded completely, its checksum stored and the whole feed parsed without errors, so a
broken or partial download never replaces a working timetable.
"""

from __future__ import annotations

import asyncio
import hashlib
import io
import logging
import re
import zipfile
from collections import OrderedDict
from dataclasses import dataclass
from datetime import date, datetime, timedelta
from urllib.parse import urlsplit

import httpx
from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.time import utcnow
from app.models import TransitFeed, TransitSource
from app.modules.transit import gtfs

log = logging.getLogger(__name__)

SOURCE = "wroclaw_gtfs"
PORTAL = "https://api.open-data.cui.wroclaw.pl"
DATASET = 6  # «Rozkład jazdy transportu publicznego»
DATASET_PAGE = "https://open-data.cui.wroclaw.pl/hdb/metadane/13/"
LICENSE = "CC0 1.0"
MAX_BYTES = 60 * 1024 * 1024
CANDIDATES = 6  # newest files looked at on each check
COVER_DAYS = 4  # today and the next days must have a schedule
KEEP_FILES = (
    "agency.txt",
    "calendar.txt",
    "calendar_dates.txt",
    "feed_info.txt",
    "routes.txt",
    "stops.txt",
    "trips.txt",
    "stop_times.txt",
)
NAME_DATE = re.compile(r"_(\d{2})(\d{2})(\d{4})$")
STALE_AFTER = timedelta(hours=72)
RETRY_REJECTED = timedelta(hours=12)  # a broken file is not downloaded again before this
_rejected: dict[int, datetime] = {}
TIMEOUT = httpx.Timeout(30.0, connect=10.0)
USER_AGENT = "FamilyOS/1.0 (family planner; schedule updates once an hour)"


class FeedUnavailable(RuntimeError):
    pass


@dataclass(frozen=True)
class RemoteFile:
    id: int
    name: str
    size: int
    published_at: datetime | None
    url: str


def name_date(name: str) -> date | None:
    """«…_GTFS_26102026» → 2026-10-26 (the first day of the file)."""
    m = NAME_DATE.search(name)
    if not m:
        return None
    try:
        return date(int(m.group(3)), int(m.group(2)), int(m.group(1)))
    except ValueError:
        return None


def _portal_url(url: str) -> bool:
    parts = urlsplit(url)
    return parts.scheme == "https" and parts.netloc == urlsplit(PORTAL).netloc


async def list_remote(client: httpx.AsyncClient) -> list[RemoteFile]:
    r = await client.get(f"{PORTAL}/od2/{DATASET}/")
    r.raise_for_status()
    ids = [int(i) for i in r.json().get("pliki", []) if isinstance(i, int)][:CANDIDATES]
    out = []
    for file_id in ids:
        m = await client.get(f"{PORTAL}/od2-files/{file_id}/")
        m.raise_for_status()
        meta = m.json()
        url = str(meta.get("download_url") or f"{PORTAL}/od2-files/{file_id}/download/")
        if not _portal_url(url):
            continue  # only ever download from the portal itself
        published = meta.get("harvested_at")
        out.append(
            RemoteFile(
                id=file_id,
                name=str(meta.get("nazwa_pliku_bez_rozszerzenia") or f"GTFS {file_id}")[:200],
                size=int(meta.get("rozmiar_pliku") or 0),
                published_at=datetime.fromisoformat(published) if published else None,
                url=url,
            )
        )
    return out


def slim(data: bytes) -> bytes:
    """The zip with only the files the router reads (shapes etc. dropped)."""
    out = io.BytesIO()
    with (
        zipfile.ZipFile(io.BytesIO(data)) as src,
        zipfile.ZipFile(out, "w", zipfile.ZIP_DEFLATED, compresslevel=6) as dst,
    ):
        for name in src.namelist():
            if name in KEEP_FILES:
                dst.writestr(name, src.read(name))
    return out.getvalue()


async def _download(client: httpx.AsyncClient, f: RemoteFile) -> bytes:
    if f.size > MAX_BYTES:
        raise FeedUnavailable(f"file too large: {f.size}")
    async with client.stream("GET", f.url) as r:
        r.raise_for_status()
        chunks, total = [], 0
        async for chunk in r.aiter_bytes():
            total += len(chunk)
            if total > MAX_BYTES:
                raise FeedUnavailable("file too large")
            chunks.append(chunk)
    data = b"".join(chunks)
    if f.size and len(data) != f.size:
        raise FeedUnavailable(f"incomplete download: {len(data)} of {f.size} bytes")
    return data


async def check_updates(
    db: AsyncSession, client: httpx.AsyncClient | None = None, now: datetime | None = None
) -> dict[str, object]:
    """Looks for new schedule files and stores every new valid one. Never raises for network
    problems: the error is recorded in transit_sources and the stored feeds stay in use."""
    now = now or utcnow()
    state = await db.get(TransitSource, SOURCE)
    if state is None:
        state = TransitSource(source=SOURCE)
        db.add(state)
    state.checked_at = now
    own = client is None
    client = client or httpx.AsyncClient(
        timeout=TIMEOUT, headers={"User-Agent": USER_AGENT}, follow_redirects=False
    )
    added: list[str] = []
    problems: list[str] = []
    try:
        remote = await list_remote(client)
        known = {
            r.remote_id: (r.feed_start, r.feed_end, r.size)
            for r in (
                await db.execute(
                    select(
                        TransitFeed.remote_id,
                        TransitFeed.feed_start,
                        TransitFeed.feed_end,
                        TransitFeed.size,
                    ).where(TransitFeed.source == SOURCE)
                )
            ).all()
        }
        today = now.date()
        # Newest file first; a date is served by the newest file that covers it, so older files
        # are needed only for the coming days the newer ones leave uncovered.
        uncovered = {today + timedelta(days=i) for i in range(COVER_DAYS)}
        for f in remote:
            if not uncovered:
                break
            replaced = f.id in known and bool(f.size) and f.size != known[f.id][2]
            if f.id in known and not replaced:
                start, end = known[f.id][0], known[f.id][1]
            else:
                begins = name_date(f.name)
                if begins is not None and begins < today - timedelta(days=60):
                    continue
                if now - _rejected.get(f.id, now - RETRY_REJECTED) < RETRY_REJECTED:
                    problems.append(f"{f.name}: rejected earlier")
                    continue
                try:
                    raw = await _download(client, f)
                    data = await asyncio.to_thread(slim, raw)
                    # Parse completely before accepting the file: a broken feed is never stored.
                    tt = await asyncio.to_thread(gtfs.load, data)
                except (zipfile.BadZipFile, FeedUnavailable, gtfs.FeedError) as exc:
                    # Keep going with older files; the stored timetable stays in use.
                    _rejected[f.id] = now
                    problems.append(f"{f.name}: {type(exc).__name__}: {exc}")
                    continue
                start, end = tt.info.start, tt.info.end
                if end is not None and end < today:
                    continue  # already over
                if replaced:  # the portal republished the file under the same id
                    await db.execute(
                        delete(TransitFeed).where(
                            TransitFeed.source == SOURCE, TransitFeed.remote_id == f.id
                        )
                    )
                feed = TransitFeed(
                    source=SOURCE,
                    remote_id=f.id,
                    name=f.name,
                    feed_start=start,
                    feed_end=end,
                    published_at=f.published_at,
                    sha256=hashlib.sha256(raw).hexdigest(),
                    size=len(raw),
                    data=data,
                )
                db.add(feed)
                await db.flush()
                get_store().put(str(feed.id), tt)
                added.append(f.name)
            uncovered = {d for d in uncovered if not _covers(start, end, d)}
        if problems:
            # A newer file could not be used: the schedule counts as not updated (it turns
            # "stale" after STALE_AFTER and is then never shown as the best choice).
            state.error = "; ".join(problems)[:300]
            log.warning("schedule file rejected", extra={"ctx": {"error": state.error}})
        else:
            state.ok_at = now
            state.error = None
    except (httpx.HTTPError, ValueError, KeyError, FeedUnavailable, gtfs.FeedError) as exc:
        state.error = f"{type(exc).__name__}: {exc}"[:300]
        log.warning("schedule update failed", extra={"ctx": {"error": state.error}})
    finally:
        if own:
            await client.aclose()
    # Feeds that ended more than two days ago are no longer needed.
    await db.execute(
        delete(TransitFeed).where(
            TransitFeed.source == SOURCE, TransitFeed.feed_end < now.date() - timedelta(days=2)
        )
    )
    return {"added": added, "error": state.error}


def _covers(start: date | None, end: date | None, day: date) -> bool:
    return (start is None or start <= day) and (end is None or day <= end)


@dataclass(frozen=True)
class FeedMeta:
    id: str
    remote_id: int
    name: str
    start: date | None
    end: date | None
    fetched_at: datetime


async def feed_for(db: AsyncSession, day: date) -> FeedMeta | None:
    """The stored feed for a date: the newest published file whose validity covers it."""
    rows = (
        await db.execute(
            select(
                TransitFeed.id,
                TransitFeed.remote_id,
                TransitFeed.name,
                TransitFeed.feed_start,
                TransitFeed.feed_end,
                TransitFeed.fetched_at,
            )
            .where(TransitFeed.source == SOURCE)
            .order_by(TransitFeed.remote_id.desc())
        )
    ).all()
    for fid, remote_id, name, start, end, fetched in rows:
        if _covers(start, end, day):
            return FeedMeta(str(fid), remote_id, name, start, end, fetched)
    return None


class TimetableStore:
    """Parsed timetables in memory (at most two feeds) and per-date tables (at most four)."""

    def __init__(self) -> None:
        self._feeds: OrderedDict[str, gtfs.Timetable] = OrderedDict()
        self._days: OrderedDict[tuple[str, date], gtfs.DayTable] = OrderedDict()
        self._loading: dict[str, asyncio.Task[gtfs.Timetable]] = {}

    def loaded(self, feed_id: str) -> bool:
        return feed_id in self._feeds

    def put(self, feed_id: str, tt: gtfs.Timetable) -> None:
        self._feeds[feed_id] = tt
        self._trim()

    def _trim(self) -> None:
        while len(self._feeds) > 2:
            old, _ = self._feeds.popitem(last=False)
            for key in [k for k in self._days if k[0] == old]:
                del self._days[key]

    async def timetable(
        self, db: AsyncSession, meta: FeedMeta, wait: float | None = None
    ) -> gtfs.Timetable | None:
        """The parsed feed. Parsing runs in the background; with `wait`, gives up after that
        many seconds and returns None (the parse goes on and the next request finds it)."""
        tt = self._feeds.get(meta.id)
        if tt is not None:
            self._feeds.move_to_end(meta.id)
            return tt
        task = self._loading.get(meta.id)
        if task is None:
            data = await db.scalar(select(TransitFeed.data).where(TransitFeed.id == meta.id))
            if data is None:
                raise FeedUnavailable("feed removed")
            task = asyncio.create_task(asyncio.to_thread(gtfs.load, data))
            self._loading[meta.id] = task

            def done(t: asyncio.Task[gtfs.Timetable], fid: str = meta.id) -> None:
                self._loading.pop(fid, None)
                if not t.cancelled() and t.exception() is None:
                    self.put(fid, t.result())
                elif not t.cancelled():
                    log.error("schedule parse failed", extra={"ctx": {"error": str(t.exception())}})

            task.add_done_callback(done)
        try:
            return await asyncio.wait_for(asyncio.shield(task), wait)
        except TimeoutError:
            return None

    async def day(
        self, db: AsyncSession, meta: FeedMeta, day: date, wait: float | None = None
    ) -> gtfs.DayTable | None:
        key = (meta.id, day)
        table = self._days.get(key)
        if table is not None:
            self._days.move_to_end(key)
            return table
        tt = await self.timetable(db, meta, wait)
        if tt is None:
            return None
        table = await asyncio.to_thread(gtfs.day_table, tt, day)
        self._days[key] = table
        while len(self._days) > 4:
            self._days.popitem(last=False)
        return table

    def clear(self) -> None:
        self._feeds.clear()
        self._days.clear()


_store = TimetableStore()


def get_store() -> TimetableStore:
    return _store


async def source_state(db: AsyncSession) -> TransitSource | None:
    return await db.get(TransitSource, SOURCE)


def is_stale(state: TransitSource | None, now: datetime) -> bool:
    """True when the portal has not answered for a long time: newer schedule changes may exist."""
    return state is None or state.ok_at is None or now - state.ok_at > STALE_AFTER
