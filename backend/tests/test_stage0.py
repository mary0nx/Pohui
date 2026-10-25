"""Stage 0: worker liveness in readiness, no uploads onto a wiped disk, S3 for Supabase Storage."""

from __future__ import annotations

from collections.abc import Iterator

import pytest
from httpx import ASGITransport, AsyncClient

from app.config import get_settings
from app.integrations.storage import S3Storage, set_storage
from app.workers import status
from tests.conftest import Actor

PDF = b"%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n"


@pytest.fixture
def settings_env(monkeypatch: pytest.MonkeyPatch) -> Iterator[pytest.MonkeyPatch]:
    get_settings.cache_clear()
    yield monkeypatch
    monkeypatch.undo()
    get_settings.cache_clear()


@pytest.fixture(autouse=True)
def fresh_worker_state() -> Iterator[None]:
    status.reset()
    yield
    status.reset()


# --- worker liveness -----------------------------------------------------------------------


def test_worker_state_follows_the_loop() -> None:
    tick = 20.0
    assert status.worker_state(tick, now=0) == "starting"  # loop not started yet
    status.mark_started(now=0)
    assert status.worker_state(tick, now=30) == "starting"  # first tick still running
    assert status.worker_state(tick, now=200) == "stale"  # never ticked after the grace period
    status.mark_tick(ok=True, now=210)
    assert status.worker_state(tick, now=240) == "ok"
    status.mark_tick(ok=False, now=250)
    assert status.worker_state(tick, now=260) == "degraded"  # a job or the dispatcher failed
    status.mark_tick(ok=True, now=270)
    assert status.worker_state(tick, now=270 + 89) == "ok"
    assert status.worker_state(tick, now=270 + 91) == "stale"  # asleep, crashed or paused


async def test_readiness_reports_the_embedded_worker(settings_env: pytest.MonkeyPatch) -> None:
    from app.main import create_app

    settings_env.setenv("EMBEDDED_WORKER", "true")
    get_settings.cache_clear()
    async with AsyncClient(transport=ASGITransport(app=create_app()), base_url="http://t") as c:
        status.mark_started()
        assert (await c.get("/health/ready")).json() == {"status": "ok", "worker": "starting"}
        status.mark_tick(ok=True)
        assert (await c.get("/health/ready")).json() == {"status": "ok", "worker": "ok"}


async def test_readiness_without_embedded_worker(client: AsyncClient) -> None:
    assert (await client.get("/health/ready")).json() == {"status": "ok", "worker": "not_embedded"}


async def test_loop_marks_ticks(settings_env: pytest.MonkeyPatch) -> None:
    import asyncio

    from app.workers.loop import run_loop

    settings_env.delenv("TELEGRAM_BOT_TOKEN", raising=False)
    settings_env.setenv("WORKER_TICK_SECONDS", "0.05")
    get_settings.cache_clear()
    stop = asyncio.Event()
    task = asyncio.create_task(run_loop(stop))
    for _ in range(100):
        await asyncio.sleep(0.05)
        if status.worker_state(0.05) == "ok":
            break
    stop.set()
    await task
    assert status.worker_state(0.05) == "ok"


# --- uploads on an ephemeral disk ----------------------------------------------------------


async def test_no_uploads_onto_a_disk_that_deploys_wipe(
    couple: tuple[Actor, Actor], client: AsyncClient, settings_env: pytest.MonkeyPatch
) -> None:
    alice, _ = couple
    settings_env.setenv("RENDER", "true")  # Render sets this; its disk is wiped on deploy
    get_settings.cache_clear()
    meta = (await client.get("/api/v1/meta")).json()
    assert meta["storage"] == "local" and meta["uploads_enabled"] is False

    files = {"file": ("passport.pdf", PDF, "application/pdf")}
    r = await alice.post(alice.f("/documents/upload"), data={"title": "Паспорт"}, files=files)
    assert r.status_code == 503
    assert r.json()["error"]["code"] == "storage_not_configured"
    assert (await alice.get(alice.f("/documents"))).json() == []  # nothing half-saved

    # The document itself (expiry, reminder) can still be kept without a file.
    r = await alice.post(alice.f("/documents"), {"title": "Паспорт", "expires_on": "2030-01-01"})
    assert r.status_code == 201 and r.json()["has_file"] is False

    # An explicit override and S3 both lift the block.
    settings_env.setenv("STORAGE_EPHEMERAL", "false")
    get_settings.cache_clear()
    assert get_settings().uploads_enabled is True
    settings_env.delenv("STORAGE_EPHEMERAL")
    settings_env.setenv("STORAGE_BACKEND", "s3")
    get_settings.cache_clear()
    assert get_settings().uploads_enabled is True


def test_uploads_allowed_locally_without_render(settings_env: pytest.MonkeyPatch) -> None:
    settings_env.delenv("RENDER", raising=False)
    settings_env.delenv("RENDER_EXTERNAL_URL", raising=False)
    get_settings.cache_clear()
    assert get_settings().uploads_enabled is True  # VPS/compose keeps files on a volume


# --- S3 (Supabase Storage) -----------------------------------------------------------------


@pytest.fixture
def s3_server(settings_env: pytest.MonkeyPatch) -> Iterator[str]:
    """A real S3 HTTP endpoint (moto) addressed like Supabase Storage: custom URL, path style."""
    import boto3
    from moto.server import ThreadedMotoServer

    server = ThreadedMotoServer(ip_address="127.0.0.1", port=0)
    server.start()
    host, port = server.get_host_and_port()
    endpoint = f"http://{host}:{port}"
    for key, value in {
        "STORAGE_BACKEND": "s3",
        "STORAGE_ENDPOINT": endpoint,
        "STORAGE_REGION": "eu-west-1",
        "STORAGE_BUCKET": "documents",
        "STORAGE_ACCESS_KEY": "test-access",
        "STORAGE_SECRET_KEY": "test-secret",
        "RENDER": "true",  # S3 must lift the ephemeral-disk block
    }.items():
        settings_env.setenv(key, value)
    get_settings.cache_clear()
    boto3.client(
        "s3",
        endpoint_url=endpoint,
        region_name="eu-west-1",
        aws_access_key_id="test-access",
        aws_secret_access_key="test-secret",
    ).create_bucket(
        Bucket="documents", CreateBucketConfiguration={"LocationConstraint": "eu-west-1"}
    )
    set_storage(S3Storage())
    try:
        yield endpoint
    finally:
        set_storage(None)
        server.stop()


async def test_documents_round_trip_through_s3(
    s3_server: str, couple: tuple[Actor, Actor], client: AsyncClient
) -> None:
    storage = S3Storage()
    assert storage.client.meta.config.s3["addressing_style"] == "path"
    assert storage.presigned_url("k", "f.pdf", 60) is None  # downloads go through the API

    alice, bob = couple
    files = {"file": ("Паспорт.pdf", PDF, "application/pdf")}
    r = await alice.post(alice.f("/documents/upload"), data={"title": "Паспорт"}, files=files)
    assert r.status_code == 201, r.text
    doc = r.json()

    # The object really is in the bucket, under a random family-scoped key.
    import boto3

    raw = boto3.client(
        "s3",
        endpoint_url=s3_server,
        region_name="eu-west-1",
        aws_access_key_id="test-access",
        aws_secret_access_key="test-secret",
    )
    [obj] = raw.list_objects_v2(Bucket="documents")["Contents"]
    assert obj["Key"].startswith(f"{alice.family_id}/") and "Паспорт" not in obj["Key"]

    link = (await bob.post(bob.f(f"/documents/{doc['id']}/download-link"))).json()
    path = link["url"].split("http://localhost:8000")[-1]
    resp = await client.get(path)
    assert resp.status_code == 200 and resp.content == PDF

    assert (await alice.delete(alice.f(f"/documents/{doc['id']}"))).status_code == 204
    assert raw.list_objects_v2(Bucket="documents").get("KeyCount") == 0


def test_supabase_endpoint_uses_path_style(settings_env: pytest.MonkeyPatch) -> None:
    for key, value in {
        "STORAGE_BACKEND": "s3",
        "STORAGE_ENDPOINT": "https://abc.storage.supabase.co/storage/v1/s3",
        "STORAGE_BUCKET": "documents",
        "STORAGE_ACCESS_KEY": "a",
        "STORAGE_SECRET_KEY": "b",
    }.items():
        settings_env.setenv(key, value)
    get_settings.cache_clear()
    storage = S3Storage()
    url = storage.client.generate_presigned_url(
        "get_object", Params={"Bucket": "documents", "Key": "f/x"}, ExpiresIn=60
    )
    assert url.startswith("https://abc.storage.supabase.co/storage/v1/s3/documents/f/x?")


def test_storage_settings_typed_on_a_phone_are_normalised(settings_env: pytest.MonkeyPatch) -> None:
    settings_env.setenv("STORAGE_BACKEND", " S3 ")
    settings_env.setenv("STORAGE_BUCKET", "documents ")
    settings_env.setenv("STORAGE_REGION", " eu-west-1")
    settings_env.setenv("STORAGE_ACCESS_KEY", " key\n")
    get_settings.cache_clear()
    s = get_settings()
    assert s.storage_backend == "s3" and s.uploads_enabled
    assert (s.storage_bucket, s.storage_region) == ("documents", "eu-west-1")
    assert s.storage_access_key.get_secret_value() == "key"
